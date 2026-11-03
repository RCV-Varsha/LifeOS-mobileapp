import { Text, View } from 'react-native';
import type { Proposal } from '../../../backend/src/workspace/contracts';
import ActionButton from '../components/ActionButton';
import MarkdownText from '../components/MarkdownText';
import { colors } from '../ui/theme';
export default function ActionReviewCard({proposal,busy,onDecision}:{proposal:Proposal;busy:boolean;onDecision:(decision:'apply'|'reject'|'undo')=>void}){
  const review=(proposal.result as {review?:{before:unknown;after:{title?:string;sourceTitle?:string;targetTitle?:string}}[]}|null)?.review;
  const date=(value:string)=>new Date(value).toLocaleString();
  return <View style={{padding:20,gap:14,borderWidth:1,borderColor:colors.line,borderRadius:12,backgroundColor:colors.paperRaised}}><MarkdownText>{proposal.summary}</MarkdownText><Text style={{color:colors.muted}}>{proposal.source} · {proposal.status}</Text>
    {proposal.changes.map((change,index)=>{
      const before=review?.[index]?.before;
      return <View key={index} style={{padding:14,gap:8,borderLeftWidth:3,borderLeftColor:colors.green,backgroundColor:colors.greenSoft}}>
        <Text style={{fontWeight:'600',color:colors.ink}}>{change.kind==='create_task'?(change.parentTaskId?'Create linked subtask':'Create task'):change.kind==='schedule_task'?'Schedule task':'Connect knowledge'}</Text>
        <Text style={{color:colors.muted}}>Before: {Array.isArray(before)&&before.length?before.map((event:{starts_at:string;ends_at:string})=>`${date(event.starts_at)} → ${date(event.ends_at)}`).join('; '):change.kind==='schedule_task'?'Not scheduled':change.kind==='create_task'?'No task':'No relationship'}</Text>
        <Text style={{color:colors.ink,lineHeight:23}}>After: {change.kind==='create_task'?`${change.title} · ${change.minutes} minutes${change.deadline?' · Due '+date(change.deadline):''}`:change.kind==='schedule_task'?`${review?.[index]?.after.title??'Task'} · ${date(change.startsAt)} → ${date(change.endsAt)}`:`${review?.[index]?.after.sourceTitle??change.sourceId} → ${change.type.replaceAll('_',' ')} → ${review?.[index]?.after.targetTitle??change.targetId}`}</Text>
      </View>;
    })}
    {proposal.status==='pending'?<View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}><ActionButton title="Apply reviewed changes" variant="primary" disabled={busy} onPress={()=>onDecision('apply')}/><ActionButton title="Reject" disabled={busy} onPress={()=>onDecision('reject')}/></View>:proposal.status==='applied'?<ActionButton title="Undo these changes" disabled={busy} onPress={()=>onDecision('undo')}/>:null}
  </View>;
}

