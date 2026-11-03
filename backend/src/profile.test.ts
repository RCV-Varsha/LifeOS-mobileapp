import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProfile,validateProfile} from './profile.ts';
test('profile fields can all be cleared and names are trimmed',()=>{
  assert.deepEqual(validateProfile(blankProfile),blankProfile);
  assert.equal(validateProfile({...blankProfile,name:'  Sam  '}).name,'Sam');
});
test('profile rejects malformed hours, unsupported fields and unreasonable session budgets',()=>{
  for(const change of [{start:'18:00'},{start:'25:00',end:'26:00'},{start:'18:00',end:'09:00'},{sessionMinutes:0},{sessionMinutes:241},{sessionMinutes:30.5},{owner_id:'other'}])assert.throws(()=>validateProfile({...blankProfile,...change}));
  assert.equal(validateProfile({...blankProfile,start:'18:00',end:'20:00',sessionMinutes:60}).sessionMinutes,60);
});
