import type { WorkspaceTask } from './contracts.ts';

export type TimeBlock={starts_at:string;ends_at:string};
export function freeBlocks(start:string,end:string,events:TimeBlock[]) {
  const from=Date.parse(start),to=Date.parse(end);
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)throw new Error('Invalid planning window.');
  const occupied=events.map(e=>[Math.max(from,Date.parse(e.starts_at)),Math.min(to,Date.parse(e.ends_at))] as const)
    .filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
  const result:{start:number;end:number}[]=[];let cursor=from;
  for(const [a,b] of occupied){if(a>cursor)result.push({start:cursor,end:a});cursor=Math.max(cursor,b);}
  if(cursor<to)result.push({start:cursor,end:to});
  return result;
}
export function correction(tasks:Pick<WorkspaceTask,'planned_minutes'|'actual_minutes'|'status'|'category'>[],category:string) {
  const samples=tasks.filter(t=>t.status==='completed'&&t.category===category&&t.actual_minutes!==null&&t.planned_minutes>0);
  const estimated=samples.reduce((n,t)=>n+t.planned_minutes,0),actual=samples.reduce((n,t)=>n+t.actual_minutes!,0);
  return {sampleSize:samples.length,estimatedAverage:samples.length?estimated/samples.length:null,actualAverage:samples.length?actual/samples.length:null,factor:estimated?actual/estimated:1,basis:samples.length?'Recorded completed tasks':'Explicit estimate; no completed samples'};
}
export function schedule(tasks:WorkspaceTask[],start:string,end:string,events:TimeBlock[],maxTasks:number|null=null,bufferMinutes=0,minuteBudget:number|null=null) {
  const blocks=freeBlocks(start,end,events);
  let reserve=bufferMinutes*60000;
  for(let i=blocks.length-1;i>=0&&reserve>0;i--){const block=blocks[i]!;const amount=Math.min(reserve,block.end-block.start);block.end-=amount;reserve-=amount;}
  const initial=blocks.reduce((n,b)=>n+(b.end-b.start)/60000,0);
  const completed=new Set(tasks.filter(t=>t.status==='completed').map(t=>t.id));
  const pending=tasks.filter(t=>t.status==='pending').sort((a,b)=>b.priority-a.priority||(a.deadline??'9999').localeCompare(b.deadline??'9999')||a.id.localeCompare(b.id));
  const selected:{taskId:string;revision:number;startsAt:string;endsAt:string;minutes:number;basis:ReturnType<typeof correction>}[]=[];
  const skipped:{taskId:string;reason:string}[]=[];
  const finish=new Map<string,number>();
  while(pending.length){
    if(maxTasks!==null&&selected.length>=maxTasks){skipped.push(...pending.map(t=>({taskId:t.id,reason:'Your confirmed preference limits the number of major tasks.'})));break;}
    const index=pending.findIndex(t=>t.dependencies.every(d=>completed.has(d)||finish.has(d)));
    if(index<0){skipped.push(...pending.map(t=>({taskId:t.id,reason:'Unresolved dependency, missing dependency context, or cycle.'})));break;}
    const task=pending.splice(index,1)[0]!;
    const basis=correction(tasks,task.category),minutes=Math.ceil(task.planned_minutes*basis.factor);
    if(minuteBudget!==null&&selected.reduce((sum,item)=>sum+item.minutes,0)+minutes>minuteBudget){skipped.push({taskId:task.id,reason:'This task exceeds the remaining minutes in your profile’s planning-session budget.'});continue;}
    const earliest=Math.max(Date.parse(start),...task.dependencies.map(d=>finish.get(d)??0));
    let placed=false;
    for(const block of blocks){
      const a=Math.max(block.start,earliest),b=a+minutes*60000;
      if(b>block.end||(task.deadline&&b>Date.parse(task.deadline)))continue;
      selected.push({taskId:task.id,revision:task.revision,startsAt:new Date(a).toISOString(),endsAt:new Date(b).toISOString(),minutes,basis});
      // Preserve any earlier gap for independent tasks.
      const oldStart=block.start;block.start=b;
      if(a>oldStart)blocks.push({start:oldStart,end:a});
      finish.set(task.id,b);placed=true;break;
    }
    if(!placed)skipped.push({taskId:task.id,reason:'No uninterrupted block fits the estimate, dependency order and deadline.'});
  }
  return {availableMinutes:initial,allocatedMinutes:selected.reduce((n,t)=>n+t.minutes,0),selected,skipped};
}
export function projectInsights(tasks:WorkspaceTask[],now=new Date()) {
  const active=tasks.filter(t=>t.status==='pending');
  return active.flatMap(t=>{
    const evidence={taskId:t.id,title:t.instruction,deadline:t.deadline,estimate:t.planned_minutes,dependencies:t.dependencies};
    const result:{kind:string;what:string;why:string;evidence:typeof evidence;recommendation:string}[]=[];
    if(t.deadline&&Date.parse(t.deadline)<now.getTime())result.push({kind:'overdue',what:`${t.instruction} is overdue`,why:'The recorded deadline has passed while this task remains pending.',evidence,recommendation:'Review the deadline and remaining work.'});
    if(t.dependencies.some(d=>tasks.find(x=>x.id===d)?.status!=='completed'))result.push({kind:'blocked',what:`${t.instruction} has unfinished dependencies`,why:'Prerequisite work needs to finish first.',evidence,recommendation:'Review the prerequisite tasks before scheduling.'});
    if(Date.parse(t.updated_at)<now.getTime()-7*86400000)result.push({kind:'stalled',what:`${t.instruction} has not changed in seven days`,why:'No task update has been recorded; this does not prove no work happened.',evidence,recommendation:'Record progress or adjust the plan.'});
    return result;
  });
}
