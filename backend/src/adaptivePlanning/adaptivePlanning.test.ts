import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { calendarDay, parseReviewDate, validateTimeZone } from '../dailyReview/date.ts';
import { validateAdaptiveExplanation } from './explanationSchema.ts';
import { generateAdaptiveExplanation } from './groqExplanationService.ts';
import { evaluateDailyPlan, validateEditedSelection } from './planner.ts';
import type { PlanningTask } from './types.ts';
import { AdaptiveConflictError } from './adaptivePlanningRepository.ts';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
function task(id:string,minutes:number|null,options:Partial<PlanningTask>={}):PlanningTask{return{id,goalId:'10000000-0000-4000-8000-000000000001',goalPlanId:'20000000-0000-4000-8000-000000000001',goalTitle:'Goal',instruction:`Task ${id}`,estimatedMinutes:minutes,status:'pending',goalPriority:0,planOrder:1,taskOrder:Number(id.at(-1))||1,revision:1,planVersion:1,...options};}

test('planner handles zero tasks',()=>assert.deepEqual(evaluateDailyPlan([],30,null).selected,[]));
test('one task fits',()=>assert.equal(evaluateDailyPlan([task('a',30)],30,null).currentPlanFits,true));
test('multiple tasks fit',()=>assert.equal(evaluateDailyPlan([task('a',10),task('b',20)],40,null).remainingMinutes,10));
test('multiple tasks do not fit',()=>assert.deepEqual(evaluateDailyPlan([task('a',30),task('b',25)],40,null).selected.map((x)=>x.taskId),['a']));
test('explicit priority ranks first',()=>assert.deepEqual(evaluateDailyPlan([task('a',30),task('b',25)],30,'b').selected.map((x)=>x.taskId),['b']));
test('goal priority ranks first',()=>assert.deepEqual(evaluateDailyPlan([task('a',30),task('b',25,{goalPriority:2})],30,null).selected.map((x)=>x.taskId),['b']));
test('existing order breaks equal-priority ties',()=>assert.deepEqual(evaluateDailyPlan([task('a',20,{taskOrder:2}),task('b',20,{taskOrder:1})],20,null).selected.map((x)=>x.taskId),['b']));
test('unknown duration is not treated as zero',()=>{const result=evaluateDailyPlan([task('a',null)],30,null);assert.equal(result.currentPlanFits,false);assert.equal(result.uncertainty[0]?.taskId,'a');assert.deepEqual(result.selected,[]);});
test('insufficient capacity is explicit',()=>assert.ok(evaluateDailyPlan([task('a',31)],30,null).conflicts.some((x)=>x.code==='insufficient_capacity')));
test('already feasible plan produces no omissions',()=>assert.deepEqual(evaluateDailyPlan([task('a',20)],30,null).omittedTaskIds,[]));
test('completed tasks are ineligible',()=>assert.equal(evaluateDailyPlan([task('a',20,{status:'completed'})],30,null).requiredMinutes,0));
test('priority conflict is explicit',()=>assert.ok(evaluateDailyPlan([task('a',40)],30,'a').conflicts.some((x)=>x.code==='priority_does_not_fit')));
test('edited selection can remove and add eligible tasks',()=>assert.deepEqual(validateEditedSelection([task('a',20),task('b',20)],30,[{taskId:'b',allocationMinutes:25}]).selected,[{taskId:'b',allocationMinutes:25}]));
test('edited selection rejects over-allocation',()=>assert.throws(()=>validateEditedSelection([task('a',20)],10,[{taskId:'a',allocationMinutes:11}])));
test('edited selection rejects unknown task IDs',()=>assert.throws(()=>validateEditedSelection([task('a',20)],30,[{taskId:'b',allocationMinutes:10}])));
test('edited selection rejects duplicate tasks',()=>assert.throws(()=>validateEditedSelection([task('a',20)],30,[{taskId:'a',allocationMinutes:10},{taskId:'a',allocationMinutes:10}])));

