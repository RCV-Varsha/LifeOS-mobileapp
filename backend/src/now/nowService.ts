import { evaluateDailyPlan } from '../adaptivePlanning/planner.ts';
import type { NowExperience, NowSnapshot } from './types.ts';

export function buildNow(snapshot:NowSnapshot):NowExperience{
  const pending=snapshot.tasks.filter((task)=>task.status==='pending');
  const completed=snapshot.tasks.length-pending.length;
  const calendar=snapshot.external.calendar;const weather=snapshot.external.weather;let calendarInfluenced=false;let weatherInfluenced=false;
  const external=()=>({calendar:{state:calendar.state,source:calendar.source,observedAt:calendar.observedAt,influenced:calendarInfluenced,minutesBeforeNext:calendar.freeMinutesBeforeNext,nextCommitmentStartsAt:calendar.nextCommitment?.startsAt??null},weather:{state:weather.state,source:weather.source,observedAt:weather.observedAt,influenced:weatherInfluenced,location:weather.location,precipitationProbability:weather.window?.precipitationProbability??null}});
  const base={date:snapshot.date,timeZone:snapshot.timeZone,direction:snapshot.direction,
    execution:{completed,total:snapshot.tasks.length},capacity:{availableMinutes:snapshot.context?.availableMinutes??null,source:snapshot.context?'USER_PROVIDED' as const:'UNKNOWN' as const},
    personalization:{maxMajorTasks:snapshot.preferences.maxMajorTasks,dailyBufferMinutes:snapshot.memory.dailyBufferMinutes}};
  if(snapshot.readyProposalId)return{...base,state:'ADAPTIVE_PROPOSAL',adaptive:{readyProposalId:snapshot.readyProposalId,currentPlanWorks:false},
    recommendation:{title:'Review today’s proposed change',reason:'Your saved daily context produced an adaptive proposal. Nothing changes until you accept it.',action:'REVIEW_ADAPTIVE_PROPOSAL',taskId:null,trust:'INFERRED_FROM_AUTHORIZED_STATE'},external:external(),uncertainty:[]};
  if(snapshot.tasks.length>0&&pending.length===0)return{...base,state:'DAY_COMPLETE',adaptive:{readyProposalId:null,currentPlanWorks:true},
    recommendation:{title:'Review what happened today',reason:'Every task currently scheduled for today is complete.',action:'REVIEW_DAY',taskId:null,trust:'INFERRED_FROM_AUTHORIZED_STATE'},external:external(),uncertainty:[]};
  if(pending.length===0){const empty=snapshot.goalCount===0;return{...base,state:empty?'EMPTY':'INSUFFICIENT_INFORMATION',adaptive:{readyProposalId:null,currentPlanWorks:null},
    recommendation:empty?{title:'Choose a direction',reason:'LifeOS has no goal or current work to prioritize yet.',action:'SET_DIRECTION',taskId:null,trust:'INFERRED_FROM_AUTHORIZED_STATE'}:null,
    external:external(),uncertainty:empty?[]:['You have a goal, but no actionable task is scheduled for today.']};}
  if(!snapshot.context&&pending.length>1)return{...base,state:'INSUFFICIENT_INFORMATION',adaptive:{readyProposalId:null,currentPlanWorks:null},recommendation:null,
    external:external(),uncertainty:['LifeOS needs today’s available capacity or a priority before choosing among multiple tasks.']};
  const calendarMinutes=calendar.state==='AVAILABLE'?calendar.freeMinutesBeforeNext:null;const internalAvailable=snapshot.context?.availableMinutes??pending[0]!.estimatedMinutes??0;const available=calendarMinutes===null?internalAvailable:Math.min(internalAvailable,calendarMinutes);calendarInfluenced=calendarMinutes!==null&&calendarMinutes<internalAvailable;
  const evaluation=evaluateDailyPlan(snapshot.tasks,available,snapshot.context?.priorityTaskId??null,snapshot.preferences.maxMajorTasks,snapshot.memory.dailyBufferMinutes);
  if(snapshot.context&&!evaluation.currentPlanFits)return{...base,state:'TRADEOFF_REQUIRED',adaptive:{readyProposalId:null,currentPlanWorks:false},
    recommendation:{title:'Re-evaluate today’s plan',reason:calendarInfluenced?`You have ${calendarMinutes} minutes before your next commitment, which is less than this plan needs.`:evaluation.conflicts[0]?.message??evaluation.uncertainty[0]?.message??'The current plan cannot be justified from the available information.',action:'SET_CONTEXT',taskId:null,trust:'INFERRED_FROM_AUTHORIZED_STATE'},
    external:external(),uncertainty:evaluation.uncertainty.map((item)=>item.message)};
  const taskId=evaluation.selected[0]?.taskId??pending[0]!.id;const task=pending.find((item)=>item.id===taskId)!;
  const rainRisk=weather.state==='AVAILABLE'&&weather.window&&weather.window.precipitationProbability>=60&&weather.relevantToTaskIds.includes(task.id);if(rainRisk){weatherInfluenced=true;return{...base,state:'TRADEOFF_REQUIRED',adaptive:{readyProposalId:null,currentPlanWorks:false},recommendation:{title:'Check today’s outdoor plan',reason:`Rain risk is ${weather.window!.precipitationProbability}% during the relevant forecast window. Confirm when this explicitly outdoor task can happen.`,action:'SET_CONTEXT',taskId:task.id,trust:'INFERRED_FROM_AUTHORIZED_STATE'},external:external(),uncertainty:[]};}
  return{...base,state:snapshot.context?'CURRENT_PLAN_WORKS':'NEXT_TASK',adaptive:{readyProposalId:null,currentPlanWorks:snapshot.context?true:null},
    recommendation:{title:task.instruction,reason:calendarInfluenced?`You have ${calendarMinutes} minutes before your next commitment, and this task fits.`:snapshot.context?'This is the highest-ranked unfinished task and the current plan fits your saved capacity.':'This is the only unfinished task scheduled for today.',action:'START_TASK',taskId:task.id,trust:'INFERRED_FROM_AUTHORIZED_STATE'},external:external(),uncertainty:[]};
}
