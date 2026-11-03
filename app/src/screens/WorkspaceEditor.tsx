import {useEffect,useState,type ReactNode} from 'react';
import {Modal,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import ActionButton from '../components/ActionButton';
import {colors} from '../ui/theme';
export default function WorkspaceEditor({children,activeKey,busy}:{children:ReactNode;activeKey:object|null;busy:boolean}){
  const [open,setOpen]=useState(false);
  useEffect(()=>{if(activeKey)setOpen(true);},[activeKey]);
  return <><ActionButton title={activeKey?'Continue editing':'+ Add task'} variant="primary" onPress={()=>setOpen(true)}/><Modal visible={open} animationType="slide" onRequestClose={()=>{if(!busy)setOpen(false);}}><SafeAreaView style={{flex:1,backgroundColor:colors.paper}}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16}}><Text style={{fontSize:22,fontWeight:'700',color:colors.ink}}>Task details</Text><ActionButton title="Done" disabled={busy} onPress={()=>setOpen(false)}/></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:40}}>{children}</ScrollView></SafeAreaView></Modal></>;
}
