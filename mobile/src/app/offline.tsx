import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, ErrorNote, Field, FieldFrame, Header, InfoNote, useT } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/api';
import { storageDir, useGis } from '@/lib/gis';
import { getMapLibre } from '@/lib/native';
import { STREET_STYLE_URL, notifyPacksChanged, refreshSavedBasemap, releaseDate } from '@/lib/offline-map';
import { useSettings } from '@/lib/settings';
import { getLastViewport, requestMapFocus } from '@/lib/viewport';

/** OpenFreeMap's vector tiles stop at z14; deeper zooms are drawn from those, so none are fetched. */
const VECTOR_MAX_ZOOM = 14;
/** MapLibre's own ceiling on tiles per pack. */
const TILE_LIMIT = 6000;
const CACHE_SIZES = [100, 200, 500, 1000];

function tileCount(bounds: [number, number, number, number], minZoom: number, maxZoom: number): number {
  const [w, s, e, n] = bounds;
  const x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const y = (lat: number, z: number) => {
    const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };
  let total = 0;
  for (let z = minZoom; z <= Math.min(maxZoom, VECTOR_MAX_ZOOM); z++) {
    total += (x(e, z) - x(w, z) + 1) * (y(s, z) - y(n, z) + 1);
  }
  return total;
}

/**
 * Stored with a downloaded area: its name and date, the zoom range, and the tile address of the
 * map-data release it holds. The map needs that address to find these tiles once OpenFreeMap has
 * moved on to a newer release (see lib/offline-map.ts).
 */
function packMetadata(name: string, template: string, minZoom: number, maxZoom: number): Record<string, unknown> {
  const now = Date.now();
  return { name: name.trim() || `Area ${new Date(now).toLocaleDateString()}`, createdAt: now, template, minZoom, maxZoom };
}

