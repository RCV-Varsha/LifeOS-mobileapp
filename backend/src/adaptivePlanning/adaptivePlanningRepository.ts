import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { calendarDay } from '../dailyReview/date.ts';
import { validateAdaptiveExplanation } from './explanationSchema.ts';
import type { AdaptiveExplanation, AdaptiveProposal, PlanEvaluation, PlannedItem, PlanningTask } from './types.ts';

export class AdaptiveConflictError extends Error {
  readonly code: 'idempotency_conflict' | 'stale' | 'invalid_selection' | 'already_decided' | 'undo_conflict';
  constructor(code: 'idempotency_conflict' | 'stale' | 'invalid_selection' | 'already_decided' | 'undo_conflict') {
    super(code);
    this.name = 'AdaptiveConflictError';
    this.code = code;
  }
}

export type DailyContext = {
  id: string; ownerId: string; date: string; timeZone: string; availableMinutes: number;
  priorityTaskId: string | null; blocker: string; note: string; revision: number;
  createdAt: Date; updatedAt: Date;
};

type ProposalRow = {
  id: string; ownerId: string; date: string; timeZone: string;
  status: AdaptiveProposal['status']; contextRevision: number; baseDailyPlanVersion: number;
  proposal: unknown; explanation: unknown; createdAt: Date; decidedAt: Date | null;
  requestHash: string; decisionKey: string | null; decisionHash: string | null;
  taskRevisions: Record<string, number>; planVersions: Record<string, number>;
};

export function requestHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function parseEvaluation(value: unknown): PlanEvaluation & { eligibleTasks: PlanningTask[] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid stored proposal');
  const proposal = value as Record<string, unknown>;
  if (!Array.isArray(proposal.selected) || !Array.isArray(proposal.omittedTaskIds) || !Array.isArray(proposal.conflicts) || !Array.isArray(proposal.uncertainty) || !Array.isArray(proposal.eligibleTasks)) throw new Error('Invalid stored proposal');
  return proposal as PlanEvaluation & { eligibleTasks: PlanningTask[] };
}

function mapProposal(row: ProposalRow): AdaptiveProposal {
  const value = parseEvaluation(row.proposal);
  const authorized = new Set(value.eligibleTasks.map((task) => task.id));
  return {
    id: row.id, ownerId: row.ownerId, date: row.date, timeZone: row.timeZone,
    status: row.status, contextRevision: row.contextRevision,
    baseDailyPlanVersion: row.baseDailyPlanVersion, ...value,
    explanation: row.explanation === null ? null : validateAdaptiveExplanation(row.explanation, authorized),
    createdAt: row.createdAt, decidedAt: row.decidedAt,
  };
}

const proposalColumns = `SELECT id, owner_id AS "ownerId", local_date::text AS "date", time_zone AS "timeZone",
  status, context_revision AS "contextRevision", base_daily_plan_version AS "baseDailyPlanVersion",
  task_revisions AS "taskRevisions", plan_versions AS "planVersions", proposal, explanation,
  request_hash AS "requestHash", decision_key AS "decisionKey", decision_hash AS "decisionHash",
  created_at AS "createdAt", decided_at AS "decidedAt" FROM public.daily_plan_proposals`;

export class AdaptivePlanningRepository {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async getContext(ownerId: string, date: string, timeZone: string) {
    const result = await this.pool.query<DailyContext>(
      `SELECT id, owner_id AS "ownerId", local_date::text AS date, time_zone AS "timeZone",
       available_minutes AS "availableMinutes", priority_task_id AS "priorityTaskId", blocker, note,
       revision, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM public.daily_contexts WHERE owner_id=$1 AND local_date=$2 AND time_zone=$3`, [ownerId, date, timeZone]);
    return result.rows[0] ?? null;
  }

