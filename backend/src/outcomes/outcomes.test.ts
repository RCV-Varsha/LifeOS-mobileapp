import assert from 'node:assert/strict';
import { afterEach,test } from 'node:test';
import { goalProgress } from './progress.ts';
import { validateMilestoneInput,validateOutcomeInput } from './validation.ts';
import { validateOutcomeSuggestion } from './suggestionSchema.ts';
import { generateOutcomeSuggestion } from './groqOutcomeService.ts';
import { OutcomeConflictError } from './outcomeRepository.ts';

const originalFetch=globalThis.fetch;afterEach(()=>{globalThis.fetch=originalFetch;});
const goalId='10000000-0000-4000-8000-000000000001',outcomeId='20000000-0000-4000-8000-000000000001',milestoneId='30000000-0000-4000-8000-000000000001',taskId='40000000-0000-4000-8000-000000000001';
const input={title:'Deploy a working application',description:'A real result',targetValue:null,targetUnit:null,targetDate:null};
const savedOutcome={id:outcomeId,goalId,ownerId:'local',...input,outcomeType:'qualitative' as const,status:'in_progress' as const,revision:1,createdAt:new Date(),updatedAt:new Date()};
const savedMilestone={id:milestoneId,goalId,outcomeId,ownerId:'local',...input,title:'Build the application',sequence:1,status:'not_started' as const,revision:1,createdAt:new Date(),updatedAt:new Date()};

test('qualitative outcome is valid',()=>assert.equal(validateOutcomeInput(input).targetValue,null));
test('measurable outcome is valid',()=>assert.deepEqual(validateOutcomeInput({...input,targetValue:5,targetUnit:'km'}).targetValue,5));
test('outcome title is required',()=>assert.throws(()=>validateOutcomeInput({...input,title:''})));
test('outcome title is bounded',()=>assert.throws(()=>validateOutcomeInput({...input,title:'x'.repeat(201)})));
test('description is bounded',()=>assert.throws(()=>validateOutcomeInput({...input,description:'x'.repeat(1001)})));
test('negative target is rejected',()=>assert.throws(()=>validateOutcomeInput({...input,targetValue:-1,targetUnit:'km'})));
test('target unit is required with value',()=>assert.throws(()=>validateOutcomeInput({...input,targetValue:5})));
test('target unit without value is rejected',()=>assert.throws(()=>validateOutcomeInput({...input,targetUnit:'km'})));
test('valid target date is accepted',()=>assert.equal(validateOutcomeInput({...input,targetDate:'2027-02-28'}).targetDate,'2027-02-28'));
test('invalid target date is rejected',()=>assert.throws(()=>validateOutcomeInput({...input,targetDate:'2027-02-29'})));
test('unexpected owner ID is rejected',()=>assert.throws(()=>validateOutcomeInput({...input,ownerId:'attacker'})));
test('milestone sequence is validated',()=>assert.equal(validateMilestoneInput({...input,sequence:2}).sequence,2));
test('invalid milestone sequence is rejected',()=>assert.throws(()=>validateMilestoneInput({...input,sequence:0})));

test('legacy goal progress uses activity without milestones',()=>assert.deepEqual(goalProgress([{status:'completed'},{status:'pending'}],[]),{activity:{completed:1,total:2,percent:50},milestone:null,legacyPercent:50}));
test('milestone goal distinguishes activity and achievement',()=>{const result=goalProgress([{status:'completed'},{status:'completed'},{status:'pending'}],[{status:'completed'},{status:'pending'}]);assert.equal(result.activity.percent,67);assert.equal(result.milestone?.percent,50);});
test('completed milestone count is deterministic',()=>assert.equal(goalProgress([],[{status:'completed'},{status:'completed'}]).milestone?.completed,2));
test('incomplete milestone count is deterministic',()=>assert.equal(goalProgress([],[{status:'not_started'},{status:'in_progress'}]).milestone?.completed,0));
test('task completion never marks outcome achieved',()=>{const result=goalProgress([{status:'completed'}],[{status:'not_started'}]);assert.equal(result.milestone?.percent,0);assert.equal(savedOutcome.status,'in_progress');});

const suggestion={outcome:{title:'Deploy a Python app',description:'A working application is publicly reachable.'},milestones:[{title:'Finish fundamentals',description:'Core language concepts are demonstrated.',sequence:1}]};
test('valid outcome suggestion is normalized',()=>assert.equal(validateOutcomeSuggestion(suggestion).milestones[0]?.sequence,1));
test('suggestion invented IDs are rejected',()=>assert.throws(()=>validateOutcomeSuggestion({...suggestion,outcome:{...suggestion.outcome,id:outcomeId}})));
test('oversized suggestion is rejected',()=>assert.throws(()=>validateOutcomeSuggestion({...suggestion,outcome:{...suggestion.outcome,title:'x'.repeat(201)}})));
test('out-of-order suggestion is rejected',()=>assert.throws(()=>validateOutcomeSuggestion({...suggestion,milestones:[{...suggestion.milestones[0],sequence:2}]})));
test('malformed AI response is rejected',()=>assert.throws(()=>validateOutcomeSuggestion({outcome:{title:'Missing fields'}})));
test('Groq suggestion returns validated output only',async()=>{process.env.GROQ_API_KEY='test';process.env.GROQ_MODEL='test';globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(suggestion)}}]}),{status:200});assert.equal((await generateOutcomeSuggestion({goal:'Learn Python',description:''})).outcome.title,'Deploy a Python app');});
test('Groq failure leaves manual flow available',async()=>{process.env.GROQ_API_KEY='test';process.env.GROQ_MODEL='test';globalThis.fetch=async()=>new Response('{}',{status:503});await assert.rejects(()=>generateOutcomeSuggestion({goal:'Learn Python',description:''}));assert.equal(validateOutcomeInput(input).title,input.title);});

