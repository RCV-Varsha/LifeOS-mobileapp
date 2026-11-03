import { useEffect,useState } from 'react';
import { ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ActionButton from '../components/ActionButton';
import { apiFetch } from '../services/apiFetch';
import { API_URL } from '../config/api';
import { normalizePlannerWindow } from '../services/taskDeadline';
import { calendarDayKey,calendarMonth,eventsOnDay,type CalendarEntry } from '../services/calendarView';
import { colors } from '../ui/theme';

type Props={start:string;end:string;disabled:boolean;onError:(message:string)=>void;title?:string;onSelect?:(day:Date)=>void};
export default function PlannerCalendarButton({start,end,disabled,onError,title='View calendar',onSelect}:Props){
  const [visible,setVisible]=useState(false),[selected,setSelected]=useState(()=>new Date());
  const [month,setMonth]=useState(()=>new Date()),[entries,setEntries]=useState<CalendarEntry[]>([]);
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{
    if(!visible)return;
    let active=true;const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    const bounds=calendarMonth(month);setLoading(true);setError('');setEntries([]);
    void (async()=>{
      try{
        const response=await apiFetch(`${API_URL}/calendar?start=${encodeURIComponent(bounds.start.toISOString())}&end=${encodeURIComponent(bounds.end.toISOString())}`,{signal:controller.signal});
        if(!response.ok)throw new Error('Could not load the calendar. Please try again.');
        const result=await response.json() as {items:CalendarEntry[]};
        if(active)setEntries(result.items);
      }catch(reason){if(active)setError(controller.signal.aborted?'Calendar request timed out. Check your connection and retry.':reason instanceof Error?reason.message:'Could not load the calendar.');}
      finally{clearTimeout(timeout);if(active)setLoading(false);}
    })();
    return()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[visible,month,reload]);
  function open(){
    try{const window=normalizePlannerWindow(start,end),requested=new Date(window.startsAt),now=new Date(),date=calendarDayKey(requested)<calendarDayKey(now)?now:requested;setSelected(date);setMonth(new Date(date.getFullYear(),date.getMonth(),1));setVisible(true);}
    catch(reason){onError(reason instanceof Error?reason.message:'Enter a valid planning window.');}
  }
  function moveMonth(direction:number){const date=new Date(month.getFullYear(),month.getMonth()+direction,1),now=new Date(),currentMonth=new Date(now.getFullYear(),now.getMonth(),1);if(date<currentMonth)return;setMonth(date);setSelected(date<now?now:date);}
  const days=calendarMonth(month).cells,agenda=eventsOnDay(entries,selected),selectedKey=calendarDayKey(selected),today=calendarDayKey(new Date());
  const label=(date:Date)=>date.toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric'});
  function time(value:string){const date=new Date(value);return date.toLocaleString(undefined,{...(calendarDayKey(date)!==selectedKey?{day:'numeric' as const,month:'short' as const}:{}),hour:'numeric',minute:'2-digit',hour12:true});}
  return <><ActionButton title={title} disabled={disabled} onPress={open}/>
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={()=>setVisible(false)}>
      <SafeAreaView style={styles.safe}><View style={styles.header}><View><Text style={styles.eyebrow}>YOUR SCHEDULE</Text><Text accessibilityRole="header" style={styles.heading}>Calendar</Text></View><ActionButton title="Close" onPress={()=>setVisible(false)}/></View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.monthHeader}><ActionButton title="‹" accessibilityLabel="Previous month" disabled={calendarDayKey(calendarMonth(month).start)<=calendarDayKey(calendarMonth(new Date()).start)} onPress={()=>moveMonth(-1)}/><Text accessibilityLiveRegion="polite" style={styles.month}>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</Text><ActionButton title="›" accessibilityLabel="Next month" onPress={()=>moveMonth(1)}/></View>
          <Text style={styles.muted}>Choose today or a later date. Past dates are disabled.</Text><View style={styles.grid}>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><View key={day} style={styles.cell}><Text style={styles.weekday}>{day}</Text></View>)}{days.map((date,index)=>date?<Pressable key={calendarDayKey(date)} accessibilityRole="button" accessibilityLabel={`${label(date)}${eventsOnDay(entries,date).length?', has scheduled events':''}`} disabled={calendarDayKey(date)<today} accessibilityState={{selected:calendarDayKey(date)===selectedKey,disabled:calendarDayKey(date)<today}} onPress={()=>{if(calendarDayKey(date)>=calendarDayKey(new Date()))setSelected(date);}} style={({pressed})=>[styles.cell,styles.day,calendarDayKey(date)<today&&styles.disabledDay,calendarDayKey(date)===today&&styles.today,calendarDayKey(date)===selectedKey&&styles.selected,pressed&&{opacity:0.7}]}><Text style={[styles.dayText,calendarDayKey(date)<today&&styles.disabledText,calendarDayKey(date)===selectedKey&&styles.selectedText]}>{date.getDate()}</Text><View style={[styles.dot,{opacity:eventsOnDay(entries,date).length?1:0},calendarDayKey(date)===selectedKey&&styles.selectedDot]}/></Pressable>:<View key={`blank-${index}`} style={styles.cell}/>)}</View>
          <View style={styles.actions}><ActionButton title="Today" onPress={()=>{const date=new Date();setSelected(date);setMonth(new Date(date.getFullYear(),date.getMonth(),1));}}/><ActionButton title={loading?'Loading…':'Refresh calendar'} disabled={loading} onPress={()=>setReload(value=>value+1)}/></View>
          <Text accessibilityRole="header" style={styles.agendaHeading}>{selected.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})}</Text><Text style={styles.muted}>LifeOS commitments and accepted schedules · local time</Text>
          {loading?<ActivityIndicator accessibilityLabel="Loading calendar" color={colors.green}/>:error?<View style={styles.message}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><ActionButton title="Retry" onPress={()=>setReload(value=>value+1)}/></View>:agenda.length?agenda.map(event=><View key={event.id} style={styles.event}><Text style={styles.eventTime}>{time(event.starts_at)} – {time(event.ends_at)}</Text><Text style={styles.eventTitle}>{event.title}</Text></View>):<View style={styles.message}><Text style={styles.emptyTitle}>Nothing scheduled for this day</Text><Text style={styles.muted}>Add a commitment in Planner or review and apply a proposed schedule. It will appear here.</Text></View>}
          {onSelect?<ActionButton title="Use this date" variant="primary" onPress={()=>{onSelect(selected);setVisible(false);}}/>:null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.paper},header:{paddingHorizontal:20,paddingVertical:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},eyebrow:{fontSize:10,letterSpacing:1.6,fontWeight:'700',color:colors.green},heading:{fontSize:28,fontWeight:'700',color:colors.ink},content:{padding:20,gap:16,paddingBottom:36},monthHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},month:{fontSize:20,fontWeight:'700',color:colors.ink,flexShrink:1,textAlign:'center'},grid:{flexDirection:'row',flexWrap:'wrap',backgroundColor:colors.paperRaised,borderRadius:16,paddingVertical:10},cell:{width:'14.285714%',minHeight:48,alignItems:'center',justifyContent:'center'},weekday:{fontSize:11,color:colors.muted,fontWeight:'600'},day:{borderRadius:12,gap:3},disabledDay:{opacity:0.35},disabledText:{color:colors.muted,textDecorationLine:'line-through'},dayText:{fontSize:16,color:colors.ink,fontWeight:'600'},today:{backgroundColor:colors.greenSoft},selected:{backgroundColor:colors.green},selectedText:{color:colors.onInk},dot:{height:4,width:4,borderRadius:2,backgroundColor:colors.green},selectedDot:{backgroundColor:colors.onInk},actions:{flexDirection:'row',gap:12},agendaHeading:{fontSize:20,fontWeight:'700',color:colors.ink,marginTop:8},muted:{fontSize:14,lineHeight:22,color:colors.muted},event:{borderLeftWidth:4,borderLeftColor:colors.green,backgroundColor:colors.paperRaised,padding:16,borderRadius:12,gap:8},eventTime:{fontSize:13,fontWeight:'700',color:colors.green},eventTitle:{fontSize:17,lineHeight:24,fontWeight:'600',color:colors.ink},message:{backgroundColor:colors.greenSoft,padding:20,borderRadius:16,gap:10},emptyTitle:{fontSize:17,fontWeight:'700',color:colors.ink},error:{color:colors.danger,lineHeight:22}});
