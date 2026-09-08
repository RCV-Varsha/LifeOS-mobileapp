import type { Pool, PoolClient } from 'pg';
import { memoryRegistry, type PlanningMemoryContext } from './registry.ts';
import type { Memory, MemoryKey, MemorySource, MemoryStatus } from './types.ts';

type Row = Omit<Memory, 'id' | 'value'> & { memoryId: string; integerValue: number };
const columns = `m.id AS "memoryId",v.id AS "versionId",m.key,m.category,v.integer_value AS "integerValue",
  v.source,v.status,v.revision,v.note,v.created_at AS "createdAt",v.updated_at AS "updatedAt"`;

function map(row: Row): Memory {
  return { id: row.memoryId, versionId: row.versionId, key: row.key, category: row.category, value: row.integerValue,
    source: row.source, status: row.status, revision: row.revision, note: row.note, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export class MemoryConflictError extends Error {
  readonly code: 'duplicate_key' | 'stale_revision' | 'invalid_state';
  constructor(code: 'duplicate_key' | 'stale_revision' | 'invalid_state') { super(code); this.name='MemoryConflictError'; this.code=code; }
}

export class MemoryRepository {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool=pool; }

  async list(userId: string) {
    const result=await this.pool.query<Row>(`SELECT ${columns} FROM public.user_memories m
      INNER JOIN public.user_memory_versions v ON v.memory_id=m.id AND v.user_id=m.user_id
      WHERE m.user_id=$1 AND v.status IN ('ACTIVE','ARCHIVED') ORDER BY m.key`,[userId]);
    return result.rows.map(map);
  }

  async get(userId: string, memoryId: string) {
    const result=await this.pool.query<Row>(`SELECT ${columns} FROM public.user_memories m
      INNER JOIN public.user_memory_versions v ON v.memory_id=m.id AND v.user_id=m.user_id
      WHERE m.user_id=$1 AND m.id=$2 AND v.status IN ('ACTIVE','ARCHIVED')`,[userId,memoryId]);
    return result.rows[0]?map(result.rows[0]):null;
  }

  async create(userId: string, key: MemoryKey, value: number, source: MemorySource='USER_EXPLICIT') {
    const definition=memoryRegistry[key];
    try {
      const result=await this.pool.query<Row>(`WITH created AS (
        INSERT INTO public.user_memories(user_id,key,category) VALUES($1,$2,$3) RETURNING id,user_id,key,category
      ), version AS (
        INSERT INTO public.user_memory_versions(memory_id,user_id,integer_value,source,status,revision)
        SELECT id,user_id,$4,$5,'ACTIVE',1 FROM created RETURNING *
      ) SELECT created.id AS "memoryId",version.id AS "versionId",created.key,created.category,
        version.integer_value AS "integerValue",version.source,version.status,version.revision,version.note,
        version.created_at AS "createdAt",version.updated_at AS "updatedAt"
        FROM created INNER JOIN version ON version.memory_id=created.id`,[userId,key,definition.category,value,source]);
      return map(result.rows[0]!);
    } catch(error) {
      if(databaseCode(error)==='23505') throw new MemoryConflictError('duplicate_key');
      throw error;
    }
  }

  update(userId:string,memoryId:string,value:number,expectedRevision:number){return this.replace(userId,memoryId,value,expectedRevision,'ACTIVE','ACTIVE','USER_EXPLICIT',null,false);}
  correct(userId:string,memoryId:string,value:number,expectedRevision:number,note:string|null){return this.replace(userId,memoryId,value,expectedRevision,'ACTIVE','ACTIVE','USER_CORRECTION',note,true);}
  async archive(userId:string,memoryId:string,expectedRevision:number){const current=await this.get(userId,memoryId);return current?this.replace(userId,memoryId,current.value,expectedRevision,'ACTIVE','ARCHIVED','USER_EXPLICIT',null,false):null;}
  async reactivate(userId:string,memoryId:string,expectedRevision:number){const current=await this.get(userId,memoryId);return current?this.replace(userId,memoryId,current.value,expectedRevision,'ARCHIVED','ACTIVE','USER_EXPLICIT',null,false):null;}

  async history(userId:string,memoryId:string) {
    const versions=await this.pool.query<Row>(`SELECT ${columns} FROM public.user_memories m
      INNER JOIN public.user_memory_versions v ON v.memory_id=m.id AND v.user_id=m.user_id
      WHERE m.user_id=$1 AND m.id=$2 ORDER BY v.revision DESC`,[userId,memoryId]);
    if(versions.rows.length===0)return null;
    const corrections=await this.pool.query<{id:string;revision:number;previousVersionId:string;newVersionId:string;note:string|null;createdAt:Date}>(
      `SELECT id,revision,previous_version_id AS "previousVersionId",new_version_id AS "newVersionId",note,created_at AS "createdAt"
       FROM public.user_memory_corrections WHERE user_id=$1 AND memory_id=$2 ORDER BY revision DESC`,[userId,memoryId]);
    return {versions:versions.rows.map(map),corrections:corrections.rows};
  }

  async planningContext(userId:string):Promise<PlanningMemoryContext>{
    const result=await this.pool.query<{integerValue:number}>(`SELECT v.integer_value AS "integerValue" FROM public.user_memories m
      INNER JOIN public.user_memory_versions v ON v.memory_id=m.id AND v.user_id=m.user_id
      WHERE m.user_id=$1 AND m.key='planning.daily_buffer_minutes' AND m.category='CONSTRAINT' AND v.status='ACTIVE'`,[userId]);
    return {dailyBufferMinutes:result.rows[0]?.integerValue??0};
  }

  private async replace(userId:string,memoryId:string,value:number,expectedRevision:number,expectedStatus:Exclude<MemoryStatus,'SUPERSEDED'>,
    nextStatus:Exclude<MemoryStatus,'SUPERSEDED'>,source:MemorySource,note:string|null,correction:boolean) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current=await lockCurrent(client,userId,memoryId);
      if(!current){await client.query('ROLLBACK');return null;}
      if(current.revision!==expectedRevision)throw new MemoryConflictError('stale_revision');
      if(current.status!==expectedStatus)throw new MemoryConflictError('invalid_state');
      const validated=memoryRegistry[current.key].validate(value);
      await client.query(`UPDATE public.user_memory_versions SET status='SUPERSEDED',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2`,[current.versionId,userId]);
      const inserted=await client.query<Row>(`INSERT INTO public.user_memory_versions(memory_id,user_id,integer_value,source,status,revision,note)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING $1::uuid AS "memoryId",id AS "versionId",$8::text AS key,$9::text AS category,
        integer_value AS "integerValue",source,status,revision,note,created_at AS "createdAt",updated_at AS "updatedAt"`,
        [memoryId,userId,validated,source,nextStatus,current.revision+1,note,current.key,memoryRegistry[current.key].category]);
      if(correction)await client.query(`INSERT INTO public.user_memory_corrections(memory_id,user_id,previous_version_id,new_version_id,revision,note)
        VALUES($1,$2,$3,$4,$5,$6)`,[memoryId,userId,current.versionId,inserted.rows[0]!.versionId,current.revision+1,note]);
      await client.query('COMMIT');return map(inserted.rows[0]!);
    } catch(error) {await client.query('ROLLBACK').catch(()=>undefined);throw error;} finally {client.release();}
  }
}

async function lockCurrent(client:PoolClient,userId:string,memoryId:string){const result=await client.query<Row>(`SELECT ${columns} FROM public.user_memories m
  INNER JOIN public.user_memory_versions v ON v.memory_id=m.id AND v.user_id=m.user_id
  WHERE m.user_id=$1 AND m.id=$2 AND v.status IN ('ACTIVE','ARCHIVED') FOR UPDATE OF m,v`,[userId,memoryId]);return result.rows[0]??null;}
function databaseCode(error:unknown){return typeof error==='object'&&error!==null&&'code' in error?error.code:null;}
