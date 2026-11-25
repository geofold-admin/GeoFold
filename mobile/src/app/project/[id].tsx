import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Check, Chevron, ExportIcon, ImportIcon } from '@/components/icons';
import { MarkerIcon } from '@/components/marker-icon';
import { Button, ErrorNote, Hatch, Header, Loading, ProgressBar, StatusPill, useT } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors, useTheme } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { formatCoords } from '@/lib/capture';
import { parseDetails } from '@/lib/details';
import { useGis } from '@/lib/gis';
import { labelSourceName } from '@/lib/labels';
import { buildReferences } from '@/lib/reference';
import { useBackups } from '@/lib/reminders';
import { labelFieldFor, markerFor, useSettings } from '@/lib/settings';
import { useSync } from '@/lib/sync-context';
import { parseSchema, type ProjectResponse, type SurveyDetail } from '@/lib/types';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/** Photos shown before "Show all" — each synced one costs a signed-URL request. */
const PHOTO_PAGE = 12;
/** Signed URLs fetched in parallel, so a large project does not open fifty requests at once. */
const URL_CONCURRENCY = 6;

interface Tile {
  key: string;
  surveyId: string | null;
  photoId: string | null;
  localUri: string | null;
  label: string;
  pending: boolean;
  failed: boolean;
  day: string;
}

/**
 * Project detail, laid out like the design's Job Detail — and, since there is no Gallery tab any
 * more (spec 2.2), the home of the project's photos: the evidence sits in the hierarchy it belongs
 * to rather than in a flat stream across every project.
 *
 * Also the project's data hub: its spatial features and the shapefile import/export (spec 1.4),
 * and how its points are drawn on the map (spec 1.2 / 1.6).
 */