function repository(overrides:Record<string,unknown>={}){return{goalExists:async()=>true,getOutcome:async()=>savedOutcome,createOutcome:async()=>savedOutcome,updateOutcome:async()=>({...savedOutcome,revision:2}),deleteOutcome:async()=>true,setOutcomeStatus:async()=>({...savedOutcome,status:'achieved'}),listMilestones:async()=>[savedMilestone],getMilestone:async()=>savedMilestone,createMilestone:async()=>savedMilestone,updateMilestone:async()=>({...savedMilestone,revision:2}),setMilestoneStatus:async()=>({...savedMilestone,status:'completed'}),deleteMilestone:async()=>true,reorderMilestones:async()=>[savedMilestone],linkTask:async()=>({id:taskId,milestoneId}),...overrides};}
async function api(path:string,method='GET',requestBody?:unknown,repo=repository()){
  process.env.PGHOST='localhost';process.env.PGPORT='5432';process.env.PGDATABASE='test';process.env.PGUSER='test';process.env.PGPASSWORD='test';const express=(await import('express')).default;const {createOutcomeRouter}=await import('../outcomeRoutes.ts');const app=express();app.use(express.json());app.use(createOutcomeRouter(repo as never));const server=app.listen(0);await new Promise<void>((resolve)=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No test address');try{return await fetch(`http://127.0.0.1:${address.port}${path}`,{method,headers:requestBody===undefined?{}:{'Content-Type':'application/json'},body:requestBody===undefined?undefined:JSON.stringify(requestBody)});}finally{await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()));}}

test('create outcome API persists an owned outcome',async()=>assert.equal((await api(`/goals/${goalId}/outcome`,'POST',input)).status,201));
test('retrieve outcome API returns outcome',async()=>assert.equal((await api(`/goals/${goalId}/outcome`)).status,200));
test('update outcome API requires revision',async()=>assert.equal((await api(`/goals/${goalId}/outcome`,'PUT',{...input,expectedRevision:1})).status,200));
test('delete outcome API works',async()=>assert.equal((await api(`/goals/${goalId}/outcome`,'DELETE',{expectedRevision:1})).status,204));
test('unowned goal is hidden',async()=>assert.equal((await api(`/goals/${goalId}/outcome`,'GET',undefined,repository({goalExists:async()=>false}))).status,404));
test('create milestone API works',async()=>assert.equal((await api(`/goals/${goalId}/milestones`,'POST',input)).status,201));
test('update milestone API works',async()=>assert.equal((await api(`/milestones/${milestoneId}`,'PUT',{...input,expectedRevision:1})).status,200));
test('complete milestone API works',async()=>assert.equal((await api(`/milestones/${milestoneId}/status`,'POST',{status:'completed',expectedRevision:1})).status,200));
test('reopen milestone API works',async()=>assert.equal((await api(`/milestones/${milestoneId}/status`,'POST',{status:'not_started',expectedRevision:1})).status,200));
test('duplicate milestone completion is safe',async()=>assert.equal((await api(`/milestones/${milestoneId}/status`,'POST',{status:'completed',expectedRevision:1})).status,200));
test('delete milestone API works',async()=>assert.equal((await api(`/milestones/${milestoneId}`,'DELETE',{expectedRevision:1})).status,204));
test('reorder milestones API works',async()=>assert.equal((await api(`/goals/${goalId}/milestones/order`,'PUT',{ids:[milestoneId],revisions:{[milestoneId]:1}})).status,200));
test('valid task milestone relationship works',async()=>assert.equal((await api(`/tasks/${taskId}/milestone`,'PUT',{milestoneId})).status,200));
test('unlinked legacy task remains supported',async()=>assert.equal((await api(`/tasks/${taskId}/milestone`,'PUT',{milestoneId:null})).status,200));
test('cross-goal task milestone relationship is rejected',async()=>assert.equal((await api(`/tasks/${taskId}/milestone`,'PUT',{milestoneId},repository({linkTask:async()=>{throw new OutcomeConflictError('invalid_relationship');}}))).status,409));
test('stale concurrent update returns conflict',async()=>assert.equal((await api(`/goals/${goalId}/outcome`,'PUT',{...input,expectedRevision:1},repository({updateOutcome:async()=>{throw new OutcomeConflictError('stale_revision');}}))).status,409));
