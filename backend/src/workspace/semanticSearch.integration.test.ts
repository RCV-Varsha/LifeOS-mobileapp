import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { RetrievalService,type EmbeddingProvider } from './retrieval.ts';

test('semantic search indexes all source types, reuses cache and excludes foreign, stale and deleted content',async()=>{
  const pool=new pg.Pool(),client=await pool.connect();
  const query=(sql:string,values?:unknown[])=>client.query(sql,values);
  const scoped={query,connect:async()=>({release(){},query:(sql:string,values?:unknown[])=>query(sql.startsWith('BEGIN')?'SAVEPOINT semantic_write':sql==='COMMIT'?'RELEASE SAVEPOINT semantic_write':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT semantic_write':sql,values)})} as unknown as pg.Pool;
  try{
    await query('BEGIN');
    const owner=randomUUID(),foreign=randomUUID();
    await query('INSERT INTO public.users(id) VALUES($1),($2)',[owner,foreign]);
    const project=(await query("INSERT INTO public.projects(owner_id,title) VALUES($1,'Career project') RETURNING id",[owner])).rows[0].id;
    const goal=(await query("INSERT INTO public.goals(owner_id,title,reason,minutes_per_day) VALUES($1,'Career goal','Employment',20) RETURNING id",[owner])).rows[0].id;
    const task=(await query("INSERT INTO public.tasks(owner_id,instruction,planned_minutes,project_id) VALUES($1,'Career task',20,$2) RETURNING id",[owner,project])).rows[0].id;
    const note=(await query("INSERT INTO public.knowledge_items(owner_id,title,content,kind,project_id) VALUES($1,'Career notes','Interview preparation','note',$2) RETURNING id",[owner,project])).rows[0].id;
    await query("INSERT INTO public.tasks(owner_id,instruction,planned_minutes) VALUES($1,'Cooking pasta',20),($2,'Career private',20)",[owner,foreign]);
    let documents=0;let duringQuery:(()=>Promise<void>)|null=null;
    const provider:EmbeddingProvider={model:'semantic-fixture-v1',async embed(texts,purpose){if(purpose==='query'){if(duringQuery)await duringQuery();return texts.map(()=>[1,0]);}documents+=texts.length;return texts.map(text=>/career/i.test(text)?[1,0]:[0,1]);}};
    const service=new RetrievalService(scoped);
    const first=await service.search(owner,'employment preparation','semantic',null,provider);
    assert.deepEqual(new Set(first.map(item=>item.id)),new Set([project,goal,task,note]));
    assert.deepEqual(new Set(first.map(item=>item.kind)),new Set(['project','goal','task','note']));
    const initialCount=documents;
    await service.search(owner,'job readiness','semantic',null,provider);assert.equal(documents,initialCount);
    const filtered=await service.search(owner,'employment','semantic',project,provider);
    assert.deepEqual(new Set(filtered.map(item=>item.id)),new Set([project,task,note]));
    await query("UPDATE public.tasks SET instruction='Cooking noodles',revision=revision+1 WHERE id=$1",[task]);
    await query('UPDATE public.knowledge_items SET deleted_at=now() WHERE id=$1',[note]);
    const edited=await service.search(owner,'employment','semantic',null,provider);
    assert.ok(!edited.some(item=>item.id===task||item.id===note));assert.ok(documents>initialCount);
    duringQuery=async()=>{await query("UPDATE public.goals SET title='Changed while searching' WHERE id=$1",[goal]);};
    const concurrent=await service.search(owner,'employment','semantic',null,provider);
    assert.ok(!concurrent.some(item=>item.id===goal));
    assert.equal((await service.search(randomUUID(),'nothing','semantic',null,provider)).length,0);
  }finally{await query('ROLLBACK');client.release();await pool.end();}
});
