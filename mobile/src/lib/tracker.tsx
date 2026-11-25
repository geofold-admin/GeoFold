import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { distance, type Position } from './geometry';
import { readJsonSync, writeJsonSync } from './kv';

/**
 * GPS logger (spec 1.7): records the surveyor's route as time-stamped coordinates, independently
 * of any capture, and keeps recording with the screen off.
 *
 * Background recording runs through a TaskManager location task with an Android foreground
 * service — the persistent "recording your route" notification is what Android requires for
 * location in the background, and it is also what tells the surveyor the logger is still on.
 * Where that is unavailable (background permission refused, or a build without the native task
 * module) it falls back to a foreground watch that records while GeoFold is open, and says so.
 *
 * Storage: one JSON file per track under `Paths.document/tracks/`, plus an index. Points are
 * appended from the task handler, which can run while the UI is not mounted, so nothing here may
 * depend on React state — the handler reads the active track id from the synchronous kv store.
 */

export const TRACK_TASK = 'geofold-gps-logger';

/** `[lng, lat, timestampMs, accuracyM | null, altitudeM | null, speedMps | null]` */
export type TrackPoint = [number, number, number, number | null, number | null, number | null];

export interface TrackMeta {
  id: string;
  name: string;
  projectId: string | null;
  startedAt: number;
  endedAt: number | null;
  pointCount: number;
  distanceM: number;
  /** Drawn on the main map. */
  onMap: boolean;
  mode: 'background' | 'foreground';
}

interface TrackFile {
  id: string;
  points: TrackPoint[];
}

interface ActiveState {
  activeId: string | null;
  intervalSec: number;
  mode: 'background' | 'foreground' | null;
}

/** Fixes worse than this are dropped: a 200 m jump under canopy is noise, not a route. */
const MAX_ACCURACY_M = 75;

/** Tint of the Android foreground-service notification — the brand accent. */
const NOTIFICATION_COLOR = '#0070bb';

/* ── optional native task manager ───────────────────────────────────── */

type TaskManagerModule = typeof import('expo-task-manager');
let taskManager: TaskManagerModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a build without the native module must still start
  taskManager = require('expo-task-manager') as TaskManagerModule;
} catch {
  taskManager = null;
}

/* ── storage ────────────────────────────────────────────────────────── */

function tracksDir(): Directory {
  const dir = new Directory(Paths.document, 'tracks');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function trackFile(id: string): File {
  return new File(tracksDir(), `${id}.json`);
}

function readIndex(): TrackMeta[] {
  return readJsonSync<TrackMeta[]>('tracks-index') ?? [];
}

function writeIndex(index: TrackMeta[]): void {
  writeJsonSync('tracks-index', index);
}

function readActive(): ActiveState {
  return readJsonSync<ActiveState>('tracker') ?? { activeId: null, intervalSec: 5, mode: null };
}

function writeActive(state: ActiveState): void {
  writeJsonSync('tracker', state);
}

export async function loadTrackPoints(id: string): Promise<TrackPoint[]> {
  try {
    const file = trackFile(id);
    if (!file.exists) return [];
    const parsed = JSON.parse(await file.text()) as TrackFile;
    return Array.isArray(parsed.points) ? parsed.points : [];
  } catch {
    return [];
  }
}

function writeTrackPoints(id: string, points: TrackPoint[]): void {
  const file = trackFile(id);
  if (!file.exists) file.create();
  file.write(JSON.stringify({ id, points } satisfies TrackFile));
}

/* ── appending fixes ────────────────────────────────────────────────── */

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

// Appends are chained: two batches arriving together would otherwise both read the old file and
// the second write would drop the first batch's points.
let chain: Promise<unknown> = Promise.resolve();

function appendLocations(locations: Location.LocationObject[]): Promise<void> {
  const run = async () => {
    const { activeId } = readActive();
    if (!activeId || !locations.length) return;

    const points = await loadTrackPoints(activeId);
    const index = readIndex();
    const meta = index.find((t) => t.id === activeId);
    let added = 0;
    let gained = 0;

    for (const loc of [...locations].sort((a, b) => a.timestamp - b.timestamp)) {
      const acc = loc.coords.accuracy ?? null;
      if (acc != null && acc > MAX_ACCURACY_M) continue;
      const last = points[points.length - 1];
      // The OS can redeliver a fix; one point per timestamp keeps the timeline monotonic.
      if (last && loc.timestamp <= last[2]) continue;
      const point: TrackPoint = [
        loc.coords.longitude,
        loc.coords.latitude,
        loc.timestamp,
        acc,
        loc.coords.altitude ?? null,
        loc.coords.speed ?? null,
      ];
      if (last) gained += distance([last[0], last[1]], [point[0], point[1]]);
      points.push(point);
      added++;
    }

    if (!added) return;
    writeTrackPoints(activeId, points);
    if (meta) {
      meta.pointCount = points.length;
      meta.distanceM = Math.round((meta.distanceM + gained) * 10) / 10;
      writeIndex(index);
    }
    emit();
  };
  const next = chain.then(run, run);
  chain = next.catch(() => {});
  return next;
}

// Defined at module scope, as TaskManager requires: when Android wakes the app headless to deliver
// locations, this file is evaluated (it is imported by the root layout) before any UI exists.
if (taskManager && !taskManager.isTaskDefined(TRACK_TASK)) {
  taskManager.defineTask<{ locations: Location.LocationObject[] }>(TRACK_TASK, async ({ data, error }) => {
    if (error || !data?.locations) return;
    await appendLocations(data.locations);
  });
}

/* ── start / stop ───────────────────────────────────────────────────── */

let foregroundWatch: Location.LocationSubscription | null = null;

async function startForegroundWatch(intervalSec: number): Promise<void> {
  foregroundWatch?.remove();
  foregroundWatch = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: intervalSec * 1000, distanceInterval: 3 },
    (loc) => void appendLocations([loc]),
  );
}

