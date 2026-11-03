const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const path=require('node:path');
const compiled=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/services/workspaceProgress.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const out={exports:{}};new Function('exports','module',compiled)(out.exports,out);
const {applyTaskStatus,taskProgress,projectPendingTasks}=out.exports;
const tasks=()=>[{id:'parent',status:'pending',subtask_progress:{completed:0,total:2}},{id:'a',parent_task_id:'parent',status:'pending'},{id:'b',parent_task_id:'parent',status:'pending'}];
test('completion and reopening update parent progress without double-counting the parent',()=>{
  const initial=tasks(),one=applyTaskStatus(initial,'a','completed');
  assert.deepEqual(one[0].subtask_progress,{completed:1,total:2});
  assert.deepEqual(taskProgress(one),{completed:1,total:2,percent:50});
  assert.equal(initial[1].status,'pending');
  assert.equal(applyTaskStatus(one,'a','completed'),one);
  const all=applyTaskStatus(one,'b','completed');assert.equal(taskProgress(all).percent,100);
  assert.equal(applyTaskStatus(all,'a','pending')[0].subtask_progress.completed,1);
});
test('durable pending completions remain visible after reload but rejected writes do not count',()=>{
  const writes=[{entityId:'a',state:'pending',payload:{status:'completed'}},{entityId:'b',state:'conflict',payload:{status:'completed'}}];
  const projected=projectPendingTasks(tasks(),writes);
  assert.equal(projected[1].status,'completed');assert.equal(projected[2].status,'pending');
  assert.equal(projected[0].subtask_progress.completed,1);
});
test('empty lists, standalone work and partially loaded parent groups have correct totals',()=>{
  assert.equal(taskProgress([]).percent,0);
  assert.deepEqual(taskProgress([{id:'a',status:'completed'},{id:'b',status:'pending'}]),{total:2,completed:1,percent:50});
  assert.equal(taskProgress([tasks()[0]]).total,0);
});
