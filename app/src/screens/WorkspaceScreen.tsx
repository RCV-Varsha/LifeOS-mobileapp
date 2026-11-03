import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import ActionButton from '../components/ActionButton';
import MarkdownText from '../components/MarkdownText';
import PlannerPanel from './PlannerPanel';
import AssistantPanel from './AssistantPanel';
import WorkspaceEditor from './WorkspaceEditor';
import TaskAlertsPanel from './TaskAlertsPanel';
import EmptySection from '../components/EmptySection';
import Disclosure from '../components/Disclosure';
import { knowledgePreview } from '../services/knowledgePresentation';
import EvidenceMemoryPanel from './EvidenceMemoryPanel';
import PrivacyPanel from './PrivacyPanel';
import ProjectDetailPanel from './ProjectDetailPanel';
import ActionReviewCard from './ActionReviewCard';
import QuickAddPanel from './QuickAddPanel';
import { colors, input } from '../ui/theme';
import { api } from '../services/apiFetch';
import { discardWrite, enqueueTask, enqueueTaskStatus, revisePendingTask, retryPendingStatus, localWorkspace, synchronizeWorkspace, type PendingWrite } from '../services/workspaceOffline';
import { normalizeTaskDeadline,formatTaskDeadline } from '../services/taskDeadline';
import WorkspaceTaskList from './WorkspaceTaskList';
import { applyTaskStatus,projectPendingTasks } from '../services/workspaceProgress';
import type { AssistantAnswer, KnowledgeItem, Project, Proposal, Source, WorkspaceTask } from '../../../backend/src/workspace/contracts';

export type WorkspaceArea='workspace'|'knowledge'|'planner'|'assistant'|'intelligence'|'analytics'|'capture'|'search'|'notifications'|'activity'|'actions'|'graph'|'memory'|'settings';
type Props={area:WorkspaceArea;onNavigate:(area:WorkspaceArea)=>void;onDeleted?:()=>void};
type Insight={kind:string;what:string;why:string;evidence:{taskId:string;title:string;estimate:number};recommendation:string};
type CalendarEvent={id:string;title:string;starts_at:string;ends_at:string};
type Graph={nodes:{id:string;kind:string;title:string}[];edges:{id:string;source_id:string;target_id:string;type:string}[]};
const names:Record<WorkspaceArea,string>={workspace:'Workspace',knowledge:'Knowledge',planner:'Planner',assistant:'AI Assistant',intelligence:'Task alerts',analytics:'Progress',capture:'Quick add',search:'Search',notifications:'Notifications',activity:'Activity history',actions:'Review changes',graph:'Connections',memory:'Memory',settings:'Data & privacy'};
function readableTime(value:string|null){return value?new Date(value).toLocaleString():'';}
function ErrorText({value}:{value:string}){return value?<Text accessibilityRole="alert" style={styles.error}>{value}</Text>:null;}
function Field({label,value,onChange,multiline=false}:{label:string;value:string;onChange:(value:string)=>void;multiline?:boolean}){return <View style={{gap:6}}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} multiline={multiline} style={[input,multiline&&{minHeight:100,textAlignVertical:'top'}]}/></View>;}
function Choice({values,value,onChange}:{values:string[];value:string;onChange:(value:string)=>void}){return <View style={styles.row}>{values.map(v=><Pressable key={v} accessibilityRole="button" accessibilityState={{selected:v===value}} onPress={()=>onChange(v)} style={[styles.choice,v===value&&styles.chosen]}><Text style={{color:v===value?colors.onInk:colors.ink}}>{v}</Text></Pressable>)}</View>;}

