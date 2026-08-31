import { useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { checkBackendHealth } from '../services/healthService';


export default function WelcomeScreen() {
  const [hasStarted, setHasStarted] = useState(false);
  const [backendStatus,setBackendStatus]=useState('not checked');
  const[isChecking,setIsChecking]=useState(false);
  async function checkBackend(){
    setIsChecking(true)
    setBackendStatus('Checking...')

    try {
    await checkBackendHealth();
    setBackendStatus('Backend connected');
  } catch (error) {
    console.warn('Health check failed:', error);
    setBackendStatus('Check failed — see development logs');
  } finally {
    setIsChecking(false);
  }

  }

  return (
    <View style={styles.container}>
      <Text>
        {hasStarted ? "Let’s plan your first goal." : "Welcome to LifeOS"}
      </Text>
      <Button title="Get started" onPress={() => setHasStarted(true)} />
        <Text>{backendStatus}</Text>
<Button
  title="Check backend"
  onPress={checkBackend}
  disabled={isChecking}
/>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
