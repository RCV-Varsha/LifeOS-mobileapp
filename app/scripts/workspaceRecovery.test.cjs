const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');
function load(name, mocks = {}) {
  const compiled = ts.transpileModule(readFileSync(resolve(__dirname, '../src/services/', name + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', compiled)(module.exports, module, name => {
    if (!(name in mocks)) throw new Error('Unexpected import ' + name);
    return mocks[name];
  });
  return module.exports;
}
const { normalizeTaskDeadline,formatTaskDeadline,normalizePlannerWindow,normalizeNewPlannerWindow } = load('taskDeadline');

test('new plans reject yesterday but allow today and future dates using local midnight',()=>{
  const now=new Date(2026,8,20,15);
  assert.throws(()=>normalizeNewPlannerWindow('19/09/2026 23:59','20/09/2026 10:00',now),/Past dates are unavailable/);
  assert.doesNotThrow(()=>normalizeNewPlannerWindow('20/09/2026 00:00','20/09/2026 10:00',now));
  assert.doesNotThrow(()=>normalizeNewPlannerWindow('21/09/2026 09:00','21/09/2026 10:00',now));
  assert.doesNotThrow(()=>normalizePlannerWindow('19/09/2026 09:00','19/09/2026 10:00'));
  assert.throws(()=>normalizeNewPlannerWindow(new Date(2026,8,19,23,59).toISOString(),new Date(2026,8,20,10).toISOString(),now),/Past dates are unavailable/);
});

test('planner converts displayed local dates and times into unchanged server instants',()=>{
  const start=new Date(2026,8,20,9,0).toISOString(),end=new Date(2026,8,20,17,0).toISOString();
  assert.equal(formatTaskDeadline(start,true),'20/09/2026 09:00');
  assert.deepEqual(normalizePlannerWindow(formatTaskDeadline(start,true),formatTaskDeadline(end,true)),{startsAt:start,endsAt:end});
  assert.deepEqual(normalizePlannerWindow(start,end),{startsAt:start,endsAt:end});
  assert.throws(()=>normalizePlannerWindow('20/09/2026','20/09/2026 17:00'),/both a date and time/);
  assert.throws(()=>normalizePlannerWindow('20/09/2026 17:00','20/09/2026 09:00'),/after start/);
  assert.throws(()=>normalizePlannerWindow('31/09/2026 09:00','31/09/2026 17:00'),/valid deadline/);
});

test('deadline editor displays local day-first dates without changing the saved deadline',()=>{
  const endOfDay=new Date(2026,8,22,23,59,59,999).toISOString();
  assert.equal(formatTaskDeadline(endOfDay),'22/09/2026');
  assert.equal(normalizeTaskDeadline(formatTaskDeadline(endOfDay)),endOfDay);
  const timed=new Date(2026,8,22,16,30,12,123).toISOString();
  assert.equal(formatTaskDeadline(timed),'22/09/2026 16:30:12.123');
  assert.equal(normalizeTaskDeadline(formatTaskDeadline(timed)),timed);
  assert.equal(formatTaskDeadline(null),'');
  assert.equal(formatTaskDeadline('invalid saved date'),'invalid saved date');
});

test('date-only deadlines use local end of day, including day-first dates', () => {
  const expected = new Date(2026, 8, 30, 23, 59, 59, 999).toISOString();
  assert.equal(normalizeTaskDeadline('2026-09-30'), expected);
  assert.equal(normalizeTaskDeadline(' 30/09/2026 '), expected);
  assert.equal(normalizeTaskDeadline(''), null);
});
test('local time and explicit timezone deadlines preserve their intended time', () => {
  assert.equal(normalizeTaskDeadline('2026-09-30 18:30'), new Date(2026, 8, 30, 18, 30).toISOString());
  assert.equal(normalizeTaskDeadline('2026-09-30T18:30:00+05:30'), '2026-09-30T13:00:00.000Z');
  assert.equal(normalizeTaskDeadline('2026-09-30T13:00:00.123Z'), '2026-09-30T13:00:00.123Z');
});
test('impossible and ambiguous free-text dates are rejected instead of silently changed', () => {
  for (const input of ['2026-02-30', '31/09/2026', '2026-13-01', '2026-00-01', '2026-09-30 24:00', '2026-09-30 12:60', 'tomorrow', '09-30-2026']) {
    assert.throws(() => normalizeTaskDeadline(input), /valid deadline/);
  }
  assert.equal(normalizeTaskDeadline('2028-02-29'), new Date(2028, 1, 29, 23, 59, 59, 999).toISOString());
});

function workspace(failWrites = false) {
  const original = { operationId: 'saved-operation', kind: 'create_task', entityId: null, state: 'conflict', error: 'Provide an ISO timestamp with timezone.', payload: {
    title: 'Aptitude prep', description: 'Keep my saved description', minutes: 30, deadline: '2026-09-30', priority: 2, category: 'study', status: 'pending', actualMinutes: null,
  } };
  let stored = JSON.stringify({ tasks: [], queue: [original] });
  const sent = [];
  const service = load('workspaceOffline', {
    '@react-native-async-storage/async-storage': { default: {
      getItem: async () => stored,
      setItem: async (_key, value) => { if (failWrites) throw new Error('Storage full'); stored = value; },
    } },
    './authStorage': { readTokens: async () => ({ user: { id: 'qa' } }) },
    './apiFetch': { api: async (path, _method, body) => {
      if (path === '/sync') { sent.push(body); return {}; }
      return { items: [{ id: 'server-task', instruction: original.payload.title }] };
    } },
    './offlineReplay': load('offlineReplay'),
  });
  return { service, original, sent, stored: () => JSON.parse(stored) };
}
test('a rejected deadline can be corrected in place and synced once without losing content', async () => {
  const { service, original, sent, stored } = workspace();
  await service.revisePendingTask(original.operationId, { ...original.payload, deadline: normalizeTaskDeadline(original.payload.deadline) });
  assert.equal(stored().queue.length, 1);
  assert.equal(stored().queue[0].operationId, original.operationId);
  assert.equal(stored().queue[0].state, 'pending');
  assert.equal(stored().queue[0].error, undefined);
  assert.equal(stored().queue[0].payload.description, original.payload.description);
  await service.synchronizeWorkspace();
  await service.synchronizeWorkspace();
  assert.equal(sent.length, 1); assert.equal(sent[0].operationId, original.operationId);
  assert.equal(stored().queue.length, 0); assert.equal(stored().tasks[0].id, 'server-task');
});
test('a failed correction write leaves the original saved task intact', async () => {
  const { service, original, stored } = workspace(true);
  await assert.rejects(service.revisePendingTask(original.operationId, { ...original.payload, title: 'Changed' }), /Storage full/);
  assert.deepEqual(stored().queue, [original]);
});
test('an already synchronized or discarded operation cannot create a second task', async () => {
  const { service, original, stored } = workspace();
  await service.discardWrite(original.operationId);
  await assert.rejects(service.revisePendingTask(original.operationId, original.payload), /already synced or was removed/);
  assert.equal(stored().queue.length, 0);
});

test('completion queues only status and retry retains its operation identifier',async()=>{
  const {service,stored}=workspace();
  await service.enqueueTaskStatus({id:'task',instruction:'Keep title',revision:1},'completed');
  const operation=stored().queue.at(-1);
  assert.equal(operation.kind,'set_task_status');
  assert.deepEqual(operation.payload,{title:'Keep title',status:'completed'});
  await service.retryPendingStatus(operation.operationId);
  assert.equal(stored().queue.at(-1).operationId,operation.operationId);
});

test('a server-recovered edit clears its local conflict using the original receipt',async()=>{
  const original={operationId:'recovered-edit',kind:'update_task',entityId:'task',payload:{title:'Task',status:'completed',deadline:'2026-09-22T18:29:59.999Z',revision:1},state:'conflict',error:'Task changed or is unavailable. Reload before editing.'};
  let stored=JSON.stringify({tasks:[],queue:[original]});
  const sent=[];
  const service=load('workspaceOffline',{
    '@react-native-async-storage/async-storage':{default:{getItem:async()=>stored,setItem:async(_key,value)=>{stored=value;}}},
    './authStorage':{readTokens:async()=>({user:{id:'test'}})},
    './offlineReplay':load('offlineReplay'),
    './apiFetch':{api:async(path,_method,body)=>{if(path==='/sync'){sent.push(body);return {item:{id:'task',status:'completed'}};}return {items:[{id:'task',status:'completed'}]};}},
  });
  const result=await service.synchronizeWorkspace();
  assert.equal(result.queue.length,0);
  assert.equal(sent.length,1);
  assert.equal(sent[0].operationId,original.operationId);
  assert.deepEqual(sent[0].payload,original.payload);
  await service.synchronizeWorkspace();
  assert.equal(sent.length,1);
});

for(const changedTitle of [false,true])test(`legacy completion recovery ${changedTitle?'preserves conflicting edits':'recovers a metadata-only revision change'}`,async()=>{
  const task={id:'task',instruction:'Task',description:'Notes',project_id:null,planned_minutes:30,deadline:null,priority:0,category:'general',actual_minutes:null,status:'pending',revision:3};
  const payload={title:changedTitle?'User edit':'Task',description:'Notes',projectId:null,minutes:30,deadline:null,priority:0,category:'general',actualMinutes:null,status:'completed',revision:1};
  let stored=JSON.stringify({tasks:[task],queue:[{operationId:'rejected',kind:'update_task',entityId:task.id,payload,state:'conflict',error:'Task changed or is unavailable. Reload before editing.'}]});
  const sent=[];
  const service=load('workspaceOffline',{
    '@react-native-async-storage/async-storage':{default:{getItem:async()=>stored,setItem:async(_key,value)=>{stored=value;}}},
    './authStorage':{readTokens:async()=>({user:{id:'test'}})},
    './offlineReplay':load('offlineReplay'),
    './apiFetch':{api:async(path,_method,body)=>{if(path==='/sync'){if(body.kind==='update_task')throw Object.assign(new Error('Task changed or is unavailable. Reload before editing.'),{status:409});sent.push(body);task.status=body.payload.status;return{};}return{items:[task]};}},
  });
  const result=await service.synchronizeWorkspace();
  assert.equal(sent.length,changedTitle?0:1);
  assert.equal(result.queue.length,changedTitle?1:0);
  if(!changedTitle){assert.equal(sent[0].kind,'set_task_status');assert.notEqual(sent[0].operationId,'rejected');assert.equal(task.status,'completed');}
});
