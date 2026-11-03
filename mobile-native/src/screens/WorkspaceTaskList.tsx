import { useState } from 'react';
import { ActivityIndicator,Pressable,StyleSheet,Text,View } from 'react-native';
import type { WorkspaceTask } from '../../../backend/src/workspace/contracts';
import { colors } from '../ui/theme';
import TaskProgressBar from '../components/TaskProgressBar';
import { taskProgress } from '../services/workspaceProgress';

type Props={tasks:WorkspaceTask[];allTasks:WorkspaceTask[];busy:boolean;updatingId:string|null;pendingIds:Set<string>;onEdit:(task:WorkspaceTask)=>void;onToggle:(task:WorkspaceTask)=>void;board:boolean};
export default function WorkspaceTaskList({tasks,allTasks,busy,updatingId,pendingIds,onEdit,onToggle,board}:Props){
  const [hideDone,setHideDone]=useState(true);
  const progress=taskProgress(tasks);
  const ids=new Set(tasks.map(task=>task.id));
  function row(task:WorkspaceTask,child=false){
    const done=task.status==='completed',saving=updatingId===task.id,pending=pendingIds.has(task.id);
    return <View key={task.id} style={[styles.row,child&&styles.child,done&&styles.doneCard]}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`${done?'Reopen':'Complete'} ${task.instruction}`} accessibilityState={{checked:done,disabled:busy||pending}} disabled={busy||pending} onPress={()=>onToggle(task)} style={({pressed})=>[styles.check,done&&styles.checked,pressed&&{opacity:0.6}]}>{saving?<ActivityIndicator size="small" color={done?colors.onInk:colors.green}/>:<Text style={[styles.checkText,done&&{color:colors.onInk}]}>{done?'✓':''}</Text>}</Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${task.instruction}`} onPress={()=>onEdit(task)} style={styles.content}>
        <Text style={[styles.title,done&&styles.doneTitle]}>{task.instruction}</Text>
        <Text style={[styles.meta,done&&styles.doneMeta]}>{saving?'Saving…':pending?'Saved locally · waiting to sync':done?'✓ Completed':`${task.planned_minutes} min · Ready to start`}{task.deadline&&!done?` · Due ${new Date(task.deadline).toLocaleDateString()}`:''}</Text>
        {task.parent_task_id&&!child?<Text style={styles.meta}>Part of {allTasks.find(parent=>parent.id===task.parent_task_id)?.instruction??'a main task'}</Text>:null}
      </Pressable>
    </View>;
  }
  function group(task:WorkspaceTask){
    const children=tasks.filter(child=>child.parent_task_id===task.id);
    const stats=task.subtask_progress??{total:children.length,completed:children.filter(child=>child.status==='completed').length};
    if(!stats.total)return row(task);
    return <View key={task.id} style={styles.group}>
      <View style={styles.groupTop}><Text style={styles.eyebrow}>MAIN TASK</Text><Text style={styles.percent}>{Math.round(stats.completed/stats.total*100)}%</Text></View>
      <Pressable accessibilityRole="button" onPress={()=>onEdit(task)}><Text style={styles.parentTitle}>{task.instruction}</Text></Pressable>
      <TaskProgressBar {...stats}/><Text accessibilityLiveRegion="polite" style={styles.progressText}>{stats.completed} of {stats.total} subtasks complete{stats.completed===stats.total?' · All steps finished!':''}</Text>
      {children.filter(child=>!hideDone||child.status!=='completed').map(child=>row(child,true))}
      {stats.completed===stats.total&&task.status!=='completed'?<Pressable accessibilityRole="button" disabled={busy||pendingIds.has(task.id)} onPress={()=>onToggle(task)} style={styles.finish}><Text style={styles.finishText}>Finish main task ✓</Text></Pressable>:null}
      {task.status==='completed'?<Pressable accessibilityRole="button" disabled={busy||pendingIds.has(task.id)} onPress={()=>onToggle(task)}><Text style={styles.progressText}>Main task completed · Tap to reopen</Text></Pressable>:null}
    </View>;
  }
  return <View style={styles.list}>
    <View style={styles.summary}><View style={styles.summaryTop}><View><Text style={styles.eyebrow}>YOUR MOMENTUM</Text><Text style={styles.summaryTitle}>{progress.total&&progress.completed===progress.total?'Everything finished ✨':progress.completed?`${progress.completed} ${progress.completed===1?"step":"steps"} forward`:'One step starts it'}</Text></View><Text style={styles.bigPercent}>{progress.percent}%</Text></View><TaskProgressBar {...progress}/><Text accessibilityLiveRegion="polite" style={styles.progressText}>{progress.completed} of {progress.total} tasks complete{progress.total?` · ${progress.total-progress.completed} remaining`:''}</Text></View>
    <Pressable accessibilityRole="button" accessibilityState={{selected:hideDone}} onPress={()=>setHideDone(value=>!value)}><Text style={styles.filter}>{hideDone?'Show completed tasks':'Hide completed tasks'}</Text></Pressable>
    {board?(['pending','completed'] as const).map(status=><View key={status} style={styles.list}><Text style={styles.eyebrow}>{status==='pending'?'TO DO':'DONE'}</Text>{tasks.filter(task=>task.status===status&&(!hideDone||status!=='completed')).map(task=>row(task))}</View>):tasks.filter(task=>(!task.parent_task_id||!ids.has(task.parent_task_id))&&(!hideDone||task.status!=='completed'||Boolean(task.subtask_progress?.total))).map(group)}
  </View>;
}
const styles=StyleSheet.create({list:{gap:12},summary:{padding:20,borderRadius:20,backgroundColor:colors.greenSoft,gap:12},summaryTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},eyebrow:{fontSize:10,letterSpacing:1.6,fontWeight:'800',color:colors.green},summaryTitle:{fontSize:21,fontWeight:'700',color:colors.ink,marginTop:6},bigPercent:{fontSize:30,fontWeight:'800',color:colors.green},progressText:{fontSize:12,color:colors.green,fontWeight:'600',lineHeight:19},filter:{color:colors.green,fontWeight:'600',paddingVertical:10},row:{flexDirection:'row',alignItems:'center',padding:16,gap:12,borderRadius:16,borderWidth:1,borderColor:colors.line,backgroundColor:colors.paperRaised},child:{borderWidth:0,borderRadius:12,padding:12},doneCard:{backgroundColor:colors.greenSoft},check:{width:48,height:48,borderRadius:24,borderWidth:2,borderColor:colors.green,alignItems:'center',justifyContent:'center'},checked:{backgroundColor:colors.green},checkText:{fontSize:22,fontWeight:'700',color:colors.green},content:{flex:1,gap:6},title:{fontSize:15,fontWeight:'600',color:colors.ink,lineHeight:22},doneTitle:{textDecorationLine:'line-through',color:colors.muted},meta:{fontSize:12,color:colors.muted,lineHeight:18},doneMeta:{color:colors.green},group:{backgroundColor:colors.paperRaised,borderColor:colors.line,borderWidth:1,borderRadius:20,padding:16,gap:12},groupTop:{flexDirection:'row',justifyContent:'space-between'},parentTitle:{fontSize:20,lineHeight:27,fontWeight:'700',color:colors.ink},percent:{fontWeight:'800',color:colors.green},finish:{backgroundColor:colors.green,borderRadius:12,padding:14,alignItems:'center'},finishText:{color:colors.onInk,fontWeight:'700'}});

