import {test} from 'node:test';
import assert from 'node:assert/strict';
import {presentActivity} from './activityPresentation.ts';
const row={id:'1',entity_type:'tasks',operation:'UPDATE',actor:'user',created_at:'2026-09-19T10:00:00Z',before_value:{status:'pending'},after_value:{status:'completed',instruction:'Verbal reasoning'}};
test('activity names the task and the completed action without exposing snapshots',()=>{
  const result=presentActivity(row);assert.equal(result.title,'Task completed');assert.equal(result.detail,'Verbal reasoning');assert.equal('after_value' in result,false);
});
test('deleted records retain their prior name and recovery is explained',()=>{
  assert.equal(presentActivity({...row,operation:'DELETE',before_value:{title:'Study'},after_value:null}).detail,'Study');
  assert.equal(presentActivity({...row,actor:'recover_reviewed_offline_edit'}).origin,'Recovered your saved change');
  assert.equal(presentActivity({...row,after_value:{deleted_at:'2026-09-19'}}).title,'Task deleted');
});
test('suggested actions show review outcome and unknown types have a readable fallback',()=>{
  assert.equal(presentActivity({...row,entity_type:'ai_actions',after_value:{status:'applied'}}).title,'Suggested changes applied');
  assert.equal(presentActivity({...row,entity_type:'internal_new_type',operation:'INSERT',after_value:{}}).title,'Record created');
});
