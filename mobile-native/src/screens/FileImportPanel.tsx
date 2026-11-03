import {useState} from 'react';
import {ActivityIndicator,Text,View} from 'react-native';
import { pickUpload } from '../services/pickUpload';
import {API_URL} from '../config/api';
import {api,apiFetch} from '../services/apiFetch';
import ActionButton from '../components/ActionButton';
import MarkdownText from '../components/MarkdownText';
import ActionReviewCard from './ActionReviewCard';
import type {Proposal} from '../../../backend/src/workspace/contracts';
import {colors} from '../ui/theme';
type Analysis={summary:string;extractedText:string;proposal:Proposal|null};
export default function FileImportPanel({onWorkspace}:{onWorkspace:()=>void}){
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const [saved,setSaved]=useState<{id:string;filename:string}|null>(null),[result,setResult]=useState<Analysis|null>(null);
  async function analyze(id:string){setStatus('Reading your file and preparing a summary…');const analysis=await api<Analysis>(`/documents/${id}/analyze`,'POST',{});setResult(analysis);setStatus('Summary saved in Knowledge. Review any suggested tasks below.');}
  async function capture(){setBusy(true);setError('');try{
    const asset = await pickUpload();
    if (!asset) return;
    const { bytes, mediaType } = asset;
    setSaved(null);setResult(null);setStatus('Saving your file…');
    const response=await apiFetch(`${API_URL}/documents/upload?filename=${encodeURIComponent(asset.name)}`,{method:'POST',headers:{'Content-Type':mediaType},body:bytes});
    const body=await response.json();if(!response.ok)throw new Error(body.error??'Upload failed. Please retry.');
    setSaved(body.item);await analyze(body.item.id);
  }catch(reason){setStatus('');setError(reason instanceof Error&&reason.name==='AbortError'?'Analysis took too long. If your file was saved, retry analysis below.':reason instanceof Error?reason.message:'Could not process the file.');}finally{setBusy(false);}}
  async function retry(){if(!saved)return;setBusy(true);setError('');try{await analyze(saved.id);}catch(reason){setStatus('');setError(reason instanceof Error?reason.message:'Analysis failed. Try again.');}finally{setBusy(false);}}
  async function decide(decision:'apply'|'reject'|'undo'){if(!result?.proposal)return;setBusy(true);setError('');try{const response=await api<{item:Proposal}>(`/ai/actions/${result.proposal.id}/${decision}`,'POST',{confirmed:true});setResult({...result,proposal:response.item});setStatus(decision==='apply'?'Tasks added to Workspace.':decision==='reject'?'Suggestions dismissed. Your file and summary are still saved.':'Suggested task changes undone.');}catch(reason){setError(reason instanceof Error?reason.message:'Could not update the suggested tasks.');}finally{setBusy(false);}}
  return <View style={{gap:14}}><Text style={{color:colors.muted,lineHeight:22}}>Upload a syllabus, notes, or recording. Get a summary and suggested tasks to review.</Text><Text style={{color:colors.muted,fontSize:12,lineHeight:19}}>Text, PDF, PNG, JPEG, MP3, M4A, or WAV · up to 10 MB. Your selected file is sent to Google Gemini for analysis.</Text><ActionButton title={busy?'Processing…':saved?'Choose another file':'Choose file & summarize'} variant="primary" disabled={busy} onPress={()=>void capture()}/>
    {saved?<Text style={{color:colors.green}}>Saved in Knowledge: {saved.filename}</Text>:null}
    {busy?<ActivityIndicator accessibilityLabel="Processing file" color={colors.green}/>:null}
    {status?<Text accessibilityLiveRegion="polite" style={{color:colors.green,lineHeight:22}}>{status}</Text>:null}
    {error?<Text accessibilityRole="alert" style={{color:colors.danger,lineHeight:22}}>{error}</Text>:null}
    {saved&&!result&&!busy?<ActionButton title="Retry analysis of saved file" onPress={()=>void retry()}/>:null}
    {result?.proposal?.status==='applied'?<ActionButton title="View added tasks" onPress={onWorkspace}/>:null}{result?<><Text style={{fontSize:20,fontWeight:'700',color:colors.ink}}>File summary</Text><MarkdownText>{result.summary}</MarkdownText><Text style={{color:colors.muted,lineHeight:20}}>Check the summary and suggested time estimates against your file before applying tasks.</Text>{result.proposal?<ActionReviewCard proposal={result.proposal} busy={busy} onDecision={decision=>void decide(decision)}/>:<Text style={{color:colors.muted}}>No tasks were suggested from this file. Its summary is saved in Knowledge.</Text>}</>:null}
  </View>;
}

