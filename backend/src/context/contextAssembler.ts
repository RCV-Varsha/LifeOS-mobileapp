import type { MemoryRepository } from '../memories/memoryRepository.ts';
import type { PreferenceRepository } from '../preferences/preferenceRepository.ts';
import type { CurrentUser } from '../auth.ts';
import type { DailyReviewMetrics } from '../dailyReview/reviewData.ts';
import type { PlanningTask } from '../adaptivePlanning/types.ts';
import type { AdaptivePlanningAiContext, AdaptivePlanningContext, DailyReviewAiContext, DailyReviewContext } from './types.ts';

type PreferenceSelector=Pick<PreferenceRepository,'context'>;
type MemorySelector=Pick<MemoryRepository,'planningContext'>;
type AdaptiveInput={date:string;timeZone:string;availableMinutes:number;priorityTaskId:string|null;tasks:PlanningTask[]};
type ReviewInput={date:string;timeZone:string;metrics:DailyReviewMetrics};

export class ContextAssembler {
  private readonly preferences:PreferenceSelector;
  private readonly memories:MemorySelector;
  constructor(preferences:PreferenceSelector,memories:MemorySelector){this.preferences=preferences;this.memories=memories;}

  async forAdaptivePlanning(user:CurrentUser,input:AdaptiveInput):Promise<AdaptivePlanningContext>{
    const [preferenceContext,memoryContext]=await Promise.all([
      this.preferences.context(user.id,['PLANNING','INTERACTION']),
      this.memories.planningContext(user.id),
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
      memories:{dailyBufferMinutes:{value:memoryContext.dailyBufferMinutes,reason:'Owner-scoped active planning CONSTRAINT, or the controlled zero default, selected by exact key.'}},
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
  if(!Array.isArray(value.tasks)||!Array.isArray(value.goals))throw new Error('Invalid adaptive context collections.');
  return value;
}

export function validateDailyReviewContext(value:DailyReviewContext){
  if(value.policy!=='DAILY_REVIEW_V1'||!value.authorization.userId||value.authorization.basis!=='AUTHENTICATED_CURRENT_USER')throw new Error('Invalid review context authorization.');
  if(!Number.isInteger(value.execution.totalTasks)||value.execution.totalTasks<0||value.execution.completionRate<0||value.execution.completionRate>100)throw new Error('Invalid review execution context.');
  if(value.memories.length!==0)throw new Error('Daily Review policy does not permit memories.');
  return value;
}

export function adaptiveAiContext(context:AdaptivePlanningContext):AdaptivePlanningAiContext{const {authorization:_authorization,...allowed}=context;return allowed;}
export function dailyReviewAiContext(context:DailyReviewContext):DailyReviewAiContext{const {authorization:_authorization,...allowed}=context;return allowed;}
