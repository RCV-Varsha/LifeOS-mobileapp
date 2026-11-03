import type { Pool, PoolClient } from 'pg';
import { ApiError, choice, id, integer, keys, object, text, timestamp } from '../platform/validation.ts';
import { transaction } from '../platform/database.ts';
import type { KnowledgeItem, Project, WorkspaceTask } from './contracts.ts';

export function taskInput(value:unknown) {
  const b=object(value);keys(b,['title','description','projectId','parentTaskId','minutes','deadline','priority','category','revision','status','actualMinutes']);
  return {title:text(b.title,'Title',500),description:text(b.description??'','Description',10000,0),projectId:b.projectId==null?null:id(b.projectId),minutes:integer(b.minutes,'Estimate',1,240),deadline:b.deadline==null?null:timestamp(b.deadline),priority:integer(b.priority??0,'Priority',0,3),category:text(b.category??'general','Category',80),status:choice(b.status??'pending',['pending','completed'],'status'),actualMinutes:b.actualMinutes==null?null:integer(b.actualMinutes,'Actual duration',1,1440)};
}
export function knowledgeInput(value:unknown) {
  const b=object(value);keys(b,['title','content','kind','projectId','sourceUrl','revision','decision']);
  const sourceUrl=b.sourceUrl==null?null:text(b.sourceUrl,'Source URL',2048);
  if(sourceUrl&&!/^https?:\/\//i.test(sourceUrl)) throw new ApiError(400,'invalid_url','Use an HTTP or HTTPS source URL.');
  const result={title:text(b.title,'Title'),content:text(b.content??'','Content',200000,0),kind:choice(b.kind,['note','document','idea','resource','concept','decision'],'knowledge type'),projectId:b.projectId==null?null:id(b.projectId),sourceUrl,decision:null as null|{context:string;options:string[];reasoning:string}};
  if(result.kind==='decision') {
    const d=object(b.decision);keys(d,['context','options','reasoning']);
    if(!Array.isArray(d.options)||d.options.length>20)throw new ApiError(400,'invalid_input','Provide up to 20 decision options.');
    result.decision={context:text(d.context,'Decision context',10000),reasoning:text(d.reasoning,'Recorded reasoning',10000),options:d.options.map(x=>text(x,'Option',2000))};
    result.content=[result.content,`Context: ${result.decision.context}`,`Options: ${result.decision.options.join('; ')}`,`Recorded reasoning: ${result.decision.reasoning}`].filter(Boolean).join('\n');
  }
  return result;
}
export class WorkspaceRepository {
  pool:Pool;
  constructor(pool:Pool){this.pool=pool;}
  async list(owner:string,kind:'projects'|'tasks'|'knowledge',query='',offset=0,projectId:string|null=null) {
    const table=kind==='knowledge'?'knowledge_items':kind;
    const title=kind==='tasks'?'instruction':'title';
    const extra=kind==='projects'?"status<>'archived'":'deleted_at IS NULL';
    const project=kind==='projects'?'NULL::uuid':'project_id';
    return (await this.pool.query(`SELECT * FROM public.${table} WHERE owner_id=$1 AND ${extra}
      AND ($2='' OR ${title} ILIKE '%'||$2||'%') AND ($4::uuid IS NULL OR ${project}=$4)
      ORDER BY updated_at DESC,id LIMIT 50 OFFSET $3`,[owner,query,offset,projectId])).rows;
  }
  async projects(owner:string):Promise<Project[]> {return this.list(owner,'projects') as Promise<Project[]>;}
  async tasks(owner:string,projectId:string|null=null):Promise<WorkspaceTask[]> {
    const rows=(await this.pool.query(`SELECT t.*,
      (SELECT json_build_object('completed',count(*) FILTER (WHERE c.status='completed'),'total',count(*)) FROM public.tasks c WHERE c.owner_id=$1 AND c.parent_task_id=t.id AND c.deleted_at IS NULL) AS subtask_progress,
      COALESCE((SELECT array_agg(d.depends_on_id) FROM public.task_dependencies d WHERE d.task_id=t.id AND d.owner_id=$1),'{}') AS dependencies
      FROM public.tasks t WHERE owner_id=$1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR project_id=$2)
      ORDER BY priority DESC,deadline NULLS LAST,created_at LIMIT 500`,[owner,projectId])).rows;
    return rows.map(row=>({...row,deadline:row.deadline?new Date(row.deadline).toISOString():null,updated_at:new Date(row.updated_at).toISOString()}));
  }
  async project(owner:string,projectId:string) {
    const project=(await this.pool.query('SELECT * FROM public.projects WHERE id=$1 AND owner_id=$2',[projectId,owner])).rows[0];
    if(!project)throw new ApiError(404,'not_found','Project not found.');
    const objectives=(await this.pool.query('SELECT * FROM public.objectives WHERE owner_id=$1 AND goal_id=$2 ORDER BY created_at',[owner,project.goal_id])).rows;
    const milestones=(await this.pool.query('SELECT * FROM public.goal_milestones WHERE owner_id=$1 AND goal_id=$2 AND (project_id IS NULL OR project_id=$3) ORDER BY sequence',[owner,project.goal_id,projectId])).rows;
    return {project,objectives,milestones,tasks:await this.tasks(owner,projectId),knowledge:await this.list(owner,'knowledge','',0,projectId)};
  }
  async saveProject(owner:string,value:unknown,projectId?:string) {
    const b=object(value);keys(b,['title','description','goalId','objectiveId','status','deadline','revision']);
    const values=[owner,text(b.title,'Title'),text(b.description??'','Description',10000,0),b.goalId==null?null:id(b.goalId),choice(b.status??'active',['active','paused','completed','archived'],'status'),b.deadline==null?null:timestamp(b.deadline),b.objectiveId==null?null:id(b.objectiveId)];
    const result=projectId
      ?await this.pool.query(`UPDATE public.projects SET title=$2,description=$3,goal_id=$4,status=$5,deadline=$6,objective_id=$7,revision=revision+1,updated_at=now() WHERE owner_id=$1 AND id=$8 AND revision=$9 RETURNING *`,[...values,projectId,integer(b.revision,'Revision',1,2147483647)])
      :await this.pool.query(`INSERT INTO public.projects(owner_id,title,description,goal_id,status,deadline,objective_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,values);
    if(!result.rows[0])throw new ApiError(409,'conflict','Project changed or is unavailable. Reload before editing.');
    return result.rows[0];
  }
  async saveTask(owner:string,value:unknown,taskId?:string,client:Pool|PoolClient=this.pool) {
    const b=taskInput(value);
    const parentTaskId=object(value).parentTaskId==null?null:id(object(value).parentTaskId);
    if(parentTaskId){
      const parent=await client.query('SELECT id FROM public.tasks WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL AND parent_task_id IS NULL',[parentTaskId,owner]);
      if(!parent.rowCount)throw new ApiError(404,'not_found','Parent task not found or is already a subtask.');
      if(taskId)throw new ApiError(400,'invalid_parent','Existing task relationships cannot be changed by an edit.');
    }
    const values=[owner,b.title,b.description,b.projectId,b.minutes,b.deadline,b.priority,b.category,b.status,b.actualMinutes];
    const result=taskId
      ?await client.query(`UPDATE public.tasks SET instruction=$2,description=$3,project_id=$4,planned_minutes=$5,deadline=$6,priority=$7,category=$8,status=$9,actual_minutes=$10,
        completed_at=CASE WHEN $9='completed' THEN COALESCE(completed_at,now()) ELSE NULL END,revision=revision+1,updated_at=now()
        WHERE owner_id=$1 AND id=$11 AND revision=$12 AND deleted_at IS NULL RETURNING *`,[...values,taskId,integer(object(value).revision,'Revision',1,2147483647)])
      :await client.query(`INSERT INTO public.tasks(owner_id,instruction,description,project_id,planned_minutes,deadline,priority,category,status,actual_minutes,completed_at,parent_task_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $9='completed' THEN now() ELSE NULL END,$11) RETURNING *`,[...values,parentTaskId]);
    if(!result.rows[0])throw new ApiError(409,'conflict','Task changed or is unavailable. Reload before editing.');
    if(result.rows[0].parent_task_id&&b.status==='pending')await client.query("UPDATE public.tasks SET status='pending',completed_at=NULL,revision=revision+1,updated_at=now() WHERE id=$1 AND owner_id=$2 AND status='completed' AND deleted_at IS NULL",[result.rows[0].parent_task_id,owner]);
    return result.rows[0];
  }
  async setTaskStatus(owner:string,taskId:string,value:unknown,client:Pool|PoolClient=this.pool){
    const b=object(value);keys(b,['status','title']);
    const status=choice(b.status,['pending','completed'],'status');
    if(status==='completed'){
      const unfinished=await client.query("SELECT id FROM public.tasks WHERE parent_task_id=$1 AND owner_id=$2 AND status='pending' AND deleted_at IS NULL LIMIT 1",[taskId,owner]);
      if(unfinished.rowCount)throw new ApiError(409,'unfinished_subtasks','Complete the remaining subtasks before finishing this main task.');
    }
    const updated=await client.query(`UPDATE public.tasks SET status=$3,completed_at=CASE WHEN $3='completed' THEN now() ELSE NULL END,revision=revision+1,updated_at=now() WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL AND status<>$3 RETURNING *`,[owner,taskId,status]);
    const item=updated.rows[0]??(await client.query('SELECT * FROM public.tasks WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL',[owner,taskId])).rows[0];
    if(!item)throw new ApiError(404,'not_found','Task is no longer available.');
    if(item.parent_task_id&&status==='pending')await client.query("UPDATE public.tasks SET status='pending',completed_at=NULL,revision=revision+1,updated_at=now() WHERE id=$1 AND owner_id=$2 AND status='completed' AND deleted_at IS NULL",[item.parent_task_id,owner]);
    return item;
  }
  async saveKnowledge(owner:string,value:unknown,knowledgeId?:string) {
    const b=knowledgeInput(value);
    return transaction(this.pool,async client=>{
      const values=[owner,b.title,b.content,b.kind,b.projectId,b.sourceUrl];
      const result=knowledgeId
        ?await client.query<KnowledgeItem>(`UPDATE public.knowledge_items SET title=$2,content=$3,kind=$4,project_id=$5,source_url=$6,revision=revision+1,updated_at=now()
          WHERE owner_id=$1 AND id=$7 AND revision=$8 AND deleted_at IS NULL RETURNING *`,[...values,knowledgeId,integer(object(value).revision,'Revision',1,2147483647)])
        :await client.query<KnowledgeItem>(`INSERT INTO public.knowledge_items(owner_id,title,content,kind,project_id,source_url) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,values);
      const item=result.rows[0];if(!item)throw new ApiError(409,'conflict','Knowledge changed or is unavailable. Reload before editing.');
      await client.query('DELETE FROM public.knowledge_chunks WHERE knowledge_id=$1 AND owner_id=$2',[item.id,owner]);
      await client.query('DELETE FROM public.decisions WHERE knowledge_id=$1 AND owner_id=$2',[item.id,owner]);
      if(b.decision)await client.query(`INSERT INTO public.decisions(knowledge_id,owner_id,context,options,reasoning) VALUES($1,$2,$3,$4,$5)`,[item.id,owner,b.decision.context,b.decision.options,b.decision.reasoning]);
      return item;
    });
  }
  async dependency(owner:string,taskId:string,dependsOnId:string) {
    return transaction(this.pool,async client=>{
      // One owner lock serializes cycle checks and dependency mutations.
      await client.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[owner]);
      const cycle=await client.query(`WITH RECURSIVE ancestors(id) AS (
        SELECT $2::uuid UNION SELECT d.depends_on_id FROM public.task_dependencies d JOIN ancestors a ON d.task_id=a.id WHERE d.owner_id=$1)
        SELECT 1 FROM ancestors WHERE id=$3`,[owner,dependsOnId,taskId]);
      if(cycle.rowCount)throw new ApiError(409,'dependency_cycle','This dependency would create a cycle.');
      await client.query('INSERT INTO public.task_dependencies(owner_id,task_id,depends_on_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[owner,taskId,dependsOnId]);
      return {taskId,dependsOnId};
    });
  }
  async graph(owner:string,root:string|null) {
    const edges=(await this.pool.query(`SELECT * FROM public.relationships WHERE owner_id=$1 AND ($2::uuid IS NULL OR source_id=$2 OR target_id=$2) ORDER BY created_at DESC LIMIT 100`,[owner,root])).rows;
    const ids=[...new Set(edges.flatMap(e=>[e.source_id,e.target_id]))];
    if(root)ids.push(root);
    const nodes=(await this.pool.query(`SELECT n.*,COALESCE(g.title,p.title,t.instruction,k.title,m.title) AS title FROM public.entity_nodes n
      LEFT JOIN public.goals g ON g.id=n.id AND g.owner_id=n.owner_id
      LEFT JOIN public.projects p ON p.id=n.id AND p.owner_id=n.owner_id
      LEFT JOIN public.tasks t ON t.id=n.id AND t.owner_id=n.owner_id
      LEFT JOIN public.knowledge_items k ON k.id=n.id AND k.owner_id=n.owner_id
      LEFT JOIN public.goal_milestones m ON m.id=n.id AND m.owner_id=n.owner_id
      WHERE n.owner_id=$1 AND n.id=ANY($2::uuid[]) AND t.deleted_at IS NULL AND k.deleted_at IS NULL`,[owner,ids])).rows;
    const visible=new Set(nodes.map(n=>n.id));
    return {nodes,edges:edges.filter(e=>visible.has(e.source_id)&&visible.has(e.target_id)),limit:100};
  }
}
