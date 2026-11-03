import {useState} from 'react';
import {Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import ActionButton from '../components/ActionButton';
import {api} from '../services/apiFetch';
import {colors,input} from '../ui/theme';
import FileCapture from './FileImportPanel';
type Mode='note'|'ai'|'file';
const choices:{id:Mode;title:string;description:string}[]=[
  {id:'note',title:'Save a note',description:'Keep an idea or information in Knowledge.'},
  {id:'ai',title:'Get help from AI',description:'Ask a question or get help planning a task.'},
  {id:'file',title:'Import a file',description:'Turn a file into a summary and suggested tasks.'},
];
export default function QuickAddPanel({text,onChange,onKnowledge,onAssistant,onWorkspace}:{text:string;onChange:(text:string)=>void;onKnowledge:()=>void;onAssistant:()=>void;onWorkspace:()=>void}){
  const [mode,setMode]=useState<Mode|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  async function save(){setBusy(true);setError('');try{const content=text.trim();await api('/knowledge','POST',{title:content.split('\n')[0].slice(0,100),content,kind:'note'});onChange('');setSaved(true);}catch(reason){setError(reason instanceof Error?reason.message:'Could not save your note. Your text is still here; try again.');}finally{setBusy(false);}}
  return <View style={s.page}>{!mode?<><Text style={s.title}>What would you like to do?</Text><Text style={s.description}>Choose one option to get started.</Text></>:<ActionButton title="← Choose a different option" disabled={busy} onPress={()=>setMode(null)}/>}
    {!mode?choices.map(choice=><Pressable key={choice.id} accessibilityRole="button" disabled={busy} onPress={()=>{setMode(choice.id);setError('');}} style={s.choice}><View style={{flex:1,gap:4}}><Text style={s.choiceTitle}>{choice.title}</Text><Text style={s.description}>{choice.description}</Text></View><Text style={s.arrow}>›</Text></Pressable>):null}
    {mode?<View style={s.form}>
      <Text style={s.choiceTitle}>{choices.find(choice=>choice.id===mode)?.title}</Text>
      {mode==='file'?<><Text style={s.description}>Example: placement syllabus → study tasks. You approve tasks before they are added.</Text><FileCapture onWorkspace={onWorkspace}/><ActionButton title="Open Knowledge" onPress={onKnowledge}/></>:<>
        <Text style={s.description}>{mode==='note'?'Write what you want to remember. Saving puts it in Knowledge, where you can read and edit it later.':'Describe what you need. You’ll continue in Assistant and send your message there. You review any suggested task or schedule changes before applying them.'}</Text>
        <Text style={s.label}>{mode==='note'?'Your note':'What do you need help with?'}</Text><TextInput accessibilityLabel={mode==='note'?'Your note':'What do you need help with?'} placeholder={mode==='note'?'Example: Revise percentages before the placement test.':'Example: Help me plan two hours of aptitude practice.'} placeholderTextColor={colors.muted} multiline editable={!busy} value={text} onChangeText={value=>{onChange(value);setSaved(false);}} style={[input,s.input]}/>
        <ActionButton title={mode==='note'?(busy?'Saving note…':'Save note to Knowledge'):'Continue to Assistant'} variant="primary" disabled={busy||!text.trim()} onPress={mode==='note'?()=>void save():onAssistant}/>
        {saved&&mode==='note'?<View accessibilityLiveRegion="polite" style={s.success}><Text style={s.choiceTitle}>Your note is saved</Text><Text style={s.description}>Find it in Knowledge. This saved a note; it did not create a task or reminder.</Text><ActionButton title="View saved notes" onPress={onKnowledge}/></View>:null}
      </>}
      {error?<Text accessibilityRole="alert" style={{color:colors.danger,lineHeight:22}}>{error}</Text>:null}
    </View>:null}
  </View>;
}
const s=StyleSheet.create({page:{gap:12},title:{fontSize:23,lineHeight:30,fontWeight:'700',color:colors.ink},description:{fontSize:14,lineHeight:22,color:colors.muted},choice:{backgroundColor:colors.paperRaised,borderRadius:16,borderWidth:1,borderColor:colors.line,padding:16,flexDirection:'row',alignItems:'center',gap:14},selected:{borderColor:colors.green,backgroundColor:colors.greenSoft},choiceTitle:{fontSize:16,lineHeight:23,fontWeight:'600',color:colors.ink},arrow:{fontSize:23,color:colors.green},form:{padding:18,borderWidth:1,borderColor:colors.line,borderRadius:18,backgroundColor:colors.paperRaised,gap:14,marginTop:6},label:{fontSize:13,fontWeight:'600',color:colors.ink},input:{minHeight:112,textAlignVertical:'top'},success:{padding:14,gap:10,backgroundColor:colors.greenSoft,borderRadius:12}});
