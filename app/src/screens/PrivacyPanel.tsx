import { useState } from 'react';
import { Platform, Share, Text, TextInput, View } from 'react-native';
import { api } from '../services/apiFetch';
import { saveTokens } from '../services/authStorage';
import { clearLocalWorkspace } from '../services/workspaceOffline';
import { colors, input } from '../ui/theme';
import ActionButton from '../components/ActionButton';
import Disclosure from '../components/Disclosure';
export default function PrivacyPanel({onDeleted,onActivity}:{onDeleted:()=>void;onActivity:()=>void}){
  const [confirmation,setConfirmation]=useState(''),[password,setPassword]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  async function run(work:()=>Promise<void>){setBusy(true);setStatus('');try{await work();}catch(e){setStatus(e instanceof Error?e.message:'Operation failed.');}finally{setBusy(false);}}
  return <View style={{gap:18}}><Text style={{fontSize:22,fontWeight:'600',color:colors.ink}}>Your data</Text><Text style={{color:colors.muted}}>Export your records, including knowledge, decisions, actions and audit history.</Text>
    <ActionButton title="Activity history" onPress={onActivity}/><Text style={{color:colors.muted,lineHeight:22}}>See what changed in your tasks, notes, and plans, and when.</Text><ActionButton title="Export my data" disabled={busy} onPress={()=>void run(async()=>{const result=await api('/privacy/export');const content=JSON.stringify(result,null,2);if(Platform.OS==='web'){const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='lifeos-export.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}else await Share.share({message:content,title:'LifeOS data export'});setStatus('Export prepared.');})}/>
    <Disclosure title="Delete account"><Text style={{fontSize:20,fontWeight:'600',color:colors.danger}}>Delete account permanently</Text><Text style={{color:colors.muted,lineHeight:22}}>This deletes your server records and revokes all sessions. Export anything you need first. This cannot be undone.</Text>
    <TextInput accessibilityLabel="Deletion confirmation" placeholder="Type DELETE MY ACCOUNT" value={confirmation} onChangeText={setConfirmation} style={input}/><TextInput accessibilityLabel="Current password" placeholder="Current password" secureTextEntry value={password} onChangeText={setPassword} style={input}/>
    <ActionButton title="Permanently delete my account" variant="danger" disabled={busy||confirmation!=='DELETE MY ACCOUNT'||!password} onPress={()=>void run(async()=>{await api('/privacy/delete-account','POST',{confirmation,password});await clearLocalWorkspace();await saveTokens(null);onDeleted();})}/></Disclosure>{status?<Text accessibilityLiveRegion="polite" style={{color:colors.muted}}>{status}</Text>:null}
  </View>;
}
