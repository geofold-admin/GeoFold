import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chevron, ExportIcon, ImportIcon } from '@/components/icons';
import { Button, Chip, ErrorNote, FieldFrame, Header, InfoNote, Loading, Segmented, useT } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { boundsOf } from '@/lib/geometry';
import { LAYER_COLORS, useGis } from '@/lib/gis';
import {
  buildExport,
  fetchAllSurveys,
  guessNameField,
  pickShapefiles,
  saveToFolder,
  writeZip,
  type ExportPackage,
  type PickedImport,
} from '@/lib/project-data';
import { markBackup, useBackups } from '@/lib/reminders';
import { useSync } from '@/lib/sync-context';
import { loadTrackPoints, useTracker } from '@/lib/tracker';
import type { ProjectResponse } from '@/lib/types';
import { requestMapFocus } from '@/lib/viewport';

type Mode = 'export' | 'import';

/**
 * Shapefile export and import for one project (spec 1.4), and the backup the reminders ask for
 * (spec 3.2). Reached from a project's detail screen, or from the backup reminder with no project
 * chosen yet — in which case it asks which one first.
 */
export default function ProjectDataScreen() {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; mode?: string }>();
  const [projectId, setProjectId] = useState<string | null>(params.id ?? null);
  const [mode, setMode] = useState<Mode>(params.mode === 'import' ? 'import' : 'export');

  const [projects, setProjects] = useState<ProjectResponse[] | null>(null);
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) {
      api<ProjectResponse>(`/api/projects/${projectId}`)
        .then(setProject)
        .catch((e) => setError(errorMessage(e, 'Could not load the project.')));
    } else {
      api<ProjectResponse[]>('/api/projects')
        .then(setProjects)
        .catch((e) => setError(errorMessage(e, 'Could not load projects.')));
    }
  }, [projectId]);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <Header title={project ? project.name : 'Project data'} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <ErrorNote message={error} />

        {!projectId ? (
          <>
            <Text style={[T.section, { marginBottom: 6 }]}>Which project?</Text>
            <Text style={[T.sub, { marginBottom: 14 }]}>Exports and imports are made one project at a time.</Text>
            {projects === null ? (
              <Loading />
            ) : (
              projects.map((p) => (
                <Pressable key={p.id} onPress={() => setProjectId(p.id)} style={({ pressed }) => [styles.pickRow, { opacity: pressed ? 0.6 : 1 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={T.body}>{p.name}</Text>
                    <Text style={T.caption}>{`${p.surveyCount} surveys`}</Text>
                  </View>
                  <Chevron />
                </Pressable>
              ))
            )}
          </>
        ) : !project ? (
          <Loading />
        ) : (
          <>
            <Segmented
              value={mode}
              onChange={(k) => setMode(k as Mode)}
              options={[
                { key: 'export', label: 'Export' },
                { key: 'import', label: 'Import' },
              ]}
            />
            <View style={{ height: 18 }} />
            {mode === 'export' ? <ExportPanel project={project} /> : <ImportPanel project={project} />}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ExportPanel({ project }: { project: ProjectResponse }) {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const gis = useGis();
  const { items } = useSync();
  const tracker = useTracker();
  const backups = useBackups();

  const [includePending, setIncludePending] = useState(true);
  const [includeTracks, setIncludeTracks] = useState(true);
  const [pkg, setPkg] = useState<ExportPackage | null>(null);
  const [busy, setBusy] = useState<'build' | 'share' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const build = useCallback(async () => {
    setBusy('build');
    setError(null);
    try {
      const [surveys, tracks] = await Promise.all([
        fetchAllSurveys(project.id),
        Promise.all(
          tracker.tracks
            .filter((t) => includeTracks && t.projectId === project.id)
            .map(async (meta) => ({ meta, points: await loadTrackPoints(meta.id) })),
        ),
      ]);
      setPkg(
        buildExport({
          project,
          surveys,
          pending: includePending ? items.filter((i) => i.projectId === project.id) : [],
          features: gis.features.filter((f) => f.projectId === project.id),
          layers: gis.layers,
          tracks,
        }),
      );
    } catch (e) {
      setError(errorMessage(e, 'Could not gather the project data.'));
    } finally {
      setBusy(null);
    }
  }, [gis.features, gis.layers, includePending, includeTracks, items, project, tracker.tracks]);

  // Rebuilt whenever an option changes, so the preview is always exactly what will be written.
  useEffect(() => {
    const timer = setTimeout(() => void build(), 0);
    return () => clearTimeout(timer);
  }, [build]);

  const share = async () => {
    if (!pkg) return;
    setBusy('share');
    setError(null);
    try {
      const file = writeZip(pkg);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device. Use "Save to folder" instead.');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: `${project.name} — shapefiles`, UTI: 'public.zip-archive' });
      markBackup(project.id);
      setDone(`Shared ${pkg.baseName}.zip`);
    } catch (e) {
      setError(errorMessage(e, 'Could not share the export.'));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!pkg) return;
    setBusy('save');
    setError(null);
    try {
      const result = await saveToFolder(pkg);
      if (result) {
        markBackup(project.id);
        setDone(`Saved ${result.count} files to "${result.folder}"`);
      }
    } catch (e) {
      setError(errorMessage(e, 'Could not save the files.'));
    } finally {
      setBusy(null);
    }
  };

  const lastExport = backups.projects[project.id];

  return (
    <View>
      <Text style={[T.sub, { marginBottom: 14 }]}>
        One shapefile per layer and geometry type, in WGS 84 with UTF-8 text — opens directly in QGIS,
        ArcGIS and Google Earth Pro. {lastExport ? `Last exported ${new Date(lastExport).toLocaleString()}.` : 'Not exported yet.'}
      </Text>

      <View style={styles.card}>
        <View style={styles.optionRow}>
          <Text style={[T.body, { flex: 1 }]}>Include captures not yet synced</Text>
          <Switch value={includePending} onValueChange={setIncludePending} trackColor={{ true: C.accent, false: C.line85 }} thumbColor="#fff" />
        </View>
        <View style={[styles.optionRow, { borderBottomWidth: 0 }]}>
          <Text style={[T.body, { flex: 1 }]}>Include this project’s GPS tracks</Text>
          <Switch value={includeTracks} onValueChange={setIncludeTracks} trackColor={{ true: C.accent, false: C.line85 }} thumbColor="#fff" />
        </View>
      </View>

      <ErrorNote message={error} />
      <InfoNote message={done} tone="ok" />

      <Text style={[T.section, { marginBottom: 10 }]}>In the package</Text>
      {busy === 'build' || !pkg ? (
        <Loading label="Gathering project data…" />
      ) : pkg.summary.length === 0 ? (
        <Text style={[T.sub, { marginBottom: 16 }]}>Nothing to export yet — no surveys, features or tracks in this project.</Text>
      ) : (
        <View style={[styles.card, { paddingVertical: 4 }]}>
          {pkg.summary.map((s) => (
            <View key={s.file} style={styles.fileRow}>
              <Text style={styles.fileName} numberOfLines={1}>
                {`${s.file}.shp`}
              </Text>
              <Text style={T.caption}>{`${s.count} ${s.kind}${s.count === 1 ? '' : 's'}`}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ gap: 10, marginTop: 6 }}>
        <Pressable
          onPress={() => void share()}
          disabled={!pkg || !pkg.summary.length || !!busy}
          style={({ pressed }) => [styles.bigButton, { opacity: !pkg?.summary.length || busy ? 0.45 : pressed ? 0.85 : 1 }]}>
          <ExportIcon color="#fff" />
          <Text style={styles.bigButtonText}>{busy === 'share' ? 'Preparing…' : 'Share as .zip'}</Text>
        </Pressable>
        <Button
          title={busy === 'save' ? 'Saving…' : 'Save files to a folder'}
          variant="outline"
          onPress={() => void save()}
          disabled={!pkg || !pkg.summary.length || !!busy}
        />
      </View>
    </View>
  );
}

function ImportPanel({ project }: { project: ProjectResponse }) {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const router = useRouter();
  const gis = useGis();

  const [picked, setPicked] = useState<PickedImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ count: number; bounds: [number, number, number, number] | null } | null>(null);
  /** Per shapefile: target layer id ('new' = a new layer named after the file) and name column. */
  const [targets, setTargets] = useState<Record<string, { layer: string; nameField: string | null }>>({});

  const pick = async () => {
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const result = await pickShapefiles();
      if (!result) return;
      setPicked(result);
      setTargets(
        Object.fromEntries(result.results.map((r) => [r.name, { layer: 'new', nameField: guessNameField(r) }])),
      );
    } catch (e) {
      setError(errorMessage(e, 'Could not read those files.'));
    } finally {
      setBusy(false);
    }
  };

  const total = useMemo(() => picked?.results.reduce((s, r) => s + r.features.length, 0) ?? 0, [picked]);

  const commit = () => {
    if (!picked) return;
    let count = 0;
    const all: [number, number][] = [];
    for (const result of picked.results) {
      if (!result.features.length) continue;
      const target = targets[result.name] ?? { layer: 'new', nameField: null };
      const layerId =
        target.layer === 'new'
          ? gis.addLayer(result.name, LAYER_COLORS[(gis.layers.length + count) % LAYER_COLORS.length]).id
          : target.layer;
      count += gis.addFeatures(
        result.features.map((f, i) => {
          const named = target.nameField ? f.attributes[target.nameField] : null;
          all.push(...f.coordinates);
          return {
            layerId,
            projectId: project.id,
            kind: f.kind,
            coordinates: f.coordinates,
            name: named !== null && named !== undefined && named !== '' ? String(named) : `${result.name} ${i + 1}`,
            attributes: f.attributes,
          };
        }),
      );
    }
    setDone({ count, bounds: boundsOf(all) });
    setPicked(null);
  };

  return (
    <View>
      <Text style={[T.sub, { marginBottom: 14 }]}>
        Pick a zipped shapefile, or the .shp together with its .dbf and .prj. Points, lines and polygons
        are supported; WGS 84, UTM, TM-3 and Web Mercator coordinates are converted automatically.
      </Text>

      <ErrorNote message={error} />
      {done ? (
        <View style={{ marginBottom: 16 }}>
          <InfoNote message={`Imported ${done.count} feature${done.count === 1 ? '' : 's'} into this project.`} tone="ok" />
          {done.bounds ? (
            <Button
              title="Show on the map"
              variant="outline"
              onPress={() => {
                requestMapFocus({ kind: 'bounds', bounds: done.bounds! });
                router.navigate('/(tabs)');
              }}
            />
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={() => void pick()}
        disabled={busy}
        style={({ pressed }) => [styles.bigButton, { opacity: busy ? 0.45 : pressed ? 0.85 : 1 }]}>
        <ImportIcon color="#fff" />
        <Text style={styles.bigButtonText}>{busy ? 'Reading…' : picked ? 'Choose other files' : 'Choose files'}</Text>
      </Pressable>

      {picked ? (
        <View style={{ marginTop: 18 }}>
          {picked.ignored.length ? (
            <InfoNote message={`Ignored (not shapefile parts): ${picked.ignored.join(', ')}`} tone="warn" />
          ) : null}
          {picked.results.map((r) => {
            const target = targets[r.name] ?? { layer: 'new', nameField: null };
            const kinds = ['point', 'line', 'polygon']
              .map((k) => [k, r.features.filter((f) => f.kind === k).length] as const)
              .filter(([, n]) => n > 0)
              .map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`)
              .join(', ');
            const fields = Object.keys(r.features[0]?.attributes ?? {});
            return (
              <View key={r.name} style={styles.card}>
                <Text style={T.section}>{r.name}</Text>
                <Text style={[T.caption, { marginTop: 2 }]}>{`${kinds || 'no features'} · ${r.crs}`}</Text>
                {r.warnings.map((w) => (
                  <Text key={w} style={[T.caption, { color: C.warn, marginTop: 6 }]}>
                    {w}
                  </Text>
                ))}
                <View style={{ height: 12 }} />
                <FieldFrame label="Into layer">
                  <View style={styles.chips}>
                    <Chip
                      label={`New "${r.name}"`}
                      small
                      active={target.layer === 'new'}
                      onPress={() => setTargets((t) => ({ ...t, [r.name]: { ...target, layer: 'new' } }))}
                    />
                    {gis.layers.map((l) => (
                      <Chip
                        key={l.id}
                        label={l.name}
                        small
                        active={target.layer === l.id}
                        onPress={() => setTargets((t) => ({ ...t, [r.name]: { ...target, layer: l.id } }))}
                      />
                    ))}
                  </View>
                </FieldFrame>
                {fields.length ? (
                  <FieldFrame label="Name features by">
                    <View style={styles.chips}>
                      {fields.slice(0, 16).map((k) => (
                        <Chip
                          key={k}
                          label={k}
                          small
                          active={target.nameField === k}
                          onPress={() => setTargets((t) => ({ ...t, [r.name]: { ...target, nameField: k } }))}
                        />
                      ))}
                    </View>
                  </FieldFrame>
                ) : null}
              </View>
            );
          })}
          <Button title={`Import ${total} feature${total === 1 ? '' : 's'}`} onPress={commit} disabled={total === 0} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
  },
  card: { borderWidth: 1, borderColor: C.line90, borderRadius: Radius.xl, padding: 14, marginBottom: 14 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
  },
  fileName: { flex: 1, fontSize: 13, color: C.ink30, fontFamily: Fonts.mono },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: C.accent,
    borderRadius: Radius.md,
    paddingVertical: 15,
  },
  bigButtonText: { color: '#fff', fontSize: 15, fontWeight: '600', fontFamily: Fonts.sans },
}));
