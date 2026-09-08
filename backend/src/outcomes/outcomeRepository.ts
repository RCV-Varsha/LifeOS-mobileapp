import type { Pool, PoolClient } from 'pg';
import type { GoalMilestone, GoalOutcome, MilestoneInput, MilestoneStatus, OutcomeInput, OutcomeStatus } from './types.ts';

export class OutcomeConflictError extends Error {
  readonly code: 'stale_revision' | 'outcome_exists' | 'invalid_relationship';
  constructor(code: 'stale_revision' | 'outcome_exists' | 'invalid_relationship') { super(code); this.name = 'OutcomeConflictError'; this.code=code; }
}

const outcomeColumns = `id, goal_id AS "goalId", owner_id AS "ownerId", title, description,
  outcome_type AS "outcomeType", target_value::float8 AS "targetValue", target_unit AS "targetUnit",
  target_date::text AS "targetDate", status, revision, created_at AS "createdAt", updated_at AS "updatedAt"`;
const milestoneColumns = `id, goal_id AS "goalId", outcome_id AS "outcomeId", owner_id AS "ownerId", title,
  description, sequence, status, target_value::float8 AS "targetValue", target_unit AS "targetUnit",
  target_date::text AS "targetDate", revision, created_at AS "createdAt", updated_at AS "updatedAt"`;

export class OutcomeRepository {
  private readonly pool:Pool;
  constructor(pool: Pool) {this.pool=pool;}

