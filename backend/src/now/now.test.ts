import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { buildNow } from './nowService.ts';
import type { NowSnapshot } from './types.ts';
import type { PlanningTask } from '../adaptivePlanning/types.ts';

const task=(id:string,status:'pending'|'completed'='pending'):PlanningTask=>({id,goalId:'10000000-0000-4000-8000-000000000001',goalPlanId:'20000000-0000-4000-8000-000000000001',goalTitle:'Ship product',instruction:'Finish the release',estimatedMinutes:30,status,goalPriority:2,planOrder:1,taskOrder:1,revision:1,planVersion:1});
function snapshot(overrides:Partial<NowSnapshot>={}):NowSnapshot{return{date:'2026-09-09',timeZone:'UTC',goalCount:0,tasks:[],context:null,readyProposalId:null,direction:null,
  preferences:{maxMajorTasks:null,explanationLength:'standard'},memory:{dailyBufferMinutes:0,selection:null},...overrides};}
test('NOW represents a new user without pretending work exists',()=>assert.equal(buildNow(snapshot()).state,'EMPTY'));
test('NOW recommends the only actionable task from stored state',()=>{const value=buildNow(snapshot({goalCount:1,tasks:[task('30000000-0000-4000-8000-000000000001')]}));assert.equal(value.state,'NEXT_TASK');assert.equal(value.recommendation?.taskId,'30000000-0000-4000-8000-000000000001');assert.equal(value.recommendation?.trust,'INFERRED_FROM_AUTHORIZED_STATE');});
test('NOW reports a fitting current plan',()=>{const value=buildNow(snapshot({goalCount:1,tasks:[task('30000000-0000-4000-8000-000000000001')],context:{id:'c',ownerId:'u',date:'2026-09-09',timeZone:'UTC',availableMinutes:60,priorityTaskId:null,blocker:'',note:'',revision:1,createdAt:new Date(),updatedAt:new Date()}}));assert.equal(value.state,'CURRENT_PLAN_WORKS');});
test('NOW gives a ready adaptive proposal precedence',()=>assert.equal(buildNow(snapshot({readyProposalId:'40000000-0000-4000-8000-000000000001',tasks:[task('t')]})).state,'ADAPTIVE_PROPOSAL'));
test('NOW reports completion and uncertainty honestly',()=>{assert.equal(buildNow(snapshot({goalCount:1,tasks:[task('t','completed')]})).state,'DAY_COMPLETE');assert.equal(buildNow(snapshot({goalCount:1,tasks:[task('a'),task('b')]})).state,'INSUFFICIENT_INFORMATION');});
test('NOW surfaces a capacity tradeoff',()=>{const value=buildNow(snapshot({goalCount:1,tasks:[task('t')],context:{id:'c',ownerId:'u',date:'2026-09-09',timeZone:'UTC',availableMinutes:10,priorityTaskId:null,blocker:'',note:'',revision:1,createdAt:new Date(),updatedAt:new Date()}}));assert.equal(value.state,'TRADEOFF_REQUIRED');});

test('NOW route uses only the authenticated owner',async()=>{process.env.PGHOST='localhost';process.env.PGPORT='5432';process.env.PGDATABASE='test';process.env.PGUSER='test';process.env.PGPASSWORD='test';let selected='';const {createNowRouter}=await import('../nowRoutes.ts');const app=express();app.use((req,_res,next)=>{req.user={id:'owner-a',status:'ACTIVE'};next();});app.use(createNowRouter({snapshot:async(owner)=>{selected=owner;return snapshot();}},()=>new Date('2026-09-09T12:00:00Z')));const server=app.listen(0);await new Promise<void>((resolve)=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No address');try{const response=await fetch(`http://127.0.0.1:${address.port}/now?timeZone=UTC`);assert.equal(response.status,200);assert.equal(selected,'owner-a');assert.equal(JSON.stringify(await response.json()).includes('owner-a'),false);}finally{await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()));}});
