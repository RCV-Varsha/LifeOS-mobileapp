import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import BrandSplash from './BrandSplash';
import OnboardingScreen from './OnboardingScreen';
import { completeOnboarding, readOnboarding, withDeadline } from './onboardingState';
import { BrandHeader } from '../components/LifeOSLogo';
import ActionButton from '../components/ActionButton';
import { colors } from '../ui/theme';

export default function EntryGate({ children }: { children: ReactNode }) {
  const [splashDone, setSplashDone] = useState(false);
  const [completed, setCompleted] = useState<boolean | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const finishSplash = useCallback(() => setSplashDone(true), []);
  useEffect(() => {
    let active = true;
    setError(false);
    void withDeadline(readOnboarding(AsyncStorage)).then((value) => {
      if (active) setCompleted(value);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);

  if (!splashDone) return <BrandSplash onFinished={finishSplash} />;
  if (completed === null) return <SafeAreaView style={styles.root}><StatusBar style="dark" /><View style={styles.content}>
    <BrandHeader />
    {error ? <><Text style={styles.message}>We couldn’t read your welcome preference.</Text><ActionButton title="Try again" variant="primary" onPress={() => setAttempt((value) => value + 1)} /></>
      : <><ActivityIndicator color={colors.ink} /><Text style={styles.message}>Getting ready…</Text></>}
  </View></SafeAreaView>;
  if (!completed) return <OnboardingScreen onComplete={async () => {
    await withDeadline(completeOnboarding(AsyncStorage));
    setCompleted(true);
  }} />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper, justifyContent: 'center', padding: 28 },
  content: { gap: 24, alignSelf: 'center', maxWidth: 420, width: '100%' },
  message: { textAlign: 'center', fontSize: 16, lineHeight: 24, color: colors.muted },
});
