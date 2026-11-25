import { useRouter } from 'expo-router';
import { useCallback, useState, useEffect } from 'react';
import { ScrollView, Text, View, Alert, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cloud, DownloadIcon, DroneIcon, FolderSyncIcon, ImageIcon, MapPinIcon, TrackIcon } from '@/components/icons';
import { Button, Row, RowGroup, Segmented, StatTile, SwitchRow, useT, TabTitle } from '@/components/ui';
import { Fonts, makeStyles, useColors } from '@/constants/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DEMO_MODE } from '@/lib/config';
import { DJI_AVAILABLE } from '@dji';
import { useGis } from '@/lib/gis';
import { useSettings } from '@/lib/settings';
import { useSync } from '@/lib/sync-context';
import { useTracker } from '@/lib/tracker';
import type { SubscriptionMe } from '@/lib/types';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { endIap, fetchPremiumProduct, initIap, purchasePremium, recoverPurchases } from '@/lib/billing';

function initials(email: string | undefined): string {
  if (!email) return 'GF';
  const [local] = email.split('@');
  const parts = local.split(/[._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : local.slice(0, 2)).toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const { session, signOut } = useAuth();
  const { pending } = useSync();

  const [me, setMe] = useState<SubscriptionMe | null>(null);
  const { settings, update, updateReminders } = useSettings();
  const tracker = useTracker();
  const gis = useGis();
  const [purchasing, setPurchasing] = useState(false);
  const [price, setPrice] = useState<string | null>(null);

  const load = useCallback(async () => {
    await api<SubscriptionMe>('/api/subscriptions/me')
      .then(setMe)
      .catch(() => {});
  }, []);

  useRefreshOnFocus(load);

  // Play Billing for the Premium upgrade. Opening the connection also settles any purchase that was
  // paid for but never confirmed — the app closed half-way, or a cash payment has cleared since —
  // so it is granted rather than refunded by Google after three days.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;
    initIap().then(async (ready) => {
      if (ready && (await recoverPurchases()) && !cancelled) load();
    });
    return () => {
      cancelled = true;
      endIap();
    };
  }, [load]);

  const handleUpgrade = async () => {
    setPurchasing(true);
    try {
      const outcome = await purchasePremium();
      if (outcome.status === 'granted') {
        Alert.alert('Premium activated', 'Premium is active for the next 30 days.');
        load();
      } else if (outcome.status === 'pending') {
        Alert.alert('Payment pending', 'Premium is activated as soon as Google Play confirms your payment.');
      } else if (outcome.status === 'error') {
        Alert.alert('Purchase not completed', outcome.message);
      }
      // 'cancelled': the surveyor closed the Play sheet themselves — nothing to report.
    } finally {
      setPurchasing(false);
    }
  };

  const email = session?.user?.email;
  const premium = !!me?.premiumActive;
  // Only once the plan is known: offering an upgrade to someone who may already have it is worse
  // than showing the row a moment late.
  const canUpgrade = Platform.OS === 'android' && !!me && !premium;

  // Play's own localised price, once there is an upgrade to offer; the fixed label stands in until
  // it arrives, or if this build is not on sale on Play at all.
  useEffect(() => {
    if (!canUpgrade) return;
    let cancelled = false;
    fetchPremiumProduct().then((product) => {
      if (!cancelled && product) setPrice(product.displayPrice);
    });
    return () => {
      cancelled = true;
    };
  }, [canUpgrade]);

  return (
    // Inset with a margin, not content padding: padding scrolls, and content scrolled up under the
    // transparent status bar ran into the clock. The tab scene paints the margin in the surface colour.
    <ScrollView
      style={{ flex: 1, backgroundColor: C.surface, marginTop: insets.top }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
    >
      <TabTitle title="Profile" />

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(email)}</Text>
        </View>
        <View style={{ minWidth: 0, flex: 1, gap: 2 }}>
          <Text style={styles.name} numberOfLines={1}>
            {email ?? 'Signed in'}
          </Text>
          <Text style={T.sub}>Field surveyor</Text>
          {me ? (
            <View style={[styles.planBadge, premium ? styles.planBadgePremium : null]}>
              <Text style={[styles.planBadgeText, premium ? styles.planBadgeTextPremium : null]}>
                {premium ? 'Premium plan' : 'Free plan'}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.stats}>
        <StatTile value={me ? String(me.usage.projects) : '—'} label="Projects" />
        <StatTile value={me ? String(me.usage.surveysToday) : '—'} label="Surveys today" />
        <StatTile value={me ? String(me.usage.photosToday) : '—'} label="Photos today" />
      </View>

      <RowGroup>
        <Row
          icon={Cloud}
          label="Sync & backup"
          value={pending === 0 ? 'Up to date' : `${pending} pending`}
          onPress={() => router.push('/sync')}
          last={!canUpgrade}
        />

        {canUpgrade && (
          <Row
            label="Upgrade to Premium"
            detail={`${price ?? 'Rp 40.000'} / 30 days`}
            right={
              purchasing ? (
                <ActivityIndicator size="small" color={C.accentText} />
              ) : (
                <Button title="Upgrade" size="sm" onPress={handleUpgrade} style={{ minWidth: 84 }} />
              )
            }
            last
          />
        )}
      </RowGroup>

      {canUpgrade ? (
        <Text style={[T.caption, { marginTop: 10, lineHeight: 18 }]}>
          Plan limits are enforced by the server. Billed through Google Play.
        </Text>
      ) : null}

      {/* Dark mode (spec 1.9): System follows the phone's own setting, live. */}
      <Text style={styles.section}>Appearance</Text>
      <Segmented
        value={settings.theme}
        onChange={(k) => update({ theme: k as typeof settings.theme })}
        options={[
          { key: 'system', label: 'System' },
          { key: 'light', label: 'Light' },
          { key: 'dark', label: 'Dark' },
        ]}
      />

      <Text style={styles.section}>Map & data</Text>
      <RowGroup>
        <Row icon={MapPinIcon} label="Marker & label style" onPress={() => router.push('/map-settings')} />
        <Row
          icon={TrackIcon}
          label="GPS logger"
          value={tracker.recording ? 'Recording' : tracker.tracks.length ? `${tracker.tracks.length} routes` : undefined}
          onPress={() => router.push('/tracks')}
        />
        <Row
          icon={ImageIcon}
          label="Map overlays"
          value={gis.overlays.length ? String(gis.overlays.length) : undefined}
          onPress={() => router.push('/overlays')}
        />
        <Row icon={DownloadIcon} label="Offline maps" onPress={() => router.push('/offline')} />
        <Row
          icon={FolderSyncIcon}
          label="Export or import project data"
          onPress={() => router.push('/project/data?mode=export')}
          last
        />
      </RowGroup>

      {/* Sync and backup reminders (spec 3.2). */}
      <Text style={styles.section}>Reminders</Text>
      <RowGroup>
        <SwitchRow
          label="Sync & backup reminders"
          detail="Notifies you when captures have waited too long to sync, and when a project is due for an export."
          value={settings.reminders.enabled}
          onValueChange={(v) => updateReminders({ enabled: v })}
          last={!settings.reminders.enabled}
        />
        {settings.reminders.enabled ? (
          <View style={styles.reminderBox}>
            {/* One choice from a short fixed set — a segmented control, which also keeps each set
                on one line where five chips wrapped "Never" onto a row of its own. */}
            <Text style={[T.sub, styles.choiceLabel]}>Remind me to sync after</Text>
            <Segmented
              small
              value={String(settings.reminders.syncAfterHours)}
              onChange={(k) => updateReminders({ syncAfterHours: Number(k) })}
              options={[2, 6, 12, 24].map((h) => ({ key: String(h), label: `${h} h` }))}
            />
            <Text style={[T.sub, styles.choiceLabel, { marginTop: 14 }]}>Remind me to export a backup every</Text>
            <Segmented
              small
              value={String(settings.reminders.backupEveryDays)}
              onChange={(k) => updateReminders({ backupEveryDays: Number(k) })}
              options={(
                [
                  [1, 'Day'],
                  [3, '3 days'],
                  [7, 'Week'],
                  [30, 'Month'],
                  [0, 'Never'],
                ] as const
              ).map(([d, label]) => ({ key: String(d), label }))}
            />
          </View>
        ) : null}
      </RowGroup>

      {/* Only in the drone build — the standard APK carries no SDK, so the screen would have
          nothing to say. See DJI-SETUP.md for how the two variants are produced. */}
      {DJI_AVAILABLE ? (
        <>
          <Text style={styles.section}>Drone</Text>
          <RowGroup>
            <Row
              icon={DroneIcon}
              label="DJI aircraft"
              detail="Link, flight view and mapping"
              onPress={() => router.push('/drone')}
              last
            />
          </RowGroup>
        </>
      ) : null}

      <View style={{ height: 28 }} />

      <Button
        title="Sign out"
        variant="danger"
        onPress={async () => {
          await signOut();
          router.replace('/welcome');
        }}
      />

      {DEMO_MODE ? (
        <Text style={[T.caption, { textAlign: 'center', marginTop: 16 }]}>
          Sample data · nothing here is stored on a server
        </Text>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((C) => ({
  section: {
    fontSize: 12,
    fontWeight: '600',
    color: C.ink55,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 8,
    fontFamily: Fonts.sans,
  },
  reminderBox: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  choiceLabel: { marginBottom: 8 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line90,
    borderRadius: 14,
    marginBottom: 12,
  },
  planBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: C.bg95,
  },
  planBadgePremium: { backgroundColor: C.okBg },
  planBadgeText: { fontSize: 11, fontWeight: '600', color: C.ink46, fontFamily: Fonts.sans },
  planBadgeTextPremium: { color: C.ok },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
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
}));