  async putContext(ownerId: string, date: string, timeZone: string, input: { availableMinutes: number; priorityTaskId: string | null; blocker: string; note: string }) {
    if (input.priorityTaskId) {
      const owned = await this.pool.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM public.tasks t INNER JOIN public.goal_plans gp ON gp.id=t.goal_plan_id
         WHERE t.id=$1 AND t.owner_id=$2 AND gp.owner_id=$2 AND gp.status='accepted') AS exists`, [input.priorityTaskId, ownerId]);
      if (!owned.rows[0]?.exists) throw new AdaptiveConflictError('invalid_selection');
    }
    const result = await this.pool.query<DailyContext>(
      `INSERT INTO public.daily_contexts(owner_id,local_date,time_zone,available_minutes,priority_task_id,blocker,note)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(owner_id,local_date,time_zone) DO UPDATE SET
         available_minutes=EXCLUDED.available_minutes, priority_task_id=EXCLUDED.priority_task_id,
         blocker=EXCLUDED.blocker, note=EXCLUDED.note,
         revision=public.daily_contexts.revision + CASE WHEN
           (public.daily_contexts.available_minutes, public.daily_contexts.priority_task_id, public.daily_contexts.blocker, public.daily_contexts.note)
           IS DISTINCT FROM
           (EXCLUDED.available_minutes, EXCLUDED.priority_task_id, EXCLUDED.blocker, EXCLUDED.note)
           THEN 1 ELSE 0 END,
         updated_at=CASE WHEN
           (public.daily_contexts.available_minutes, public.daily_contexts.priority_task_id, public.daily_contexts.blocker, public.daily_contexts.note)
           IS DISTINCT FROM
           (EXCLUDED.available_minutes, EXCLUDED.priority_task_id, EXCLUDED.blocker, EXCLUDED.note)
           THEN CURRENT_TIMESTAMP ELSE public.daily_contexts.updated_at END
       RETURNING id,owner_id AS "ownerId",local_date::text AS date,time_zone AS "timeZone",
         available_minutes AS "availableMinutes",priority_task_id AS "priorityTaskId",blocker,note,revision,
         created_at AS "createdAt",updated_at AS "updatedAt"`,
      [ownerId,date,timeZone,input.availableMinutes,input.priorityTaskId,input.blocker,input.note]);
    return result.rows[0]!;
  }

  async tasksForDate(ownerId: string, date: { key: number }, timeZone: string): Promise<PlanningTask[]> {
    const result = await this.pool.query<PlanningTask & { acceptedAt: Date; dayNumber: number; dailySelected: boolean }>(
      `SELECT t.id,gp.goal_id AS "goalId",gp.id AS "goalPlanId",gp.goal_title AS "goalTitle",
       t.instruction,t.planned_minutes AS "estimatedMinutes",t.status,g.priority AS "goalPriority",
       floor(extract(epoch from gp.accepted_at))::bigint AS "planOrder",t.position AS "taskOrder",
       t.revision,gp.version AS "planVersion",gp.accepted_at AS "acceptedAt",t.day_number AS "dayNumber",
       EXISTS(SELECT 1 FROM public.daily_plan_items dpi INNER JOIN public.daily_plans dp ON dp.id=dpi.daily_plan_id
         WHERE dpi.task_id=t.id AND dp.owner_id=$1 AND dp.local_date=$2 AND dp.time_zone=$3) AS "dailySelected"
       FROM public.tasks t INNER JOIN public.goal_plans gp ON gp.id=t.goal_plan_id
       INNER JOIN public.goals g ON g.id=gp.goal_id
       WHERE t.owner_id=$1 AND gp.owner_id=$1 AND g.owner_id=$1 AND gp.status='accepted' AND gp.accepted_at IS NOT NULL
       ORDER BY gp.accepted_at,gp.goal_id,t.day_number,t.position`, [ownerId, dateKeyToIso(date.key), timeZone]);
    return result.rows.filter((task) => task.dailySelected || date.key - calendarDay(task.acceptedAt,timeZone).key + 1 === task.dayNumber)
      .map(({acceptedAt:_a,dayNumber:_d,dailySelected:_s,...task}) => ({...task,planOrder:-Number(task.planOrder)}));
  }

  async dailyPlanVersion(ownerId: string, date: string, timeZone: string) {
    const result = await this.pool.query<{ version: number }>('SELECT version FROM public.daily_plans WHERE owner_id=$1 AND local_date=$2 AND time_zone=$3',[ownerId,date,timeZone]);
    return result.rows[0]?.version ?? 0;
  }

  async createProposal(ownerId: string, date: string, timeZone: string, context: DailyContext, tasks: PlanningTask[], evaluation: PlanEvaluation, explanation: AdaptiveExplanation | null, requestKey: string, hash: string) {
    const existing = await this.findByRequestKey(ownerId,requestKey);
    if (existing) {
      if (existing.requestHash !== hash) throw new AdaptiveConflictError('idempotency_conflict');
      return { proposal: mapProposal(existing), reused: true };
    }
    const baseDailyPlanVersion = await this.dailyPlanVersion(ownerId,date,timeZone);
    const taskRevisions = Object.fromEntries(tasks.map((task) => [task.id,task.revision]));
    const planVersions = Object.fromEntries(tasks.map((task) => [task.goalPlanId,task.planVersion]));
    const body = {...evaluation,eligibleTasks:tasks};
    try {
      const result = await this.pool.query<ProposalRow>(
        `INSERT INTO public.daily_plan_proposals(owner_id,local_date,time_zone,context_revision,base_daily_plan_version,task_revisions,plan_versions,proposal,explanation,request_key,request_hash)
         VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11)
         RETURNING id,owner_id AS "ownerId",local_date::text AS date,time_zone AS "timeZone",status,
         context_revision AS "contextRevision",base_daily_plan_version AS "baseDailyPlanVersion",task_revisions AS "taskRevisions",plan_versions AS "planVersions",
         proposal,explanation,request_hash AS "requestHash",decision_key AS "decisionKey",decision_hash AS "decisionHash",created_at AS "createdAt",decided_at AS "decidedAt"`,
        [ownerId,date,timeZone,context.revision,baseDailyPlanVersion,JSON.stringify(taskRevisions),JSON.stringify(planVersions),JSON.stringify(body),explanation ? JSON.stringify({summary:explanation.summary,reason:explanation.reason,evidence_task_ids:explanation.evidenceTaskIds,question:explanation.question}) : null,requestKey,hash]);
      return { proposal: mapProposal(result.rows[0]!), reused: false };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        const raced = await this.findByRequestKey(ownerId,requestKey);
        if (raced && raced.requestHash === hash) return {proposal:mapProposal(raced),reused:true};
        throw new AdaptiveConflictError('idempotency_conflict');
      }
      throw error;
    }
  }

  private async findByRequestKey(ownerId:string,key:string) {
    const result=await this.pool.query<ProposalRow>(`${proposalColumns} WHERE owner_id=$1 AND request_key=$2`,[ownerId,key]);
    return result.rows[0]??null;
  }

  async getProposal(ownerId:string,id:string) {
    const result=await this.pool.query<ProposalRow>(`${proposalColumns} WHERE owner_id=$1 AND id=$2`,[ownerId,id]);
    return result.rows[0]?mapProposal(result.rows[0]):null;
  }

  async editProposal(ownerId:string,id:string,evaluation:PlanEvaluation) {
    const current=await this.getProposal(ownerId,id);
    if(!current) return null;
    if(current.status!=='ready') throw new AdaptiveConflictError('already_decided');
    const result=await this.pool.query<ProposalRow>(
      `UPDATE public.daily_plan_proposals SET proposal=$3::jsonb,explanation=NULL
       WHERE owner_id=$1 AND id=$2 AND status='ready'
       RETURNING id,owner_id AS "ownerId",local_date::text AS date,time_zone AS "timeZone",status,
       context_revision AS "contextRevision",base_daily_plan_version AS "baseDailyPlanVersion",task_revisions AS "taskRevisions",plan_versions AS "planVersions",
       proposal,explanation,request_hash AS "requestHash",decision_key AS "decisionKey",decision_hash AS "decisionHash",created_at AS "createdAt",decided_at AS "decidedAt"`,
      [ownerId,id,JSON.stringify({...evaluation,eligibleTasks:current.eligibleTasks})]);
    if(!result.rows[0]) throw new AdaptiveConflictError('already_decided');
    return mapProposal(result.rows[0]);
  }

  async rejectProposal(ownerId:string,id:string) {
    const result=await this.pool.query<ProposalRow>(
      `UPDATE public.daily_plan_proposals SET status='rejected',decided_at=CURRENT_TIMESTAMP
       WHERE owner_id=$1 AND id=$2 AND status='ready'
       RETURNING id,owner_id AS "ownerId",local_date::text AS date,time_zone AS "timeZone",status,
       context_revision AS "contextRevision",base_daily_plan_version AS "baseDailyPlanVersion",task_revisions AS "taskRevisions",plan_versions AS "planVersions",
       proposal,explanation,request_hash AS "requestHash",decision_key AS "decisionKey",decision_hash AS "decisionHash",created_at AS "createdAt",decided_at AS "decidedAt"`,[ownerId,id]);
    if(result.rows[0]) return mapProposal(result.rows[0]);
    return this.getProposal(ownerId,id);
  }

  async markStale(ownerId:string,id:string) {
    await this.pool.query(
      `UPDATE public.daily_plan_proposals SET status='stale',decided_at=CURRENT_TIMESTAMP
       WHERE owner_id=$1 AND id=$2 AND status='ready'`,
      [ownerId,id],
    );
  }

  async acceptProposal(ownerId:string,id:string,decisionKey:string,decisionHash:string) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result=await client.query<ProposalRow>(`${proposalColumns} WHERE owner_id=$1 AND id=$2 FOR UPDATE`,[ownerId,id]);
      const row=result.rows[0];
      if(!row){await client.query('ROLLBACK');return null;}
      if(row.status==='accepted') {
        if(row.decisionKey===decisionKey && row.decisionHash!==decisionHash) throw new AdaptiveConflictError('idempotency_conflict');
        const change=await client.query<{id:string;newVersion:number}>('SELECT id,new_version AS "newVersion" FROM public.daily_plan_changes WHERE proposal_id=$1',[id]);
        await client.query('COMMIT'); return {proposal:mapProposal(row),change:change.rows[0]!,reused:true};
      }
      if(row.status!=='ready') throw new AdaptiveConflictError('already_decided');
      const context=await client.query<{revision:number;availableMinutes:number}>('SELECT revision,available_minutes AS "availableMinutes" FROM public.daily_contexts WHERE owner_id=$1 AND local_date=$2 AND time_zone=$3 FOR UPDATE',[ownerId,row.date,row.timeZone]);
      const stored=parseEvaluation(row.proposal);
      if(context.rows[0]?.revision!==row.contextRevision || stored.selected.reduce((sum,item)=>sum+item.allocationMinutes,0)>(context.rows[0]?.availableMinutes??-1)) throw new AdaptiveConflictError('stale');
      await assertVersions(client,ownerId,row.taskRevisions,row.planVersions);
      const dailyPlan=await client.query<{id:string;version:number;active:boolean}>(
        `INSERT INTO public.daily_plans(owner_id,local_date,time_zone) VALUES($1,$2,$3)
         ON CONFLICT(owner_id,local_date,time_zone) DO UPDATE SET owner_id=EXCLUDED.owner_id
         RETURNING id,version,active`,[ownerId,row.date,row.timeZone]);
      const plan=dailyPlan.rows[0]!;
      if(plan.version!==row.baseDailyPlanVersion) throw new AdaptiveConflictError('stale');
      const previous=await itemsForPlan(client,plan.id);
      await client.query('DELETE FROM public.daily_plan_items WHERE daily_plan_id=$1',[plan.id]);
      for(const [index,item] of stored.selected.entries()) await client.query(
        `INSERT INTO public.daily_plan_items(daily_plan_id,task_id,position,allocated_minutes)
         SELECT $1,t.id,$3,$4 FROM public.tasks t WHERE t.id=$2 AND t.owner_id=$5 AND t.status='pending'`,
        [plan.id,item.taskId,index+1,item.allocationMinutes,ownerId]);
      const count=await client.query<{count:string}>('SELECT count(*)::text AS count FROM public.daily_plan_items WHERE daily_plan_id=$1',[plan.id]);
      if(Number(count.rows[0]?.count)!==stored.selected.length) throw new AdaptiveConflictError('stale');
      const updated=await client.query<{version:number}>('UPDATE public.daily_plans SET version=version+1,active=TRUE,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING version',[plan.id]);
      const change=await client.query<{id:string;newVersion:number}>(
        `INSERT INTO public.daily_plan_changes(owner_id,daily_plan_id,proposal_id,context_revision,previous_active,previous_version,new_version,previous_items,new_items)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) RETURNING id,new_version AS "newVersion"`,
        [ownerId,plan.id,id,row.contextRevision,plan.active,plan.version,updated.rows[0]!.version,JSON.stringify(previous),JSON.stringify(stored.selected)]);
      const accepted=await client.query<ProposalRow>(
        `UPDATE public.daily_plan_proposals SET status='accepted',decision_key=$3,decision_hash=$4,decided_at=CURRENT_TIMESTAMP
         WHERE owner_id=$1 AND id=$2 RETURNING id,owner_id AS "ownerId",local_date::text AS date,time_zone AS "timeZone",status,
         context_revision AS "contextRevision",base_daily_plan_version AS "baseDailyPlanVersion",task_revisions AS "taskRevisions",plan_versions AS "planVersions",
         proposal,explanation,request_hash AS "requestHash",decision_key AS "decisionKey",decision_hash AS "decisionHash",created_at AS "createdAt",decided_at AS "decidedAt"`,[ownerId,id,decisionKey,decisionHash]);
      await client.query('COMMIT');return {proposal:mapProposal(accepted.rows[0]!),change:change.rows[0]!,reused:false};
    } catch(error) { try{await client.query('ROLLBACK');}catch{} throw error; } finally { client.release(); }
  }

  async undoChange(ownerId:string,id:string) {
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const change=await client.query<{dailyPlanId:string;newVersion:number;previousActive:boolean;previousItems:PlannedItem[];undoneAt:Date|null}>(
        `SELECT daily_plan_id AS "dailyPlanId",new_version AS "newVersion",previous_active AS "previousActive",previous_items AS "previousItems",undone_at AS "undoneAt"
         FROM public.daily_plan_changes WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[id,ownerId]);
      const value=change.rows[0]; if(!value){await client.query('ROLLBACK');return null;}
      if(value.undoneAt){await client.query('COMMIT');return {undone:true,reused:true};}
      const plan=await client.query<{version:number}>('SELECT version FROM public.daily_plans WHERE id=$1 AND owner_id=$2 FOR UPDATE',[value.dailyPlanId,ownerId]);
      if(plan.rows[0]?.version!==value.newVersion) throw new AdaptiveConflictError('undo_conflict');
      await client.query('DELETE FROM public.daily_plan_items WHERE daily_plan_id=$1',[value.dailyPlanId]);
      for(const [index,item] of value.previousItems.entries()) await client.query('INSERT INTO public.daily_plan_items(daily_plan_id,task_id,position,allocated_minutes) VALUES($1,$2,$3,$4)',[value.dailyPlanId,item.taskId,index+1,item.allocationMinutes]);
      await client.query('UPDATE public.daily_plans SET version=version+1,active=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[value.dailyPlanId,value.previousActive]);
      await client.query('UPDATE public.daily_plan_changes SET undone_at=CURRENT_TIMESTAMP WHERE id=$1',[id]);
      await client.query('COMMIT');return {undone:true,reused:false};
    }catch(error){try{await client.query('ROLLBACK');}catch{} throw error;}finally{client.release();}
  }
}

