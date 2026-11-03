import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateDocumentAnalysis} from './documentAnalysis.ts';
test('file suggestions can only create bounded, unscheduled tasks',()=>{
  const result=validateDocumentAnalysis({summary:'Study percentages.',extractedText:'Syllabus: percentages',tasks:[{title:'Practice percentages',description:'Solve syllabus exercises',minutes:30}]});
  assert.equal(result.tasks[0].kind,'create_task');assert.equal(result.tasks[0].deadline,null);assert.equal(result.tasks[0].projectId,null);
  assert.throws(()=>validateDocumentAnalysis({summary:'x',extractedText:'',tasks:[{title:'Unsupported',description:'x',minutes:30}]}));
  assert.throws(()=>validateDocumentAnalysis({summary:'x',extractedText:'x',tasks:[{title:'x',description:'x',minutes:300}]}));
  assert.throws(()=>validateDocumentAnalysis({summary:'x',extractedText:'x',tasks:[{title:'x',description:'x',minutes:30,kind:'schedule_task'}]}));
});
test('unreadable documents can return a useful explanation without tasks',()=>{
  assert.deepEqual(validateDocumentAnalysis({summary:'This image is too blurry to read.',extractedText:'',tasks:[]}).tasks,[]);
  assert.throws(()=>validateDocumentAnalysis({summary:'x',extractedText:'x',tasks:Array(13).fill({title:'x',description:'x',minutes:1})}));
});