/** Roughly the zoom that frames `bounds` on a phone screen, as the Map tab would have shown it. */
function framingZoom(bounds: [number, number, number, number]): number {
  const span = Math.max(bounds[2] - bounds[0], 1e-6);
  return Math.log2(281 / span);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} kB`;
}

interface PackRow {
  id: string;
  name: string;
  bounds: [number, number, number, number];
  percentage: number;
  state: string;
  size: number;
  /** Null for areas downloaded before releases were recorded; the map cannot rely on those offline. */
  template: string | null;
}

/**
 * Maps without a connection (spec 3.1), three ways:
 *
 *  1. **Downloaded areas** — MapLibre offline packs of the street basemap for a chosen area, kept
 *     in its tile database (SQLite, the same idea as MBTiles) until deleted.
 *  2. **The tile cache** — every tile viewed is kept, street and satellite alike, up to a size the
 *     surveyor sets; ground looked at with signal is still there without it.
 *  3. **MBTiles basemaps** — a raster .mbtiles file made elsewhere (QGIS "Generate XYZ tiles", or a
 *     licensed imagery provider) and copied to the phone, drawn straight from the file.
 *
 * Satellite imagery is not bulk-downloaded: Esri's terms do not allow harvesting World Imagery for
 * offline use. Viewed satellite tiles stay in the cache, and MBTiles is the licensed route.
 */
export default function OfflineScreen() {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gis = useGis();
  const { settings, update } = useSettings();
  const lib = getMapLibre();
  const view = getLastViewport();

  const [packs, setPacks] = useState<PackRow[]>([]);
  const [name, setName] = useState('');
  const [maxZoom, setMaxZoom] = useState(14);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const minZoom = view ? Math.max(0, Math.min(10, Math.floor(view.zoom) - 3)) : 8;
  const estimate = view ? tileCount(view.bounds, minZoom, maxZoom) : 0;

  const refresh = useCallback(async () => {
    if (!lib) return;
    try {
      const list = await lib.OfflineManager.getPacks();
      const rows = await Promise.all(
        list.map(async (p) => {
          const s = await p.status().catch(() => null);
          return {
            id: p.id,
            name: typeof p.metadata?.name === 'string' ? p.metadata.name : 'Offline area',
            bounds: p.bounds,
            percentage: s?.percentage ?? 0,
            state: s?.state ?? 'inactive',
            size: s?.completedResourceSize ?? 0,
            template: typeof p.metadata?.template === 'string' ? p.metadata.template : null,
          };
        }),
      );
      setPacks(rows);
    } catch (e) {
      setError(errorMessage(e, 'Could not read the downloaded areas.'));
    }
  }, [lib]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  /** Starts downloading one area of the street map, tagged with the map-data release it holds. */
  const startPack = async (areaName: string, bounds: [number, number, number, number], fromZoom: number, toZoom: number) => {
    if (!lib) throw new Error('Offline maps are unavailable in this build.');
    // Fetched now, at the same moment as the download, so the recorded tile address is the one
    // the download is about to use.
    const saved = await refreshSavedBasemap().catch(() => null);
    const template = saved?.source?.template;
    if (!template) throw new Error("Couldn't reach the map server. Connect to the internet and try again.");
    const pack = await lib.OfflineManager.createPack(
      {
        mapStyle: STREET_STYLE_URL.light,
        bounds,
        minZoom: fromZoom,
        maxZoom: toZoom,
        metadata: packMetadata(areaName, template, fromZoom, toZoom),
      },
      (_pack, status) => {
        setPacks((prev) => prev.map((p) => (p.id === status.id ? { ...p, percentage: status.percentage, state: status.state, size: status.completedResourceSize } : p)));
        if (status.state === 'complete') void refresh();
      },
      (_pack, err) => setError(`Download problem: ${err.message}`),
    );
    notifyPacksChanged();
    return pack;
  };

  const download = async () => {
    if (!lib || !view) return;
    setError(null);
    setNotice(null);
    if (estimate > TILE_LIMIT) {
      setError(`That is about ${estimate.toLocaleString()} tiles — over the ${TILE_LIMIT.toLocaleString()} limit. Zoom the map in to a smaller area, or lower the detail.`);
      return;
    }
    setBusy('Starting download…');
    try {
      await startPack(name, view.bounds, minZoom, maxZoom);
      setName('');
      setNotice('Downloading. It continues while you use the app; keep GeoFold open until it completes.');
      await refresh();
    } catch (e) {
      setError(errorMessage(e, 'Could not start the download.'));
    } finally {
      setBusy(null);
    }
  };

  /**
   * An area downloaded before releases were recorded is fetched again, at the current release, so
   * the map knows which tiles it holds. The new copy starts before the old one is deleted, so a
   * failed start leaves the old copy in place.
   */
  const redownload = async (p: PackRow) => {
    if (!lib) return;
    setError(null);
    setNotice(null);
    const fromZoom = Math.max(0, Math.min(10, Math.floor(framingZoom(p.bounds)) - 3));
    const toZoom = [14, 13, 12].find((z) => tileCount(p.bounds, fromZoom, z) <= TILE_LIMIT) ?? 12;
    setBusy(`Downloading "${p.name}" again…`);
    try {
      await startPack(p.name, p.bounds, fromZoom, toZoom);
      await lib.OfflineManager.deletePack(p.id);
      notifyPacksChanged();
      setNotice(`"${p.name}" is downloading again. Keep GeoFold open until it completes.`);
      await refresh();
    } catch (e) {
      setError(errorMessage(e, 'Could not download the area again.'));
    } finally {
      setBusy(null);
    }
  };

  const importMbtiles = async () => {
    setError(null);
    setNotice(null);
    const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
    if (picked.canceled || !picked.result) return;
    const source = picked.result;
    if (!/\.mbtiles$/i.test(source.name)) {
      setError('Pick a .mbtiles file.');
      return;
    }
    setBusy('Copying the MBTiles file…');
    try {
      const target = new File(storageDir('basemaps'), `${randomUUID()}.mbtiles`);
      await source.copy(target);
      // Sixteen bytes through a handle — these files run to hundreds of megabytes.
      const handle = target.open();
      const head = handle.readBytes(16);
      handle.close();
      if (String.fromCharCode(...head).indexOf('SQLite format 3') !== 0) {
        target.delete();
        throw new Error('That file is not an MBTiles (SQLite) database.');
      }
      gis.addBasemap({
        name: source.name.replace(/\.mbtiles$/i, ''),
        uri: target.uri,
        visible: true,
        opacity: 1,
        sizeBytes: target.size ?? 0,
      });
      setNotice('Added. It is drawn above the basemap; raster MBTiles (PNG/JPEG/WebP tiles) are supported.');
    } catch (e) {
      setError(errorMessage(e, 'Could not add that file.'));
    } finally {
      setBusy(null);
    }
  };

  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
        <Header title="Offline maps" onBack={() => router.back()} />
        <View style={{ padding: 20 }}>
          <InfoNote message="Offline maps are available on the Android and iOS builds." tone="warn" />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <Header title="Offline maps" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <ErrorNote message={error} />
        <InfoNote message={notice} tone="ok" />

        <Text style={[T.section, { marginBottom: 4 }]}>Download an area</Text>
        <Text style={[T.sub, { marginBottom: 12 }]}>
          {view
            ? 'The street map of the area last shown on the Map tab, kept on this phone until you delete it.'
            : 'Open the Map tab and frame the area first — the download covers what the map shows.'}
        </Text>
        {view ? (
          <View style={styles.card}>
            <Text style={styles.mono}>
              {`${view.bounds[1].toFixed(4)}, ${view.bounds[0].toFixed(4)} → ${view.bounds[3].toFixed(4)}, ${view.bounds[2].toFixed(4)}`}
            </Text>
            <Field label="Name" value={name} onChangeText={setName} placeholder="Desa Sungai Ambawang" />
            <FieldFrame label="Detail" hint={`About ${estimate.toLocaleString()} tiles, zoom ${minZoom}–${Math.min(maxZoom, VECTOR_MAX_ZOOM)}.`}>
              <View style={styles.chips}>
                {[12, 13, 14].map((z) => (
                  <Chip key={z} label={z === 14 ? 'Full detail' : `Zoom ${z}`} small active={maxZoom === z} onPress={() => setMaxZoom(z)} />
                ))}
              </View>
            </FieldFrame>
            <Button title={busy ?? 'Download this area'} busy={!!busy} onPress={() => void download()} disabled={!lib} />
          </View>
        ) : null}

        <Text style={[T.section, { marginTop: 6, marginBottom: 10 }]}>Downloaded areas</Text>
        {packs.length === 0 ? (
          <Text style={[T.sub, { marginBottom: 16 }]}>None yet.</Text>
        ) : (
          packs.map((p) => (
            <View key={p.id} style={styles.packRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={T.body} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={T.caption}>
                  {[
                    p.state === 'complete' ? `Ready · ${formatBytes(p.size)}` : `${Math.round(p.percentage)}% · ${formatBytes(p.size)}`,
                    releaseDate(p.template) ? `map of ${releaseDate(p.template)!.toLocaleDateString()}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {p.template === null ? (
                  <Pressable onPress={() => void redownload(p)} disabled={!!busy} hitSlop={6}>
                    <Text style={[T.caption, { color: C.warn, marginTop: 2 }]}>
                      Downloaded with an older version of the app, so it may not show offline. Tap to download it again.
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                onPress={() => {
                  requestMapFocus({ kind: 'bounds', bounds: p.bounds });
                  router.navigate('/(tabs)');
                }}
                hitSlop={6}>
                <Text style={T.link}>Show</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert('Delete this area?', `"${p.name}" will no longer be available offline.`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () =>
                        void lib?.OfflineManager.deletePack(p.id)
                          .then(() => {
                            notifyPacksChanged();
                            return refresh();
                          })
                          .catch(() => {}),
                    },
                  ])
                }
                hitSlop={6}>
                <Text style={[T.link, { color: C.danger }]}>Delete</Text>
              </Pressable>
            </View>
          ))
        )}

        <Text style={[T.section, { marginTop: 18, marginBottom: 4 }]}>Tile cache</Text>
        <Text style={[T.sub, { marginBottom: 12 }]}>
          Street and satellite tiles you have viewed are kept for use without a connection, up to this size.
        </Text>
        <View style={styles.chips}>
          {CACHE_SIZES.map((mb) => (
            <Chip key={mb} label={mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`} small active={settings.tileCacheMb === mb} onPress={() => update({ tileCacheMb: mb })} />
          ))}
        </View>
        <Button
          title="Clear cached tiles"
          variant="outline"
          size="sm"
          style={{ marginTop: 12, marginBottom: 8 }}
          onPress={() =>
            Alert.alert('Clear the tile cache?', 'Downloaded areas are kept; only tiles cached while browsing are removed.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: () => void lib?.OfflineManager.clearAmbientCache().catch(() => {}) },
            ])
          }
        />

        <Text style={[T.section, { marginTop: 18, marginBottom: 4 }]}>MBTiles basemaps</Text>
        <Text style={[T.sub, { marginBottom: 12 }]}>
          A raster .mbtiles file — orthophoto, drone mosaic, licensed imagery — drawn over the basemap, fully offline.
        </Text>
        {gis.basemaps.map((b) => (
          <View key={b.id} style={styles.card}>
            <View style={styles.packRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={T.body} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={T.caption}>{formatBytes(b.sizeBytes)}</Text>
              </View>
              <Switch
                value={b.visible}
                onValueChange={(v) => gis.updateBasemap(b.id, { visible: v })}
                trackColor={{ true: C.accent, false: C.line85 }}
                thumbColor="#fff"
              />
            </View>
            <View style={[styles.chips, { marginTop: 8 }]}>
              {[0.5, 0.75, 1].map((o) => (
                <Chip key={o} label={`${Math.round(o * 100)}%`} small active={b.opacity === o} onPress={() => gis.updateBasemap(b.id, { opacity: o })} />
              ))}
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() =>
                  Alert.alert('Remove basemap?', `"${b.name}" will be deleted from this device.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => gis.deleteBasemap(b.id) },
                  ])
                }
                hitSlop={6}>
                <Text style={[T.link, { color: C.danger }]}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}
        <Button title="Add an MBTiles file" variant="outline" onPress={() => void importMbtiles()} disabled={!!busy} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  card: { borderWidth: 1, borderColor: C.line90, borderRadius: Radius.xl, padding: 14, marginBottom: 14 },
  mono: { fontSize: 12, color: C.ink46, marginBottom: 12, fontFamily: Fonts.mono },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
  },
}));
