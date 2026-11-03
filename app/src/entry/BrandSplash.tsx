import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as NativeSplash from 'expo-splash-screen';
import LifeOSLogo, { brandFont } from '../components/LifeOSLogo';
import { colors } from '../ui/theme';
import { useReducedMotion } from './useReducedMotion';

export default function BrandSplash({ onFinished }: { onFinished: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const logo = useRef(new Animated.Value(0)).current;
  const wordmark = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced === null) return;
    if (reduced) {
      logo.setValue(1); wordmark.setValue(1); tagline.setValue(1);
      onFinished();
      return;
    }
    const fade = (value: Animated.Value, duration: number, delay: number) => Animated.timing(value, {
      toValue: 1, duration, delay, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS!=='web',
    });
    const entrance = Animated.parallel([fade(logo, 400, 100), fade(wordmark, 350, 300), fade(tagline, 300, 500)]);
    entrance.start();
    const timeout = setTimeout(onFinished, 1100);
    return () => { entrance.stop(); clearTimeout(timeout); };
  }, [reduced, logo, wordmark, tagline, onFinished]);

  return <SafeAreaView style={styles.root} onLayout={() => { void NativeSplash.hideAsync().catch(() => {}); }}>
    <StatusBar style="dark" />
    <View style={styles.lockup} accessible accessibilityLabel="LifeOS. Plan. Focus. Grow.">
      <Animated.View style={{ opacity: logo, transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }}>
        <LifeOSLogo size={Math.min(width * 0.68, height * 0.36, 280)} label={false} />
      </Animated.View>
      <Animated.Text style={[styles.wordmark, { opacity: wordmark }]}>LifeOS</Animated.Text>
      <Animated.Text style={[styles.tagline, { opacity: tagline }]}>PLAN · FOCUS · GROW</Animated.Text>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lockup: { alignItems: 'center', maxWidth: 440 },
  wordmark: { fontFamily: brandFont, fontSize: 48, lineHeight: 60, color: colors.ink, textAlign: 'center' },
  tagline: { fontSize: 11, lineHeight: 20, letterSpacing: 3, color: colors.muted, marginTop: 12, textAlign: 'center' },
});
