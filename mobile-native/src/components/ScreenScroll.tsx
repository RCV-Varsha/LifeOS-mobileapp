import { type Ref } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../ui/theme';
export default function ScreenScroll({ ref, ...props }: ScrollViewProps & { ref?: Ref<ScrollView> }) {
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.fill}>
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={ref} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets {...props}
        contentContainerStyle={[props.contentContainerStyle, styles.content]} />
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ fill: { flex: 1, backgroundColor: colors.paper }, content: { flexGrow: 1, paddingTop: 20, paddingBottom: 40 } });
