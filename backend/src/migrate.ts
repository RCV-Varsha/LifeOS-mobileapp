import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pool } from './db.ts';

const client = await pool.connect();
try {
  await client.query('SELECT pg_advisory_lock(710042)');
  await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const files = (await readdir(new URL('../migrations/', import.meta.url))).filter(x => /^\d+.*\.sql$/.test(x)).sort();
  const baseline = process.argv.includes('--baseline-existing');
  if (baseline) {
    // Earlier versions applied these scripts manually. Never infer adoption from a single table.
    for (const table of ['goals','goal_plans','tasks','daily_reviews','daily_contexts','daily_plan_proposals','goal_outcomes','goal_milestones','users','user_preferences','user_memory_versions']) {
      const result = await client.query('SELECT to_regclass($1) AS relation', [`public.${table}`]);
      if (!result.rows[0]?.relation) throw new Error(`Cannot baseline: missing ${table}`);
    }
    await client.query('SELECT valid_from, valid_until FROM public.user_memory_versions LIMIT 0');
  }
  for (const name of files) {
    const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query('SELECT checksum FROM public.schema_migrations WHERE name=$1', [name]);
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    await client.query('BEGIN');
    try {
      if (!(baseline && Number(name.slice(0, 3)) <= 10)) await client.query(sql);
      await client.query('INSERT INTO public.schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]);
      await client.query('COMMIT');
      console.log(`${baseline && Number(name.slice(0, 3)) <= 10 ? 'Adopted' : 'Applied'} ${name}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock(710042)');
  client.release();
  await pool.end();
}
