import type { MemoryRepository } from '../memories/memoryRepository.ts';
import type { PreferenceRepository } from '../preferences/preferenceRepository.ts';
import type { CurrentUser } from '../auth.ts';
import type { DailyReviewMetrics } from '../dailyReview/reviewData.ts';
import type { PlanningTask } from '../adaptivePlanning/types.ts';
import type { AdaptivePlanningAiContext, AdaptivePlanningContext, DailyReviewAiContext, DailyReviewContext } from './types.ts';
import { ExternalContextService } from '../externalContext/externalContextService.ts';
import type { ExternalContextReader } from '../externalContext/types.ts';

type PreferenceSelector=Pick<PreferenceRepository,'context'>;
type MemorySelector=Pick<MemoryRepository,'planningContext'>;
type AdaptiveInput={date:string;timeZone:string;availableMinutes:number;priorityTaskId:string|null;tasks:PlanningTask[]};
type ReviewInput={date:string;timeZone:string;metrics:DailyReviewMetrics};

export class ContextAssembler {
  private readonly preferences:PreferenceSelector;
  private readonly memories:MemorySelector;
  private readonly external:ExternalContextReader;
  constructor(preferences:PreferenceSelector,memories:MemorySelector,external:ExternalContextReader=new ExternalContextService()){this.preferences=preferences;this.memories=memories;this.external=external;}

  async forAdaptivePlanning(user:CurrentUser,input:AdaptiveInput):Promise<AdaptivePlanningContext>{
    const [preferenceContext,memoryContext,external]=await Promise.all([
      this.preferences.context(user.id,['PLANNING','INTERACTION']),
      this.memories.planningContext(user.id,input.date),
      this.external.forPlanning(user.id,input.timeZone,input.tasks),
    ]);
    const goals=new Map<string,string>();for(const task of input.tasks)goals.set(task.goalId,task.goalTitle);
    return validateAdaptivePlanningContext({
      policy:'ADAPTIVE_PLANNING_V1',authorization:{userId:user.id,basis:'AUTHENTICATED_CURRENT_USER'},
      situation:{date:input.date,timeZone:input.timeZone,availableMinutes:input.availableMinutes,priorityTaskId:input.priorityTaskId},
      goals:[...goals].map(([id,title])=>({id,title})),
      tasks:input.tasks.map(({id,goalId,goalTitle,instruction,estimatedMinutes,status})=>({id,goalId,goalTitle,instruction,estimatedMinutes,status})),
      preferences:{
        maxMajorTasks:{value:preferenceContext.maxMajorTasks,reason:'Owner-scoped active PLANNING preference, or the controlled absence default, selected by policy.'},
        explanationLength:{value:preferenceContext.explanationLength,reason:'Owner-scoped active INTERACTION preference, or the controlled standard default, selected by policy.'},
      },
      memories:{dailyBufferMinutes:memoryContext.selection?{
        value:memoryContext.selection.value,reason:'Owner-scoped, active, date-valid CONSTRAINT selected by the exact Adaptive Planning relevance policy.',
        provenance:memoryContext.selection.provenance,confidence:memoryContext.selection.confidence,revision:memoryContext.selection.revision,
        validFrom:memoryContext.selection.validFrom,validUntil:memoryContext.selection.validUntil,
      }:{value:0,reason:'No owner-scoped, active, date-valid memory matched the exact Adaptive Planning relevance policy.',
        provenance:'SYSTEM_DEFAULT',confidence:'DEFAULT',revision:null,validFrom:null,validUntil:null}},
      external,
    });
  }

  async forDailyReview(user:CurrentUser,input:ReviewInput):Promise<DailyReviewContext>{
    const preferenceContext=await this.preferences.context(user.id,['INTERACTION']);
    const {totalTasks,completedTasks,incompleteTasks,completionRate,goals,milestoneProgress}=input.metrics;
    return validateDailyReviewContext({
      policy:'DAILY_REVIEW_V1',authorization:{userId:user.id,basis:'AUTHENTICATED_CURRENT_USER'},
      situation:{date:input.date,timeZone:input.timeZone},execution:{totalTasks,completedTasks,incompleteTasks,completionRate,goals,milestoneProgress},
      preferences:{explanationLength:{value:preferenceContext.explanationLength,reason:'Owner-scoped active INTERACTION preference, or the controlled standard default, selected for review presentation.'}},
      memories:[],
    });
  }
}

