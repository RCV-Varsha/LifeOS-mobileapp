import assert from 'node:assert/strict';
import {pool} from './src/db.ts';
import {AssistantService} from './src/workspace/assistant.ts';
const base='http://127.0.0.1:3000',accounts:{accessToken:string;password:string}[]=[];
async function call(path:string,token='',method='GET',body?:unknown){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:response.status===204?null:await response.json()};}
try{
  for(let i=0;i<2;i++){const password=`QA-${crypto.randomUUID()}!`,r=await call('/auth/register','','POST',{email:`profile-${crypto.randomUUID()}@example.test`,password});assert.equal(r.status,201);accounts.push({...r.body,password});}
  const token=accounts[0].accessToken,blank=(await call('/profile',token)).body;
  assert.equal(blank.revision,0);
  const profile={...blank.profile,name:'Sam',role:'Student',focus:'Learn Java',routine:'Classes until 4 PM',start:'18:00',end:'20:00',sessionMinutes:30};
  const saved=await call('/profile',token,'PUT',{profile,revision:0});assert.equal(saved.status,200);assert.equal(saved.body.revision,1);
  assert.deepEqual((await call('/profile',token)).body.profile,profile);
  assert.equal((await call('/profile',accounts[1].accessToken)).body.profile.name,'');
  const account=await call('/me',token);
  const owner=account.body.user?.id;
  assert.ok(owner);
  await new AssistantService(pool).ask(owner,'Hello',null,false,{name:'test',model:'test',async complete(_system,input){assert.equal((input as {profile:{name:string}}).profile.name,'Sam');return {answer:'Hello, Sam.',sourceIds:[],changes:[]};}});
  assert.equal((await call('/profile',token,'PUT',{profile,revision:0})).status,409);
  assert.equal((await call('/profile',token,'PUT',{profile:{...profile,end:'16:00'},revision:1})).status,400);
  for(const title of ['First task','Second task'])assert.equal((await call('/workspace/tasks',token,'POST',{title,minutes:30})).status,201);
  const startsAt=new Date(Date.now()+86400000).toISOString(),endsAt=new Date(Date.now()+86400000+7200000).toISOString();
  const plan=await call('/planner/proposals',token,'POST',{startsAt,endsAt});assert.equal(plan.status,200,JSON.stringify(plan.body));assert.equal(plan.body.evaluation.allocatedMinutes,30);assert.equal(plan.body.evaluation.sessionMinutes,30);
  const exported=await call('/privacy/export',token);assert.equal(exported.body.tables.personal_profiles[0].data.name,'Sam');
  assert.equal((await call('/profile',token,'PUT',{profile:blank.profile,revision:1})).status,200);assert.equal((await call('/profile',token)).body.profile.name,'');
  console.log('PASS: profile persists, isolates accounts, detects stale saves, validates hours, caps Planner, exports and clears.');
}finally{for(const account of accounts)assert.equal((await call('/privacy/delete-account',account.accessToken,'POST',{confirmation:'DELETE MY ACCOUNT',password:account.password})).status,204);await pool.end();console.log('Synthetic accounts removed.');}