test('timezone boundary selects distinct local calendar dates',()=>{const instant=new Date('2026-09-08T00:30:00Z');assert.equal(calendarDay(instant,'Asia/Kolkata').isoDate,'2026-09-08');assert.equal(calendarDay(instant,'America/Los_Angeles').isoDate,'2026-09-07');});
test('DST transition uses local calendar dates',()=>{assert.equal(calendarDay(new Date('2026-03-08T07:30:00Z'),'America/New_York').isoDate,'2026-03-08');assert.equal(calendarDay(new Date('2026-03-09T03:30:00Z'),'America/New_York').isoDate,'2026-03-08');});
test('invalid timezone is rejected',()=>assert.equal(validateTimeZone('Mars/Olympus'),null));
test('invalid date is rejected',()=>assert.equal(parseReviewDate('2026-02-30','UTC',new Date('2026-09-08T12:00:00Z')),null));
test('future date is rejected in the requested timezone',()=>assert.equal(parseReviewDate('2026-09-09','UTC',new Date('2026-09-08T23:00:00Z')),null));
test('midnight transition accepts the new local day',()=>assert.equal(parseReviewDate('2026-09-09','Asia/Kolkata',new Date('2026-09-08T20:00:00Z'))?.isoDate,'2026-09-09'));

const raw={summary:'Focus on one task.',reason:'It fits the available capacity.',evidence_task_ids:['a'],question:null};
test('valid AI explanation is normalized',()=>assert.equal(validateAdaptiveExplanation(raw,new Set(['a'])).evidenceTaskIds[0],'a'));
test('malformed AI explanation is rejected',()=>assert.throws(()=>validateAdaptiveExplanation({...raw,extra:true},new Set(['a']))));
test('unsupported AI evidence is rejected',()=>assert.throws(()=>validateAdaptiveExplanation(raw,new Set(['b']))));
test('Groq explanation returns only validated output',async()=>{process.env.GROQ_API_KEY='test';process.env.GROQ_MODEL='test';globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]}),{status:200});const result=await generateAdaptiveExplanation(evaluateDailyPlan([task('a',40)],30,null),[task('a',40)]);assert.equal(result.summary,raw.summary);});
test('Groq failure rejects without changing deterministic evaluation',async()=>{process.env.GROQ_API_KEY='test';process.env.GROQ_MODEL='test';globalThis.fetch=async()=>new Response('{}',{status:503});const evaluation=evaluateDailyPlan([task('a',40)],30,null);await assert.rejects(()=>generateAdaptiveExplanation(evaluation,[task('a',40)]));assert.equal(evaluation.selected.length,0);});

const taskId='30000000-0000-4000-8000-000000000001';
const proposalId='40000000-0000-4000-8000-000000000001';
function apiTask():PlanningTask{return task(taskId,40,{taskOrder:1});}
function apiProposal(){const evaluation=evaluateDailyPlan([apiTask()],30,null);return{id:proposalId,ownerId:'local',date:'2026-09-08',timeZone:'UTC',status:'ready' as const,contextRevision:1,baseDailyPlanVersion:0,...evaluation,eligibleTasks:[apiTask()],explanation:null,createdAt:new Date(),decidedAt:null};}
function fakeRepository(overrides:Record<string,unknown>={}){return{
  getContext:async()=>({id:'context',ownerId:'local',date:'2026-09-08',timeZone:'UTC',availableMinutes:30,priorityTaskId:null,blocker:'',note:'',revision:1,createdAt:new Date(),updatedAt:new Date()}),
  putContext:async()=>({id:'context',revision:1}),tasksForDate:async()=>[apiTask()],
  createProposal:async()=>({proposal:apiProposal(),reused:false}),getProposal:async()=>apiProposal(),
  editProposal:async()=>apiProposal(),rejectProposal:async()=>({...apiProposal(),status:'rejected'}),
  markStale:async()=>undefined,
  acceptProposal:async()=>({proposal:{...apiProposal(),status:'accepted'},change:{id:'change',newVersion:1},reused:false}),
  undoChange:async()=>({undone:true,reused:false}),...overrides};}
