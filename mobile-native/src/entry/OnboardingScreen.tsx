import { useEffect, useRef, useState } from 'react';
import { StatusBar, AccessibilityInfo, Animated, BackHandler, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ActionButton from '../components/ActionButton';
import LifeOSLogo, { BrandHeader, brandFont } from '../components/LifeOSLogo';
import { colors } from '../ui/theme';
import { nextPage, previousPage } from './onboardingState';
import { useReducedMotion } from './useReducedMotion';

const pages = [
  { name: 'Clarity', title: 'Plan with clarity.', body: 'Turn your goals into a clear path, without keeping everything in your head.', steps: [] },
  { name: 'Focus', title: 'Focus on today.', body: 'LifeOS adjusts your day when time, energy, or priorities change.', steps: ['Today', 'Available time', 'Focused actions'] },
  { name: 'Direction', title: 'Keep moving forward.', body: 'Your goals stay in view while LifeOS helps you decide what matters now.', steps: ['Goal', 'Steps', 'Today'] },
  { name: 'Control', title: 'You stay in control.', body: 'LifeOS suggests.\nYou decide what gets added to your day.', steps: ['Suggestion', 'Review', 'Accept'] },
] as const;

function OnboardingIllustration({ page, compact }: { page: number; compact: boolean }) {
  if (page === 0) return <View style={styles.visual}><LifeOSLogo size={compact ? 180 : 232} label={false} /></View>;
  return <View style={[styles.visual, { paddingVertical: compact ? 12 : 24 }]} accessible accessibilityLabel={pages[page].steps.join(', then ')}>
    {pages[page].steps.map((step, index) => <View key={step} style={styles.stepGroup}>
      {index > 0 ? <View style={styles.connector} /> : null}
      <View style={[styles.step, index === 2 && styles.finalStep]}>
        <Text style={[styles.stepNumber, index === 2 && styles.finalText]}>{index === 2 && page === 3 ? '✓' : `0${index + 1}`}</Text>
        <Text style={[styles.stepText, index === 2 && styles.finalText]}>{step}</Text>
      </View>
    </View>)}
  </View>;
}

function OnboardingPagination({ page }: { page: number }) {
  return <View style={styles.pagination} accessible accessibilityLabel={`Page ${page + 1} of 4`}>
    {pages.map((item, index) => <View key={item.name} style={[styles.dot, index === page && styles.activeDot]} />)}
  </View>;
}

export default function OnboardingScreen({ onComplete }: { onComplete: () => Promise<void> }) {
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const entrance = useRef(new Animated.Value(1)).current;
  const direction = useRef(1);
  const submitting = useRef(false);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    AccessibilityInfo.announceForAccessibility(`Page ${page + 1} of 4. ${pages[page].title}`);
    if (reduced !== false) { entrance.setValue(1); return; }
    entrance.setValue(0);
    const animation = Animated.timing(entrance, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [page, reduced, entrance]);

  function back() { direction.current = -1; setPage(previousPage); setError(''); }
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (saving) return true;
      if (page === 0) return false;
      back(); return true;
    });
    return () => listener.remove();
  }, [page, saving]);

  async function finish() {
    if (submitting.current) return;
    submitting.current = true; setSaving(true); setError('');
    try { await onComplete(); }
    catch { setError('Your welcome preference could not be saved. Please try again.'); }
    finally { submitting.current = false; setSaving(false); }
  }

  return <SafeAreaView style={styles.root}>
    <StatusBar barStyle="dark-content" />
    <View style={styles.frame}>
      <View style={styles.navigation}>
        {page > 0 ? <Pressable accessibilityRole="button" onPress={back} disabled={saving} style={styles.navButton}><Text style={styles.navText}>‹  Back</Text></Pressable> : <View style={styles.navPlaceholder} />}
        <BrandHeader />
        {page < 3 ? <Pressable accessibilityRole="button" onPress={() => void finish()} disabled={saving} style={styles.navButton}><Text style={styles.navText}>Skip</Text></Pressable> : <View style={styles.navPlaceholder} />}
      </View>
      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: entrance, transform: [{ translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [direction.current * 18, 0] }) }] }}>
          <OnboardingIllustration page={page} compact={height < 720} />
          <Text style={styles.eyebrow}>{pages[page].name.toUpperCase()}</Text>
          <Text style={styles.heading} accessibilityRole="header">{pages[page].title}</Text>
          <Text style={styles.body}>{pages[page].body}</Text>
        </Animated.View>
      </ScrollView>
      <View style={styles.footer}>
        <OnboardingPagination page={page} />
        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        <ActionButton variant="primary" title={saving ? 'Saving…' : page === 3 ? 'Get started' : 'Next'} disabled={saving}
          onPress={() => { if (page === 3) void finish(); else { direction.current = 1; setPage(nextPage); setError(''); } }} />
      </View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  frame: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' },
  navigation: { paddingHorizontal: 16, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { minWidth: 64, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  navPlaceholder: { width: 64 }, navText: { fontSize: 14, color: colors.muted },
  scroll: { flex: 1 }, content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 24 },
  visual: { alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  stepGroup: { alignItems: 'center', width: '100%' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 50, paddingVertical: 12, paddingHorizontal: 20, width: '88%', maxWidth: 288, borderRadius: 14, backgroundColor: colors.stone },
  finalStep: { backgroundColor: colors.greenSoft }, stepNumber: { fontSize: 12, fontWeight: '600', color: colors.muted },
  stepText: { flexShrink: 1, color: colors.ink, fontSize: 16, lineHeight: 23 }, finalText: { color: colors.green },
  connector: { width: 1, height: 14, backgroundColor: colors.input },
  eyebrow: { fontSize: 10, letterSpacing: 2.5, color: colors.muted, textAlign: 'center', marginBottom: 14 },
  heading: { fontFamily: brandFont, fontSize: 34, lineHeight: 42, color: colors.ink, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 25, color: colors.muted, textAlign: 'center', marginTop: 18, maxWidth: 350, alignSelf: 'center' },
  footer: { paddingHorizontal: 28, paddingBottom: 20, paddingTop: 12 },
  pagination: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 24, height: 8 },
  dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: colors.input }, activeDot: { width: 20, backgroundColor: colors.green },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, marginBottom: 12, textAlign: 'center' },
});
