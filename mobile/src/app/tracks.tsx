import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chevron, RecordDot, TrackIcon } from '@/components/icons';
import { Button, Chip, ErrorNote, Field, FieldFrame, Header, InfoNote, useT } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { formatLength } from '@/lib/geometry';
import { useSettings } from '@/lib/settings';
import { formatDuration, useTracker } from '@/lib/tracker';
import type { ProjectResponse } from '@/lib/types';

const INTERVALS = [
  { sec: 5, label: 'Every 5 s' },
  { sec: 10, label: '10 s' },
  { sec: 30, label: '30 s' },
  { sec: 60, label: '1 min' },
];

/**
 * The GPS logger (spec 1.7): a route recorder that runs on its own, separate from capturing, and
 * keeps going with the screen off. Each recording is a time-stamped series of positions; the track
 * screen plays it back on a timeline.
 */
export default function TracksScreen() {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tracker = useTracker();
  const { settings } = useSettings();

  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [interval, setIntervalSec] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    api<ProjectResponse[]>('/api/projects')
      .then(setProjects)
      .catch(() => {});
  }, []);

  // The elapsed time ticks while recording; nothing re-renders once it stops.
  useEffect(() => {
    if (!tracker.recording) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [tracker.recording]);

  const start = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      setNote(await tracker.start({ name, projectId, intervalSec: interval }));
      setName('');
    } catch (e) {
      setError(errorMessage(e, 'Could not start recording.'));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await tracker.stop();
      setNote(null);
    } finally {
      setBusy(false);
    }
  };

  const active = tracker.active;
  const finished = tracker.tracks.filter((t) => t.id !== active?.id);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <Header title="GPS logger" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <ErrorNote message={error} />
        <InfoNote message={note} tone="warn" />

        {!tracker.supported ? (
          <InfoNote message="Route recording works on the Android and iOS builds." tone="warn" />
        ) : active ? (
          <View style={[styles.card, styles.recording]}>
            <View style={styles.recHead}>
              <RecordDot />
              <Text style={styles.recTitle}>Recording</Text>
              <Text style={T.caption}>{active.mode === 'background' ? 'continues with the screen off' : 'only while GeoFold is open'}</Text>
            </View>
            <Text style={[T.body, { marginTop: 6 }]} numberOfLines={1}>
              {active.name}
            </Text>
            <View style={styles.stats}>
              <Stat label="Time" value={formatDuration(now - active.startedAt)} />
              <Stat label="Distance" value={formatLength(active.distanceM, settings.lengthUnit)} />
              <Stat label="Fixes" value={String(active.pointCount)} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="View" variant="outline" style={{ flex: 1 }} onPress={() => router.push(`/track/${active.id}`)} />
              <Button title={busy ? 'Stopping…' : 'Stop recording'} variant="danger" style={{ flex: 1.4 }} busy={busy} onPress={() => void stop()} />
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={[T.section, { marginBottom: 4 }]}>Record a route</Text>
            <Text style={[T.sub, { marginBottom: 14 }]}>
              Logs your position on its own, separately from photo captures, and keeps logging with the screen
              off. Android shows a notification while it runs.
            </Text>
            <Field label="Name (optional)" value={name} onChangeText={setName} placeholder="Transek 3 — pagi" maxLength={80} />
            <FieldFrame label="Log a position">
              <View style={styles.chips}>
                {INTERVALS.map((i) => (
                  <Chip key={i.sec} label={i.label} small active={interval === i.sec} onPress={() => setIntervalSec(i.sec)} />
                ))}
              </View>
            </FieldFrame>
            {projects.length ? (
              <FieldFrame label="Project" hint="A track filed under a project goes into that project's shapefile export.">
                <View style={styles.chips}>
                  <Chip label="None" small active={projectId === null} onPress={() => setProjectId(null)} />
                  {projects.map((p) => (
                    <Chip key={p.id} label={p.name} small active={projectId === p.id} onPress={() => setProjectId(p.id)} />
                  ))}
                </View>
              </FieldFrame>
            ) : null}
            <Button title={busy ? 'Starting…' : 'Start recording'} busy={busy} onPress={() => void start()} />
          </View>
        )}

        <Text style={[T.section, { marginTop: 8, marginBottom: 8 }]}>Recorded routes</Text>
        {finished.length === 0 ? (
          <Text style={T.sub}>None yet.</Text>
        ) : (
          finished.map((t) => (
            <View key={t.id} style={styles.trackRow}>
              <Pressable style={styles.trackMain} onPress={() => router.push(`/track/${t.id}`)}>
                <TrackIcon color={C.accentText} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={T.body} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text style={T.caption}>
                    {`${new Date(t.startedAt).toLocaleDateString()} · ${formatDuration((t.endedAt ?? t.startedAt) - t.startedAt)} · ${formatLength(t.distanceM, settings.lengthUnit)}`}
                  </Text>
                </View>
                <Chevron />
              </Pressable>
              <Switch
                value={t.onMap}
                onValueChange={(v) => tracker.setOnMap(t.id, v)}
                trackColor={{ true: C.accent, false: C.line85 }}
                thumbColor="#fff"
                accessibilityLabel={`Show ${t.name} on the map`}
              />
            </View>
          ))
        )}
        {finished.length ? <Text style={[T.caption, { marginTop: 8 }]}>The switch shows a route on the main map.</Text> : null}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  card: { borderWidth: 1, borderColor: C.line90, borderRadius: Radius.xl, padding: 16, marginBottom: 20 },
  recording: { borderColor: '#e5484d', borderWidth: 1.5 },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recTitle: { fontSize: 15, fontWeight: '700', color: '#e5484d', fontFamily: Fonts.sans, marginRight: 4 },
  stats: { flexDirection: 'row', marginVertical: 14 },
  statLabel: { fontSize: 11, color: C.ink55, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: Fonts.sans },
  statValue: { fontSize: 18, fontWeight: '600', color: C.ink, marginTop: 2, fontFamily: Fonts.mono },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
  },
  trackMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
}));
