import { useRouter } from 'expo-router';
import { useCallback, useState, useEffect } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View, Alert, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Row, RowGroup, T, TabTitle } from '@/components/ui';
import { C, Fonts } from '@/constants/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DEMO_MODE } from '@/lib/config';
import { DJI_AVAILABLE } from '@dji';
import { useSync } from '@/lib/sync-context';
import type { SubscriptionMe } from '@/lib/types';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { buyProduct, initIap, endIap, IAP_PRODUCTS, verifyAndGrantPremium } from '@/lib/billing';

function initials(email: string | undefined): string {
  if (!email) return 'GF';
  const [local] = email.split('@');
  const parts = local.split(/[._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : local.slice(0, 2)).toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const { pending } = useSync();

  const [me, setMe] = useState<SubscriptionMe | null>(null);
  const [notifOn, setNotifOn] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  const load = useCallback(async () => {
    await api<SubscriptionMe>('/api/subscriptions/me')
      .then(setMe)
      .catch(() => {});
  }, []);

  useRefreshOnFocus(load);

  // Initialize IAP on mount
  useEffect(() => {
    if (Platform.OS === 'android') {
      initIap();
    }
    return () => {
      if (Platform.OS === 'android') {
        endIap();
      }
    };
  }, []);

  const handleUpgrade = async () => {
    setPurchasing(true);
    try {
      const result = await buyProduct(IAP_PRODUCTS.premium);
      if (result.success && result.purchase) {
        const verify = await verifyAndGrantPremium(result.purchase);
        if (verify.ok && verify.granted) {
          Alert.alert('Success', 'Premium activated for 30 days!');
          load(); // Refresh subscription status
        } else {
          Alert.alert('Error', verify.error || 'Failed to activate premium. Contact support.');
        }
      } else {
        if (result.error) {
          Alert.alert('Purchase Failed', result.error);
        }
      }
    } catch (err) {
      console.error('[Profile] Upgrade error:', err);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setPurchasing(false);
    }
  };

  const email = session?.user?.email;
  const planLabel = me ? (me.premiumActive ? 'Premium plan' : 'Free plan') : 'GeoFold';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.surface }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top, paddingBottom: insets.bottom + 32 }}
    >
      <TabTitle title="Profile" />

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(email)}</Text>
        </View>
        <View style={{ minWidth: 0, flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {email ?? 'Signed in'}
          </Text>
          <Text style={T.sub}>Field surveyor</Text>
          <Text style={T.sub}>{planLabel}</Text>
        </View>
      </View>

      <RowGroup>
        <Row
          label="Sync & backup"
          value={pending === 0 ? 'Up to date' : `${pending} pending`}
          onPress={() => router.push('/sync')}
        />
        <Row label="Projects" value={me ? String(me.usage.projects) : '—'} />
        <Row label="Surveys today" value={me ? String(me.usage.surveysToday) : '—'} />
        <Row label="Photos today" value={me ? String(me.usage.photosToday) : '—'} />

        {Platform.OS === 'android' && (
          <Row
            label={me?.premiumActive ? 'Premium active' : 'Upgrade to Premium'}
            value={me?.premiumActive ? '✓ Active' : 'Rp 40.000 / 30 days'}
            right={me?.premiumActive ? null : (
              <>
                {purchasing && <ActivityIndicator size="small" color={C.accent} />}
                {!purchasing && (
                  <Button
                    title="Upgrade"
                    variant="primary"
                    onPress={handleUpgrade}
                    style={{ minWidth: 80 }}
                  />
                )}
              </>
            )}
            last
          />
        )}

        <Row
          label="Notifications"
          right={
            <Switch
              value={notifOn}
              onValueChange={setNotifOn}
              trackColor={{ true: C.accent, false: C.line85 }}
            />
          }
          last
        />
      </RowGroup>

      <Text style={[T.caption, { marginTop: 12, lineHeight: 18 }]}>
        Plan limits are enforced by the server. Google Play billing is available on Android.
      </Text>

      {/* Only in the drone build — the standard APK carries no SDK, so the screen would have
          nothing to say. See DJI-SETUP.md for how the two variants are produced. */}
      {DJI_AVAILABLE ? (
        <>
          <View style={{ height: 20 }} />
          <RowGroup>
            <Row label="Drone" value="DJI" onPress={() => router.push('/drone')} />
          </RowGroup>
        </>
      ) : null}

      <View style={{ height: 20 }} />

      <Button title="Sign out" variant="danger" onPress={() => void signOut()} />

      {DEMO_MODE ? (
        <Text style={[T.caption, { textAlign: 'center', marginTop: 16 }]}>
          Sample data · nothing here is stored on a server
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line90,
    borderRadius: 14,
    marginBottom: 20,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '600', fontFamily: Fonts.sans },
  name: { fontSize: 16, fontWeight: '600', color: C.ink, fontFamily: Fonts.sans },
});