export default function ProjectDetailScreen() {
  const styles = useStyles();
  const C = useColors();
  const { STATUS } = useTheme();
  const T = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items } = useSync();
  const gis = useGis();
  const { settings } = useSettings();
  const backups = useBackups();

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [surveys, setSurveys] = useState<SurveyDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({});
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [showAllSurveys, setShowAllSurveys] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [p, s] = await Promise.all([
        api<ProjectResponse>(`/api/projects/${id}`),
        api<SurveyDetail[]>(`/api/surveys?projectId=${id}&pageSize=200`),
      ]);
      setProject(p);
      setSurveys(s);
    } catch (e) {
      setError(errorMessage(e, 'Could not load this project.'));
    }
  }, [id]);

  useRefreshOnFocus(load);

  const fields = useMemo(() => parseSchema(project?.formSchema), [project]);
  const references = useMemo(
    () => buildReferences(surveys ?? [], () => project?.name ?? 'Project'),
    [surveys, project],
  );

  // Which schema fields the most recent survey actually carried — the closest honest analogue of
  // the design's "photos taken so far" checklist.
  //
  // Counted against the schema, and parsed with the same guard the survey screen uses. Counting
  // every key of whatever `detailsJson` decoded to read "2/0" on a project with no fields: a
  // double-encoded "{}" decodes to a two-character *string*, whose keys are "0" and "1".
  const covered = useMemo(() => {
    const details = parseDetails(surveys?.[0]?.detailsJson ?? null);
    return new Set(
      fields
        .map((f) => f.key)
        .filter((k) => details[k] !== undefined && details[k] !== null && details[k] !== ''),
    );
  }, [fields, surveys]);

  // The project's photos: what is still on the device first, then what reached the server.
  const tiles = useMemo<Tile[]>(() => {
    const local: Tile[] = items
      .filter((i) => i.projectId === id && i.photoUri)
      .map((i) => ({
        key: i.id,
        surveyId: null,
        photoId: i.photoId,
        localUri: i.photoUri,
        label: 'Not synced',
        pending: true,
        failed: i.status === 'error',
        day: new Date(i.capturedAtUtc).toDateString(),
      }));
    const remote: Tile[] = (surveys ?? [])
      .filter((s) => s.photos.length > 0)
      .map((s) => ({
        key: s.id,
        surveyId: s.id,
        photoId: s.photos[0].id,
        localUri: null,
        label: references.get(s.id) ?? s.id.slice(0, 8),
        pending: false,
        failed: false,
        day: new Date(s.capturedAtUtc).toDateString(),
      }));
    return [...local, ...remote];
  }, [id, items, references, surveys]);

  // Memoised: the URL effect below depends on it, and a fresh slice every render would restart it.
  const visibleTiles = useMemo(() => (showAllPhotos ? tiles : tiles.slice(0, PHOTO_PAGE)), [showAllPhotos, tiles]);

  // Signed URLs for the synced tiles on screen, fetched a few at a time and only once each.
  useEffect(() => {
    const wanted = visibleTiles.filter((t) => t.surveyId && t.photoId && !(t.photoId in photoUrls));
    if (!wanted.length) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < wanted.length && !cancelled; i += URL_CONCURRENCY) {
        const batch = wanted.slice(i, i + URL_CONCURRENCY);
        const entries = await Promise.all(
          batch.map(async (t) => {
            try {
              // A signed URL expires within minutes, so a copy kept for offline use would be useless.
              const { url } = await api<{ url: string | null }>(`/api/surveys/${t.surveyId}/photos/${t.photoId}/url`, {
                cache: 'none',
              });
              return [t.photoId!, url] as const;
            } catch {
              return [t.photoId!, null] as const;
            }
          }),
        );
        if (!cancelled) setPhotoUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoUrls, visibleTiles]);

  const groups = useMemo(() => {
    const today = new Date().toDateString();
    const byDay = new Map<string, Tile[]>();
    for (const tile of visibleTiles) {
      const list = byDay.get(tile.day) ?? [];
      list.push(tile);
      byDay.set(tile.day, list);
    }
    return [...byDay.entries()].map(([day, list]) => ({
      label: day === today ? 'Today' : new Date(day).toLocaleDateString(),
      tiles: list,
    }));
  }, [visibleTiles]);

  const projectFeatures = useMemo(() => gis.features.filter((f) => f.projectId === id), [gis.features, id]);
  // Read out here: inside the nested callback the compiler would track all of `gis` instead.
  const gisLayers = gis.layers;
  const featureCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of projectFeatures) counts.set(f.layerId, (counts.get(f.layerId) ?? 0) + 1);
    return [...counts.entries()].map(([layerId, count]) => ({
      layer: gisLayers.find((l) => l.id === layerId),
      count,
    }));
  }, [gisLayers, projectFeatures]);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
        <Header title="Project" onBack={() => router.back()} />
        <View style={{ padding: 20 }}>
          <ErrorNote message={error} />
        </View>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
        <Header title="Project" onBack={() => router.back()} />
        <Loading />
      </View>
    );
  }

  const count = surveys?.length ?? project.surveyCount;
  const pct = fields.length ? Math.round((covered.size / fields.length) * 100) : count > 0 ? 100 : 0;
  const marker = markerFor(settings, project.id);
  const labelField = labelFieldFor(settings, project.id);
  const lastExport = backups.projects[project.id];
  const shownSurveys = showAllSurveys ? (surveys ?? []) : (surveys ?? []).slice(0, 20);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <Header
        title="Project details"
        onBack={() => router.back()}
        right={
          <Pressable onPress={() => router.push(`/project/new?id=${project.id}`)} hitSlop={8} style={{ paddingHorizontal: 8 }}>
            <Text style={T.link}>Edit</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <StatusPill
          status={count > 0 ? 'submitted' : 'none'}
          label={count > 0 ? 'In progress' : 'Not started'}
        />
        <Text style={[T.h2, { marginTop: 10, marginBottom: 6 }]}>{project.name}</Text>
        <Text style={[T.sub, { marginBottom: 20 }]}>
          {project.description ?? 'No description'}
        </Text>

        <View style={styles.metaRow}>
          <Text style={T.mono}>
            Created {new Date(project.createdAtUtc).toLocaleDateString()}
          </Text>
          <Text style={T.mono}>
            {count} survey{count === 1 ? '' : 's'}
          </Text>
        </View>

        {/* Photos — the project's media, replacing the separate Gallery tab. */}
        <View style={styles.sectionHead}>
          <Text style={T.section}>Photos</Text>
          <Text style={T.sub}>{tiles.length}</Text>
        </View>
        {tiles.length === 0 ? (
          <Text style={[T.sub, { marginBottom: 24 }]}>
            {surveys === null ? 'Loading…' : 'No photos yet. They appear here as soon as they are taken.'}
          </Text>
        ) : (
          <View style={{ marginBottom: 20 }}>
            {groups.map((group) => (
              <View key={group.label}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                <View style={styles.grid}>
                  {group.tiles.map((tile) => {
                    const uri = tile.localUri ?? (tile.photoId ? photoUrls[tile.photoId] : null);
                    return (
                      <Pressable
                        key={tile.key}
                        disabled={!tile.surveyId}
                        onPress={() =>
                          tile.surveyId &&
                          router.push({
                            pathname: '/survey/[id]',
                            params: { id: tile.surveyId, ref: references.get(tile.surveyId) ?? '' },
                          })
                        }
                        style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.75 : 1 }]}>
                        {uri ? (
                          <Image
                            // Keyed on the photo, not the URL: signed URLs change every request,
                            // and the photo behind them never does.
                            source={{ uri, cacheKey: tile.photoId ?? tile.key }}
                            style={styles.cellImage}
                            contentFit="cover"
                            transition={120}
                          />
                        ) : (
                          <Hatch style={styles.cellImage}>
                            <View style={styles.cellLabelWrap}>
                              <Text style={styles.cellLabel} numberOfLines={3}>
                                {tile.label}
                              </Text>
                            </View>
                          </Hatch>
                        )}
                        <View
                          style={[
                            styles.dot,
                            {
                              backgroundColor: tile.failed
                                ? STATUS.failed.color
                                : tile.pending
                                  ? STATUS.pending.color
                                  : STATUS.synced.color,
                            },
                          ]}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            {tiles.length > PHOTO_PAGE ? (
              <Pressable onPress={() => setShowAllPhotos((v) => !v)} style={styles.more}>
                <Text style={T.link}>{showAllPhotos ? 'Show fewer' : `Show all ${tiles.length} photos`}</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <View style={styles.sectionHead}>
          <Text style={T.section}>Capture form</Text>
          {/* A counter and a bar only mean something when there are fields to fill in. */}
          {fields.length > 0 ? (
            <Text style={T.sub}>
              {covered.size}/{fields.length}
            </Text>
          ) : null}
        </View>
        {fields.length > 0 ? <ProgressBar pct={pct} /> : null}

        <View style={{ marginTop: fields.length > 0 ? 16 : 0, marginBottom: 20 }}>
          {fields.length === 0 ? (
            <Text style={T.sub}>
              No custom fields — captures record a photo, a position and a note.
            </Text>
          ) : (
            fields.map((f) => {
              const done = covered.has(f.key);
              return (
                <View key={f.key} style={styles.checkRow}>
                  <View style={[styles.tick, done ? { backgroundColor: C.ok } : styles.tickEmpty]}>
                    {done ? <Check /> : null}
                  </View>
                  <Text style={[T.body, { flex: 1 }]}>
                    {f.label ?? f.key}
                    {f.required ? ' *' : ''}
                  </Text>
                  <Text style={T.caption}>{f.type}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Spatial data held on this device for the project, and its way off the device. */}
        <Text style={[T.section, { marginBottom: 10 }]}>Spatial data</Text>
        <View style={styles.card}>
          {featureCounts.length === 0 ? (
            <Text style={T.sub}>
              No drawn or imported features yet. Draw them with the map’s measure tool, or import a shapefile.
            </Text>
          ) : (
            featureCounts.map(({ layer, count: n }) => (
              <View key={layer?.id ?? 'unknown'} style={styles.layerRow}>
                <View style={[styles.swatch, { backgroundColor: layer?.color ?? C.ink55 }]} />
                <Text style={[T.body, { flex: 1 }]}>{layer?.name ?? 'Layer'}</Text>
                <Text style={T.sub}>{n === 1 ? '1 feature' : `${n} features`}</Text>
              </View>
            ))
          )}
          <Text style={[T.caption, { marginTop: 10 }]}>
            {lastExport ? `Last exported ${new Date(lastExport).toLocaleString()}` : 'Never exported from this device.'}
          </Text>
          <View style={styles.dataButtons}>
            <Pressable
              style={styles.dataButton}
              onPress={() => router.push(`/project/data?id=${project.id}&mode=export`)}
              accessibilityRole="button">
              <ExportIcon color={C.accentText} />
              <Text style={styles.dataButtonText}>Export shapefile</Text>
            </Pressable>
            <Pressable
              style={styles.dataButton}
              onPress={() => router.push(`/project/data?id=${project.id}&mode=import`)}
              accessibilityRole="button">
              <ImportIcon color={C.accentText} />
              <Text style={styles.dataButtonText}>Import shapefile</Text>
            </Pressable>
          </View>
        </View>

        {/* How this project's points look on the map. */}
        <Pressable
          onPress={() => router.push(`/map-settings?projectId=${project.id}`)}
          style={({ pressed }) => [styles.card, styles.styleRow, { opacity: pressed ? 0.7 : 1 }]}>
          <MarkerIcon style={marker} size={28} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={T.body}>Map marker & label</Text>
            <Text style={T.caption} numberOfLines={1}>
              {`${settings.projectMarkers[project.id] ? 'Own marker' : 'Default marker'} · label: ${
                settings.labels.enabled ? labelSourceName(labelField, fields) : 'off'
              }`}
            </Text>
          </View>
          <Chevron />
        </Pressable>

        <Text style={[T.section, { marginTop: 8, marginBottom: 10 }]}>Surveys</Text>
        {surveys === null ? (
          <Text style={T.sub}>Loading…</Text>
        ) : surveys.length === 0 ? (
          <Text style={T.sub}>None captured yet.</Text>
        ) : (
          <>
            {shownSurveys.map((s) => (
              <Pressable
                key={s.id}
                onPress={() =>
                  router.push({
                    pathname: '/survey/[id]',
                    params: { id: s.id, ref: references.get(s.id) ?? '' },
                  })
                }
                style={({ pressed }) => [styles.surveyRow, { opacity: pressed ? 0.65 : 1 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={T.mono}>{references.get(s.id) ?? s.id.slice(0, 8)}</Text>
                  <Text style={[T.caption, { marginTop: 2 }]}>
                    {formatCoords(s.latitude, s.longitude)}
                  </Text>
                  <Text style={T.caption}>{new Date(s.capturedAtUtc).toLocaleString()}</Text>
                </View>
                <Chevron />
              </Pressable>
            ))}
            {surveys.length > 20 ? (
              <Pressable onPress={() => setShowAllSurveys((v) => !v)} style={styles.more}>
                <Text style={T.link}>{showAllSurveys ? 'Show fewer' : `Show all ${surveys.length} surveys`}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Button title="Capture photo" onPress={() => router.push(`/capture?projectId=${project.id}`)} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.ink46,
    marginTop: 6,
    marginBottom: 8,
    fontFamily: Fonts.sans,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Tinted while the signed URL and the image itself load, so a tile is a tile from the first frame
  // rather than a hole with a status dot floating in it.
  cell: { width: '31.7%', aspectRatio: 1, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: C.hatchA },
  cellImage: { width: '100%', height: '100%', borderRadius: Radius.md },
  cellLabelWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  cellLabel: { fontFamily: Fonts.mono, fontSize: 9, color: C.hatchInk, textAlign: 'center', lineHeight: 12 },
  dot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  more: { paddingVertical: 12, alignItems: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  tick: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tickEmpty: { borderWidth: 1.6, borderColor: C.line80 },
  card: { borderWidth: 1, borderColor: C.line90, borderRadius: Radius.xl, padding: 16, marginBottom: 16 },
  layerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  dataButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  dataButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: C.accentTint,
  },
  dataButtonText: { fontSize: 13, fontWeight: '600', color: C.accentText, fontFamily: Fonts.sans },
  styleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  surveyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
  },
  cta: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.line92,
    backgroundColor: C.surface,
  },
}));
