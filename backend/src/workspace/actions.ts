import type { Pool } from 'pg';
import { transaction } from '../platform/database.ts';
import { ApiError, choice, id, integer, keys, object, text, timestamp } from '../platform/validation.ts';
import type { Change, Proposal } from './contracts.ts';
import { WorkspaceRepository } from './repository.ts';

export function validateChanges(input:unknown):Change[] {
  if(!Array.isArray(input)||input.length<1||input.length>30)throw new ApiError(400,'invalid_actions','Provide 1–30 changes.');
  return input.map(value=>{
    const b=object(value);
    if(b.kind==='create_task') {
      keys(b,['kind','title','description','projectId','parentTaskId','minutes','deadline']);
      return {kind:'create_task',title:text(b.title,'Title',500),description:text(b.description??'','Description',10000,0),projectId:b.projectId==null?null:id(b.projectId),parentTaskId:b.parentTaskId==null?null:id(b.parentTaskId),minutes:integer(b.minutes,'Estimate',1,240),deadline:b.deadline==null?null:timestamp(b.deadline)};
    }
    if(b.kind==='schedule_task') {
      keys(b,['kind','taskId','revision','startsAt','endsAt']);
      const startsAt=timestamp(b.startsAt),endsAt=timestamp(b.endsAt);
      if(Date.parse(endsAt)<=Date.parse(startsAt))throw new ApiError(400,'invalid_interval','End must follow start.');
      return {kind:'schedule_task',taskId:id(b.taskId),revision:integer(b.revision,'Revision',1,2147483647),startsAt,endsAt};
    }
    if(b.kind==='link') {
      keys(b,['kind','sourceId','targetId','type']);
      const sourceId=id(b.sourceId),targetId=id(b.targetId);
      if(sourceId===targetId)throw new ApiError(400,'invalid_link','Choose two distinct entities.');
      return {kind:'link',sourceId,targetId,type:choice(b.type,['related_to','supports','informs','contradicts','references'],'relationship')};
    }
    throw new ApiError(400,'invalid_action','Unsupported action.');
  });
}
export class ActionService {
  pool:Pool;repository:WorkspaceRepository;
  constructor(pool:Pool){this.pool=pool;this.repository=new WorkspaceRepository(pool);}
  async propose(owner:string,source:Proposal['source'],summary:string,input:unknown,interactionId:string|null=null) {
    const changes=validateChanges(input);
    const review=[];
    for(const change of changes) {
      if(change.kind==='create_task'&&change.parentTaskId){
        const parent=await this.pool.query('SELECT id FROM public.tasks WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL AND parent_task_id IS NULL',[change.parentTaskId,owner]);
        if(!parent.rowCount)throw new ApiError(404,'not_found','Parent task not found or is already a subtask.');
      }
      if(change.kind==='create_task'&&change.projectId) {
        const project=await this.pool.query('SELECT id FROM public.projects WHERE id=$1 AND owner_id=$2',[change.projectId,owner]);
        if(!project.rowCount)throw new ApiError(404,'not_found','Project not found.');
      }
      if(change.kind==='schedule_task') {
        const task=await this.pool.query('SELECT instruction,revision FROM public.tasks WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL',[change.taskId,owner]);
        if(!task.rows[0]||task.rows[0].revision!==change.revision)throw new ApiError(409,'conflict','Task changed or is unavailable.');
        const events=(await this.pool.query('SELECT id,starts_at,ends_at,revision FROM public.calendar_events WHERE owner_id=$1 AND task_id=$2 ORDER BY id',[owner,change.taskId])).rows;
        review.push({change,before:events,after:{title:task.rows[0].instruction,startsAt:change.startsAt,endsAt:change.endsAt}});
      } else if(change.kind==='link'){
        const [sourceGraph,targetGraph]=await Promise.all([this.repository.graph(owner,change.sourceId),this.repository.graph(owner,change.targetId)]);
        const source=sourceGraph.nodes.find(n=>n.id===change.sourceId),target=targetGraph.nodes.find(n=>n.id===change.targetId);
        if(!source||!target)throw new ApiError(404,'not_found','A relationship endpoint is unavailable.');
        review.push({change,before:null,after:{sourceTitle:source.title,targetTitle:target.title,type:change.type}});
      } else review.push({change,before:null,after:change});
    }
    return (await this.pool.query<Proposal>(`INSERT INTO public.ai_actions(owner_id,source,summary,changes,interaction_id,result) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[owner,choice(source,['assistant','planner','capture','knowledge'],'source'),text(summary,'Summary',2000),JSON.stringify(changes),interactionId,JSON.stringify({review})])).rows[0]!;
  }
  async decide(owner:string,proposalId:string,decision:'apply'|'reject') {
    return transaction(this.pool,async client=>{
      await client.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[owner]);
      const found=await client.query<Proposal>('SELECT * FROM public.ai_actions WHERE id=$1 AND owner_id=$2 FOR UPDATE',[proposalId,owner]);
      const proposal=found.rows[0];if(!proposal)throw new ApiError(404,'not_found','Proposal not found.');
      if(proposal.status===(decision==='apply'?'applied':'rejected'))return proposal;
      if(proposal.status!=='pending')throw new ApiError(409,'conflict','This proposal has already been decided.');
      const results:unknown[]=[];
      if(decision==='apply')for(const change of validateChanges(proposal.changes)) {
        if(change.kind==='create_task') {
          const {kind:_kind,...input}=change;results.push({kind:change.kind,record:await this.repository.saveTask(owner,input,undefined,client)});
        } else if(change.kind==='link') {
          const endpoints=(await client.query('SELECT id,kind FROM public.entity_nodes WHERE owner_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE',[owner,[change.sourceId,change.targetId]])).rows;
          if(endpoints.length!==2)throw new ApiError(409,'stale_relationship','A relationship endpoint is no longer available.');
          for(const kind of ['task','knowledge']){
            const endpointIds=endpoints.filter(e=>e.kind===kind).map(e=>e.id);
            if(!endpointIds.length)continue;
            const table=kind==='task'?'tasks':'knowledge_items';
            const active=await client.query(`SELECT id FROM public.${table} WHERE owner_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL FOR UPDATE`,[owner,endpointIds]);
            if(active.rowCount!==endpointIds.length)throw new ApiError(409,'stale_relationship','A relationship endpoint was deleted after this proposal.');
          }
          const result=await client.query(`INSERT INTO public.relationships(owner_id,source_id,target_id,type,confidence,created_by)
            VALUES($1,$2,$3,$4,1,'confirmed_ai') RETURNING *`,[owner,change.sourceId,change.targetId,change.type]);
          results.push({kind:change.kind,record:result.rows[0]});
        } else {
          if(Date.parse(change.startsAt)<Date.now())throw new ApiError(409,'stale_schedule','This proposed time is in the past. Generate a new schedule.');
          const task=(await client.query('SELECT * FROM public.tasks WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE',[change.taskId,owner])).rows[0];
          if(!task||task.revision!==change.revision||task.status==='completed')throw new ApiError(409,'conflict','A proposed task has changed. Generate a new proposal.');
          const overlap=await client.query(`SELECT id FROM public.calendar_events WHERE owner_id=$1 AND starts_at<$3 AND ends_at>$2 LIMIT 1`,[owner,change.startsAt,change.endsAt]);
          if(overlap.rowCount)throw new ApiError(409,'calendar_conflict','Calendar changed or this slot overlaps an existing event.');
          const dependencies=await client.query(`SELECT d.depends_on_id FROM public.task_dependencies d JOIN public.tasks t ON t.id=d.depends_on_id AND t.owner_id=d.owner_id
            WHERE d.owner_id=$1 AND d.task_id=$2 AND t.status<>'completed' AND NOT EXISTS(
              SELECT 1 FROM public.calendar_events e WHERE e.owner_id=$1 AND e.task_id=t.id AND e.ends_at<=$3)`,[owner,task.id,change.startsAt]);
          if(dependencies.rowCount)throw new ApiError(409,'dependency_conflict','A prerequisite must be scheduled earlier or completed.');
          const result=await client.query(`INSERT INTO public.calendar_events(owner_id,task_id,title,starts_at,ends_at) VALUES($1,$2,$3,$4,$5) RETURNING *`,[owner,task.id,task.instruction,change.startsAt,change.endsAt]);
          results.push({kind:change.kind,record:result.rows[0]});
        }
      }
      return (await client.query<Proposal>(`UPDATE public.ai_actions SET status=$3,decided_at=now(),result=result||$4::jsonb WHERE id=$1 AND owner_id=$2 RETURNING *`,[proposalId,owner,decision==='apply'?'applied':'rejected',JSON.stringify({applied:results})])).rows[0]!;
    },`confirmed_action:${proposalId}`);
  }
  async undo(owner:string,proposalId:string){
    return transaction(this.pool,async client=>{
      await client.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[owner]);
      const proposal=(await client.query<Proposal>('SELECT * FROM public.ai_actions WHERE id=$1 AND owner_id=$2 FOR UPDATE',[proposalId,owner])).rows[0];
      if(!proposal)throw new ApiError(404,'not_found','Proposal not found.');
      if(proposal.status==='undone')return proposal;
      if(proposal.status!=='applied')throw new ApiError(409,'conflict','Only an applied proposal can be reversed.');
      const results=object(proposal.result).applied;
      if(!Array.isArray(results))throw new ApiError(409,'conflict','No reversible result was recorded.');
      for(const entry of [...results].reverse()){
        const result=object(entry),record=object(result.record),entityId=id(record.id);
        if(result.kind==='create_task'){
          const referenced=await client.query(`SELECT 1 FROM public.calendar_events WHERE owner_id=$1 AND task_id=$2
            UNION ALL SELECT 1 FROM public.tasks WHERE owner_id=$1 AND parent_task_id=$2 AND deleted_at IS NULL
            UNION ALL SELECT 1 FROM public.task_dependencies WHERE owner_id=$1 AND (task_id=$2 OR depends_on_id=$2)
            UNION ALL SELECT 1 FROM public.relationships WHERE owner_id=$1 AND (source_id=$2 OR target_id=$2) LIMIT 1`,[owner,entityId]);
          if(referenced.rowCount)throw new ApiError(409,'undo_conflict','This task is now referenced by other work.');
          const changed=await client.query(`UPDATE public.tasks SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 AND owner_id=$2 AND revision=$3 AND deleted_at IS NULL RETURNING id`,[entityId,owner,record.revision]);
          if(!changed.rowCount)throw new ApiError(409,'undo_conflict','A created task has changed. Undo would overwrite later work.');
        }else if(result.kind==='schedule_task'){
          const removed=await client.query('DELETE FROM public.calendar_events WHERE id=$1 AND owner_id=$2 AND revision=$3 RETURNING id',[entityId,owner,record.revision]);
          if(!removed.rowCount)throw new ApiError(409,'undo_conflict','A calendar event has changed.');
        }else if(result.kind==='link'){
          const removed=await client.query('DELETE FROM public.relationships WHERE id=$1 AND owner_id=$2 RETURNING id',[entityId,owner]);
          if(!removed.rowCount)throw new ApiError(409,'undo_conflict','A relationship has changed.');
        }else throw new ApiError(409,'undo_conflict','This action does not support reversal.');
      }
      return (await client.query<Proposal>("UPDATE public.ai_actions SET status='undone',decided_at=now() WHERE id=$1 AND owner_id=$2 RETURNING *",[proposalId,owner])).rows[0]!;
    },`undo_action:${proposalId}`);
  }
}
