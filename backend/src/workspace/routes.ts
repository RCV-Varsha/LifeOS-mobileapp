import { Router, type ErrorRequestHandler } from 'express';
import type { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { currentUser } from '../auth.ts';
import { ApiError, choice, id, integer, keys, object, text, timestamp } from '../platform/validation.ts';
import { transaction } from '../platform/database.ts';
import { WorkspaceRepository } from './repository.ts';
import { ActionService } from './actions.ts';
import { RetrievalService } from './retrieval.ts';
import { AssistantService } from './assistant.ts';
import { correction, freeBlocks, projectInsights } from './planning.ts';
import { proposeSchedule } from './planningService.ts';
import { presentActivity } from './activityPresentation.ts';

export function workspaceRouter(pool:Pool) {
  const router=Router(),repository=new WorkspaceRepository(pool),actions=new ActionService(pool),retrieval=new RetrievalService(pool),assistant=new AssistantService(pool);
  router.get('/projects',async(req,res)=>res.json({items:await repository.list(currentUser(req).id,'projects',String(req.query.q??''),integer(Number(req.query.offset??0),'Offset',0,100000))}));
  router.post('/projects',async(req,res)=>res.status(201).json({item:await repository.saveProject(currentUser(req).id,req.body)}));
  router.get('/projects/:id',async(req,res)=>res.json(await repository.project(currentUser(req).id,id(req.params.id))));
  router.put('/projects/:id',async(req,res)=>res.json({item:await repository.saveProject(currentUser(req).id,req.body,id(req.params.id))}));
  router.get('/workspace/tasks',async(req,res)=>res.json({items:await repository.tasks(currentUser(req).id,req.query.projectId?id(req.query.projectId):null)}));
  router.post('/workspace/tasks',async(req,res)=>res.status(201).json({item:await repository.saveTask(currentUser(req).id,req.body)}));
  router.put('/workspace/tasks/:id',async(req,res)=>res.json({item:await repository.saveTask(currentUser(req).id,req.body,id(req.params.id))}));
  router.post('/workspace/tasks/:id/dependencies',async(req,res)=>{
    const b=object(req.body);keys(b,['dependsOnId']);
    res.status(201).json(await repository.dependency(currentUser(req).id,id(req.params.id),id(b.dependsOnId)));
  });
  router.get('/knowledge',async(req,res)=>res.json({items:await repository.list(currentUser(req).id,'knowledge',String(req.query.q??''),integer(Number(req.query.offset??0),'Offset',0,100000),req.query.projectId?id(req.query.projectId):null)}));
  router.post('/knowledge',async(req,res)=>res.status(201).json({item:await repository.saveKnowledge(currentUser(req).id,req.body)}));
  router.get('/knowledge/:id',async(req,res)=>{
    const owner=currentUser(req).id,knowledgeId=id(req.params.id);
    const item=(await pool.query('SELECT * FROM public.knowledge_items WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',[knowledgeId,owner])).rows[0];
    if(!item)throw new ApiError(404,'not_found','Knowledge item not found.');
    const decision=(await pool.query('SELECT * FROM public.decisions WHERE knowledge_id=$1 AND owner_id=$2',[knowledgeId,owner])).rows[0]??null;
    res.json({item,decision,graph:await repository.graph(owner,knowledgeId)});
  });
  router.put('/knowledge/:id',async(req,res)=>res.json({item:await repository.saveKnowledge(currentUser(req).id,req.body,id(req.params.id))}));
  router.delete('/knowledge/:id',async(req,res)=>{
    const revision=integer(object(req.body).revision,'Revision',1,2147483647);
    const result=await pool.query(`UPDATE public.knowledge_items SET deleted_at=now(),revision=revision+1 WHERE id=$1 AND owner_id=$2 AND revision=$3 AND deleted_at IS NULL RETURNING id`,[id(req.params.id),currentUser(req).id,revision]);
    if(!result.rowCount)throw new ApiError(409,'conflict','Knowledge changed or is unavailable.');
    res.status(204).end();
  });
  router.post('/knowledge/:id/index',async(req,res)=>res.json(await retrieval.index(currentUser(req).id,id(req.params.id))));
  router.get('/graph',async(req,res)=>res.json(await repository.graph(currentUser(req).id,req.query.root?id(req.query.root):null)));
  router.post('/relationships',async(req,res)=>{
    const b=object(req.body);keys(b,['sourceId','targetId','type']);
    res.status(201).json({item:(await pool.query(`INSERT INTO public.relationships(owner_id,source_id,target_id,type,confidence,created_by) VALUES($1,$2,$3,$4,1,'user') RETURNING *`,[currentUser(req).id,id(b.sourceId),id(b.targetId),choice(b.type,['related_to','supports','informs','contradicts','references'],'relationship')])).rows[0]});
  });
  router.get('/search',async(req,res)=>res.json({items:await retrieval.search(currentUser(req).id,text(req.query.q,'Query',500),choice(req.query.mode??'keyword',['keyword','semantic'],'search mode'),req.query.projectId?id(req.query.projectId):null)}));
  router.post('/ai/assistant',async(req,res)=>{
    const b=object(req.body);keys(b,['input','projectId','semantic','parentTaskId']);
    if(b.semantic!==undefined&&typeof b.semantic!=='boolean')throw new ApiError(400,'invalid_input','Semantic must be boolean.');
    res.json(await assistant.ask(currentUser(req).id,text(b.input,'Input',4000),b.projectId==null?null:id(b.projectId),b.semantic===true,undefined,b.parentTaskId==null?null:id(b.parentTaskId)));
  });
  router.get('/ai/actions',async(req,res)=>res.json({items:(await pool.query('SELECT * FROM public.ai_actions WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50',[currentUser(req).id])).rows}));
  router.post('/ai/actions/:id/:decision',async(req,res)=>{
    const decision=choice(req.params.decision,['apply','reject','undo'],'decision');
    const b=object(req.body);keys(b,['confirmed']);
    if(b.confirmed!==true)throw new ApiError(400,'confirmation_required','Explicit confirmation is required.');
    res.json({item:decision==='undo'?await actions.undo(currentUser(req).id,id(req.params.id)):await actions.decide(currentUser(req).id,id(req.params.id),decision)});
  });
  router.get('/calendar',async(req,res)=>{
    const start=timestamp(req.query.start),end=timestamp(req.query.end);
    if(Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>366*86400000)throw new ApiError(400,'invalid_window','Choose a positive range no longer than one year.');
    const items=(await pool.query('SELECT * FROM public.calendar_events WHERE owner_id=$1 AND starts_at<$3 AND ends_at>$2 ORDER BY starts_at',[currentUser(req).id,start,end])).rows;
    res.json({items,freeBlocks:freeBlocks(start,end,items)});
  });
  router.post('/calendar',async(req,res)=>{
    const b=object(req.body);keys(b,['title','startsAt','endsAt']);const start=timestamp(b.startsAt),end=timestamp(b.endsAt);
    if(Date.parse(end)<=Date.parse(start))throw new ApiError(400,'invalid_window','End must follow start.');
    const owner=currentUser(req).id;
    const item=await transaction(pool,async client=>{
      await client.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[owner]);
      return (await client.query('INSERT INTO public.calendar_events(owner_id,title,starts_at,ends_at) VALUES($1,$2,$3,$4) RETURNING *',[owner,text(b.title,'Title'),start,end])).rows[0];
    });res.status(201).json({item});
  });
  router.post('/planner/proposals',async(req,res)=>res.json(await proposeSchedule(pool,currentUser(req).id,req.body)));
  router.get('/intelligence',async(req,res)=>{
    const tasks=await repository.tasks(currentUser(req).id,req.query.projectId?id(req.query.projectId):null);
    res.json({items:projectInsights(tasks),basis:'Deterministic checks of recorded task data; system estimates, not a health score.'});
  });
  router.get('/analytics',async(req,res)=>{
    const owner=currentUser(req).id,tasks=await repository.tasks(owner);
    const categories=[...new Set(tasks.map(t=>t.category))];
    const trends=(await pool.query(`SELECT completed_at::date AS date,count(*)::int AS completed,sum(actual_minutes)::int AS actual_minutes FROM public.tasks WHERE owner_id=$1 AND status='completed' AND deleted_at IS NULL AND completed_at>now()-interval '30 days' GROUP BY 1 ORDER BY 1`,[owner])).rows;
    const outcomes=(await pool.query('SELECT status,count(*)::int AS count FROM public.ai_actions WHERE owner_id=$1 GROUP BY status',[owner])).rows;
    res.json({total:tasks.length,completed:tasks.filter(t=>t.status==='completed').length,pending:tasks.filter(t=>t.status==='pending').length,corrections:categories.map(category=>({category,...correction(tasks,category)})),trends,actionOutcomes:outcomes,sampleLimit:500});
  });
  router.get('/activity',async(req,res)=>res.json({items:(await pool.query(`SELECT id,entity_id,entity_type,operation,actor,created_at,before_value,after_value FROM public.audit_logs WHERE owner_id=$1 AND ($2::bigint IS NULL OR id<$2) ORDER BY id DESC LIMIT 50`,[currentUser(req).id,req.query.before?text(req.query.before,'Cursor',30):null])).rows.map(presentActivity)}));
  router.get('/notifications',async(req,res)=>res.json({items:(await pool.query('SELECT * FROM public.notifications WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50',[currentUser(req).id])).rows}));
  router.post('/notifications/:id/read',async(req,res)=>{
    const result=await pool.query('UPDATE public.notifications SET read_at=COALESCE(read_at,now()) WHERE owner_id=$1 AND id=$2 RETURNING *',[currentUser(req).id,id(req.params.id)]);
    if(!result.rowCount)throw new ApiError(404,'not_found','Notification not found.');res.json({item:result.rows[0]});
  });
  router.post('/sync',async(req,res)=>{
    const b=object(req.body);keys(b,['operationId','kind','entityId','payload']);
    const owner=currentUser(req).id,operationId=id(b.operationId),kind=choice(b.kind,['create_task','update_task','set_task_status'],'sync kind');
    const entityId=kind==='create_task'?null:id(b.entityId);
    const hash=createHash('sha256').update(JSON.stringify({kind,entityId,payload:b.payload})).digest('hex');
    const result=await transaction(pool,async client=>{
      await client.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[owner]);
      const existing=(await client.query('SELECT * FROM public.sync_operations WHERE owner_id=$1 AND operation_id=$2',[owner,operationId])).rows[0];
      if(existing){if(existing.request_hash!==hash)throw new ApiError(409,'idempotency_conflict','Operation ID was reused with different content.');return existing.result;}
      const item=kind==='set_task_status'?await repository.setTaskStatus(owner,entityId!,b.payload,client):await repository.saveTask(owner,b.payload,entityId??undefined,client);
      await client.query('INSERT INTO public.sync_operations(owner_id,operation_id,request_hash,result) VALUES($1,$2,$3,$4)',[owner,operationId,hash,JSON.stringify({item})]);
      return {item};
    },'offline_sync');res.json(result);
  });
  return router;
}
export const apiErrors:ErrorRequestHandler=(error,req,res,_next)=>{
  const requestId=randomUUID();
  if(error instanceof ApiError){res.status(error.status).json({error:error.message,code:error.code,requestId});return;}
  const code=error&&typeof error==='object'&&'code'in error?error.code:null;
  if(code==='23503'||code==='23514'||code==='23505'||code==='22P02'){
    res.status(409).json({error:'A referenced record is unavailable, duplicated, or violates a domain constraint.',code:'constraint_conflict',requestId});return;
  }
  if(error?.type==='entity.parse.failed'||error?.type==='entity.too.large'){
    res.status(error.type==='entity.too.large'?413:400).json({error:'Invalid or oversized JSON body.',code:'invalid_input',requestId});return;
  }
  console.error(JSON.stringify({level:'error',event:'api_failure',requestId,method:req.method,code:typeof code==='string'?code:'unknown'}));
  res.status(500).json({error:'The operation failed. Please retry.',code:'internal_error',requestId});
};
