import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './apiFetch';
import { readTokens } from './authStorage';
import type { WorkspaceTask } from '../../../backend/src/workspace/contracts';
import { replayQueue } from './offlineReplay';

export type PendingWrite={operationId:string;kind:'create_task'|'update_task'|'set_task_status';entityId:string|null;payload:Record<string,unknown>;state:'pending'|'conflict';error?:string};
type LocalWorkspace={tasks:WorkspaceTask[];queue:PendingWrite[]};
let serial:Promise<unknown>=Promise.resolve();
async function exclusive<T>(work:()=>Promise<T>):Promise<T>{const next=serial.then(work,work);serial=next.catch(()=>undefined);return next;}
async function storageKey(){const session=await readTokens();if(!session)throw new Error('Sign in to save offline.');return `lifeos.workspace.${session.user.id}`;}
async function load(key:string):Promise<LocalWorkspace>{const raw=await AsyncStorage.getItem(key);return raw?JSON.parse(raw) as LocalWorkspace:{tasks:[],queue:[]};}
async function save(key:string,value:LocalWorkspace){await AsyncStorage.setItem(key,JSON.stringify(value));}
function operationId(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16);});}
export async function localWorkspace(){return exclusive(async()=>load(await storageKey()));}
export async function clearLocalWorkspace(){return exclusive(async()=>{await AsyncStorage.removeItem(await storageKey());});}
export async function enqueueTask(payload:Record<string,unknown>,entityId:string|null=null){return exclusive(async()=>{
  const key=await storageKey(),local=await load(key),operation=operationId();
  local.queue.push({operationId:operation,kind:entityId?'update_task':'create_task',entityId,payload,state:'pending'});
  await save(key,local);return local;
});}
export async function enqueueTaskStatus(task:WorkspaceTask,status:WorkspaceTask['status']){return exclusive(async()=>{
  const key=await storageKey(),local=await load(key);
  local.queue.push({operationId:operationId(),kind:'set_task_status',entityId:task.id,payload:{title:task.instruction,status},state:'pending'});
  await save(key,local);return local;
});}
export async function revisePendingTask(operation:string,payload:Record<string,unknown>){return exclusive(async()=>{
  const key=await storageKey(),local=await load(key);
  const write=local.queue.find(item=>item.operationId===operation);
  if(!write)throw new Error('This change has already synced or was removed. Refresh the workspace.');
  // Keep the operation ID so an uncertain earlier result cannot create a duplicate.
  write.payload=payload;write.state='pending';delete write.error;
  await save(key,local);return local;
});}
export async function discardWrite(operation:string){return exclusive(async()=>{const key=await storageKey(),local=await load(key);local.queue=local.queue.filter(x=>x.operationId!==operation);await save(key,local);return local;});}
export async function retryPendingStatus(operation:string){return exclusive(async()=>{
  const key=await storageKey(),local=await load(key),write=local.queue.find(item=>item.operationId===operation);
  if(!write||write.kind!=='set_task_status')throw new Error('This completion has already synced or was removed.');
  write.state='pending';delete write.error;await save(key,local);
});}
export async function synchronizeWorkspace(){return exclusive(async()=>{
  const key=await storageKey(),local=await load(key);
  for(const write of local.queue)if(write.kind==='set_task_status'&&write.state==='conflict'&&write.error==='Invalid sync kind.'){
    write.state='pending';delete write.error;
  }
  // A reviewed conflict may have been recovered on the server. Replay the exact
  // operation to retrieve its receipt; unchanged revision checks still protect edits.
  for(const write of local.queue)if(write.kind==='update_task'&&write.state==='conflict'&&write.error?.startsWith('Task changed or is unavailable.')){
    write.state='pending';delete write.error;
  }
  local.queue=await replayQueue(local.queue,async write=>{
    const {state:_state,error:_error,...body}=write;await api('/sync','POST',body);
  },async remaining=>{local.queue=remaining;await save(key,local);});
  let remote=await api<{items:WorkspaceTask[]}>('/workspace/tasks');
  // Older builds sent entire task snapshots to complete a task. Recover only rejected
  // writes whose editable fields exactly match the current server record.
  let recovered=false;
  local.queue=local.queue.map(write=>{
    const task=remote.items.find(item=>item.id===write.entityId),p=write.payload;
    if(write.kind!=='update_task'||write.state!=='conflict'||!write.error?.startsWith('Task changed or is unavailable.')||!task)return write;
    const matches=p.title===task.instruction&&p.description===task.description&&p.projectId===task.project_id&&p.minutes===task.planned_minutes&&p.deadline===task.deadline&&p.priority===task.priority&&p.category===task.category&&p.actualMinutes===task.actual_minutes;
    if(!matches||(p.status!=='completed'&&p.status!=='pending'))return write;
    recovered=true;
    return {operationId:operationId(),kind:'set_task_status' as const,entityId:task.id,payload:{title:task.instruction,status:p.status},state:'pending' as const};
  });
  if(recovered){
    await save(key,local);
    local.queue=await replayQueue(local.queue,async write=>{const {state:_state,error:_error,...body}=write;await api('/sync','POST',body);},async remaining=>{local.queue=remaining;await save(key,local);});
    remote=await api<{items:WorkspaceTask[]}>('/workspace/tasks');
  }
  local.tasks=remote.items;await save(key,local);return local;
});}
