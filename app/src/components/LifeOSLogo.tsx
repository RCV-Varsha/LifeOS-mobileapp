import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { colors } from '../ui/theme';

export const logoSource = require('../../assets/lifeos-logo.png');
export const brandFont = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });

export default function LifeOSLogo({ size = 96, label = true }: { size?: number; label?: boolean }) {
  return <Image source={logoSource} resizeMode="contain" style={{ width: size, height: size * 1239 / 1269 }}
    accessible={label} accessibilityLabel={label ? 'LifeOS logo' : undefined} />;
}

export function BrandHeader() {
  return <View style={styles.header} accessible accessibilityLabel="LifeOS">
    <LifeOSLogo size={46} label={false} /><Text style={styles.name}>LifeOS</Text>
  </View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  name: { fontFamily: brandFont, fontSize: 25, color: colors.ink },
});
