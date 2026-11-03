import { useState } from 'react';
import { StatusBar, View, Text, TextInput, StyleSheet } from 'react-native';
import ActionButton from '../components/ActionButton';
import { colors, input } from '../ui/theme';
import { API_URL } from '../config/api';
import { saveTokens, type Tokens } from '../services/authStorage';
import ScreenScroll from '../components/ScreenScroll';
import { request } from '../services/request';
import LifeOSLogo from '../components/LifeOSLogo';

export default function SignInScreen({onSignedIn}:{onSignedIn:()=>void}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[register,setRegister]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(){setBusy(true);setError('');try{
    const response=await request(`${API_URL}/auth/${register?'register':'login'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password})});
    const body=await response.json();if(!response.ok)throw new Error(body.error??'Unable to sign in.');
    await saveTokens(body as Tokens);setPassword('');onSignedIn();
  }catch(e){setError(e instanceof Error?e.message:'Unable to connect.');}finally{setBusy(false);}}
  return <ScreenScroll contentContainerStyle={styles.page}><StatusBar barStyle="dark-content"/><View style={styles.form}><View style={{flexDirection:'row',alignItems:'center',gap:8}}><LifeOSLogo size={48}/><Text style={styles.brand}>LIFEOS</Text></View><Text style={styles.title}>{register?'Create your space':'Welcome back'}</Text><Text style={styles.subtitle}>A clearer view of your work, knowledge, and next steps.</Text>
    <TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="Email" value={email} onChangeText={setEmail} style={input}/>
    <TextInput accessibilityLabel="Password" secureTextEntry autoCapitalize="none" placeholder={register?'Password · at least 12 characters':'Password'} value={password} onChangeText={setPassword} style={input}/>
    {error?<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>:null}
    <ActionButton title={busy?'Connecting…':register?'Create account':'Sign in'} variant="primary" disabled={busy||!email||!password} onPress={()=>void submit()}/>
    <ActionButton title={register?'I already have an account':'Create an account'} disabled={busy} onPress={()=>{setRegister(!register);setError('');}}/>
  </View></ScreenScroll>;
}
const styles=StyleSheet.create({page:{flexGrow:1,justifyContent:'center',alignItems:'center',padding:24,backgroundColor:colors.paper},form:{width:'100%',maxWidth:440,gap:16},brand:{fontSize:13,fontWeight:'700',letterSpacing:4,color:colors.green},title:{fontSize:34,fontWeight:'700',color:colors.ink},subtitle:{fontSize:16,lineHeight:24,color:colors.muted,marginBottom:16}});
