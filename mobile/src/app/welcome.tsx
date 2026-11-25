import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { Fonts, makeStyles, useColors } from '@/constants/theme';

/**
 * Welcome. The design's opening screen: white-to-accent-tint wash, the teardrop mark in a rounded
 * square, and the two entry paths.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const C = useColors();

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 40 },
      ]}>
      {/* The design's `linear-gradient(180deg, #ffffff 0%, accentTint 100%)`, full bleed. */}
      <LinearGradient
        colors={[C.surface, C.accentTint]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View />

      <View style={styles.brand}>
        <View style={styles.mark}>
          <View style={styles.markPin} />
        </View>
        <Text style={styles.title}>GeoFold</Text>
        <Text style={styles.tagline}>Field photos, pinned to the exact coordinate.</Text>
      </View>

      <View style={{ gap: 14 }}>
        <Button
          title="Get started"
          size="lg"
          onPress={() => router.push('/signin?mode=signup')}
        />
        <Text style={styles.footer}>
          Already have an account?{' '}
          <Text style={styles.link} onPress={() => router.push('/signin?mode=signin')}>
            Sign in
          </Text>
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  root: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    backgroundColor: C.accentTint,
  },
  brand: { alignItems: 'center', gap: 18 },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markPin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderBottomLeftRadius: 0,
    backgroundColor: '#fff',
    transform: [{ rotate: '-45deg' }],
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: C.ink,
    letterSpacing: -0.5,
    fontFamily: Fonts.sans,
  },
  tagline: {
    fontSize: 16,
    lineHeight: 24,
    color: C.ink46,
    textAlign: 'center',
    maxWidth: 260,
    fontFamily: Fonts.sans,
  },
  footer: { textAlign: 'center', fontSize: 14, color: C.ink46, fontFamily: Fonts.sans },
  link: { color: C.accent, fontWeight: '500' },
}));
