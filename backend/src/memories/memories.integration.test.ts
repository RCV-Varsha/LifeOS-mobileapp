import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { MemoryConflictError, MemoryRepository } from './memoryRepository.ts';

test('live memory selection is owner-scoped, date-valid, correction-aware, and deterministic',async()=>{
  const pool=new pg.Pool();const a=crypto.randomUUID();const b=crypto.randomUUID();
  await pool.query(`INSERT INTO public.users(id) VALUES($1),($2)`,[a,b]);
  try{
    const repository=new MemoryRepository(pool);
    const first=await repository.create(a,'planning.daily_buffer_minutes',30,'USER_EXPLICIT',{validFrom:'2026-09-01',validUntil:'2026-09-30'});
    const other=await repository.create(b,'planning.daily_buffer_minutes',90,'USER_CONFIRMED_AI_SUGGESTION',{validFrom:'2026-01-01'});
    assert.equal(first.confidence,'CONFIRMED');assert.equal(first.validUntil,'2026-09-30');
    assert.equal((await repository.list(a)).length,1);assert.equal(await repository.get(a,other.id),null);assert.equal(await repository.history(a,other.id),null);
    assert.equal(await repository.update(a,other.id,20,other.revision),null);assert.equal(await repository.correct(a,other.id,20,other.revision,null),null);
    assert.equal(await repository.archive(a,other.id,other.revision),null);
    assert.equal((await repository.planningContext(a,'2026-08-31')).selection,null);
    assert.equal((await repository.planningContext(a,'2026-10-01')).selection,null);
    const active=await repository.planningContext(a,'2026-09-08');
    assert.deepEqual(active.selection,{key:'planning.daily_buffer_minutes',value:30,revision:1,provenance:'USER_EXPLICIT',confidence:'CONFIRMED',
      validFrom:'2026-09-01',validUntil:'2026-09-30',relevance:'ADAPTIVE_PLANNING'});
    assert.deepEqual(await repository.planningContext(a,'2026-09-08'),active);
    assert.equal((await repository.planningContext(b,'2026-09-08')).dailyBufferMinutes,90);
    await assert.rejects(()=>repository.create(a,'planning.daily_buffer_minutes',15),(error)=>error instanceof MemoryConflictError&&error.code==='duplicate_key');

    const corrected=await repository.correct(a,first.id,20,1,'Thirty minutes was too much.');
    assert.equal(corrected?.source,'USER_CORRECTION');assert.equal(corrected?.confidence,'CORRECTED');assert.equal(corrected?.revision,2);
    assert.equal((await repository.planningContext(a,'2026-09-08')).dailyBufferMinutes,20);
    const history=await repository.history(a,first.id);
    assert.equal(history?.versions.length,2);assert.equal(history?.versions[0]?.status,'ACTIVE');assert.equal(history?.versions[1]?.value,30);
    assert.equal(history?.versions[1]?.status,'SUPERSEDED');assert.equal(history?.corrections.length,1);
    await assert.rejects(()=>repository.correct(a,first.id,10,1,'Stale.'),(error)=>error instanceof MemoryConflictError&&error.code==='stale_revision');

    const archived=await repository.archive(a,first.id,2);assert.equal(archived?.status,'ARCHIVED');
    assert.equal((await repository.planningContext(a,'2026-09-08')).selection,null);
    const reactivated=await repository.reactivate(a,first.id,3);assert.equal(reactivated?.status,'ACTIVE');assert.equal(reactivated?.confidence,'CORRECTED');
    assert.equal((await repository.planningContext(a,'2026-09-08')).dailyBufferMinutes,20);
    const concurrent=await Promise.allSettled([repository.update(a,first.id,25,4),repository.update(a,first.id,35,4)]);
    assert.equal(concurrent.filter((item)=>item.status==='fulfilled').length,1);
    assert.equal(concurrent.filter((item)=>item.status==='rejected'&&item.reason instanceof MemoryConflictError&&item.reason.code==='stale_revision').length,1);
  }finally{
    await pool.query('DELETE FROM public.user_memory_corrections WHERE user_id=ANY($1::text[])',[[a,b]]).catch(()=>undefined);
    await pool.query('DELETE FROM public.user_memories WHERE user_id=ANY($1::text[])',[[a,b]]).catch(()=>undefined);
    await pool.query('DELETE FROM public.users WHERE id=ANY($1::text[])',[[a,b]]).catch(()=>undefined);await pool.end();
  }
});
