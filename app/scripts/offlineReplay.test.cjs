const { test }=require('node:test');
const assert=require('node:assert/strict');
const { readFileSync }=require('node:fs');
const { resolve }=require('node:path');
const ts=require('typescript');
const compiled=ts.transpileModule(readFileSync(resolve(__dirname,'../src/services/offlineReplay.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleValue={exports:{}};new Function('exports','module',compiled)(moduleValue.exports,moduleValue);
const { replayQueue }=moduleValue.exports;
const item=id=>({operationId:id,state:'pending',payload:{title:id}});
test('offline transport failure leaves all durable operations intact',async()=>{
  const queue=[item('a'),item('b')];let durable=structuredClone(queue);
  await assert.rejects(()=>replayQueue(queue,async()=>{throw new TypeError('Offline');},async value=>{durable=structuredClone(value);}));
  assert.deepEqual(durable,queue);
});
test('conflicts remain visible while independent operations can synchronize',async()=>{
  let durable=[];const sent=[];
  const result=await replayQueue([item('a'),item('b')],async value=>{sent.push(value.operationId);if(value.operationId==='a')throw Object.assign(new Error('Revision changed'),{status:409});},async value=>{durable=structuredClone(value);});
  assert.deepEqual(sent,['a','b']);assert.equal(result.length,1);assert.equal(result[0].state,'conflict');assert.equal(durable[0].error,'Revision changed');
});
test('failure persisting a receipt stops replay before the next operation',async()=>{
  const queue=[item('a'),item('b')],sent=[];
  await assert.rejects(()=>replayQueue(queue,async value=>{sent.push(value.operationId);},async()=>{throw new Error('Disk full');}));
  assert.deepEqual(sent,['a']);assert.equal(queue[0].operationId,'a');
});
test('already conflicted operations are never silently retried',async()=>{
  const queue=[{...item('a'),state:'conflict'}];let calls=0;
  assert.deepEqual(await replayQueue(queue,async()=>{calls++;},async()=>{}),queue);assert.equal(calls,0);
});

test('authentication and temporary server limits keep writes pending for retry',async()=>{
  for(const status of [401,408,429]){
    const queue=[item('retry')];let persisted=false;
    await assert.rejects(()=>replayQueue(queue,async()=>{throw Object.assign(new Error('Temporary failure'),{status});},async()=>{persisted=true;}));
    assert.equal(persisted,false);assert.equal(queue[0].state,'pending');
  }
});
