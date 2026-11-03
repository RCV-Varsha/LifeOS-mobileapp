import type { Pool } from 'pg';
import { ApiError, id, keys, object, timestamp } from '../platform/validation.ts';
import { WorkspaceRepository } from './repository.ts';
import { schedule } from './planning.ts';
import { ActionService } from './actions.ts';
import { PreferenceRepository } from '../preferences/preferenceRepository.ts';
import { MemoryRepository } from '../memories/memoryRepository.ts';
import {readProfile} from '../profile.ts';

export async function proposeSchedule(pool:Pool,owner:string,input:unknown){
  const b=object(input);keys(b,['startsAt','endsAt','projectId']);const start=timestamp(b.startsAt),end=timestamp(b.endsAt);
  if(Date.parse(end)<=Date.parse(start)||Date.parse(start)<Date.now()-60000||Date.parse(end)-Date.parse(start)>7*86400000)throw new ApiError(400,'invalid_window','Choose a future window of up to seven days.');
  const tasks=await new WorkspaceRepository(pool).tasks(owner,b.projectId==null?null:id(b.projectId));
  const events=(await pool.query('SELECT * FROM public.calendar_events WHERE owner_id=$1 AND starts_at<$3 AND ends_at>$2',[owner,start,end])).rows;
  const alreadyScheduled=new Set(events.map(e=>e.task_id).filter(Boolean));
  const preferences=await new PreferenceRepository(pool).context(owner,['PLANNING']);
  const memory=await new MemoryRepository(pool).planningContext(owner,start.slice(0,10));
  const buffer=memory.dailyBufferMinutes;
  const {profile}=await readProfile(pool,owner);
  const evaluation={...schedule(tasks.filter(t=>!alreadyScheduled.has(t.id)),start,end,events,preferences.maxMajorTasks,buffer,profile.sessionMinutes),reservedBufferMinutes:buffer,maxMajorTasks:preferences.maxMajorTasks,sessionMinutes:profile.sessionMinutes};
  const changes=evaluation.selected.map(({taskId,revision,startsAt,endsAt})=>({kind:'schedule_task',taskId,revision,startsAt,endsAt}));
  const proposal=changes.length?await new ActionService(pool).propose(owner,'planner',`${evaluation.allocatedMinutes} minutes proposed in ${evaluation.availableMinutes} available minutes. Review dependency order and historical estimates.`,changes):null;
  return {evaluation,proposal};
}
