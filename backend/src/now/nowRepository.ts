import type { Pool } from 'pg';
import { AdaptivePlanningRepository } from '../adaptivePlanning/adaptivePlanningRepository.ts';
import { PreferenceRepository } from '../preferences/preferenceRepository.ts';
import { MemoryRepository } from '../memories/memoryRepository.ts';
import { evaluateDailyPlan } from '../adaptivePlanning/planner.ts';
import type { NowDirection, NowSnapshot } from './types.ts';
import { ExternalContextService } from '../externalContext/externalContextService.ts';
import type { ExternalContextReader } from '../externalContext/types.ts';

export class NowRepository{
  private pool:Pool;private adaptive:AdaptivePlanningRepository;private preferences:PreferenceRepository;private memories:MemoryRepository;private external:ExternalContextReader;private clock:()=>Date;
  constructor(pool:Pool,external:ExternalContextReader=new ExternalContextService(),clock=()=>new Date()){this.pool=pool;this.adaptive=new AdaptivePlanningRepository(pool);this.preferences=new PreferenceRepository(pool);this.memories=new MemoryRepository(pool);this.external=external;this.clock=clock;}
  async snapshot(ownerId:string,date:{key:number;isoDate:string},timeZone:string):Promise<NowSnapshot>{
    const [tasks,context,preferences,memory,proposal,goals]=await Promise.all([
      this.adaptive.tasksForDate(ownerId,date,timeZone),this.adaptive.getContext(ownerId,date.isoDate,timeZone),
      this.preferences.context(ownerId,['PLANNING']),this.memories.planningContext(ownerId,date.isoDate),
      this.pool.query<{id:string}>(`SELECT id FROM public.daily_plan_proposals WHERE owner_id=$1 AND local_date=$2 AND time_zone=$3 AND status='ready' ORDER BY created_at DESC,id DESC LIMIT 1`,[ownerId,date.isoDate,timeZone]),
      this.pool.query<{count:string}>('SELECT count(*)::text AS count FROM public.goals WHERE owner_id=$1',[ownerId]),
    ]);
    const external=await this.external.forPlanning(ownerId,timeZone,tasks,this.clock());
    const calendarMinutes=external.calendar.state==='AVAILABLE'?external.calendar.freeMinutesBeforeNext:null;const effectiveMinutes=context&&calendarMinutes!==null?Math.min(context.availableMinutes,calendarMinutes):context?.availableMinutes;
    const selectedId=effectiveMinutes!==undefined?evaluateDailyPlan(tasks,effectiveMinutes,context?.priorityTaskId??null,preferences.maxMajorTasks,memory.dailyBufferMinutes).selected[0]?.taskId:null;
    const first=tasks.find((task)=>task.id===selectedId)??tasks.find((task)=>task.status==='pending')??tasks[0]??null;
    let direction:NowDirection=null;
    if(first){const result=await this.pool.query<{goalId:string;goalTitle:string;outcomeTitle:string|null;milestoneTitle:string|null}>(
      `SELECT g.id AS "goalId",g.title AS "goalTitle",go2.title AS "outcomeTitle",gm.title AS "milestoneTitle" FROM public.goals g
       LEFT JOIN public.goal_outcomes go2 ON go2.goal_id=g.id AND go2.owner_id=g.owner_id
       LEFT JOIN public.tasks t ON t.id=$3 AND t.owner_id=g.owner_id LEFT JOIN public.goal_milestones gm ON gm.id=t.milestone_id AND gm.owner_id=g.owner_id
       WHERE g.id=$1 AND g.owner_id=$2`,[first.goalId,ownerId,first.id]);direction=result.rows[0]??null;}
    return{date:date.isoDate,timeZone,goalCount:Number(goals.rows[0]?.count??0),tasks,context,readyProposalId:proposal.rows[0]?.id??null,direction,preferences,memory,external};
  }
}
