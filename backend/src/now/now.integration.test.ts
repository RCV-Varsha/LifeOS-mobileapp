import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { NowRepository } from './nowRepository.ts';
import { buildNow } from './nowService.ts';

test('live NOW aggregation isolates owners',async()=>{const pool=new pg.Pool();const a=crypto.randomUUID();const b=crypto.randomUUID();await pool.query('INSERT INTO public.users(id) VALUES($1),($2)',[a,b]);try{
  await pool.query(`INSERT INTO public.goals(title,reason,minutes_per_day,owner_id) VALUES('Private direction','',30,$1)`,[a]);const repository=new NowRepository(pool);const day={key:20705,isoDate:'2026-09-09'};
  const own=buildNow(await repository.snapshot(a,day,'UTC'));const other=buildNow(await repository.snapshot(b,day,'UTC'));
  assert.equal(own.state,'INSUFFICIENT_INFORMATION');assert.equal(other.state,'EMPTY');assert.equal(JSON.stringify(other).includes('Private direction'),false);
}finally{await pool.query('DELETE FROM public.goals WHERE owner_id=ANY($1::text[])',[[a,b]]);await pool.query('DELETE FROM public.users WHERE id=ANY($1::text[])',[[a,b]]);await pool.end();}});
