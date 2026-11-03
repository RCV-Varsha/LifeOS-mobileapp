import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../ui/theme';
export default function Disclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return <View style={styles.section}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.toggle}>
      <Text style={styles.title}>{title}</Text><Text style={styles.symbol}>{open ? '−' : '+'}</Text>
    </Pressable>
    {open ? <View style={styles.body}>{children}</View> : null}
  </View>;
}
const styles = StyleSheet.create({ section: { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.line }, toggle: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16 }, title: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.ink }, symbol: { fontSize: 24, color: colors.muted }, body: { paddingBottom: 16, gap: 8 } });