export function validateAdaptivePlanningContext(value:AdaptivePlanningContext){
  if(value.policy!=='ADAPTIVE_PLANNING_V1'||!value.authorization.userId||value.authorization.basis!=='AUTHENTICATED_CURRENT_USER')throw new Error('Invalid adaptive context authorization.');
  if(!Number.isInteger(value.situation.availableMinutes)||value.situation.availableMinutes<0||value.situation.availableMinutes>1440)throw new Error('Invalid adaptive context capacity.');
  const max=value.preferences.maxMajorTasks.value;if(max!==null&&(!Number.isInteger(max)||max<1||max>10))throw new Error('Invalid adaptive context preference.');
  const buffer=value.memories.dailyBufferMinutes.value;if(!Number.isInteger(buffer)||buffer<0||buffer>240)throw new Error('Invalid adaptive context memory.');
  const memory=value.memories.dailyBufferMinutes;
  if(memory.provenance==='SYSTEM_DEFAULT'?(memory.confidence!=='DEFAULT'||memory.revision!==null||memory.validFrom!==null||memory.validUntil!==null):
    (memory.confidence==='DEFAULT'||memory.revision===null||!Number.isInteger(memory.revision)||memory.revision<1||typeof memory.validFrom!=='string'))throw new Error('Invalid adaptive context memory provenance.');
  if(memory.provenance!=='SYSTEM_DEFAULT'){
    const expectedConfidence=memory.provenance==='USER_CORRECTION'?'CORRECTED':'CONFIRMED';
    if(memory.confidence!==expectedConfidence||!validDate(memory.validFrom!)||
      (memory.validUntil!==null&&(!validDate(memory.validUntil)||memory.validUntil<memory.validFrom!)))throw new Error('Invalid adaptive context memory trust metadata.');
  }
  if(!Array.isArray(value.tasks)||!Array.isArray(value.goals))throw new Error('Invalid adaptive context collections.');
  validateExternal(value.external,value.tasks);
  return value;
}

export function validateDailyReviewContext(value:DailyReviewContext){
  if(value.policy!=='DAILY_REVIEW_V1'||!value.authorization.userId||value.authorization.basis!=='AUTHENTICATED_CURRENT_USER')throw new Error('Invalid review context authorization.');
  if(!Number.isInteger(value.execution.totalTasks)||value.execution.totalTasks<0||value.execution.completionRate<0||value.execution.completionRate>100)throw new Error('Invalid review execution context.');
  if(value.memories.length!==0)throw new Error('Daily Review policy does not permit memories.');
  return value;
}

export function adaptiveAiContext(context:AdaptivePlanningContext):AdaptivePlanningAiContext{const {authorization:_authorization,external,...allowed}=context;const calendar=external.calendar.state==='AVAILABLE'&&external.calendar.nextCommitment&&external.calendar.freeMinutesBeforeNext!==null?{freeMinutesBeforeNext:external.calendar.freeMinutesBeforeNext,startsAt:external.calendar.nextCommitment.startsAt,durationMinutes:external.calendar.nextCommitment.durationMinutes,source:external.calendar.source}:null;const weather=external.weather.state==='AVAILABLE'&&external.weather.window&&external.weather.location&&external.weather.relevantToTaskIds.length>0?{...external.weather.window,location:external.weather.location,relevantToTaskIds:external.weather.relevantToTaskIds,source:external.weather.source}:null;return{...allowed,external:{calendar,weather}};}
export function dailyReviewAiContext(context:DailyReviewContext):DailyReviewAiContext{const {authorization:_authorization,...allowed}=context;return allowed;}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(`${value}T00:00:00.000Z`).toISOString().slice(0,10)===value;}
function validateExternal(value:AdaptivePlanningContext['external'],tasks:AdaptivePlanningContext['tasks']){for(const source of [value.calendar,value.weather]){if(!['AVAILABLE','UNAVAILABLE','STALE'].includes(source.state)||Number.isNaN(Date.parse(source.observedAt)))throw new Error('Invalid external context metadata.');if(source.state==='AVAILABLE'&&(!source.freshUntil||Date.parse(source.freshUntil)<=Date.parse(source.observedAt)))throw new Error('Invalid external context freshness.');}if(value.weather.relevantToTaskIds.some((id)=>!tasks.some((task)=>task.id===id)))throw new Error('External context references an unknown task.');}
