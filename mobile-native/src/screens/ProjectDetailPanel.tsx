import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { api } from '../services/apiFetch';
import ActionButton from '../components/ActionButton';
import { colors, input } from '../ui/theme';
import type { Project } from '../../../backend/src/workspace/contracts';
type Detail={project:Project&{objective_id:string|null};objectives:{id:string;title:string}[];milestones:{id:string;title:string;status:string}[]};
export default function ProjectDetailPanel({projectId,onChanged}:{projectId:string;onChanged:()=>void}){
  const [data,setData]=useState<Detail|null>(null),[goals,setGoals]=useState<{id:string;goal:string}[]>([]),[goalId,setGoalId]=useState<string|null>(null),[objectiveId,setObjectiveId]=useState<string|null>(null),[objectiveTitle,setObjectiveTitle]=useState(''),[description,setDescription]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function load(){const [detail,list]=await Promise.all([api<Detail>(`/projects/${projectId}`),api<{goals:typeof goals}>('/goals')]);setData(detail);setGoals(list.goals);setDescription(detail.project.description);setGoalId(detail.project.goal_id);setObjectiveId(detail.project.objective_id);}
  useEffect(()=>{void load().catch(e=>setError(e.message));},[projectId]);
  async function run(work:()=>Promise<void>){setBusy(true);setError('');try{await work();await load();onChanged();}catch(e){setError(e instanceof Error?e.message:'Project update failed.');}finally{setBusy(false);}}
  if(!data)return error?<Text style={{color:colors.danger}}>{error}</Text>:<Text>Loading project…</Text>;
  return <View style={{gap:12,padding:20,borderWidth:1,borderColor:colors.line,borderRadius:12,backgroundColor:colors.paperRaised}}><Text style={{fontSize:22,fontWeight:'600',color:colors.ink}}>{data.project.title}</Text><Text style={{color:colors.muted}}>Goal → Objective → Project → Milestones</Text>{error?<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>:null}
    <TextInput accessibilityLabel="Project description" multiline style={input} value={description} onChangeText={setDescription}/>
    <Text style={{fontWeight:'600',color:colors.ink}}>Goal</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{goals.map(g=><ActionButton key={g.id} title={g.goal} variant={goalId===g.id?'primary':'secondary'} onPress={()=>{setGoalId(g.id);setObjectiveId(null);}}/>)}</View>
    {goalId===data.project.goal_id?<><Text style={{fontWeight:'600',color:colors.ink}}>Objectives</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{data.objectives.map(o=><ActionButton key={o.id} title={o.title} variant={objectiveId===o.id?'primary':'secondary'} onPress={()=>setObjectiveId(o.id)}/>)}</View></>:null}
    <ActionButton title="Save project connections" disabled={busy} onPress={()=>void run(async()=>{await api(`/projects/${projectId}`,'PUT',{title:data.project.title,description,goalId,objectiveId,status:data.project.status,deadline:data.project.deadline,revision:data.project.revision});})}/>
    {goalId?<><TextInput accessibilityLabel="New objective" placeholder="New objective for this goal" value={objectiveTitle} onChangeText={setObjectiveTitle} style={input}/><ActionButton title="Create objective" disabled={busy||!objectiveTitle.trim()} onPress={()=>void run(async()=>{await api('/objectives','POST',{title:objectiveTitle,goalId});setObjectiveTitle('');})}/></>:null}
    <Text style={{fontWeight:'600',color:colors.ink}}>Milestones</Text>{data.milestones.map(m=><Text key={m.id} style={{color:colors.muted}}>{m.title} · {m.status}</Text>)}{!data.milestones.length?<Text style={{color:colors.muted}}>Define the goal’s outcome and milestones from Goals.</Text>:null}
  </View>;
}