export default function WorkspaceScreen({area,onNavigate,onDeleted}:Props){
  const {width}=useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [taskFilter,setTaskFilter]=useState('');
  const [pendingEdit,setPendingEdit]=useState<PendingWrite|null>(null);
  const [updatingId,setUpdatingId]=useState<string|null>(null);
  const [breakdownTaskId,setBreakdownTaskId]=useState<string|null>(null);
  const [projects,setProjects]=useState<Project[]>([]),[tasks,setTasks]=useState<WorkspaceTask[]>([]),[knowledge,setKnowledge]=useState<KnowledgeItem[]>([]);
  const [projectId,setProjectId]=useState<string|null>(null),[task,setTask]=useState<WorkspaceTask|null>(null),[item,setItem]=useState<KnowledgeItem|null>(null);
  const [title,setTitle]=useState(''),[content,setContent]=useState(''),[minutes,setMinutes]=useState('30'),[kind,setKind]=useState('note'),[query,setQuery]=useState('');
  const [deadline,setDeadline]=useState(''),[priority,setPriority]=useState('0'),[category,setCategory]=useState('general');
  const [results,setResults]=useState<Source[]>([]),[answer,setAnswer]=useState<AssistantAnswer|null>(null),[proposals,setProposals]=useState<Proposal[]>([]);
  const [insights,setInsights]=useState<Insight[]>([]),[events,setEvents]=useState<CalendarEvent[]>([]),[graph,setGraph]=useState<Graph>({nodes:[],edges:[]});
  const [activity,setActivity]=useState<{id:string;title:string;detail:string;origin:string;created_at:string}[]>([]),[notifications,setNotifications]=useState<{id:string;title:string;detail:string;read_at:string|null}[]>([]);
  const [analytics,setAnalytics]=useState<{total:number;completed:number;pending:number;corrections:{category:string;sampleSize:number;factor:number;actualAverage:number|null;estimatedAverage:number|null;basis:string}[];trends:{date:string;completed:number;actual_minutes:number|null}[]}|null>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[offline,setOffline]=useState(false),[queue,setQueue]=useState<PendingWrite[]>([]),[board,setBoard]=useState(false);
  const [start,setStart]=useState(()=>{const d=new Date();d.setDate(d.getDate()+1);d.setHours(9,0,0,0);return d.toISOString();}),[end,setEnd]=useState(()=>{const d=new Date();d.setDate(d.getDate()+1);d.setHours(17,0,0,0);return d.toISOString();});
  async function load(){
    setLoading(true);setError('');
    try{
      if(area==='workspace'){
        const local=await localWorkspace();setTasks(projectPendingTasks(local.tasks,local.queue));setQueue(local.queue);
        try{const synced=await synchronizeWorkspace();setTasks(projectPendingTasks(synced.tasks,synced.queue));setQueue(synced.queue);setOffline(false);}catch{setOffline(true);}
        setProjects((await api<{items:Project[]}>('/projects')).items);
      }
      if(area==='knowledge')setKnowledge((await api<{items:KnowledgeItem[]}>('/knowledge')).items);
      if(area==='actions')setProposals((await api<{items:Proposal[]}>('/ai/actions')).items);
      if(area==='intelligence')setInsights((await api<{items:Insight[]}>('/intelligence')).items);
      if(area==='analytics')setAnalytics(await api('/analytics'));
      if(area==='graph')setGraph(await api('/graph'));
      if(area==='activity')setActivity((await api<{items:typeof activity}>('/activity')).items);
      if(area==='notifications')setNotifications((await api<{items:typeof notifications}>('/notifications')).items);

    }catch(e){setError(e instanceof Error?e.message:'Unable to load.');}finally{setLoading(false);}
  }
  useEffect(()=>{setTask(null);setPendingEdit(null);setItem(null);setTitle('');setContent('');setMinutes('30');setDeadline('');setPriority('0');setCategory('general');setNotice('');scroll.current?.scrollTo({y:0,animated:false});void load();},[area]);
  async function perform(work:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Operation failed.');scroll.current?.scrollTo({y:0,animated:true});}finally{setBusy(false);}}
  const currentProject=projects.find(p=>p.id===projectId);
  const visibleTasks=tasks.filter(t=>(!projectId||t.project_id===projectId)&&t.instruction.toLowerCase().includes(taskFilter.toLowerCase()));
  async function saveTask(){
    const normalizedDeadline=normalizeTaskDeadline(deadline);
    const payload={...pendingEdit?.payload,title:title.trim(),description:content,minutes:Number(minutes),projectId,deadline:normalizedDeadline,priority:Number(priority),category,status:task?.status??pendingEdit?.payload.status??'pending',actualMinutes:task?.actual_minutes??pendingEdit?.payload.actualMinutes??null,...(task?{revision:task.revision}:{})};
    if(pendingEdit?.entityId){
      const current=tasks.find(item=>item.id===pendingEdit.entityId);
      if(!current)throw new Error('This task is no longer available. Refresh before retrying.');
      // An explicit correction applies the reviewed form to the latest loaded revision.
      payload.revision=current.revision;
    }
    if(pendingEdit)await revisePendingTask(pendingEdit.operationId,payload);else await enqueueTask(payload,task?.id??null);
    setTitle('');setContent('');setDeadline('');setTask(null);setPendingEdit(null);
    await load();const local=await localWorkspace();setQueue(local.queue);
    setNotice(local.queue.length?'Saved on this device. Changes still waiting to sync are shown above.':'Saved and synced.');
    scroll.current?.scrollTo({y:0,animated:true});
  }
  function editPending(write:PendingWrite){
    setPendingEdit(write);setTask(null);setTitle(String(write.payload.title??''));setContent(String(write.payload.description??''));
    setMinutes(String(write.payload.minutes??30));setDeadline(formatTaskDeadline(String(write.payload.deadline??'')));
    setPriority(String(write.payload.priority??0));setCategory(String(write.payload.category??'general'));
    setProjectId(typeof write.payload.projectId==='string'?write.payload.projectId:null);
    setError('');setNotice('Edit the saved task below, then save and retry.');
    
  }
  async function completeTask(t:WorkspaceTask){
    if(updatingId||queue.some(write=>write.entityId===t.id))return;
    const next=t.status==='completed'?'pending':'completed';
    setUpdatingId(t.id);
    try{
      const local=await enqueueTaskStatus(t,next);
      setQueue(local.queue);setTasks(items=>applyTaskStatus(items,t.id,next));
      try{
        const synced=await synchronizeWorkspace();setQueue(synced.queue);setOffline(false);
        setTasks(projectPendingTasks(synced.tasks,synced.queue));
        setNotice(synced.queue.some(write=>write.entityId===t.id)?'Saved locally. Check the pending change above.':next==='completed'?'Step completed. Your progress is updated.':'Task reopened. Your progress is updated.');
      }catch{setOffline(true);setNotice('Saved on this device. Completion will sync when you reconnect.');}
    }finally{setUpdatingId(null);}
  }
  function editTask(t:WorkspaceTask){setPendingEdit(null);setTask({...t});setTitle(t.instruction);setContent(t.description);setMinutes(String(t.planned_minutes));setProjectId(t.project_id);setDeadline(formatTaskDeadline(t.deadline));setPriority(String(t.priority));setCategory(t.category);}
  function editKnowledge(k:KnowledgeItem){setItem(k);setTitle(k.title);setContent(k.content);setKind(k.kind);setProjectId(k.project_id);}
  async function ask(){setAnswer(await api<AssistantAnswer>('/ai/assistant','POST',{input:query,projectId,parentTaskId:breakdownTaskId}));}
  async function searchKnowledge(mode:'keyword'|'semantic'){
    const searched=query.trim();setResults([]);
    const result=await api<{items:Source[]}>(`/search?q=${encodeURIComponent(searched)}&mode=${mode}${projectId?`&projectId=${encodeURIComponent(projectId)}`:''}`);
    setResults(result.items);
    setNotice(result.items.length?`${result.items.length} ${mode==='semantic'?'meaning-based':'keyword'} match${result.items.length===1?'':'es'} for “${searched}”.`:`No matches for “${searched}”. Try another phrase.`);
  }
  function proposalView(p:Proposal){
    return <ActionReviewCard key={p.id} proposal={p} busy={busy} onDecision={decision=>void perform(async()=>{
      const response=await api<{item:Proposal}>(`/ai/actions/${p.id}/${decision}`,'POST',{confirmed:true});
      setProposals(values=>values.map(item=>item.id===p.id?response.item:item));
      setAnswer(value=>value?.proposal?.id===p.id?{...value,proposal:response.item}:value);
      setNotice(decision==='apply'?'Changes applied.':decision==='undo'?'Changes reversed.':'Proposal rejected.');
      if(area==='planner')await load();
    })}/>;
  }
  return <ScrollView ref={scroll} contentContainerStyle={[styles.page,width>900&&{paddingHorizontal:48}]} keyboardShouldPersistTaps="handled"><View style={styles.header}><View>{area!=='assistant'&&area!=='planner'?<Text style={styles.eyebrow}>LIFEOS / YOUR CONNECTED WORK</Text>:null}<Text style={styles.heading}>{names[area]}</Text></View>{area!=='assistant'&&area!=='capture'&&area!=='planner'?<ActionButton title="Refresh" disabled={loading||busy} onPress={()=>void load()}/>:null}</View>

    <ErrorText value={error}/>{notice?<Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text>:null}{loading?<ActivityIndicator color={colors.green}/>:null}
    {area==='capture'?<QuickAddPanel onWorkspace={()=>onNavigate('workspace')} text={query} onChange={setQuery} onKnowledge={()=>onNavigate('knowledge')} onAssistant={()=>{setAnswer(null);setBreakdownTaskId(null);onNavigate('assistant');}}/>:null}
    {area==='memory'?<EvidenceMemoryPanel/>:null}
    {area==='settings'?<PrivacyPanel onDeleted={()=>onDeleted?.()} onActivity={()=>onNavigate('activity')}/>:null}
    {area==='workspace'?<><View style={styles.row}><Text style={[styles.meta,{flex:1}]}>Your tasks, grouped into clear next steps.</Text><WorkspaceEditor activeKey={pendingEdit??task??null} busy={busy}><View style={styles.panel}><Text style={styles.subheading}>{pendingEdit?'Correct saved task':task?'Edit task':'Add to your workspace'}</Text><Field label="Title" value={title} onChange={setTitle}/><Field label="Description" value={content} onChange={setContent} multiline/><Field label="Estimated minutes (1–240)" value={minutes} onChange={setMinutes}/><Field label="Deadline (YYYY-MM-DD or DD/MM/YYYY, optional)" value={deadline} onChange={setDeadline}/><Text style={styles.meta}>A date means the end of that day in your local time. For a specific time, use YYYY-MM-DD HH:mm.</Text><Field label="Task category" value={category} onChange={setCategory}/><Text style={styles.label}>Priority · 0 normal to 3 urgent</Text><Choice values={['0','1','2','3']} value={priority} onChange={setPriority}/>{task?<Field label="Actual minutes" value={task.actual_minutes===null?'':String(task.actual_minutes)} onChange={v=>setTask({...task,actual_minutes:v?Number(v):null})}/>:null}<ActionButton title={pendingEdit?'Save and retry':task?'Save task changes':'Create task'} variant="primary" disabled={busy||!title.trim()||!Number.isInteger(Number(minutes))||Number(minutes)<1||Number(minutes)>240} onPress={()=>void perform(saveTask)}/>{pendingEdit?<ActionButton title="Cancel correction" disabled={busy} onPress={()=>{setPendingEdit(null);setTitle('');setContent('');setDeadline('');}}/>:!task?<ActionButton title="Create project with this title" disabled={busy||!title.trim()} onPress={()=>void perform(async()=>{await api('/projects','POST',{title,description:content});setTitle('');setContent('');await load();})}/>:<View style={{gap:8}}><ActionButton title="Break into subtasks" disabled={Boolean(task.parent_task_id)} onPress={()=>{setBreakdownTaskId(task.id);setQuery(`Break the task ${task.instruction} into subtasks with estimates. Propose changes for review.`);onNavigate('assistant');}}/><ActionButton title="Explain priority and relevant knowledge" onPress={()=>{setBreakdownTaskId(null);setQuery(`Explain the priority of ${task.instruction} and find relevant recorded knowledge.`);onNavigate('assistant');}}/><ActionButton title="Cancel edit" onPress={()=>{setTask(null);setTitle('');setContent('');}}/></View>}</View></WorkspaceEditor></View>
      <Text style={styles.meta}>{loading?'Checking sync…':offline?'Offline — changes are saved on this device':queue.some(write=>write.state==='conflict')?`Needs attention — ${queue.length} change(s) not synced`:queue.length?`${queue.length} change(s) waiting to sync`:'Synced'}</Text>
      {queue.map(write=><View key={write.operationId} style={styles.diff}><Text style={styles.body}>{String(write.payload.title)} · {write.state==='conflict'?'Needs correction':'Waiting to sync'}</Text>{write.error?<Text style={styles.error}>{write.error.includes('ISO timestamp')?'The deadline could not be understood. Edit the saved task and enter a date such as 2026-09-30.':write.error}</Text>:null}<ActionButton title={write.kind==="set_task_status"?"Retry completion":"Edit and retry"} disabled={busy||loading} onPress={()=>write.kind==="set_task_status"?void perform(async()=>{await retryPendingStatus(write.operationId);await load();}):editPending(write)}/><ActionButton title="Discard pending change" disabled={busy||loading} onPress={()=>void perform(async()=>{setQueue((await discardWrite(write.operationId)).queue);if(pendingEdit?.operationId===write.operationId){setPendingEdit(null);setTitle('');setContent('');}})}/></View>)}
      <Disclosure title="Projects & filters"><Field label="Find a task" value={taskFilter} onChange={setTaskFilter}/><View style={styles.row}><ActionButton title="All projects" onPress={()=>setProjectId(null)}/>{projects.map(p=><ActionButton key={p.id} title={p.title} onPress={()=>setProjectId(p.id)}/>)}</View></Disclosure>
      {currentProject?<ProjectDetailPanel projectId={currentProject.id} onChanged={()=>void load()}/>:null}
      <View style={[styles.columns,width>900&&{flexDirection:'row'}]}><View style={styles.main}><View style={styles.row}><Text style={styles.subheading}>Tasks</Text><ActionButton title={board?'List view':'Board view'} onPress={()=>setBoard(!board)}/></View><WorkspaceTaskList tasks={visibleTasks} allTasks={tasks} busy={busy} updatingId={updatingId} pendingIds={new Set(queue.filter(write=>write.entityId).map(write=>write.entityId!))} onEdit={editTask} onToggle={t=>void perform(()=>completeTask(t))} board={board}/>{!visibleTasks.length?<Text style={styles.empty}>{queue.length?'Your saved changes are waiting to sync. Review them above.':'No tasks here yet. Capture the next concrete step.'}</Text>:null}</View>
</View>
    </>:null}
    {area==='knowledge'?<View style={[styles.columns,width>900&&{flexDirection:'row'}]}><View style={styles.main}><Text style={styles.meta}>Your saved notes and ideas. Tap an entry to read or edit it. These entries do not create or complete tasks.</Text>{knowledge.map(k=><Pressable key={k.id} accessibilityRole="button" accessibilityLabel={`Read or edit ${k.title}`} style={[styles.panel,{marginTop:4}]} onPress={()=>editKnowledge(k)}><View><Text style={styles.taskTitle}>{k.title}</Text><Text style={styles.meta}>{k.kind.charAt(0).toUpperCase()+k.kind.slice(1)} · {new Date(k.updated_at).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}</Text>{knowledgePreview(k)?<Text numberOfLines={3} style={[styles.body,{marginTop:8}]}>{knowledgePreview(k)}</Text>:null}<Text style={[styles.meta,{marginTop:12,color:colors.green}]}>Read or edit →</Text></View></Pressable>)}{!loading&&!error&&!knowledge.length?<EmptySection title="Your notes start here" detail="Save an idea, useful information, or a decision using the form below. You can find it later with Search."/>:null}</View><View style={[styles.panel,width>900&&{width:400}]}><Text style={styles.subheading}>{item?'Edit saved entry':'Save something useful'}</Text><Text style={styles.meta}>Use a note for something to remember, or a decision to record what you chose and why.</Text><Choice values={['note','document','idea','resource','concept','decision']} value={kind} onChange={setKind}/><Field label="Title" value={title} onChange={setTitle}/><Field label={kind==='decision'?'Why did you choose this?':'Details'} value={content} onChange={setContent} multiline/><ActionButton title={item?"Save changes":"Save entry"} variant="primary" disabled={busy||!title.trim()||kind==='decision'&&!content.trim()} onPress={()=>void perform(async()=>{await api(item?`/knowledge/${item.id}`:'/knowledge',item?'PUT':'POST',{title,content,kind,projectId,...(item?{revision:item.revision}:{}),...(kind==='decision'?{decision:{context:title,options:[],reasoning:content}}:{})});setTitle('');setContent('');setItem(null);await load();})}/>{item?<><ActionButton title="Index for semantic search" disabled={busy} onPress={()=>void perform(async()=>{await api(`/knowledge/${item.id}/index`,'POST',{});setNotice('Source indexed successfully.');})}/><ActionButton title="Delete item" disabled={busy} onPress={()=>void perform(async()=>{await api(`/knowledge/${item.id}`,'DELETE',{revision:item.revision});setItem(null);setTitle('');setContent('');await load();})}/><ActionButton title="Close item" onPress={()=>{setItem(null);setTitle('');setContent('');}}/></>:null}</View></View>:null}
    {area==='assistant'?<AssistantPanel query={query} onChange={value=>{setQuery(value);setBreakdownTaskId(null);}} busy={busy} answer={answer} onSend={()=>void perform(ask)} proposal={answer?.proposal?proposalView(answer.proposal):null} onNavigate={onNavigate}/>:null}
    {area==='search'?<View style={styles.panel}><Text style={styles.subheading}>Find saved information</Text><Text style={styles.body}>Keyword search matches words. Semantic search finds related meaning across your saved tasks, goals, projects, and notes.</Text><Field label="Search query" value={query} onChange={setQuery}/><View style={styles.row}><ActionButton title={busy?'Searching…':'Keyword search'} variant="primary" disabled={busy||!query.trim()} onPress={()=>void perform(()=>searchKnowledge('keyword'))}/><ActionButton title={busy?'Searching…':'Semantic search'} disabled={busy||!query.trim()} onPress={()=>void perform(()=>searchKnowledge('semantic'))}/></View>{results.map(source=><View key={source.id} style={styles.diff}><Text style={styles.taskTitle}>{source.title}</Text><Text style={styles.meta}>{source.kind} · {source.reason}</Text><Text style={styles.body}>{source.excerpt}</Text></View>)}</View>:null}
    {area==='planner'?<PlannerPanel/>:null}
    {area==='actions'?<><Text style={styles.body}>Review changes suggested by the Assistant and Planner. Pending changes take effect only when you apply them; previous decisions remain here.</Text>{proposals.map(proposalView)}{!loading&&!error&&!proposals.length?<EmptySection title="Nothing to review yet" detail="Ask the Assistant to break down a task or propose a schedule in Planner. Review the suggested changes here before applying them." action="Open Assistant" onAction={()=>onNavigate('assistant')}/>:null}</>:null}
    {area==='intelligence'?<TaskAlertsPanel alerts={insights} loading={loading} failed={Boolean(error)} onWorkspace={()=>onNavigate('workspace')}/>:null}
    {area==='analytics'&&analytics?<><View style={styles.panel}><Text style={styles.subheading}>Task completion</Text><Text style={styles.heading}>{analytics.completed} / {analytics.total}</Text><Text style={styles.meta}>Tasks completed · {analytics.pending} pending · up to 500 loaded tasks</Text></View><Text style={styles.subheading}>Estimate accuracy</Text><Text style={styles.body}>Compare your estimated time with actual minutes recorded on completed tasks.</Text>{!analytics.corrections.length?<EmptySection title="No timing comparison yet" detail="Record actual minutes when editing a completed task. These entries help compare estimates with the time work took." action="Open workspace" onAction={()=>onNavigate('workspace')}/>:null}{analytics.corrections.map(c=><View style={styles.panel} key={c.category}><Text style={styles.taskTitle}>{c.category}</Text><Text style={styles.body}>{c.sampleSize} recorded tasks · suggested time adjustment {c.factor.toFixed(2)}×</Text><Text style={styles.meta}>{c.sampleSize?`${c.estimatedAverage?.toFixed(0)} min estimated average → ${c.actualAverage?.toFixed(0)} min actual average`:c.basis}</Text></View>)}<Text style={styles.subheading}>Last 30 days</Text>{!analytics.trends.length?<EmptySection title="No completions recorded in this period" detail="Completed tasks will appear here as you make progress."/>:null}{analytics.trends.map(t=><View key={t.date} style={styles.task}><Text style={styles.body}>{new Date(t.date).toLocaleDateString()} · {t.completed} completed · {t.actual_minutes??'No'} recorded minutes</Text></View>)}</>:null}
    {area==='graph'?<><Text style={styles.meta}>Explore saved links between your work and notes. Tap an item to see its connected records.</Text><ActionButton title="Show recent relationships" onPress={()=>void load()}/>{!loading&&!error&&graph.nodes.length>0&&!graph.edges.length?<EmptySection title="No links in this view" detail="These records are saved, but no relationships connect them in this view. Ask the Assistant to suggest useful connections, then review them before applying." action="Open Assistant" onAction={()=>onNavigate('assistant')}/>:null}{graph.nodes.map(n=><Pressable key={n.id} style={styles.task} onPress={()=>void perform(async()=>setGraph(await api(`/graph?root=${n.id}`)))}><View><Text style={styles.taskTitle}>{n.title}</Text><Text style={styles.meta}>{n.kind}</Text>{graph.edges.filter(e=>e.source_id===n.id).map(e=><Text style={styles.body} key={e.id}>→ {e.type.replaceAll('_',' ')} → {graph.nodes.find(x=>x.id===e.target_id)?.title??'Related item'}</Text>)}</View></Pressable>)}{!loading&&!error&&!graph.nodes.length?<View style={styles.panel}><Text style={styles.subheading}>No connections yet</Text><Text style={styles.body}>Ask the Assistant to connect related notes or tasks. Review and apply its suggested links to see them here.</Text><ActionButton title="Open Assistant" variant="primary" onPress={()=>onNavigate('assistant')}/></View>:null}</>:null}
    {area==='activity'?<><ActionButton title="Back to Data & privacy" onPress={()=>onNavigate('settings')}/><Text style={styles.body}>Your most recent 50 saved changes, newest first. Each entry explains what changed and when.</Text>{activity.map(a=><View style={styles.panel} key={a.id}><Text style={styles.taskTitle}>{a.title}</Text><Text style={styles.body}>{a.detail}</Text><Text style={styles.meta}>{a.origin} · {new Date(a.created_at).toLocaleString(undefined,{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'})}</Text></View>)}{!loading&&!error&&!activity.length?<EmptySection title="No activity recorded yet" detail="Saved changes to your tasks and notes will appear here." action="Open workspace" onAction={()=>onNavigate('workspace')}/>:null}</>:null}
    {area==='notifications'?<><Text style={styles.body}>Updates about reviewed actions and changes in your workspace.</Text>{notifications.map(n=><View style={styles.panel} key={n.id}><Text style={styles.taskTitle}>{n.title}</Text><Text style={styles.body}>{n.detail}</Text>{!n.read_at?<ActionButton title="Mark read" onPress={()=>void perform(async()=>{await api(`/notifications/${n.id}/read`,'POST',{});await load();})}/>:null}</View>)}{!loading&&!error&&!notifications.length?<EmptySection title="No notifications" detail="New updates will appear here. Your tasks remain available in Workspace." action="View my tasks" onAction={()=>onNavigate('workspace')}/>:null}</>:null}
  </ScrollView>;
}
const styles=StyleSheet.create({page:{flexGrow:1,padding:24,gap:20,backgroundColor:colors.paper},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:16},eyebrow:{fontSize:10,letterSpacing:2,color:colors.green,fontWeight:'700'},heading:{fontSize:32,fontWeight:'700',color:colors.ink,marginTop:8},subheading:{fontSize:20,fontWeight:'600',color:colors.ink},label:{fontSize:13,fontWeight:'600',color:colors.muted},body:{fontSize:15,lineHeight:23,color:colors.ink},meta:{fontSize:12,lineHeight:19,color:colors.muted},error:{color:colors.danger,fontSize:14,lineHeight:22},success:{color:colors.green,fontSize:14,lineHeight:22},row:{flexDirection:'row',flexWrap:'wrap',gap:10,alignItems:'center'},columns:{gap:24,alignItems:'stretch'},main:{flex:1,gap:16},panel:{backgroundColor:colors.paperRaised,borderWidth:1,borderColor:colors.line,borderRadius:12,padding:20,gap:14},task:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,paddingVertical:16,borderBottomWidth:1,borderColor:colors.line},taskTitle:{fontSize:16,fontWeight:'600',color:colors.ink,lineHeight:24},empty:{paddingVertical:32,fontSize:16,lineHeight:24,color:colors.muted},choice:{paddingVertical:8,paddingHorizontal:12,borderWidth:1,borderColor:colors.line,borderRadius:6},chosen:{backgroundColor:colors.ink},nav:{paddingVertical:12,borderBottomWidth:2,borderBottomColor:'transparent',marginRight:12},diff:{padding:12,borderLeftWidth:3,borderLeftColor:colors.green,backgroundColor:colors.greenSoft,gap:6}});







