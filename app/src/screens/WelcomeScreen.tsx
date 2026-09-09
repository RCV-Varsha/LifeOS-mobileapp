import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { checkBackendHealth } from '../services/healthService';
import TextAction from '../components/TextAction';


export default function WelcomeScreen() {
  const [hasStarted, setHasStarted] = useState(false);
  const [backendStatus,setBackendStatus]=useState('not checked');
  const[isChecking,setIsChecking]=useState(false);
  async function checkBackend(){
    setIsChecking(true)
    setBackendStatus('Checking…')

    try {
    await checkBackendHealth();
    setBackendStatus('LifeOS is ready');
  } catch (error) {
    console.warn('Health check failed:', error);
    setBackendStatus('LifeOS could not connect. Try again.');
  } finally {
    setIsChecking(false);
  }

  }

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>LIFEOS</Text><Text style={styles.heading}>
        {hasStarted ? "Let’s plan your first goal." : "Welcome to LifeOS"}
      </Text>
      <Text style={styles.muted}>A calm place to decide what deserves your attention.</Text>
      <TextAction primary label="Get started" onPress={() => setHasStarted(true)} />
      <Text style={styles.status}>{backendStatus}</Text>
      <TextAction label="Check connection" onPress={()=>void checkBackend()} disabled={isChecking}/>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f2e8",
    alignItems: "flex-start",
    justifyContent: "center",
    padding:24,
    gap:12,
  },
  eyebrow:{color:'#486553',fontWeight:'800',letterSpacing:1.5},
  heading:{fontSize:32,lineHeight:39,fontWeight:'700',color:'#20251f'},
  muted:{color:'#625d54',fontSize:16,lineHeight:24,marginBottom:12},
  status:{color:'#81796d',marginTop:12},
});