async function startBackgroundUpdates(intervalSec: number): Promise<void> {
  await Location.startLocationUpdatesAsync(TRACK_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: intervalSec * 1000,
    distanceInterval: 3,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.Fitness,
    foregroundService: {
      notificationTitle: 'GeoFold is recording your route',
      notificationBody: 'GPS logger is on. Open GeoFold to stop it.',
      notificationColor: NOTIFICATION_COLOR,
      killServiceOnDestroy: false,
    },
  });
}

async function backgroundRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(TRACK_TASK);
  } catch {
    return false;
  }
}

/* ── context ────────────────────────────────────────────────────────── */

export interface StartOptions {
  name?: string;
  projectId?: string | null;
  intervalSec?: number;
}

interface TrackerValue {
  supported: boolean;
  recording: boolean;
  mode: 'background' | 'foreground' | null;
  active: TrackMeta | null;
  activePoints: TrackPoint[];
  tracks: TrackMeta[];
  /** Tracks to draw on the main map (those switched on, plus the one recording). */
  mapLines: { id: string; coordinates: Position[]; active: boolean }[];
  /** Returns a note for the surveyor when only foreground recording was possible. */
  start: (options?: StartOptions) => Promise<string | null>;
  stop: () => Promise<void>;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  setOnMap: (id: string, onMap: boolean) => void;
}

const TrackerContext = createContext<TrackerValue>({
  supported: false,
  recording: false,
  mode: null,
  active: null,
  activePoints: [],
  tracks: [],
  mapLines: [],
  start: async () => null,
  stop: async () => {},
  rename: () => {},
  remove: () => {},
  setOnMap: () => {},
});

export const useTracker = () => useContext(TrackerContext);

