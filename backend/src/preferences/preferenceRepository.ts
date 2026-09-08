import type { Pool, PoolClient } from 'pg';
import { preferenceRegistry, type PreferenceContext } from './registry.ts';
import type { Preference, PreferenceKey, PreferenceSource, PreferenceStatus, PreferenceValue } from './types.ts';

type Row = Omit<Preference, 'id' | 'value'> & {
  preferenceId: string;
  integerValue: number | null;
  textValue: string | null;
};

const columns = `p.id AS "preferenceId",v.id AS "versionId",p.key,p.category,
  v.integer_value AS "integerValue",v.text_value AS "textValue",v.source,v.status,v.revision,v.note,
  v.created_at AS "createdAt",v.updated_at AS "updatedAt"`;

function map(row: Row): Preference {
  return {
    id: row.preferenceId,
    versionId: row.versionId,
    key: row.key,
    category: row.category,
    value: row.integerValue ?? row.textValue as PreferenceValue,
    source: row.source,
    status: row.status,
    revision: row.revision,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function storedValue(value: PreferenceValue) {
  return typeof value === 'number'
    ? { type: 'INTEGER', integer: value, text: null }
    : { type: 'ENUM', integer: null, text: value };
}

export class PreferenceConflictError extends Error {
  readonly code: 'duplicate_key' | 'stale_revision' | 'invalid_state';
  constructor(code: 'duplicate_key' | 'stale_revision' | 'invalid_state') {
    super(code);
    this.name = 'PreferenceConflictError';
    this.code = code;
  }
}

export class PreferenceRepository {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async list(userId: string) {
    const result = await this.pool.query<Row>(
      `SELECT ${columns} FROM public.user_preferences p
       INNER JOIN public.user_preference_versions v ON v.preference_id=p.id AND v.user_id=p.user_id
       WHERE p.user_id=$1 AND v.status IN ('ACTIVE','ARCHIVED') ORDER BY p.key`,
      [userId],
    );
    return result.rows.map(map);
  }

  async get(userId: string, preferenceId: string) {
    const result = await this.pool.query<Row>(
      `SELECT ${columns} FROM public.user_preferences p
       INNER JOIN public.user_preference_versions v ON v.preference_id=p.id AND v.user_id=p.user_id
       WHERE p.user_id=$1 AND p.id=$2 AND v.status IN ('ACTIVE','ARCHIVED')`,
      [userId, preferenceId],
    );
    return result.rows[0] ? map(result.rows[0]) : null;
  }

  async create(userId: string, key: PreferenceKey, value: PreferenceValue, source: PreferenceSource = 'USER_EXPLICIT') {
    const definition = preferenceRegistry[key];
    const stored = storedValue(value);
    try {
      const result = await this.pool.query<Row>(
        `WITH created AS (
           INSERT INTO public.user_preferences(user_id,key,category) VALUES($1,$2,$3)
           RETURNING id,user_id,key,category
         ), version AS (
           INSERT INTO public.user_preference_versions(preference_id,user_id,value_type,integer_value,text_value,source,status,revision)
           SELECT id,user_id,$4,$5,$6,$7,'ACTIVE',1 FROM created RETURNING *
         )
         SELECT created.id AS "preferenceId",version.id AS "versionId",created.key,created.category,
           version.integer_value AS "integerValue",version.text_value AS "textValue",version.source,version.status,
           version.revision,version.note,version.created_at AS "createdAt",version.updated_at AS "updatedAt"
         FROM created INNER JOIN version ON version.preference_id=created.id`,
        [userId, key, definition.category, stored.type, stored.integer, stored.text, source],
      );
      return map(result.rows[0]!);
    } catch (error) {
      if (databaseCode(error) === '23505') throw new PreferenceConflictError('duplicate_key');
      throw error;
    }
  }

  async update(userId: string, preferenceId: string, value: PreferenceValue, expectedRevision: number) {
    return this.replace(userId, preferenceId, value, expectedRevision, 'ACTIVE', 'ACTIVE', 'USER_EXPLICIT', null, false);
  }

  async correct(userId: string, preferenceId: string, value: PreferenceValue, expectedRevision: number, note: string | null) {
    return this.replace(userId, preferenceId, value, expectedRevision, 'ACTIVE', 'ACTIVE', 'USER_CORRECTION', note, true);
  }

  async archive(userId: string, preferenceId: string, expectedRevision: number) {
    const current = await this.get(userId, preferenceId);
    if (!current) return null;
    return this.replace(userId, preferenceId, current.value, expectedRevision, 'ACTIVE', 'ARCHIVED', 'USER_EXPLICIT', null, false);
  }

  async reactivate(userId: string, preferenceId: string, expectedRevision: number) {
    const current = await this.get(userId, preferenceId);
    if (!current) return null;
    return this.replace(userId, preferenceId, current.value, expectedRevision, 'ARCHIVED', 'ACTIVE', 'USER_EXPLICIT', null, false);
  }

  async history(userId: string, preferenceId: string) {
    const versions = await this.pool.query<Row>(
      `SELECT ${columns} FROM public.user_preferences p
       INNER JOIN public.user_preference_versions v ON v.preference_id=p.id AND v.user_id=p.user_id
       WHERE p.user_id=$1 AND p.id=$2 ORDER BY v.revision DESC`,
      [userId, preferenceId],
    );
    if (versions.rows.length === 0) return null;
    const corrections = await this.pool.query<{ id: string; revision: number; previousVersionId: string; newVersionId: string; note: string | null; createdAt: Date }>(
      `SELECT id,revision,previous_version_id AS "previousVersionId",new_version_id AS "newVersionId",note,created_at AS "createdAt"
       FROM public.user_preference_corrections WHERE user_id=$1 AND preference_id=$2 ORDER BY revision DESC`,
      [userId, preferenceId],
    );
    return { versions: versions.rows.map(map), corrections: corrections.rows };
  }

  async context(userId: string, categories: ('PLANNING' | 'INTERACTION')[]): Promise<PreferenceContext> {
    const result = await this.pool.query<{ key: PreferenceKey; integerValue: number | null; textValue: string | null }>(
      `SELECT p.key,v.integer_value AS "integerValue",v.text_value AS "textValue"
       FROM public.user_preferences p INNER JOIN public.user_preference_versions v ON v.preference_id=p.id AND v.user_id=p.user_id
       WHERE p.user_id=$1 AND p.category=ANY($2::text[]) AND v.status='ACTIVE'`,
      [userId, categories],
    );
    const values = new Map(result.rows.map((row) => [row.key, row.integerValue ?? row.textValue]));
    return {
      maxMajorTasks: typeof values.get('planning.max_major_tasks') === 'number' ? values.get('planning.max_major_tasks') as number : null,
      explanationLength: values.get('interaction.explanation_length') === 'concise' ? 'concise' : 'standard',
    };
  }

  private async replace(
    userId: string,
    preferenceId: string,
    value: PreferenceValue,
    expectedRevision: number,
    expectedStatus: Exclude<PreferenceStatus, 'SUPERSEDED'>,
    nextStatus: Exclude<PreferenceStatus, 'SUPERSEDED'>,
    source: PreferenceSource,
    note: string | null,
    correction: boolean,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockCurrent(client, userId, preferenceId);
      if (!current) { await client.query('ROLLBACK'); return null; }
      if (current.revision !== expectedRevision) throw new PreferenceConflictError('stale_revision');
      if (current.status !== expectedStatus) throw new PreferenceConflictError('invalid_state');
      const definition = preferenceRegistry[current.key];
      const validated = definition.validate(value);
      const stored = storedValue(validated);
      await client.query(`UPDATE public.user_preference_versions SET status='SUPERSEDED',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2`, [current.versionId, userId]);
      const inserted = await client.query<Row>(
        `INSERT INTO public.user_preference_versions(preference_id,user_id,value_type,integer_value,text_value,source,status,revision,note)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING $1::uuid AS "preferenceId",id AS "versionId",$10::text AS key,$11::text AS category,
           integer_value AS "integerValue",text_value AS "textValue",source,status,revision,note,
           created_at AS "createdAt",updated_at AS "updatedAt"`,
        [preferenceId,userId,stored.type,stored.integer,stored.text,source,nextStatus,current.revision+1,note,current.key,definition.category],
      );
      if (correction) {
        await client.query(
          `INSERT INTO public.user_preference_corrections(preference_id,user_id,previous_version_id,new_version_id,revision,note)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [preferenceId,userId,current.versionId,inserted.rows[0]!.versionId,current.revision+1,note],
        );
      }
      await client.query('COMMIT');
      return map(inserted.rows[0]!);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function lockCurrent(client: PoolClient, userId: string, preferenceId: string) {
  const result = await client.query<Row>(
    `SELECT ${columns} FROM public.user_preferences p
     INNER JOIN public.user_preference_versions v ON v.preference_id=p.id AND v.user_id=p.user_id
     WHERE p.user_id=$1 AND p.id=$2 AND v.status IN ('ACTIVE','ARCHIVED') FOR UPDATE OF p,v`,
    [userId, preferenceId],
  );
  return result.rows[0] ?? null;
}

function databaseCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
}
