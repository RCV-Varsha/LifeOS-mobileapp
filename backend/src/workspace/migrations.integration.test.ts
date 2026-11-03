import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

test('complete migration chain builds a fresh PostgreSQL schema transactionally',async()=>{
  const pool=new pg.Pool(),client=await pool.connect();
  const schema=`migration_test_${randomUUID().replaceAll('-','')}`;
  try {
    await client.query('BEGIN');await client.query(`CREATE SCHEMA ${schema}`);
    const files=(await readdir(new URL('../../migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort();
    for(const file of files){const sql=await readFile(new URL(`../../migrations/${file}`,import.meta.url),'utf8');await client.query(sql.replaceAll('public.',`${schema}.`));}
    const tables=await client.query('SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema=$1',[schema]);
    assert.ok(tables.rows[0].count>=30);
    assert.equal((await client.query(`SELECT count(*)::int AS count FROM ${schema}.users`)).rows[0].count,1);
    assert.equal((await client.query(`SELECT count(*)::int AS count FROM ${schema}.tasks`)).rows[0].count,0);
  }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});
