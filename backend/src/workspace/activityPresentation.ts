type RecordValue=Record<string,unknown>|null;
type Activity={id:string;entity_type:string;operation:string;actor:string;created_at:string;before_value:RecordValue;after_value:RecordValue};
export function presentActivity(row:Activity){
  const before=row.before_value??{},after=row.after_value??{},record=row.after_value??before;
  const labels:Record<string,string>={tasks:'Task',goals:'Goal',projects:'Project',knowledge_items:'Note',relationships:'Connection',calendar_events:'Calendar event',ai_actions:'Suggested changes',evidence_memories:'Memory',decisions:'Decision',objectives:'Objective'};
  const label=labels[row.entity_type]??'Record';
  let action=row.operation==='INSERT'?'created':row.operation==='DELETE'?'deleted':'updated';
  if(row.operation==='UPDATE'){
    if(after.deleted_at&&!before.deleted_at)action='deleted';
    else if(after.status!==before.status){
      const statuses:Record<string,string>={completed:'completed',pending:'reopened',archived:'archived',applied:'applied',rejected:'rejected',undone:'undone'};
      action=statuses[String(after.status)]??'updated';
    }else if(row.entity_type==='tasks'&&after.parent_task_id!==before.parent_task_id)action=after.parent_task_id?'linked to a main task':'unlinked from its main task';
  }
  const name=record.title??record.instruction??record.summary;
  const detail=typeof name==='string'&&name.trim()?name.trim():row.entity_type==='relationships'?'A link between saved items changed.':'A saved record changed.';
  return {id:row.id,created_at:row.created_at,title:`${label} ${action}`,detail,origin:row.actor==='offline_sync'?'Synced from your device':row.actor==='recover_reviewed_offline_edit'?'Recovered your saved change':row.actor==='user'?'Saved in LifeOS':'Processed by LifeOS'};
}
