import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContextAssembler, adaptiveAiContext, dailyReviewAiContext, validateDailyReviewContext } from './contextAssembler.ts';
import { calculateReviewMetrics } from '../dailyReview/reviewData.ts';
import type { PlanningMemoryContext } from '../memories/registry.ts';

const user={id:'00000000-0000-4000-8000-000000000001',status:'ACTIVE' as const};
const emptyMemory:PlanningMemoryContext={dailyBufferMinutes:0,selection:null};
const activeMemory:PlanningMemoryContext={dailyBufferMinutes:30,selection:{key:'planning.daily_buffer_minutes',value:30,revision:2,
  provenance:'USER_CORRECTION',confidence:'CORRECTED',validFrom:'2026-09-01',validUntil:'2026-09-30',relevance:'ADAPTIVE_PLANNING'}};

test('Adaptive Planning passes its date and exposes only the permitted memory with trust metadata',async()=>{
  const calls:{userId:string;categories:string[]}[]=[];
  const assembler=new ContextAssembler(
    {context:async(userId,categories)=>{calls.push({userId,categories});return{maxMajorTasks:2,explanationLength:'concise'}}},
    {planningContext:async(userId,date)=>{assert.equal(userId,user.id);assert.equal(date,'2026-09-08');return activeMemory}},
  );
  const context=await assembler.forAdaptivePlanning(user,{date:'2026-09-08',timeZone:'UTC',availableMinutes:90,priorityTaskId:null,tasks:[]});
  assert.deepEqual(calls,[{userId:user.id,categories:['PLANNING','INTERACTION']}]);
  assert.equal(context.preferences.maxMajorTasks.value,2);
  assert.deepEqual(context.memories.dailyBufferMinutes,{value:30,reason:'Owner-scoped, active, date-valid CONSTRAINT selected by the exact Adaptive Planning relevance policy.',
    provenance:'USER_CORRECTION',confidence:'CORRECTED',revision:2,validFrom:'2026-09-01',validUntil:'2026-09-30'});
  assert.equal('authorization' in adaptiveAiContext(context),false);
});

test('Daily Review policy excludes memories, planning preferences, and task text',async()=>{
  let memoryCalled=false;let categories:string[]=[];
  const assembler=new ContextAssembler({context:async(_userId,value)=>{categories=value;return{maxMajorTasks:1,explanationLength:'concise'}}},
    {planningContext:async()=>{memoryCalled=true;return activeMemory}});
  const metrics=calculateReviewMetrics([{id:'task',goalId:'goal',goalTitle:'Private goal',instruction:'Private task instruction',plannedMinutes:20,status:'completed'}]);
  const context=await assembler.forDailyReview(user,{date:'2026-09-08',timeZone:'UTC',metrics});
  const payload=JSON.stringify(dailyReviewAiContext(context));
  assert.deepEqual(categories,['INTERACTION']);assert.equal(memoryCalled,false);assert.deepEqual(context.memories,[]);
  assert.equal(payload.includes('maxMajorTasks'),false);assert.equal(payload.includes('Private task instruction'),false);assert.equal(payload.includes('authorization'),false);
});

test('empty feature contexts assemble safely with controlled memory defaults',async()=>{
  const assembler=new ContextAssembler({context:async()=>({maxMajorTasks:null,explanationLength:'standard'})},{planningContext:async()=>emptyMemory});
  const adaptive=await assembler.forAdaptivePlanning(user,{date:'2026-09-08',timeZone:'UTC',availableMinutes:0,priorityTaskId:null,tasks:[]});
  assert.deepEqual(adaptive.tasks,[]);assert.deepEqual(adaptive.goals,[]);
  assert.deepEqual(adaptive.memories.dailyBufferMinutes,{value:0,reason:'No owner-scoped, active, date-valid memory matched the exact Adaptive Planning relevance policy.',
    provenance:'SYSTEM_DEFAULT',confidence:'DEFAULT',revision:null,validFrom:null,validUntil:null});
  const review=await assembler.forDailyReview(user,{date:'2026-09-08',timeZone:'UTC',metrics:calculateReviewMetrics([])});
  assert.equal(review.execution.totalTasks,0);
});

test('runtime contract rejects memories in Daily Review context',()=>{
  const invalid={policy:'DAILY_REVIEW_V1',authorization:{userId:user.id,basis:'AUTHENTICATED_CURRENT_USER'},situation:{date:'2026-09-08',timeZone:'UTC'},execution:{totalTasks:0,completedTasks:0,incompleteTasks:0,completionRate:0,goals:[],milestoneProgress:[]},preferences:{explanationLength:{value:'standard',reason:'test'}},memories:[{value:1}]} as never;
  assert.throws(()=>validateDailyReviewContext(invalid));
});

test('Adaptive Planning receives normalized external context and AI gets only relevant minimum',async()=>{
  const observedAt='2026-09-08T12:00:00.000Z';const freshUntil='2026-09-08T12:15:00.000Z';
  const assembler=new ContextAssembler({context:async()=>({maxMajorTasks:null,explanationLength:'standard'})},{planningContext:async()=>emptyMemory},{forPlanning:async(ownerId)=>{assert.equal(ownerId,user.id);return{calendar:{state:'AVAILABLE',source:'ICAL',observedAt,freshUntil,nextCommitment:{title:'Private meeting name',startsAt:'2026-09-08T12:35:00.000Z',endsAt:'2026-09-08T13:05:00.000Z',durationMinutes:30,minutesUntilStart:35},freeMinutesBeforeNext:35},weather:{state:'STALE',source:'OPEN_METEO',observedAt,freshUntil:null,location:'Private location',window:{startsAt:observedAt,endsAt:freshUntil,temperatureC:25,precipitationProbability:80},relevantToTaskIds:[]}};}});
  const context=await assembler.forAdaptivePlanning(user,{date:'2026-09-08',timeZone:'UTC',availableMinutes:60,priorityTaskId:null,tasks:[]});const ai=adaptiveAiContext(context);assert.equal(ai.external.calendar?.freeMinutesBeforeNext,35);assert.equal(JSON.stringify(ai).includes('Private meeting name'),false);assert.equal(ai.external.weather,null);
});