function dateKeyToIso(key:number){return new Date(key*86_400_000).toISOString().slice(0,10);}
async function itemsForPlan(client:PoolClient,id:string):Promise<PlannedItem[]>{const result=await client.query<{taskId:string;allocationMinutes:number}>('SELECT task_id AS "taskId",allocated_minutes AS "allocationMinutes" FROM public.daily_plan_items WHERE daily_plan_id=$1 ORDER BY position',[id]);return result.rows;}
async function assertVersions(client:PoolClient,ownerId:string,tasks:Record<string,number>,plans:Record<string,number>){
  const taskIds=Object.keys(tasks);const planIds=Object.keys(plans);
  const taskRows=await client.query<{id:string;revision:number;status:string}>('SELECT id,revision,status FROM public.tasks WHERE owner_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE',[ownerId,taskIds]);
  if(taskRows.rows.length!==taskIds.length||taskRows.rows.some((row)=>row.status!=='pending'||tasks[row.id]!==row.revision)) throw new AdaptiveConflictError('stale');
  const planRows=await client.query<{id:string;version:number}>('SELECT id,version FROM public.goal_plans WHERE owner_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE',[ownerId,planIds]);
  if(planRows.rows.length!==planIds.length||planRows.rows.some((row)=>plans[row.id]!==row.version)) throw new AdaptiveConflictError('stale');
}
