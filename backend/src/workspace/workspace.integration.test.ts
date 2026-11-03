import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { workspaceRouter, apiErrors } from './routes.ts';
import { authRouter, authentication, tokenHash } from '../platform/authentication.ts';
import { ActionService } from './actions.ts';
import { RetrievalService } from './retrieval.ts';
import { AssistantService } from './assistant.ts';
import { rejectClientOwnership } from '../auth.ts';
import { extensionRouter } from './extensionRoutes.ts';
import { privacyRouter } from '../platform/privacy.ts';

test('real API: authentication, ownership, graph, source retrieval, confirmation, stale edits and idempotent sync',async()=>{
  delete process.env.AUTH_MODE;
  const rateScope=randomUUID();
  const pool=new pg.Pool(),app=express();app.use(express.json());app.use(rejectClientOwnership);app.use('/auth',authRouter(pool,rateScope));app.use(authentication(pool));app.use(workspaceRouter(pool));app.use(extensionRouter(pool));app.use(privacyRouter(pool));app.use(apiErrors);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No test address');
  const base=`http://127.0.0.1:${address.port}`;
  const owners:string[]=[];
  async function call(path:string,method='GET',body?:unknown,token?:string){return fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
  try {
    assert.equal((await call('/projects')).status,401);
    const accounts=[];
    for(let i=0;i<2;i++){
      const response=await call('/auth/register','POST',{email:`test-${randomUUID()}@example.test`,password:'A long test password 123!'});
      assert.equal(response.status,201);const account=await response.json();owners.push(account.user.id);accounts.push(account);
    }
    const [a,b]=accounts;
    const projectResponse=await call('/projects','POST',{title:'Backend Rewrite'},a.accessToken);assert.equal(projectResponse.status,201);const project=(await projectResponse.json()).item;
    assert.equal((await call(`/projects/${project.id}`,'GET',undefined,b.accessToken)).status,404);
    assert.equal((await call('/projects','POST',{title:'Injected',ownerId:b.user.id},a.accessToken)).status,400);
    const create=async(title:string)=>{const r=await call('/workspace/tasks','POST',{title,minutes:30,projectId:project.id,deadline:new Date(Date.now()+3*86400000).toISOString()},a.accessToken);assert.equal(r.status,201);return (await r.json()).item;};
    const first=await create('Implement authentication'),second=await create('Document authentication');
    assert.equal((await call(`/workspace/tasks/${second.id}/dependencies`,'POST',{dependsOnId:first.id},a.accessToken)).status,201);
    assert.equal((await call(`/workspace/tasks/${first.id}/dependencies`,'POST',{dependsOnId:second.id},a.accessToken)).status,409);
    assert.equal((await call('/workspace/tasks','POST',{title:'Cross owner',minutes:30,projectId:project.id},b.accessToken)).status,409);
    const knowledgeResponse=await call('/knowledge','POST',{kind:'decision',title:'Authentication decision',content:'Use short lived opaque tokens',projectId:project.id,decision:{context:'Security design',options:['Opaque sessions','Long-lived tokens'],reasoning:'Revocation must take effect immediately.'}},a.accessToken);
    assert.equal(knowledgeResponse.status,201);const knowledge=(await knowledgeResponse.json()).item;
    const upload=await fetch(base+'/documents/upload?filename=source.txt',{method:'POST',headers:{Authorization:`Bearer ${a.accessToken}`,'Content-Type':'text/plain'},body:'Synthetic text document evidence.'});
    assert.equal(upload.status,201);const uploaded=(await upload.json()).item;
    assert.equal((await call(`/documents/${uploaded.id}`,'GET',undefined,b.accessToken)).status,404);
    const downloaded=await call(`/documents/${uploaded.id}`,'GET',undefined,a.accessToken);assert.equal(await downloaded.text(),'Synthetic text document evidence.');
    const foreignSearch=await (await call('/search?q=authentication','GET',undefined,b.accessToken)).json();assert.equal(foreignSearch.items.length,0);
    const ownSearch=await (await call('/search?q=authentication','GET',undefined,a.accessToken)).json();assert.ok(ownSearch.items.some((x:{id:string})=>x.id===knowledge.id));
    const actions=new ActionService(pool);
    const link=await actions.propose(a.user.id,'knowledge','Connect source',[{kind:'link',sourceId:first.id,targetId:knowledge.id,type:'informs'}]);
    assert.equal((await call(`/ai/actions/${link.id}/apply`,'POST',{},a.accessToken)).status,400);
    assert.equal((await call(`/ai/actions/${link.id}/apply`,'POST',{confirmed:true},b.accessToken)).status,404);
    assert.equal((await call(`/ai/actions/${link.id}/apply`,'POST',{confirmed:true},a.accessToken)).status,200);
    assert.equal((await call(`/ai/actions/${link.id}/apply`,'POST',{confirmed:true},a.accessToken)).status,200);
    const graph=await (await call('/graph','GET',undefined,a.accessToken)).json();assert.equal(graph.edges.length,1);
    const retrieval=new RetrievalService(pool);
    const indexed=await retrieval.index(a.user.id,knowledge.id,{model:'test-fixture-vector',embed:async texts=>texts.map(()=>[1,0,0])});assert.ok(indexed.chunks>0);
    await assert.rejects(()=>retrieval.index(b.user.id,knowledge.id,{model:'test-fixture-vector',embed:async texts=>texts.map(()=>[1,0,0])}));
    // Provider fixture validates the pipeline without claiming live model behavior.
    const assistant=new AssistantService(pool);
    const answer=await assistant.ask(a.user.id,'authentication',project.id,false,{name:'test-fixture',model:'schema-fixture',complete:async(_system,input)=>{
      const sources=(input as {sources:{id:string}[]}).sources;assert.ok(sources.some(x=>x.id===knowledge.id));return {answer:'Revocation was the recorded reason.',sourceIds:[knowledge.id],changes:[]};
    }});assert.equal(answer.sources[0]!.id,knowledge.id);
    const future=new Date(Date.now()+86400000);future.setUTCHours(9,0,0,0);const end=new Date(future.getTime()+2*3600000);
    const planResponse=await call('/planner/proposals','POST',{startsAt:future.toISOString(),endsAt:end.toISOString()},a.accessToken);assert.equal(planResponse.status,200);const plan=await planResponse.json();assert.equal(plan.evaluation.selected.length,2);
    const update={title:first.instruction,minutes:30,projectId:project.id,revision:first.revision,description:'Changed after proposal'};
    assert.equal((await call(`/workspace/tasks/${first.id}`,'PUT',update,a.accessToken)).status,200);
    assert.equal((await call(`/workspace/tasks/${first.id}`,'PUT',update,a.accessToken)).status,409);
    assert.equal((await call(`/ai/actions/${plan.proposal.id}/apply`,'POST',{confirmed:true},a.accessToken)).status,409);
    const noEvents=await pool.query('SELECT * FROM public.calendar_events WHERE owner_id=$1',[a.user.id]);assert.equal(noEvents.rowCount,0);
    const newPlan=await (await call('/planner/proposals','POST',{startsAt:future.toISOString(),endsAt:end.toISOString()},a.accessToken)).json();
    assert.equal((await call(`/ai/actions/${newPlan.proposal.id}/apply`,'POST',{confirmed:true},a.accessToken)).status,200);
    assert.equal((await pool.query('SELECT * FROM public.calendar_events WHERE owner_id=$1',[a.user.id])).rowCount,2);
    assert.equal((await call(`/ai/actions/${newPlan.proposal.id}/undo`,'POST',{confirmed:true},a.accessToken)).status,200);
    assert.equal((await pool.query('SELECT * FROM public.calendar_events WHERE owner_id=$1',[a.user.id])).rowCount,0);
    assert.equal((await call('/evidence-memories','POST',{content:'Immediate revocation matters',sourceId:knowledge.id,category:'FACT',confirmed:false},a.accessToken)).status,400);
    assert.equal((await call('/evidence-memories','POST',{content:'Immediate revocation matters',sourceId:knowledge.id,category:'FACT',confirmed:true},b.accessToken)).status,404);
    assert.equal((await call('/evidence-memories','POST',{content:'Immediate revocation matters',sourceId:knowledge.id,category:'FACT',confirmed:true},a.accessToken)).status,201);
    assert.equal((await (await call('/evidence-memories','GET',undefined,b.accessToken)).json()).items.length,0);
    // AI breakdowns retain the parent link and live progress, including reopen and ownership checks.
    const parent=await create('Parent learning task');
    const breakdown=await assistant.ask(a.user.id,'Break this into subtasks',project.id,false,{name:'test-fixture',model:'schema-fixture',complete:async()=>({answer:'Two practice steps.',sourceIds:[parent.id],changes:[{kind:'create_task',title:'Practice one',minutes:15},{kind:'create_task',title:'Practice two',minutes:15}]})},parent.id);
    assert.ok(breakdown.proposal);
    const applied=await actions.decide(a.user.id,breakdown.proposal.id,'apply');
    const children=(applied.result as {applied:{record:{id:string;revision:number;parent_task_id:string}}[]}).applied.map(entry=>entry.record);
    assert.equal(children.length,2);assert.ok(children.every(child=>child.parent_task_id===parent.id));
    const firstChild=children[0]!;
    const completedResponse=await call(`/workspace/tasks/${firstChild.id}`,'PUT',{title:'Practice one',minutes:15,status:'completed',revision:firstChild.revision},a.accessToken);
    assert.equal(completedResponse.status,200);const completedChild=(await completedResponse.json()).item;
    const taskList=await (await call('/workspace/tasks','GET',undefined,a.accessToken)).json();
    assert.deepEqual(taskList.items.find((task:{id:string})=>task.id===parent.id).subtask_progress,{completed:1,total:2});
    assert.equal(completedChild.parent_task_id,parent.id);
    assert.equal((await call('/workspace/tasks','POST',{title:'Foreign child',minutes:10,parentTaskId:parent.id},b.accessToken)).status,404);
    assert.equal((await call('/workspace/tasks','POST',{title:'Nested child',minutes:10,parentTaskId:firstChild.id},a.accessToken)).status,404);
    assert.equal((await call(`/workspace/tasks/${firstChild.id}`,'PUT',{title:'Practice one',minutes:15,status:'pending',revision:completedChild.revision},a.accessToken)).status,200);
    const reopened=await (await call('/workspace/tasks','GET',undefined,a.accessToken)).json();
    assert.deepEqual(reopened.items.find((task:{id:string})=>task.id===parent.id).subtask_progress,{completed:0,total:2});
    const statusWrite={operationId:randomUUID(),kind:'set_task_status',entityId:firstChild.id,payload:{title:'Old display title',status:'completed'}};
    const statusOne=await (await call('/sync','POST',statusWrite,a.accessToken)).json();
    const statusTwo=await (await call('/sync','POST',statusWrite,a.accessToken)).json();
    assert.equal(statusOne.item.instruction,'Practice one');assert.equal(statusOne.item.parent_task_id,parent.id);
    assert.equal(statusOne.item.status,'completed');assert.equal(statusTwo.item.revision,statusOne.item.revision);
    assert.equal((await call('/sync','POST',{...statusWrite,operationId:randomUUID()},b.accessToken)).status,404);
    assert.equal((await call('/sync','POST',{...statusWrite,operationId:randomUUID(),payload:{status:'pending',description:'Injected edit'}},a.accessToken)).status,400);
    const setStatus=async(entityId:string,status:string)=>call('/sync','POST',{operationId:randomUUID(),kind:'set_task_status',entityId,payload:{status}},a.accessToken);
    assert.equal((await setStatus(parent.id,'completed')).status,409);
    assert.equal((await setStatus(children[1]!.id,'completed')).status,200);
    assert.equal((await setStatus(parent.id,'completed')).status,200);
    assert.equal((await setStatus(firstChild.id,'pending')).status,200);
    const finalTasks=await (await call('/workspace/tasks','GET',undefined,a.accessToken)).json();
    assert.equal(finalTasks.items.find((task:{id:string})=>task.id===parent.id).status,'pending');
    const exported=await call('/privacy/export','GET',undefined,a.accessToken);assert.equal(exported.status,200);
    const exportBody=await exported.json();assert.ok(exportBody.tables.knowledge_items.length);assert.equal(exportBody.tables.auth_credentials,undefined);
    const write={operationId:randomUUID(),kind:'create_task',entityId:null,payload:{title:'Offline task',minutes:20,projectId:project.id}};
    const one=await (await call('/sync','POST',write,a.accessToken)).json();const two=await (await call('/sync','POST',write,a.accessToken)).json();assert.equal(one.item.id,two.item.id);
    assert.equal((await call('/sync','POST',{...write,payload:{...write.payload,title:'Changed replay'}},a.accessToken)).status,409);
    assert.ok((await pool.query('SELECT * FROM public.audit_logs WHERE owner_id=$1',[a.user.id])).rowCount!>0);
    const refresh=await call('/auth/refresh','POST',{refreshToken:a.refreshToken});assert.equal(refresh.status,200);
    const renewed=await refresh.json();
    assert.equal((await call('/auth/refresh','POST',{refreshToken:a.refreshToken})).status,401);
    assert.equal((await call('/projects','GET',undefined,a.accessToken)).status,401);
    assert.equal((await call('/privacy/delete-account','POST',{confirmation:'DELETE MY ACCOUNT',password:'incorrect'},renewed.accessToken)).status,401);
    const deletion=await call('/privacy/delete-account','POST',{confirmation:'DELETE MY ACCOUNT',password:'A long test password 123!'},renewed.accessToken);
    assert.equal(deletion.status,204,await deletion.text());
    assert.equal((await pool.query('SELECT id FROM public.users WHERE id=$1',[a.user.id])).rowCount,0);
  } finally {
    await pool.query('DELETE FROM public.auth_attempts WHERE key=$1',[tokenHash(`${rateScope}:127.0.0.1`)]);
    for(const owner of owners){
      await pool.query('DELETE FROM public.user_memories WHERE user_id=$1',[owner]);
      for(const table of ['sync_operations','calendar_events','ai_actions','ai_interactions','task_dependencies','tasks','knowledge_items','projects'])await pool.query(`DELETE FROM public.${table} WHERE owner_id=$1`,[owner]);
      for(const table of ['auth_sessions','auth_credentials'])await pool.query(`DELETE FROM public.${table} WHERE user_id=$1`,[owner]);
      await pool.query('DELETE FROM public.users WHERE id=$1',[owner]);
    }
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await pool.end();
  }
});