export function TrackerProvider({ children }: { children: ReactNode }) {
  const supported = Platform.OS === 'android' || Platform.OS === 'ios';
  const [tracks, setTracks] = useState<TrackMeta[]>(() => (supported ? readIndex() : []));
  const [activeState, setActiveState] = useState<ActiveState>(() =>
    supported ? readActive() : { activeId: null, intervalSec: 5, mode: null },
  );
  const [activePoints, setActivePoints] = useState<TrackPoint[]>([]);
  const [linePoints, setLinePoints] = useState<Record<string, TrackPoint[]>>({});

  const reload = useCallback(async () => {
    const index = readIndex();
    const active = readActive();
    setTracks(index);
    setActiveState(active);
    setActivePoints(active.activeId ? await loadTrackPoints(active.activeId) : []);
  }, []);

  useEffect(() => {
    if (!supported) return;
    const onChange = () => void reload();
    listeners.add(onChange);
    // The task may have appended while the app was in the background with no listener attached.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void reload();
    });
    const timer = setTimeout(onChange, 0);
    return () => {
      listeners.delete(onChange);
      sub.remove();
      clearTimeout(timer);
    };
  }, [reload, supported]);

  // A recording the surveyor never stopped resumes after a restart or after Android killed the
  // service — but only with permissions already granted; nothing prompts at launch.
  useEffect(() => {
    if (!supported) return;
    const { activeId, intervalSec, mode } = readActive();
    if (!activeId) return;
    (async () => {
      try {
        const fg = await Location.getForegroundPermissionsAsync();
        if (!fg.granted) return;
        if (mode === 'background' && taskManager) {
          if (!(await backgroundRunning())) await startBackgroundUpdates(intervalSec);
        } else if (!foregroundWatch) {
          await startForegroundWatch(intervalSec);
        }
      } catch {
        // Left as recorded-but-paused; the logger screen still shows it and can stop it.
      }
    })();
  }, [supported]);

  // Points for the tracks switched onto the map, loaded lazily and dropped when switched off.
  const onMapIds = useMemo(() => tracks.filter((t) => t.onMap && t.id !== activeState.activeId).map((t) => t.id), [
    tracks,
    activeState.activeId,
  ]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(onMapIds.map(async (id) => [id, await loadTrackPoints(id)] as const));
      if (!cancelled) setLinePoints(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [onMapIds]);

  const start = useCallback(
    async (options: StartOptions = {}) => {
      const intervalSec = options.intervalSec ?? 5;
      const fg = await Location.requestForegroundPermissionsAsync();
      if (!fg.granted) throw new Error('Location permission is needed to record a route.');
      if (!(await Location.hasServicesEnabledAsync())) {
        throw new Error('Location services are off. Turn on GPS and try again.');
      }

      let mode: 'background' | 'foreground' = 'foreground';
      let note: string | null = null;
      if (taskManager && (await taskManager.isAvailableAsync())) {
        const bg = await Location.requestBackgroundPermissionsAsync();
        if (bg.granted) mode = 'background';
        else note = 'Background location was not allowed, so the route is recorded only while GeoFold is open.';
      } else {
        note = 'This build cannot record in the background, so the route is recorded only while GeoFold is open.';
      }

      const now = Date.now();
      const meta: TrackMeta = {
        id: randomUUID(),
        name: options.name?.trim() || `Route ${new Date(now).toLocaleString()}`,
        projectId: options.projectId ?? null,
        startedAt: now,
        endedAt: null,
        pointCount: 0,
        distanceM: 0,
        onMap: true,
        mode,
      };
      writeTrackPoints(meta.id, []);
      writeIndex([meta, ...readIndex()]);
      writeActive({ activeId: meta.id, intervalSec, mode });

      try {
        if (mode === 'background') await startBackgroundUpdates(intervalSec);
        else await startForegroundWatch(intervalSec);
      } catch (e) {
        writeActive({ activeId: null, intervalSec, mode: null });
        await reload();
        throw e;
      }
      await reload();
      return note;
    },
    [reload],
  );

  const stop = useCallback(async () => {
    const active = readActive();
    foregroundWatch?.remove();
    foregroundWatch = null;
    if (await backgroundRunning()) {
      try {
        await Location.stopLocationUpdatesAsync(TRACK_TASK);
      } catch {
        // Already stopped by the OS; the record is closed below either way.
      }
    }
    // Let an in-flight batch land before the track is closed.
    await chain;
    if (active.activeId) {
      const index = readIndex();
      const meta = index.find((t) => t.id === active.activeId);
      if (meta) meta.endedAt = Date.now();
      writeIndex(index);
    }
    writeActive({ activeId: null, intervalSec: active.intervalSec, mode: null });
    await reload();
  }, [reload]);

  const rename = useCallback(
    (id: string, name: string) => {
      writeIndex(readIndex().map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t)));
      void reload();
    },
    [reload],
  );

  const remove = useCallback(
    (id: string) => {
      if (readActive().activeId === id) return;
      writeIndex(readIndex().filter((t) => t.id !== id));
      try {
        const file = trackFile(id);
        if (file.exists) file.delete();
      } catch {
        // The index no longer lists it, which is what matters.
      }
      void reload();
    },
    [reload],
  );

  const setOnMap = useCallback(
    (id: string, onMap: boolean) => {
      writeIndex(readIndex().map((t) => (t.id === id ? { ...t, onMap } : t)));
      void reload();
    },
    [reload],
  );

  const active = useMemo(
    () => (activeState.activeId ? (tracks.find((t) => t.id === activeState.activeId) ?? null) : null),
    [tracks, activeState.activeId],
  );

  const mapLines = useMemo(() => {
    const lines = onMapIds
      .map((id) => ({ id, coordinates: (linePoints[id] ?? []).map((p) => [p[0], p[1]] as Position), active: false }))
      .filter((l) => l.coordinates.length > 1);
    if (active && activePoints.length > 1) {
      lines.push({ id: active.id, coordinates: activePoints.map((p) => [p[0], p[1]] as Position), active: true });
    }
    return lines;
  }, [active, activePoints, linePoints, onMapIds]);

  const value = useMemo<TrackerValue>(
    () => ({
      supported,
      recording: !!active,
      mode: activeState.mode,
      active,
      activePoints,
      tracks,
      mapLines,
      start,
      stop,
      rename,
      remove,
      setOnMap,
    }),
    [supported, active, activeState.mode, activePoints, tracks, mapLines, start, stop, rename, remove, setOnMap],
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

/** Duration as `1 h 05 min` / `12 min` / `40 s`. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
