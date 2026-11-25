import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CaptureSheet } from '@/components/capture-sheet';
import { CameraGlyph, Chevron, Cloud } from '@/components/icons';
import { SurveyMap, type SurveyMarker } from '@/components/survey-map';
import { Chip, Empty, ErrorNote, InfoNote, Sheet } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { ApiError, api, errorMessage } from '@/lib/api';
import { labelText } from '@/lib/labels';
import { buildReferences } from '@/lib/reference';
import { labelFieldFor, useSettings } from '@/lib/settings';
import { useSync } from '@/lib/sync-context';
import type { ProjectResponse, SurveyFeatureCollection } from '@/lib/types';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

type Filter = 'all' | 'pending' | 'synced';

export default function MapScreen() {
  const styles = useStyles();
  const C = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, pending } = useSync();
  const { settings } = useSettings();

  const [collection, setCollection] = useState<SurveyFeatureCollection | null>(null);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [projectSheet, setProjectSheet] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mapBlocked, setMapBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineNote, setOfflineNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    await Promise.all([
      api<ProjectResponse[]>('/api/projects')
        .then(setProjects)
        .catch(() => {}),
      // Offline, this is the copy saved on the phone the last time the map loaded with a connection.
      api<SurveyFeatureCollection>('/api/surveys/geojson')
        .then((fc) => {
          setCollection(fc);
          setMapBlocked(false);
          setOfflineNote(null);
        })
        .catch((e) => {
          // The map feed is plan-gated server-side; that is not an error worth a red banner.
          if (e instanceof ApiError && e.status === 403) setMapBlocked(true);
          // Nothing saved yet is expected the first time the app runs offline, so it isn't an error either.
          else if (e instanceof ApiError && e.isOffline)
            setOfflineNote("You're offline, and synced points haven't been saved on this phone yet. Points captured here still show.");
          else setError(errorMessage(e, 'Could not load the map.'));
        }),
    ]);
  }, []);

  useRefreshOnFocus(load);

  const projectName = useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name ?? 'Project',
    [projects],
  );

  // Numbered across the whole feed, so a point carries the same reference on the map, in its
  // project and on the web portal.
  const references = useMemo(
    () =>
      buildReferences(
        (collection?.features ?? []).map((f) => ({
          id: f.properties.id,
          projectId: f.properties.projectId,
          capturedAtUtc: f.properties.capturedAtUtc,
        })),
        projectName,
      ),
    [collection, projectName],
  );

  // Points still on the device are drawn alongside synced ones — a surveyor should see everything
  // they have captured today, not only what has reached the server.
  const markers = useMemo<SurveyMarker[]>(() => {
    const label = (subject: { id: string; projectId: string; capturedAtUtc: string; detailsJson: string | null }, reference: string | null) =>
      settings.labels.enabled
        ? labelText(labelFieldFor(settings, subject.projectId), subject, {
            reference,
            projectName: projectName(subject.projectId),
          })
        : null;

    const synced = (collection?.features ?? []).map((f) => ({
      id: f.properties.id,
      coordinates: { latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0] },
      title: new Date(f.properties.capturedAtUtc).toLocaleDateString(),
      showCallout: true,
      pending: false,
      projectId: f.properties.projectId,
      label: label(f.properties, references.get(f.properties.id) ?? null),
    }));
    const local = items.map((i) => ({
      id: i.id,
      coordinates: { latitude: i.latitude, longitude: i.longitude },
      title: `${i.projectName} · not yet synced`,
      showCallout: true,
      pending: true,
      projectId: i.projectId,
      label: label(i, 'Not synced'),
    }));

    let all = [...local, ...synced];
    if (projectFilter) all = all.filter((m) => m.projectId === projectFilter);
    if (filter === 'pending') return all.filter((m) => m.pending);
    if (filter === 'synced') return all.filter((m) => !m.pending);
    return all;
  }, [collection, items, filter, projectFilter, projectName, references, settings]);

  // Keyed on the coordinates rather than on `markers`, which is a new array after every refresh.
  // Keying it on the array re-centred the map each time the feed reloaded — including while the
  // surveyor was panning it — even when the point it was centring on had not moved at all.
  const firstLat = markers[0]?.coordinates.latitude;
  const firstLng = markers[0]?.coordinates.longitude;
  const camera = useMemo(
    () =>
      firstLat != null && firstLng != null
        ? { coordinates: { latitude: firstLat, longitude: firstLng }, zoom: 13 }
        : undefined,
    [firstLat, firstLng],
  );

  const activeProject = projectFilter ? projects.find((p) => p.id === projectFilter) : null;

  return (
    <View style={styles.root}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {mapBlocked ? (
          <View style={styles.blocked}>
            <Empty>
              Plotting surveys on a map is part of the Premium plan. Points are still being
              collected — they are all listed under each project.
            </Empty>
          </View>
        ) : (
          <SurveyMap
            markers={markers}
            camera={camera}
            projects={projects}
            activeProjectId={projectFilter}
            // Below the sync button, which owns the top-right corner.
            controlsTop={insets.top + 70}
            statusTop={insets.top + 116}
            // The tab bar below already clears the system navigation area; the 8 is breathing room
            // for the map attribution button tucked in the bottom-right corner.
            bottomInset={8}
            onMarkerPress={(id) => {
              if (!id) return;
              // Local ids belong to the outbox, which has no server record to open yet.
              if (!items.some((i) => i.id === id))
                router.push({ pathname: '/survey/[id]', params: { id, ref: references.get(id) ?? '' } });
            }}
          />
        )}
      </View>

      {/* `box-none` on both rows: the empty stretch between their buttons must let touches reach
          the map. A full-width bar that swallowed them is what made the old compass unpressable. */}
      <View style={[styles.topBar, { top: insets.top + 16 }]} pointerEvents="box-none">
        <Pressable onPress={() => setProjectSheet(true)} style={styles.projectPill} accessibilityRole="button">
          <View style={[styles.projectDot, { backgroundColor: activeProject ? C.accent : C.ink62 }]} />
          <Text style={styles.projectText} numberOfLines={1}>
            {activeProject?.name ?? 'All projects'}
          </Text>
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <Chevron color={C.ink55} size={10} />
          </View>
        </Pressable>
        <Pressable onPress={() => router.push('/sync')} style={styles.cloudButton} accessibilityLabel="Sync and backup">
          <Cloud />
          {pending > 0 ? <View style={styles.badge} /> : null}
        </Pressable>
      </View>

      <View style={[styles.chips, { top: insets.top + 68 }]} pointerEvents="box-none">
        {(
          [
            ['all', 'All'],
            ['pending', 'Pending'],
            ['synced', 'Synced'],
          ] as const
        ).map(([key, label]) => (
          <Chip key={key} label={label} active={filter === key} onPress={() => setFilter(key)} small floating />
        ))}
      </View>

      {error || offlineNote ? (
        <View style={[styles.errorWrap, { top: insets.top + 160 }]} pointerEvents="box-none">
          <ErrorNote message={error} />
          <InfoNote message={offlineNote} tone="warn" />
        </View>
      ) : null}

      <Pressable
        onPress={() => setSheetOpen(true)}
        accessibilityLabel="Capture a survey photo"
        // Centred on the map's bottom control row (8 + 24 up, 44 tall → centre at 54), so the FAB and
        // the basemap/tool pills read as one band instead of two near-misses.
        style={({ pressed }) => [styles.fab, { bottom: 24, opacity: pressed ? 0.9 : 1 }]}>
        <CameraGlyph />
      </Pressable>

      <CaptureSheet visible={sheetOpen} projects={projects} onClose={() => setSheetOpen(false)} />

      <Sheet visible={projectSheet} onClose={() => setProjectSheet(false)} title="Show on the map">
        {[{ id: null as string | null, name: 'All projects' }, ...projects].map((p, i, list) => (
          <Pressable
            key={p.id ?? 'all'}
            onPress={() => {
              setProjectFilter(p.id);
              setProjectSheet(false);
            }}
            style={({ pressed }) => [
              styles.sheetRow,
              i === list.length - 1 ? { borderBottomWidth: 0 } : null,
              { opacity: pressed ? 0.6 : 1 },
            ]}>
            <View style={[styles.projectDot, { backgroundColor: p.id ? C.accent : C.ink62 }]} />
            <Text style={[styles.sheetText, projectFilter === p.id && { color: C.accentText, fontWeight: '600' }]} numberOfLines={1}>
              {p.name}
            </Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  root: { flex: 1, backgroundColor: C.mapBase },
  blocked: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: C.surface },

  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    zIndex: 2,
  },
  projectPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: C.raised,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  projectDot: { width: 9, height: 9, borderRadius: 5 },
  projectText: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: Fonts.sans },
  cloudButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.raised,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.warn,
    borderWidth: 1.5,
    borderColor: '#fff',
  },

  // Stops short of the right edge: the map's control column lives there.
  chips: { position: 'absolute', left: 16, right: 76, flexDirection: 'row', gap: 8, zIndex: 2 },
  errorWrap: { position: 'absolute', left: 16, right: 76, zIndex: 2 },

  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },

  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
  },
  sheetText: { flex: 1, fontSize: 15, color: C.ink, fontFamily: Fonts.sans },
}));
