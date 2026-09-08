import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { PreferenceConflictError, PreferenceRepository } from './preferenceRepository.ts';

test('live preferences preserve history, isolate users, and reject stale edits',async()=>{
  const pool=new pg.Pool();const a=crypto.randomUUID();const b=crypto.randomUUID();
  await pool.query(`INSERT INTO public.users(id) VALUES($1),($2)`,[a,b]);
  try{
    const repository=new PreferenceRepository(pool);
    const first=await repository.create(a,'planning.max_major_tasks',3);
    const other=await repository.create(b,'planning.max_major_tasks',5);
    assert.equal((await repository.list(a)).length,1);
    assert.equal((await repository.get(a,other.id)),null);
    assert.equal((await repository.history(a,other.id)),null);
    assert.equal(await repository.update(a,other.id,4,other.revision),null);
    assert.equal(await repository.correct(a,other.id,4,other.revision,null),null);
    assert.equal(await repository.archive(a,other.id,other.revision),null);
    await assert.rejects(()=>repository.create(a,'planning.max_major_tasks',4),(error)=>error instanceof PreferenceConflictError&&error.code==='duplicate_key');

    const corrected=await repository.correct(a,first.id,2,first.revision,'Three was too many.');
    assert.equal(corrected?.value,2);assert.equal(corrected?.source,'USER_CORRECTION');assert.equal(corrected?.revision,2);
    const history=await repository.history(a,first.id);assert.equal(history?.versions.length,2);assert.equal(history?.corrections.length,1);assert.equal(history?.versions[0]?.status,'ACTIVE');assert.equal(history?.versions[1]?.value,3);assert.equal(history?.versions[1]?.status,'SUPERSEDED');
    await assert.rejects(()=>repository.update(a,first.id,4,1),(error)=>error instanceof PreferenceConflictError&&error.code==='stale_revision');
    await assert.rejects(()=>repository.correct(a,first.id,4,1,'Stale correction.'),(error)=>error instanceof PreferenceConflictError&&error.code==='stale_revision');

    const archived=await repository.archive(a,first.id,2);assert.equal(archived?.status,'ARCHIVED');assert.equal((await repository.context(a,['PLANNING'])).maxMajorTasks,null);
    const active=await repository.reactivate(a,first.id,3);assert.equal(active?.status,'ACTIVE');assert.equal(active?.value,2);
    const concurrent=await Promise.allSettled([repository.update(a,first.id,3,4),repository.update(a,first.id,4,4)]);
    assert.equal(concurrent.filter((result)=>result.status==='fulfilled').length,1);
    assert.equal(concurrent.filter((result)=>result.status==='rejected'&&result.reason instanceof PreferenceConflictError&&result.reason.code==='stale_revision').length,1);
  }finally{
    await pool.query('DELETE FROM public.user_preference_corrections WHERE user_id=ANY($1::text[])',[ [a,b] ]).catch(()=>undefined);
    await pool.query('DELETE FROM public.user_preferences WHERE user_id=ANY($1::text[])',[ [a,b] ]).catch(()=>undefined);
    await pool.query('DELETE FROM public.users WHERE id=ANY($1::text[])',[ [a,b] ]).catch(()=>undefined);
    await pool.end();
  }
});
