import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Close, Cloud, ExportIcon } from './icons';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { useReminderStatus } from '@/lib/reminders';

/**
 * The in-app half of the sync and backup reminders (spec 3.2), for when the surveyor is already in
 * the app and a system notification would be redundant. Dismissed for the session only — the
 * underlying condition is real and will be raised again next launch.
 */
export function ReminderBanner({ onExport }: { onExport?: () => void }) {
  const styles = useStyles();
  const C = useColors();
  const router = useRouter();
  const status = useReminderStatus();
  const [hidden, setHidden] = useState<{ sync?: boolean; backup?: boolean }>({});

  const showSync = status.overdueCaptures > 0 && !hidden.sync;
  const showBackup = status.backupDueDays !== null && !hidden.backup;
  if (!showSync && !showBackup) return null;

  return (
    <View style={{ gap: 8, marginBottom: 12 }}>
      {showSync ? (
        <View style={[styles.banner, { backgroundColor: C.warnBg }]}>
          <Cloud color={C.warn} />
          <Pressable style={{ flex: 1 }} onPress={() => router.push('/sync')}>
            <Text style={[styles.title, { color: C.warn }]}>
              {status.overdueCaptures === 1 ? '1 capture' : `${status.overdueCaptures} captures`} waiting to sync
            </Text>
            <Text style={styles.body}>
              {`Oldest has waited ${Math.round(status.oldestHours)} h. Tap to sync now.`}
            </Text>
          </Pressable>
          <Pressable onPress={() => setHidden((h) => ({ ...h, sync: true }))} hitSlop={10} accessibilityLabel="Dismiss">
            <Close color={C.ink55} size={11} />
          </Pressable>
        </View>
      ) : null}
      {showBackup ? (
        <View style={[styles.banner, { backgroundColor: C.accentTint }]}>
          <ExportIcon color={C.accentText} />
          <Pressable style={{ flex: 1 }} onPress={onExport}>
            <Text style={[styles.title, { color: C.accentText }]}>Back up your project data</Text>
            <Text style={styles.body}>
              {`Last export ${status.backupDueDays} days ago. Open a project and export it as a shapefile package.`}
            </Text>
          </Pressable>
          <Pressable onPress={() => setHidden((h) => ({ ...h, backup: true }))} hitSlop={10} accessibilityLabel="Dismiss">
            <Close color={C.ink55} size={11} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  title: { fontSize: 14, fontWeight: '600', fontFamily: Fonts.sans },
  body: { fontSize: 12, color: C.ink46, marginTop: 2, lineHeight: 17, fontFamily: Fonts.sans },
}));
