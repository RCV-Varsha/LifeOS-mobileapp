const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/services/calendarView.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const loaded={exports:{}};new Function('exports','module',source)(loaded.exports,loaded);
const {calendarMonth,eventsOnDay,calendarDayKey}=loaded.exports;
test('calendar grids align Monday-first and include leap days',()=>{
  const feb=calendarMonth(new Date(2028,1,15));
  assert.equal(feb.cells.filter(Boolean).length,29);
  assert.equal(feb.cells.length%7,0);
  assert.equal(feb.cells[0],null);assert.equal(feb.cells[1].getDate(),1);
  assert.equal(calendarDayKey(feb.end),'2028-03-01');
  const december=calendarMonth(new Date(2026,11,31));assert.equal(calendarDayKey(december.end),'2027-01-01');
});
test('agenda includes overlapping and overnight events without leaking exclusive end dates',()=>{
  const selected=new Date(2026,8,20);
  const event=(id,start,end)=>({id,title:id,starts_at:start.toISOString(),ends_at:end.toISOString()});
  const overnight=event('overnight',new Date(2026,8,19,23),new Date(2026,8,20,1));
  const today=event('meeting',new Date(2026,8,20,9),new Date(2026,8,20,10));
  const finished=event('yesterday',new Date(2026,8,19,12),new Date(2026,8,20,0));
  const tomorrow=event('tomorrow',new Date(2026,8,21,0),new Date(2026,8,21,1));
  assert.deepEqual(eventsOnDay([tomorrow,today,finished,overnight],selected).map(item=>item.id),['overnight','meeting']);
  assert.deepEqual(eventsOnDay([],selected),[]);
});
