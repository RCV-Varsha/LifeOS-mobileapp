import {StyleSheet,Text,View} from 'react-native';
import ActionButton from '../components/ActionButton';
import {colors} from '../ui/theme';

type Alert={kind:string;what:string;why:string;recommendation:string;evidence:{taskId:string;title:string;estimate:number}};
const checks=[{kind:'overdue',title:'Overdue',detail:'Pending tasks whose deadline has passed.'},{kind:'blocked',title:'Waiting on another task',detail:'Work with unfinished prerequisites.'},{kind:'stalled',title:'No recent update',detail:'Pending tasks unchanged for seven days.'}];
export default function TaskAlertsPanel({alerts,loading,failed,onWorkspace}:{alerts:Alert[];loading:boolean;failed:boolean;onWorkspace:()=>void}){
  return <View style={s.page}>
    <Text style={s.intro}>A quick check for work that may need your attention.</Text>
    {!loading&&!failed?<>
      <View accessibilityLiveRegion="polite" style={[s.status,alerts.length>0&&{backgroundColor:colors.amberSoft}]}>
        <Text style={s.eyebrow}>{alerts.length?'NEEDS A LOOK':'CHECK COMPLETE'}</Text>
        <Text style={s.title}>{alerts.length?`${alerts.length} task alert${alerts.length===1?'':'s'}`:'No issues detected'}</Text>
        <Text style={s.body}>{alerts.length?'Review the details below and choose your next step.':'No tasks matched these checks. You may still have pending work in Workspace.'}</Text>
        <ActionButton title="View my tasks" variant="primary" onPress={onWorkspace}/>
      </View>
      {alerts.map((alert,index)=><View key={`${alert.evidence.taskId}-${index}`} style={s.card}><Text style={s.alertLabel}>{checks.find(check=>check.kind===alert.kind)?.title??'Task alert'}</Text><Text style={s.alertTitle}>{alert.what}</Text><Text style={s.body}>{alert.why}</Text><Text style={s.body}>{alert.recommendation}</Text><ActionButton title="Open workspace" onPress={onWorkspace}/></View>)}
    </>:null}
    <View style={s.card}><Text style={s.heading}>What we check</Text>{checks.map(check=><View key={check.kind} style={s.check}><View style={{flex:1,gap:4}}><Text style={s.checkTitle}>{check.title}</Text><Text style={s.detail}>{check.detail}</Text></View>{!loading&&!failed?<Text accessibilityLabel={`${check.title}: ${alerts.filter(alert=>alert.kind===check.kind).length} alerts`} style={s.count}>{alerts.filter(alert=>alert.kind===check.kind).length}</Text>:null}</View>)}<Text style={s.footnote}>Based on saved task data. No recent update does not necessarily mean no work was done.</Text></View>
  </View>;
}
const s=StyleSheet.create({page:{gap:18},intro:{fontSize:15,lineHeight:23,color:colors.muted},status:{backgroundColor:colors.greenSoft,borderRadius:20,padding:20,gap:12},eyebrow:{fontSize:10,letterSpacing:1.5,fontWeight:'700',color:colors.green},title:{fontSize:25,lineHeight:32,fontWeight:'700',color:colors.ink},body:{fontSize:14,lineHeight:22,color:colors.ink},card:{backgroundColor:colors.paperRaised,borderWidth:1,borderColor:colors.line,borderRadius:18,padding:18,gap:12},heading:{fontSize:17,fontWeight:'700',color:colors.ink},check:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:10,borderBottomWidth:1,borderBottomColor:colors.line},checkTitle:{fontSize:14,fontWeight:'600',color:colors.ink},detail:{fontSize:12,lineHeight:19,color:colors.muted},count:{fontSize:18,fontWeight:'700',color:colors.green,minWidth:28,textAlign:'center'},footnote:{fontSize:11,lineHeight:17,color:colors.muted},alertLabel:{fontSize:11,fontWeight:'700',color:colors.amber},alertTitle:{fontSize:18,lineHeight:25,fontWeight:'600',color:colors.ink}});
