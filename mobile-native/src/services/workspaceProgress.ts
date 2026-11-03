import type { WorkspaceTask } from '../../../backend/src/workspace/contracts';
import type { PendingWrite } from './workspaceOffline';

export function projectPendingTasks(tasks:WorkspaceTask[],queue:PendingWrite[]){
  return queue.reduce((items,write)=>write.entityId&&write.state==='pending'&&(write.payload.status==='completed'||write.payload.status==='pending')?applyTaskStatus(items,write.entityId,write.payload.status):items,tasks);
}

export function applyTaskStatus(tasks:WorkspaceTask[],id:string,status:WorkspaceTask['status']):WorkspaceTask[]{
  const original=tasks.find(task=>task.id===id);
  if(!original||original.status===status)return tasks;
  const delta=status==='completed'?1:-1;
  return tasks.map(task=>task.id===id?{...task,status}:task.id===original.parent_task_id&&task.subtask_progress?{
    ...task,...(status==='pending'?{status:'pending' as const}:{}),subtask_progress:{...task.subtask_progress,completed:Math.max(0,Math.min(task.subtask_progress.total,task.subtask_progress.completed+delta))},
  }:task);
}

export function taskProgress(tasks:WorkspaceTask[]){
  // Parent containers are not an additional unit of work on top of their subtasks.
  const leaves=tasks.filter(task=>!(task.subtask_progress?.total||tasks.some(child=>child.parent_task_id===task.id)));
  const completed=leaves.filter(task=>task.status==='completed').length;
  return{completed,total:leaves.length,percent:leaves.length?Math.round(completed/leaves.length*100):0};
}
