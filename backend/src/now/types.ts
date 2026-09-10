import type { PlanningTask } from '../adaptivePlanning/types.ts';
import type { DailyContext } from '../adaptivePlanning/adaptivePlanningRepository.ts';
import type { PlanningMemoryContext } from '../memories/registry.ts';
import type { PreferenceContext } from '../preferences/registry.ts';
import type { ExternalPlanningContext, SourceState } from '../externalContext/types.ts';

export type NowState='EMPTY'|'NEXT_TASK'|'CURRENT_PLAN_WORKS'|'ADAPTIVE_PROPOSAL'|'TRADEOFF_REQUIRED'|'INSUFFICIENT_INFORMATION'|'DAY_COMPLETE';
export type NowAction='SET_DIRECTION'|'START_TASK'|'REVIEW_ADAPTIVE_PROPOSAL'|'SET_CONTEXT'|'REVIEW_DAY';
export type NowDirection={goalId:string;goalTitle:string;outcomeTitle:string|null;milestoneTitle:string|null}|null;
export type NowSnapshot={date:string;timeZone:string;goalCount:number;tasks:PlanningTask[];context:DailyContext|null;
  readyProposalId:string|null;direction:NowDirection;preferences:PreferenceContext;memory:PlanningMemoryContext;external:ExternalPlanningContext};
export type NowExperience={date:string;timeZone:string;state:NowState;direction:NowDirection;
  execution:{completed:number;total:number};capacity:{availableMinutes:number|null;source:'USER_PROVIDED'|'UNKNOWN'};
  adaptive:{readyProposalId:string|null;currentPlanWorks:boolean|null};personalization:{maxMajorTasks:number|null;dailyBufferMinutes:number};
  recommendation:{title:string;reason:string;action:NowAction;taskId:string|null;trust:'INFERRED_FROM_AUTHORIZED_STATE'}|null;
  external:{calendar:{state:SourceState;source:'ICAL';observedAt:string;influenced:boolean;minutesBeforeNext:number|null;nextCommitmentStartsAt:string|null};weather:{state:SourceState;source:'OPEN_METEO';observedAt:string;influenced:boolean;location:string|null;precipitationProbability:number|null}};
  uncertainty:string[]};
