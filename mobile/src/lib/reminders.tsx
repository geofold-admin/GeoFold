import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { readJsonSync, writeJsonSync } from './kv';
import { useSettings } from './settings';
import { useSync } from './sync-context';

/**
 * Sync and backup reminders (spec 3.2).
 *
 * Two nudges keep the server copy and the device copy of a project in step:
 *
 *  - **Sync** — captures still in the outbox once the oldest has waited `syncAfterHours`. They are
 *    safe on the phone, but only on the phone; a lost or broken device takes them with it.
 *  - **Backup** — an export of the project's spatial data (the shapefile package, which also
 *    carries what was drawn and imported on the device and never goes to the server) every
 *    `backupEveryDays`.
 *
 * Both are local notifications, re-planned whenever their inputs change, so there is never a stale
 * "12 captures waiting" after the queue has drained. The same state drives the in-app banner.
 * `expo-notifications` is loaded lazily: a build without it still runs, just without the system
 * notification.
 */

type NotificationsModule = typeof import('expo-notifications');
let notifications: NotificationsModule | null | undefined;

function getNotifications(): NotificationsModule | null {
  if (notifications === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module
      notifications = Platform.OS === 'web' ? null : (require('expo-notifications') as NotificationsModule);
    } catch {
      notifications = null;
    }
  }
  return notifications;
}

const SYNC_ID = 'geofold-sync-reminder';
const BACKUP_ID = 'geofold-backup-reminder';
const CHANNEL = 'reminders';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ── backup record ──────────────────────────────────────────────────── */

interface BackupRecord {
  /** When the reminders first started counting, so a fresh install is not nagged at once. */
  since: number;
  lastBackupAt: number | null;
  projects: Record<string, number>;
}

let backups: BackupRecord = readJsonSync<BackupRecord>('backups') ?? { since: Date.now(), lastBackupAt: null, projects: {} };
const listeners = new Set<() => void>();

/** Record a successful export. Called by the shapefile export. */
export function markBackup(projectId: string | null): void {
  const now = Date.now();
  backups = {
    ...backups,
    lastBackupAt: now,
    projects: projectId ? { ...backups.projects, [projectId]: now } : backups.projects,
  };
  writeJsonSync('backups', backups);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBackups(): BackupRecord {
  return useSyncExternalStore(subscribe, () => backups, () => backups);
}

/* ── shared status ──────────────────────────────────────────────────── */

export interface ReminderStatus {
  /** Captures waiting longer than the sync threshold (0 when none or reminders are off). */
  overdueCaptures: number;
  /** Hours the oldest capture has waited. */
  oldestHours: number;
  /** Days since the last export, or null if it is not yet due. */
  backupDueDays: number | null;
}

export function useReminderStatus(): ReminderStatus {
  const { settings } = useSettings();
  const { items } = useSync();
  const record = useBackups();
  const { enabled, syncAfterHours, backupEveryDays } = settings.reminders;
  // The clock as state, refreshed each minute — read during render it would make this impure.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => {
    const oldest = items.reduce((min, i) => Math.min(min, i.createdAt), Infinity);
    const oldestHours = Number.isFinite(oldest) ? (now - oldest) / HOUR : 0;
    const overdueCaptures = enabled && oldestHours >= syncAfterHours ? items.length : 0;
    const since = record.lastBackupAt ?? record.since;
    const backupDueDays =
      enabled && backupEveryDays > 0 && now - since >= backupEveryDays * DAY ? Math.floor((now - since) / DAY) : null;
    return { overdueCaptures, oldestHours, backupDueDays };
  }, [backupEveryDays, enabled, items, now, record, syncAfterHours]);
}

/* ── scheduling ─────────────────────────────────────────────────────── */

/** Next 09:00 local time after `from` — a backup nudge belongs at the start of a working day. */
function nextMorning(from: number): number {
  const d = new Date(from);
  d.setHours(9, 0, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

let permissionAsked = false;

async function ensurePermission(mod: NotificationsModule): Promise<boolean> {
  const current = await mod.getPermissionsAsync();
  if (current.granted) return true;
  // Asked at most once per launch, and only once there is something to remind about.
  if (!current.canAskAgain || permissionAsked) return false;
  permissionAsked = true;
  return (await mod.requestPermissionsAsync()).granted;
}

async function schedule(mod: NotificationsModule, id: string, at: number, title: string, body: string, url: string) {
  await mod.cancelScheduledNotificationAsync(id).catch(() => {});
  await mod.scheduleNotificationAsync({
    identifier: id,
    content: { title, body, data: { url } },
    trigger: {
      type: mod.SchedulableTriggerInputTypes.DATE,
      date: new Date(Math.max(at, Date.now() + 60_000)),
      channelId: CHANNEL,
    },
  });
}

/**
 * Renders nothing. Keeps the two scheduled notifications in line with the outbox, the last
 * export and the settings, and routes a tapped notification to the screen that resolves it.
 */
export function ReminderScheduler() {
  const router = useRouter();
  const { settings } = useSettings();
  const { items } = useSync();
  const record = useBackups();
  const { enabled, syncAfterHours, backupEveryDays } = settings.reminders;

  const pending = items.length;
  const oldest = items.reduce((min, i) => Math.min(min, i.createdAt), Infinity);

  useEffect(() => {
    const mod = getNotifications();
    if (!mod) return;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      mod
        .setNotificationChannelAsync(CHANNEL, {
          name: 'Sync & backup reminders',
          importance: mod.AndroidImportance.DEFAULT,
        })
        .catch(() => {});
    }
    const sub = mod.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as never);
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    const mod = getNotifications();
    if (!mod) return;
    let cancelled = false;
    (async () => {
      try {
        if (!enabled || pending === 0) {
          await mod.cancelScheduledNotificationAsync(SYNC_ID).catch(() => {});
          return;
        }
        if (!(await ensurePermission(mod)) || cancelled) return;
        const due = Number.isFinite(oldest) ? oldest + syncAfterHours * HOUR : Date.now() + syncAfterHours * HOUR;
        await schedule(
          mod,
          SYNC_ID,
          // Already overdue while the app is open: nudge again in an hour if it is left unsynced.
          due <= Date.now() ? Date.now() + HOUR : due,
          pending === 1 ? '1 capture is not synced yet' : `${pending} captures are not synced yet`,
          'They are safe on this phone, but only here. Open GeoFold with a connection to back them up.',
          '/sync',
        );
      } catch {
        // A reminder that could not be scheduled is not worth interrupting the surveyor for.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, oldest, pending, syncAfterHours]);

  useEffect(() => {
    const mod = getNotifications();
    if (!mod) return;
    let cancelled = false;
    (async () => {
      try {
        if (!enabled || backupEveryDays <= 0) {
          await mod.cancelScheduledNotificationAsync(BACKUP_ID).catch(() => {});
          return;
        }
        if (!(await ensurePermission(mod)) || cancelled) return;
        const since = record.lastBackupAt ?? record.since;
        const due = since + backupEveryDays * DAY;
        await schedule(
          mod,
          BACKUP_ID,
          due <= Date.now() ? nextMorning(Date.now()) : due,
          'Time to back up your project data',
          'Export each project as a shapefile package so the device copy is safe off the phone.',
          '/projects',
        );
      } catch {
        // As above.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backupEveryDays, enabled, record]);

  return null;
}
