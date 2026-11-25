import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrackMap } from '@/components/map/track-map';
import { Button, Empty, ErrorNote, Field, Header, Loading, useT } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/api';
import { boundsOf, distance, formatLength, type Position } from '@/lib/geometry';
import { toGpx } from '@/lib/gpx';
import { fileSlug } from '@/lib/project-data';
import { useSettings } from '@/lib/settings';
import { formatDuration, loadTrackPoints, useTracker, type TrackPoint } from '@/lib/tracker';
import { requestMapFocus } from '@/lib/viewport';

/** Rows in the time table: enough to read the route's rhythm, few enough to scroll. */
const TABLE_ROWS = 40;

/**
 * One recorded route, played back on a timeline (spec 1.7): drag along the bar and the cursor
 * moves along the route to where the surveyor was at that moment, with the time, speed and
 * accuracy of that fix.
 */
export default function TrackScreen() {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tracker = useTracker();
  const { settings } = useSettings();
  const meta = tracker.tracks.find((t) => t.id === id) ?? null;
  const live = tracker.active?.id === id;

  const [loaded, setLoaded] = useState<{ id: string; points: TrackPoint[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [name, setName] = useState(meta?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [barWidth, setBarWidth] = useState(1);

  // A live track is the one in memory (it grows as fixes arrive); a finished one is read once.
  useEffect(() => {
    if (!id || live) return;
    let cancelled = false;
    loadTrackPoints(id).then((points) => !cancelled && setLoaded({ id, points }));
    return () => {
      cancelled = true;
    };
  }, [id, live]);
  const points = live ? tracker.activePoints : loaded?.id === id ? loaded.points : null;

  const coords = useMemo<Position[]>(() => (points ?? []).map((p) => [p[0], p[1]]), [points]);
  // Distance travelled up to each fix, for the timeline readout.
  const cumulative = useMemo(() => {
    const out: number[] = [];
    let sum = 0;
    coords.forEach((c, i) => {
      if (i > 0) sum += distance(coords[i - 1], c);
      out.push(sum);
    });
    return out;
  }, [coords]);

  const count = points?.length ?? 0;
  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const current = points?.[safeIndex] ?? null;

  // Dragging anywhere on the bar picks the fix at that fraction of the *time* elapsed, not of the
  // fix count — a pause at a plot is a long stretch of the bar, which is what a timeline means.
  const pick = (x: number) => {
    if (!points || points.length < 2) return;
    const f = Math.max(0, Math.min(1, x / barWidth));
    const t0 = points[0][2];
    const t1 = points[points.length - 1][2];
    const target = t0 + f * (t1 - t0);
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid][2] < target) lo = mid + 1;
      else hi = mid;
    }
    setIndex(lo);
  };

  if (!meta) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
        <Header title="Route" onBack={() => router.back()} />
        <View style={{ padding: 20 }}>
          <Empty>This route no longer exists.</Empty>
        </View>
      </View>
    );
  }

  const started = points?.[0]?.[2] ?? meta.startedAt;
  const ended = points?.[count - 1]?.[2] ?? meta.endedAt ?? meta.startedAt;
  const duration = ended - started;
  const speeds = (points ?? []).map((p) => p[5]).filter((s): s is number => s != null && s >= 0);
  // A reduce, not Math.max(...speeds): a day at one fix a second is more arguments than a spread takes.
  const maxSpeed = speeds.length ? speeds.reduce((m, s) => (s > m ? s : m), 0) : null;
  const avgSpeed = duration > 0 ? (cumulative[count - 1] ?? 0) / (duration / 1000) : null;
  const fraction = count > 1 && duration > 0 && current ? (current[2] - started) / duration : 0;
  const step = Math.max(1, Math.ceil(count / TABLE_ROWS));
  const tableRows = (points ?? []).map((p, i) => ({ p, i })).filter(({ i }) => i % step === 0 || i === count - 1);

  const shareGpx = async () => {
    setError(null);
    try {
      if (!points?.length) return;
      const dir = new Directory(Paths.cache, 'exports');
      if (!dir.exists) dir.create({ intermediates: true });
      const file = new File(dir, `${fileSlug(meta.name)}.gpx`);
      if (file.exists) file.delete();
      file.create();
      file.write(toGpx(meta.name, points));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/gpx+xml', dialogTitle: meta.name });
    } catch (e) {
      setError(errorMessage(e, 'Could not share the route.'));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <Header title={live ? 'Route · recording' : 'Route'} onBack={() => router.back()} />
      <View style={styles.map}>
        {points === null ? <Loading /> : <TrackMap coordinates={coords} cursor={current ? [current[0], current[1]] : null} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <ErrorNote message={error} />

        {count > 1 ? (
          <View style={{ marginBottom: 18 }}>
            <View style={styles.cursorRow}>
              <Text style={styles.cursorTime}>{current ? new Date(current[2]).toLocaleTimeString() : '—'}</Text>
              <Text style={T.caption}>
                {current
                  ? `+${formatDuration(current[2] - started)} · ${formatLength(cumulative[safeIndex] ?? 0, settings.lengthUnit)}`
                  : ''}
              </Text>
            </View>
            <View
              style={styles.bar}
              onLayout={(e: LayoutChangeEvent) => setBarWidth(Math.max(1, e.nativeEvent.layout.width))}
              // The responder props directly, so the handlers are this render's `pick`, never stale.
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderTerminationRequest={() => false}
              onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
              onResponderMove={(e) => pick(e.nativeEvent.locationX)}>
              <View style={[styles.barFill, { width: `${fraction * 100}%` }]} />
              <View style={[styles.knob, { left: `${fraction * 100}%` }]} />
            </View>
            <View style={styles.barEnds}>
              <Text style={T.caption}>{new Date(started).toLocaleTimeString()}</Text>
              <Text style={T.caption}>{new Date(ended).toLocaleTimeString()}</Text>
            </View>
            {current ? (
              <Text style={[T.caption, { marginTop: 6 }]}>
                {`${current[1].toFixed(6)}, ${current[0].toFixed(6)}`}
                {current[3] != null ? ` · ±${Math.round(current[3])} m` : ''}
                {current[5] != null && current[5] >= 0 ? ` · ${(current[5] * 3.6).toFixed(1)} km/h` : ''}
                {current[4] != null ? ` · ${Math.round(current[4])} m alt` : ''}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={[T.sub, { marginBottom: 16 }]}>{live ? 'Waiting for the first fixes…' : 'This route has fewer than two fixes.'}</Text>
        )}

        <View style={styles.statsGrid}>
          <Stat label="Started" value={new Date(started).toLocaleString()} />
          <Stat label="Duration" value={formatDuration(duration)} />
          <Stat label="Distance" value={formatLength(cumulative[count - 1] ?? meta.distanceM, settings.lengthUnit)} />
          <Stat label="Fixes" value={String(count)} />
          <Stat label="Avg speed" value={avgSpeed != null ? `${(avgSpeed * 3.6).toFixed(1)} km/h` : '—'} />
          <Stat label="Max speed" value={maxSpeed != null ? `${(maxSpeed * 3.6).toFixed(1)} km/h` : '—'} />
        </View>

        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          onBlur={() => name.trim() && name !== meta.name && tracker.rename(meta.id, name)}
          onSubmitEditing={() => name.trim() && tracker.rename(meta.id, name)}
        />

        <View style={styles.toggleRow}>
          <Text style={[T.body, { flex: 1 }]}>Show on the main map</Text>
          <Switch
            value={meta.onMap}
            onValueChange={(v) => tracker.setOnMap(meta.id, v)}
            trackColor={{ true: C.accent, false: C.line85 }}
            thumbColor="#fff"
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 22 }}>
          <Button
            title="On main map"
            variant="outline"
            size="sm"
            style={{ flex: 1 }}
            onPress={() => {
              const b = boundsOf(coords);
              if (b) requestMapFocus({ kind: 'bounds', bounds: b });
              if (!meta.onMap) tracker.setOnMap(meta.id, true);
              router.navigate('/(tabs)');
            }}
          />
          <Button title="Share GPX" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => void shareGpx()} disabled={!count} />
        </View>

        {tableRows.length > 1 ? (
          <>
            <Text style={[T.section, { marginBottom: 8 }]}>Timeline</Text>
            {tableRows.map(({ p, i }) => (
              <Pressable key={i} onPress={() => setIndex(i)} style={[styles.tableRow, i === safeIndex && { backgroundColor: C.accentTint }]}>
                <Text style={styles.tableTime}>{new Date(p[2]).toLocaleTimeString()}</Text>
                <Text style={styles.tableDist}>{formatLength(cumulative[i] ?? 0, settings.lengthUnit)}</Text>
                <Text style={styles.tableCoord} numberOfLines={1}>{`${p[1].toFixed(5)}, ${p[0].toFixed(5)}`}</Text>
              </Pressable>
            ))}
          </>
        ) : null}

        {!live ? (
          <Button
            title="Delete route"
            variant="danger"
            style={{ marginTop: 22 }}
            onPress={() =>
              Alert.alert('Delete route?', `"${meta.name}" will be removed from this device.`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    tracker.remove(meta.id);
                    router.back();
                  },
                },
              ])
            }
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  map: { height: 260, backgroundColor: C.mapBase },
  cursorRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  cursorTime: { fontSize: 20, fontWeight: '700', color: C.ink, fontFamily: Fonts.mono },
  bar: { height: 28, justifyContent: 'center' },
  barFill: { position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: C.accent },
  knob: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    backgroundColor: C.surface,
    borderWidth: 3,
    borderColor: C.accent,
  },
  barEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  stat: { width: '50%', paddingVertical: 8 },
  statLabel: { fontSize: 11, color: C.ink55, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: Fonts.sans },
  statValue: { fontSize: 15, fontWeight: '600', color: C.ink, marginTop: 2, fontFamily: Fonts.sans },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 12,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  tableTime: { width: 86, fontSize: 12, color: C.ink, fontFamily: Fonts.mono },
  tableDist: { width: 78, fontSize: 12, color: C.ink46, fontFamily: Fonts.mono },
  tableCoord: { flex: 1, fontSize: 11, color: C.ink55, fontFamily: Fonts.mono },
}));