async function adaptiveApi(repository:Record<string,unknown>,path:string,method='GET',body?:unknown,headers:Record<string,string>={}){
  process.env.PGHOST='localhost';process.env.PGPORT='5432';process.env.PGDATABASE='test';process.env.PGUSER='test';process.env.PGPASSWORD='test';delete process.env.GROQ_API_KEY;delete process.env.GROQ_MODEL;
  const express=(await import('express')).default;const {createAdaptivePlanningRouter}=await import('../adaptivePlanningRoutes.ts');const app=express();app.use(express.json());app.use(createAdaptivePlanningRouter(repository as never,async()=>raw as never,()=>new Date('2026-09-08T12:00:00Z')));const server=app.listen(0);await new Promise<void>((resolve)=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No test address');try{return await fetch(`http://127.0.0.1:${address.port}${path}`,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}finally{await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()));}}

test('context API retrieves the server-owned daily context',async()=>assert.equal((await adaptiveApi(fakeRepository(),'/daily-contexts/2026-09-08?timeZone=UTC')).status,200));
test('context API rejects future dates',async()=>assert.equal((await adaptiveApi(fakeRepository(),'/daily-contexts/2026-09-09?timeZone=UTC')).status,400));
test('proposal API reports no change without persistence',async()=>{let saved=false;const response=await adaptiveApi(fakeRepository({tasksForDate:async()=>[task(taskId,20)],createProposal:async()=>{saved=true;}}),'/daily-plans/2026-09-08/proposals?timeZone=UTC','POST',{includeExplanation:false},{'Idempotency-Key':'proposal-test-1'});assert.equal(response.status,200);assert.equal((await response.json()).kind,'no_change');assert.equal(saved,false);});
test('proposal API persists deterministic fallback when AI is unavailable',async()=>{const response=await adaptiveApi(fakeRepository(),'/daily-plans/2026-09-08/proposals?timeZone=UTC','POST',{includeExplanation:true},{'Idempotency-Key':'proposal-test-2'});const body=await response.json();assert.equal(response.status,201);assert.equal(body.aiFallback,true);});
test('proposal API rejects idempotency key reuse with a different body',async()=>{const response=await adaptiveApi(fakeRepository({createProposal:async()=>{throw new AdaptiveConflictError('idempotency_conflict');}}),'/daily-plans/2026-09-08/proposals?timeZone=UTC','POST',{includeExplanation:false},{'Idempotency-Key':'proposal-test-3'});assert.equal(response.status,409);});
test('proposal retrieval does not expose a missing or unowned proposal',async()=>assert.equal((await adaptiveApi(fakeRepository({getProposal:async()=>null}),`/plan-proposals/${proposalId}`)).status,404));
test('proposal editing rejects an over-capacity user allocation',async()=>assert.equal((await adaptiveApi(fakeRepository(),`/plan-proposals/${proposalId}`,'PUT',{selected:[{taskId,allocationMinutes:31}]})).status,400));
test('proposal rejection preserves state through repository decision only',async()=>assert.equal((await adaptiveApi(fakeRepository(),`/plan-proposals/${proposalId}/reject`,'POST')).status,200));
test('stale acceptance returns conflict',async()=>assert.equal((await adaptiveApi(fakeRepository({acceptProposal:async()=>{throw new AdaptiveConflictError('stale');}}),`/plan-proposals/${proposalId}/accept`,'POST',undefined,{'Idempotency-Key':'accept-test-1'})).status,409));
test('conditional undo conflict returns conflict',async()=>assert.equal((await adaptiveApi(fakeRepository({undoChange:async()=>{throw new AdaptiveConflictError('undo_conflict');}}),`/plan-changes/${proposalId}/undo`,'POST')).status,409));
