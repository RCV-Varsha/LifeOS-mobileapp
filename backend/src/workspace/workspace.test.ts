import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunks, cosine, validateVectors } from './retrieval.ts';
import { contextBudget, validateAnswer } from './assistant.ts';
import { validateChanges } from './actions.ts';
import { correction, freeBlocks, projectInsights, schedule } from './planning.ts';
import { hashPassword, verifyPassword, tokenHash } from '../platform/authentication.ts';
import type { WorkspaceTask } from './contracts.ts';

const task=(id:string,overrides:Partial<WorkspaceTask>={}):WorkspaceTask=>({id,instruction:id,description:'',project_id:null,planned_minutes:30,actual_minutes:null,status:'pending',priority:0,category:'general',deadline:null,revision:1,updated_at:'2026-09-19T00:00:00Z',dependencies:[],...overrides});
test('free capacity merges overlaps and clips events to the requested window',()=>{
  const result=freeBlocks('2026-09-20T09:00:00Z','2026-09-20T12:00:00Z',[{starts_at:'2026-09-20T08:00:00Z',ends_at:'2026-09-20T10:00:00Z'},{starts_at:'2026-09-20T09:30:00Z',ends_at:'2026-09-20T11:00:00Z'}]);
  assert.deepEqual(result,[{start:Date.parse('2026-09-20T11:00:00Z'),end:Date.parse('2026-09-20T12:00:00Z')}]);
});
test('scheduler puts prerequisites before high-priority dependent tasks',()=>{
  const result=schedule([task('a'),task('b',{priority:3,dependencies:['a']})],'2026-09-20T09:00:00Z','2026-09-20T11:00:00Z',[]);
  assert.deepEqual(result.selected.map(t=>t.taskId),['a','b']);assert.equal(result.selected[1]!.startsAt,result.selected[0]!.endsAt);
});
test('profile session budget caps selected minutes while allowing a smaller task that fits',()=>{
  const result=schedule([task('a',{planned_minutes:90,priority:3}),task('b',{planned_minutes:30}),task('c',{planned_minutes:30}),task('d',{planned_minutes:30})],'2026-09-20T09:00:00Z','2026-09-20T12:00:00Z',[],null,0,60);
  assert.equal(result.allocatedMinutes,60);assert.deepEqual(result.selected.map(t=>t.taskId),['b','c']);assert.equal(result.skipped.length,2);
});
test('scheduler refuses unresolved dependencies, tight deadlines and capacity overflows',()=>{
  const result=schedule([task('a',{dependencies:['missing']}),task('b',{deadline:'2026-09-20T09:10:00Z'}),task('c',{planned_minutes:120})],'2026-09-20T09:00:00Z','2026-09-20T10:00:00Z',[]);
  assert.equal(result.selected.length,0);assert.equal(result.skipped.length,3);
});
test('correction uses completed measured tasks in the matching category only',()=>{
  assert.equal(correction([],'backend').factor,1);assert.equal(correction([],'backend').sampleSize,0);
  const result=correction([task('a',{category:'backend',status:'completed',actual_minutes:60}),task('b',{category:'backend',actual_minutes:120}),task('c',{category:'other',status:'completed',actual_minutes:120})],'backend');
  assert.equal(result.factor,2);assert.equal(result.sampleSize,1);
});
test('confirmed buffer reserves free time and a task limit does not change history',()=>{
  const result=schedule([task('a'),task('b')],'2026-09-20T09:00:00Z','2026-09-20T11:00:00Z',[{starts_at:'2026-09-20T10:30:00Z',ends_at:'2026-09-20T11:00:00Z'}],1,30);
  assert.equal(result.availableMinutes,60);assert.equal(result.selected.length,1);
  const noCapacity=schedule([task('a')],'2026-09-20T09:00:00Z','2026-09-20T09:20:00Z',[],null,30);assert.equal(noCapacity.availableMinutes,0);assert.equal(noCapacity.selected.length,0);
});
test('risk findings carry real task evidence and do not flag completed work',()=>{
  const result=projectInsights([task('a',{deadline:'2026-09-01T00:00:00Z'}),task('b',{status:'completed',deadline:'2026-09-01T00:00:00Z'})],new Date('2026-09-20T00:00:00Z'));
  assert.equal(result.length,1);assert.equal(result[0]!.evidence.taskId,'a');
});
test('chunking preserves source overlap and rejects non-progressing parameters',()=>{
  assert.deepEqual(chunks('abcdefghij',5,2),['abcde','defgh','ghij']);assert.throws(()=>chunks('abc',2,2));
});
test('vectors reject NaN, zero vectors, mismatched dimensions and missing results',()=>{
  for(const input of [[[0,0]],[[1,NaN]],[[1],[1,2]],[]])assert.throws(()=>validateVectors(input,1));
  assert.equal(cosine([1,0],[1,0]),1);assert.equal(cosine([1,0],[0,1]),0);assert.equal(cosine([1],[1,2]),-1);
});
test('context budget limits source excerpts',()=>{
  const sources=Array.from({length:100},(_,i)=>({id:String(i),kind:'note',title:'Source',excerpt:'a'.repeat(2000),reason:'test',score:1}));
  const selected=contextBudget(sources,2000);assert.ok(selected.reduce((n,s)=>n+s.excerpt.length,0)<=2000);assert.ok(selected.length<100);
});
test('assistant rejects hallucinated sources and actions referencing unseen entities',()=>{
  assert.throws(()=>validateAnswer({answer:'Answer',sourceIds:['foreign'],changes:[]},[]));
  assert.throws(()=>validateAnswer({answer:'Answer',sourceIds:[],changes:[{kind:'link',sourceId:'00000000-0000-4000-8000-000000000001',targetId:'00000000-0000-4000-8000-000000000002',type:'supports'}]},[]));
  assert.deepEqual(validateAnswer({answer:'Insufficient context.',sourceIds:[],changes:[]},[]).changes,[]);
});
test('action validation rejects hidden mutation fields and reversed schedules',()=>{
  assert.throws(()=>validateChanges([{kind:'create_task',title:'Test',minutes:30,ownerId:'foreign'}]));
  assert.throws(()=>validateChanges([{kind:'schedule_task',taskId:'00000000-0000-4000-8000-000000000001',revision:1,startsAt:'2026-09-20T10:00:00Z',endsAt:'2026-09-20T09:00:00Z'}]));
});
test('passwords are salted and only the correct password verifies',async()=>{
  const a=await hashPassword('long unique test password'),b=await hashPassword('long unique test password');assert.notEqual(a,b);
  assert.equal(await verifyPassword('long unique test password',a),true);assert.equal(await verifyPassword('wrong',a),false);
  assert.equal(await verifyPassword('wrong','broken'),false);assert.equal(tokenHash('a').length,64);
});
