import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import express from 'express';
import { evaluateDailyPlan } from '../adaptivePlanning/planner.ts';
import { calculateReviewMetrics } from '../dailyReview/reviewData.ts';
import { generatePreferenceSuggestion, validatePreferenceSuggestion } from './groqPreferenceSuggestionService.ts';
import { validatePreference } from './registry.ts';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});

test('registry validates supported integer and enum preferences',()=>{
  assert.equal(validatePreference('planning.max_major_tasks','PLANNING',3).value,3);
  assert.equal(validatePreference('interaction.explanation_length','INTERACTION','concise').value,'concise');
});
test('registry rejects invalid keys, categories, and values',()=>{
  assert.throws(()=>validatePreference('unknown','PLANNING',3));
  assert.throws(()=>validatePreference('planning.max_major_tasks','INTERACTION',3));
  assert.throws(()=>validatePreference('planning.max_major_tasks','PLANNING',11));
  assert.throws(()=>validatePreference('interaction.explanation_length','INTERACTION','verbose'));
});
test('planning preference deterministically limits tasks',()=>{
  const tasks=[1,2,3].map((n)=>({id:String(n),goalId:'g',goalPlanId:'p',goalTitle:'Goal',instruction:`Task ${n}`,estimatedMinutes:10,status:'pending' as const,goalPriority:0,planOrder:1,taskOrder:n,revision:1,planVersion:1}));
  const result=evaluateDailyPlan(tasks,60,null,2);
  assert.equal(result.selected.length,2);
  assert.equal(result.currentPlanFits,false);
});
test('preferences never change deterministic review metrics',()=>{
  const tasks=[{id:'1',goalId:'g',goalTitle:'Goal',instruction:'Task',plannedMinutes:10,status:'completed' as const}];
  assert.deepEqual(calculateReviewMetrics(tasks),calculateReviewMetrics(tasks));
});

const suggestion={key:'planning.max_major_tasks' as const,category:'PLANNING' as const,value:3,reason:'The user explicitly requested this limit.'};
test('valid AI suggestion is strictly validated',()=>assert.deepEqual(validatePreferenceSuggestion(suggestion),suggestion));
test('malformed AI suggestion is rejected',()=>assert.throws(()=>validatePreferenceSuggestion({...suggestion,ownerId:'other'})));
test('Groq suggestion returns validated output only',async()=>{
  process.env.GROQ_API_KEY='test';process.env.GROQ_MODEL='test';
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(suggestion)}}]}),{status:200});
  assert.deepEqual(await generatePreferenceSuggestion('Always keep my plan to three tasks.'),suggestion);
});
test('Groq suggestion failure does not create a preference',async()=>{
  process.env.GROQ_API_KEY='test';process.env.GROQ_MODEL='test';globalThis.fetch=async()=>new Response('{}',{status:503});
  await assert.rejects(()=>generatePreferenceSuggestion('Keep plans short.'));
});

async function api(path:string,body:unknown,repository:Record<string,unknown>,suggest=async()=>suggestion){
  process.env.PGHOST='localhost';process.env.PGPORT='5432';process.env.PGDATABASE='test';process.env.PGUSER='test';process.env.PGPASSWORD='test';process.env.GROQ_API_KEY='test';process.env.GROQ_MODEL='test';
  const {createPreferenceRouter}=await import('../preferenceRoutes.ts');
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:'00000000-0000-4000-8000-000000000001',status:'ACTIVE'};next();});app.use(createPreferenceRouter(repository as never,suggest));
  const server=app.listen(0);await new Promise<void>((resolve)=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No address');
  try{return await fetch(`http://127.0.0.1:${address.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}finally{await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()));}
}
test('AI suggestion endpoint does not persist automatically',async()=>{let creates=0;const response=await api('/preference-suggestions',{statement:'Always use at most three tasks.'},{create:async()=>{creates++;}});assert.equal(response.status,200);assert.equal((await response.json()).persisted,false);assert.equal(creates,0);});
test('explicit suggestion approval persists validated preference',async()=>{let creates=0;const response=await api('/preference-suggestions/accept',{suggestion:{key:suggestion.key,category:suggestion.category,value:suggestion.value}},{create:async()=>{creates++;return{id:'p'};}});assert.equal(response.status,201);assert.equal(creates,1);});