  async goalExists(ownerId: string, goalId: string) {
    const result = await this.pool.query<{ exists: boolean }>('SELECT EXISTS(SELECT 1 FROM public.goals WHERE id=$1 AND owner_id=$2) AS exists', [goalId, ownerId]);
    return Boolean(result.rows[0]?.exists);
  }
  async getOutcome(ownerId: string, goalId: string) {
    const result = await this.pool.query<GoalOutcome>(`SELECT ${outcomeColumns} FROM public.goal_outcomes WHERE goal_id=$1 AND owner_id=$2`, [goalId, ownerId]);
    return result.rows[0] ?? null;
  }
  async createOutcome(ownerId: string, goalId: string, input: OutcomeInput) {
    try {
      const result = await this.pool.query<GoalOutcome>(`INSERT INTO public.goal_outcomes(goal_id,owner_id,title,description,outcome_type,target_value,target_unit,target_date)
        SELECT g.id,$2,$3,$4,$5,$6,$7,$8 FROM public.goals g WHERE g.id=$1 AND g.owner_id=$2
        RETURNING ${outcomeColumns}`, [goalId, ownerId, input.title, input.description, input.targetValue === null ? 'qualitative' : 'measurable', input.targetValue, input.targetUnit, input.targetDate]);
      return result.rows[0] ?? null;
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === '23505') throw new OutcomeConflictError('outcome_exists');
      throw error;
    }
  }
  async updateOutcome(ownerId: string, goalId: string, input: OutcomeInput, expectedRevision: number) {
    const result = await this.pool.query<GoalOutcome>(`UPDATE public.goal_outcomes SET title=$3,description=$4,outcome_type=$5,target_value=$6,target_unit=$7,target_date=$8,
      revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE goal_id=$1 AND owner_id=$2 AND revision=$9 RETURNING ${outcomeColumns}`,
      [goalId,ownerId,input.title,input.description,input.targetValue===null?'qualitative':'measurable',input.targetValue,input.targetUnit,input.targetDate,expectedRevision]);
    if (result.rows[0]) return result.rows[0];
    if (await this.getOutcome(ownerId, goalId)) throw new OutcomeConflictError('stale_revision');
    return null;
  }
  async deleteOutcome(ownerId: string, goalId: string, expectedRevision: number) {
    const result = await this.pool.query(`DELETE FROM public.goal_outcomes WHERE goal_id=$1 AND owner_id=$2 AND revision=$3 RETURNING id`, [goalId,ownerId,expectedRevision]);
    if (result.rows[0]) return true;
    if (await this.getOutcome(ownerId, goalId)) throw new OutcomeConflictError('stale_revision');
    return false;
  }
  async setOutcomeStatus(ownerId:string,goalId:string,status:OutcomeStatus,expectedRevision:number){
    const result=await this.pool.query<GoalOutcome>(`UPDATE public.goal_outcomes SET status=$3,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE goal_id=$1 AND owner_id=$2 AND revision=$4 RETURNING ${outcomeColumns}`,[goalId,ownerId,status,expectedRevision]);
    if(result.rows[0])return result.rows[0];if(await this.getOutcome(ownerId,goalId))throw new OutcomeConflictError('stale_revision');return null;
  }
  async listMilestones(ownerId:string,goalId:string){const result=await this.pool.query<GoalMilestone>(`SELECT ${milestoneColumns} FROM public.goal_milestones WHERE goal_id=$1 AND owner_id=$2 ORDER BY sequence,id`,[goalId,ownerId]);return result.rows;}
  async getMilestone(ownerId:string,id:string){const result=await this.pool.query<GoalMilestone>(`SELECT ${milestoneColumns} FROM public.goal_milestones WHERE id=$1 AND owner_id=$2`,[id,ownerId]);return result.rows[0]??null;}
  async createMilestone(ownerId:string,goalId:string,input:MilestoneInput){
    const sequence=input.sequence??(await this.pool.query<{next:number}>('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM public.goal_milestones WHERE goal_id=$1 AND owner_id=$2',[goalId,ownerId])).rows[0]!.next;
    const result=await this.pool.query<GoalMilestone>(`INSERT INTO public.goal_milestones(goal_id,outcome_id,owner_id,title,description,sequence,target_value,target_unit,target_date)
      SELECT o.goal_id,o.id,o.owner_id,$3,$4,$5,$6,$7,$8 FROM public.goal_outcomes o WHERE o.goal_id=$1 AND o.owner_id=$2 RETURNING ${milestoneColumns}`,[goalId,ownerId,input.title,input.description,sequence,input.targetValue,input.targetUnit,input.targetDate]);return result.rows[0]??null;
  }
  async updateMilestone(ownerId:string,id:string,input:MilestoneInput,expectedRevision:number){const result=await this.pool.query<GoalMilestone>(`UPDATE public.goal_milestones SET title=$3,description=$4,target_value=$5,target_unit=$6,target_date=$7,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND owner_id=$2 AND revision=$8 RETURNING ${milestoneColumns}`,[id,ownerId,input.title,input.description,input.targetValue,input.targetUnit,input.targetDate,expectedRevision]);if(result.rows[0])return result.rows[0];if(await this.getMilestone(ownerId,id))throw new OutcomeConflictError('stale_revision');return null;}
  async setMilestoneStatus(ownerId:string,id:string,status:MilestoneStatus,expectedRevision:number){const result=await this.pool.query<GoalMilestone>(`UPDATE public.goal_milestones SET status=$3,revision=revision+CASE WHEN status=$3 THEN 0 ELSE 1 END,updated_at=CASE WHEN status=$3 THEN updated_at ELSE CURRENT_TIMESTAMP END WHERE id=$1 AND owner_id=$2 AND revision=$4 RETURNING ${milestoneColumns}`,[id,ownerId,status,expectedRevision]);if(result.rows[0])return result.rows[0];if(await this.getMilestone(ownerId,id))throw new OutcomeConflictError('stale_revision');return null;}
  async deleteMilestone(ownerId:string,id:string,expectedRevision:number){const result=await this.pool.query('DELETE FROM public.goal_milestones WHERE id=$1 AND owner_id=$2 AND revision=$3 RETURNING goal_id AS "goalId"',[id,ownerId,expectedRevision]);if(result.rows[0]){await this.normalizeSequences(ownerId,result.rows[0].goalId);return true;}if(await this.getMilestone(ownerId,id))throw new OutcomeConflictError('stale_revision');return false;}
  async reorderMilestones(ownerId:string,goalId:string,ids:string[],revisions:Record<string,number>){let client:PoolClient|undefined;try{client=await this.pool.connect();await client.query('BEGIN');await client.query('SET CONSTRAINTS goal_milestones_goal_id_sequence_key DEFERRED');const current=await client.query<{id:string;revision:number}>(`SELECT id,revision FROM public.goal_milestones WHERE goal_id=$1 AND owner_id=$2 ORDER BY sequence FOR UPDATE`,[goalId,ownerId]);if(current.rows.length!==ids.length||new Set(ids).size!==ids.length||ids.some((id)=>!current!.rows.some((row)=>row.id===id))||current.rows.some((row)=>revisions[row.id]!==row.revision))throw new OutcomeConflictError('stale_revision');for(const [index,id] of ids.entries())await client.query('UPDATE public.goal_milestones SET sequence=$3,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND owner_id=$2',[id,ownerId,index+1]);await client.query('COMMIT');return this.listMilestones(ownerId,goalId);}catch(error){if(client)await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client?.release();}}
  async linkTask(ownerId:string,taskId:string,milestoneId:string|null){try{const result=await this.pool.query(`UPDATE public.tasks SET milestone_id=$3,revision=revision+CASE WHEN milestone_id IS DISTINCT FROM $3 THEN 1 ELSE 0 END,updated_at=CASE WHEN milestone_id IS DISTINCT FROM $3 THEN CURRENT_TIMESTAMP ELSE updated_at END WHERE id=$1 AND owner_id=$2 RETURNING id,milestone_id AS "milestoneId"`,[taskId,ownerId,milestoneId]);return result.rows[0]??null;}catch(error){if(typeof error==='object'&&error&&'code'in error&&error.code==='23514')throw new OutcomeConflictError('invalid_relationship');throw error;}}
  private async normalizeSequences(ownerId:string,goalId:string){await this.pool.query(`WITH ordered AS (SELECT id,row_number() OVER(ORDER BY sequence,id) AS next FROM public.goal_milestones WHERE goal_id=$1 AND owner_id=$2) UPDATE public.goal_milestones gm SET sequence=ordered.next FROM ordered WHERE gm.id=ordered.id AND gm.sequence<>ordered.next`,[goalId,ownerId]);}
}
