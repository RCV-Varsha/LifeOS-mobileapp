import { Pressable, StyleSheet, Text, type ButtonProps } from 'react-native';
import { colors, radius } from '../ui/theme';
type Props = Omit<ButtonProps, 'color'> & { variant?: 'primary' | 'secondary' | 'danger' };
export default function ActionButton({ title, onPress, disabled, accessibilityLabel, variant = 'secondary', ...props }: Props) {
  return <Pressable {...props} onPress={onPress} disabled={disabled} accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: Boolean(disabled) }}
    style={({ pressed }) => [styles.button, variant === 'primary' && styles.primary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={[styles.label, variant === 'primary' && styles.primaryLabel, variant === 'danger' && styles.danger]}>{title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 13, borderRadius: radius.input, backgroundColor: colors.stone, alignItems: 'center', justifyContent: 'center', marginVertical: 3, flexShrink: 1 },
  primary: { backgroundColor: colors.ink }, label: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  primaryLabel: { color: colors.onInk }, danger: { color: colors.danger }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.75 },
});
