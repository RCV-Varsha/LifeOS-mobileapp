import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as LocalFile } from 'expo-file-system';
import { API_URL } from '../config/api';
import { apiFetch } from '../services/apiFetch';
import ActionButton from '../components/ActionButton';
import { colors } from '../ui/theme';

export default function FileCapture(){
  const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
  async function capture(){setBusy(true);setStatus('');try{
    const result=await DocumentPicker.getDocumentAsync({type:['text/*','application/pdf','image/jpeg','image/png','audio/*'],copyToCacheDirectory:true,multiple:false});
    if(result.canceled)return;
    const asset=result.assets[0]!;
    const bytes=Platform.OS==='web'&&asset.file?await asset.file.arrayBuffer():(await new LocalFile(asset.uri).bytes()).buffer;
    if(bytes.byteLength>10*1024*1024)throw new Error('Choose a file no larger than 10 MB.');
    const mediaType=asset.mimeType??'text/plain';
    const allowed=['text/plain','text/markdown','application/pdf','image/jpeg','image/png','audio/mpeg','audio/mp4','audio/wav'];
    if(!allowed.includes(mediaType))throw new Error('This file type is not supported. Use text, PDF, PNG, JPEG, MP3, M4A, or WAV.');
    const response=await apiFetch(`${API_URL}/documents/upload?filename=${encodeURIComponent(asset.name)}`,{method:'POST',headers:{'Content-Type':mediaType},body:bytes});
    const body=await response.json();if(!response.ok)throw new Error(body.error??'Upload failed. Please retry.');
    setStatus(`Saved ${asset.name} in Knowledge. ${mediaType.startsWith('text/')?'The text is available in the saved document.':'The file is stored. Add its text in Knowledge if you want LifeOS to understand its contents.'}`);
  }catch(e){setStatus(e instanceof Error?e.message:'Capture failed.');}finally{setBusy(false);}}
  return <View style={{gap:10}}><Text style={{color:colors.muted,lineHeight:22}}>Text, PDF, PNG, JPEG, MP3, M4A, or WAV · up to 10 MB</Text><ActionButton title={busy?'Importing…':'Choose a file'} disabled={busy} onPress={()=>void capture()}/>{status?<Text accessibilityLiveRegion="polite" style={{color:colors.muted,lineHeight:22}}>{status}</Text>:null}</View>;
}
