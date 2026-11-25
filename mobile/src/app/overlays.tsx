import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageIcon } from '@/components/icons';
import { OverlayEditor } from '@/components/map/overlay-editor';
import { Button, Chip, ErrorNote, Field, Header, InfoNote, Loading, useT } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/api';
import { latin1Decode } from '@/lib/bytes';
import { boundsOf, type Position } from '@/lib/geometry';
import { geoPdfPlacement, readGeoPdf } from '@/lib/geopdf';
import {
  imageSize,
  looksGeographic,
  parseWorldFile,
  placeInView,
  storeOverlayImage,
  worldFileCorners,
  type WorldFile,
} from '@/lib/georef';
import { useGis, type MapOverlay } from '@/lib/gis';
import { PDF_RENDER_AVAILABLE, renderPdfPage } from '@/lib/pdf-render';
import { parsePrj } from '@/lib/projection';
import { getLastViewport, requestMapFocus } from '@/lib/viewport';

type Corners = [Position, Position, Position, Position];

const OPACITIES = [0.35, 0.6, 0.85, 1];
const IMAGE_EXT = /\.(png|jpe?g)$/i;
const WORLD_EXT = /\.(pgw|pngw|jgw|jpgw|jpegw|wld)$/i;

/** A picked file copied into the cache under its own name — native readers want a file:// path. */
async function toCache(file: File): Promise<{ uri: string; name: string; bytes: Uint8Array }> {
  const bytes = await file.bytes();
  const local = new File(Paths.cache, `import-${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`);
  if (local.exists) local.delete();
  local.create();
  local.write(bytes);
  return { uri: local.uri, name: file.name, bytes };
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, '');

/**
 * Georeferenced map overlays (spec 1.5): raster maps laid onto the map in their true position,
 * the way Avenza does it — a GeoPDF reads its own georeferencing, a PNG/JPEG reads its world file,
 * and anything else can be pinned by hand. Overlays are stored on the device and work offline.
 */
export default function OverlaysScreen() {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const gis = useGis();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<MapOverlay | null>(null);
  /** A world file in projected units with no .prj: waiting for the surveyor to name the UTM zone. */
  const [needZone, setNeedZone] = useState<{ name: string; uri: string; wf: WorldFile; width: number; height: number } | null>(null);
  const [zone, setZone] = useState('49');
  const [south, setSouth] = useState(true);

  const fail = (e: unknown, fallback: string) => setError(errorMessage(e, fallback));

  const finish = (overlay: MapOverlay, message: string) => {
    setNotice(message);
    const b = boundsOf(overlay.corners);
    if (b) requestMapFocus({ kind: 'bounds', bounds: b });
  };

  const addGeoPdf = async () => {
    setError(null);
    setNotice(null);
    const picked = await File.pickFileAsync({ mimeTypes: 'application/pdf' });
    if (picked.canceled || !picked.result) return;
    setBusy('Reading the PDF…');
    try {
      const pdf = await toCache(picked.result);
      const info = readGeoPdf(pdf.bytes);
      setBusy('Rendering the map page…');
      const page = await renderPdfPage(pdf.uri, 0, 4096);
      const placement = geoPdfPlacement(info, page);
      const stored = await storeOverlayImage(page.uri, placement.crop);
      const overlay = gis.addOverlay({
        name: baseName(pdf.name),
        uri: stored.uri,
        corners: placement.corners,
        opacity: 0.85,
        visible: true,
        source: 'geopdf',
        width: stored.width,
        height: stored.height,
      });
      finish(overlay, `"${overlay.name}" placed from its GeoPDF georeferencing${info.crs ? ` (${info.crs})` : ''}.`);
    } catch (e) {
      fail(e, 'Could not read that PDF.');
    } finally {
      setBusy(null);
    }
  };

  const addWithWorldFile = async () => {
    setError(null);
    setNotice(null);
    const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: '*/*' });
    if (picked.canceled || !picked.result?.length) return;
    setBusy('Reading the image…');
    try {
      const image = picked.result.find((f) => IMAGE_EXT.test(f.name));
      const world = picked.result.find((f) => WORLD_EXT.test(f.name));
      const prjFile = picked.result.find((f) => /\.prj$/i.test(f.name));
      if (!image) throw new Error('Pick the PNG or JPEG image together with its world file.');
      if (!world) throw new Error('No world file (.pgw, .jgw or .wld) was picked with the image. Select both files together.');

      const wf = parseWorldFile(await world.text());
      if (!wf) throw new Error(`${world.name} is not a valid world file (it needs six numbers).`);
      const cached = await toCache(image);
      const { width, height } = await imageSize(cached.uri);
      const projection = prjFile ? parsePrj(latin1Decode(await prjFile.bytes())) : null;
      if (projection?.kind === 'unsupported') throw new Error(`The coordinate system "${projection.name}" is not supported.`);

      let corners = worldFileCorners(wf, width, height, projection);
      if (!projection && !looksGeographic(corners)) {
        // Metres with no .prj: most likely UTM — ask which zone rather than guess.
        setNeedZone({ name: baseName(image.name), uri: cached.uri, wf, width, height });
        return;
      }
      corners = corners.map(([x, y]) => [x, y]) as Corners;
      await placeImage(baseName(image.name), cached.uri, corners, 'worldfile');
    } catch (e) {
      fail(e, 'Could not place that image.');
    } finally {
      setBusy(null);
    }
  };

  const placeImage = async (name: string, uri: string, corners: Corners, source: MapOverlay['source']) => {
    setBusy('Storing the overlay…');
    const stored = await storeOverlayImage(uri);
    const overlay = gis.addOverlay({
      name,
      uri: stored.uri,
      corners,
      opacity: 0.85,
      visible: true,
      source,
      width: stored.width,
      height: stored.height,
    });
    if (source === 'manual') setEditing(overlay);
    else finish(overlay, `"${overlay.name}" placed from its world file.`);
  };

  const confirmZone = async () => {
    if (!needZone) return;
    const z = Number(zone);
    if (!Number.isInteger(z) || z < 1 || z > 60) {
      setError('A UTM zone is a number from 1 to 60 — most of Kalimantan is 49 or 50.');
      return;
    }
    setBusy('Placing…');
    try {
      const projection = parsePrj(
        `PROJCS["WGS_1984_UTM_Zone_${z}${south ? 'S' : 'N'}",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]]],PROJECTION["Transverse_Mercator"],UNIT["Meter",1.0]]`,
      );
      const corners = worldFileCorners(needZone.wf, needZone.width, needZone.height, projection);
      const pending = needZone;
      setNeedZone(null);
      await placeImage(pending.name, pending.uri, corners, 'worldfile');
    } catch (e) {
      fail(e, 'Could not place that image.');
    } finally {
      setBusy(null);
    }
  };

  const addManual = async () => {
    setError(null);
    setNotice(null);
    const picked = await File.pickFileAsync({ mimeTypes: ['image/png', 'image/jpeg'] });
    if (picked.canceled || !picked.result) return;
    setBusy('Reading the image…');
    try {
      const cached = await toCache(picked.result);
      const { width, height } = await imageSize(cached.uri);
      const view = getLastViewport();
      // Dropped onto wherever the map was last looking, then pinned corner by corner.
      const bounds = view?.bounds ?? [111.27, -0.05, 111.3, -0.02];
      await placeImage(baseName(picked.result.name), cached.uri, placeInView(bounds, width, height), 'manual');
    } catch (e) {
      fail(e, 'Could not use that image.');
    } finally {
      setBusy(null);
    }
  };

  const sourceLabel = { geopdf: 'GeoPDF', worldfile: 'World file', manual: 'Placed by hand' };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <Header title="Map overlays" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Text style={[T.sub, { marginBottom: 16 }]}>
          Lay a site plan, a scanned topographic sheet or an exported map onto the map in its true position.
          Overlays are kept on this phone and work without a connection.
        </Text>

        <ErrorNote message={error} />
        <InfoNote message={notice} tone="ok" />

        {needZone ? (
          <View style={styles.card}>
            <Text style={T.section}>Which UTM zone?</Text>
            <Text style={[T.sub, { marginTop: 4, marginBottom: 12 }]}>
              {`"${needZone.name}" has its world file in metres but no .prj to say which projection. Name the UTM zone and it is placed in WGS 84 / UTM.`}
            </Text>
            <Field label="Zone" value={zone} onChangeText={setZone} keyboardType="number-pad" maxLength={2} />
            <View style={styles.chips}>
              <Chip label="Southern (S)" small active={south} onPress={() => setSouth(true)} />
              <Chip label="Northern (N)" small active={!south} onPress={() => setSouth(false)} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Button title="Cancel" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => setNeedZone(null)} />
              <Button title="Place" size="sm" style={{ flex: 1 }} onPress={() => void confirmZone()} />
            </View>
          </View>
        ) : null}

        {busy ? (
          <Loading label={busy} />
        ) : (
          <View style={{ gap: 10, marginBottom: 24 }}>
            <AddButton
              title="GeoPDF"
              detail={PDF_RENDER_AVAILABLE ? 'A PDF map with built-in georeferencing — placed automatically.' : 'Needs the latest GeoFold build.'}
              onPress={() => void addGeoPdf()}
              disabled={!PDF_RENDER_AVAILABLE}
            />
            <AddButton
              title="Image + world file"
              detail="A PNG or JPEG with its .pgw / .jgw (and .prj) — select the files together."
              onPress={() => void addWithWorldFile()}
            />
            <AddButton
              title="Image, placed by hand"
              detail="Any PNG or JPEG — dropped onto the current map view, then pinned corner by corner."
              onPress={() => void addManual()}
            />
          </View>
        )}

        <Text style={[T.section, { marginBottom: 10 }]}>On this device</Text>
        {gis.overlays.length === 0 ? (
          <Text style={T.sub}>No overlays yet.</Text>
        ) : (
          gis.overlays.map((o) => (
            <View key={o.id} style={styles.card}>
              <View style={styles.overlayHead}>
                <Image source={{ uri: o.uri }} style={styles.thumb} contentFit="cover" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={T.body} numberOfLines={1}>
                    {o.name}
                  </Text>
                  <Text style={T.caption}>{`${sourceLabel[o.source]} · ${o.width}×${o.height} px`}</Text>
                </View>
                <Switch
                  value={o.visible}
                  onValueChange={(v) => gis.updateOverlay(o.id, { visible: v })}
                  trackColor={{ true: C.accent, false: C.line85 }}
                  thumbColor="#fff"
                />
              </View>
              <View style={[styles.chips, { marginTop: 12 }]}>
                {OPACITIES.map((op) => (
                  <Chip key={op} label={`${Math.round(op * 100)}%`} small active={o.opacity === op} onPress={() => gis.updateOverlay(o.id, { opacity: op })} />
                ))}
              </View>
              <View style={styles.actions}>
                <Pressable style={styles.action} onPress={() => setEditing(o)}>
                  <Text style={T.link}>Adjust</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={() => {
                    const b = boundsOf(o.corners);
                    if (b) requestMapFocus({ kind: 'bounds', bounds: b });
                    if (!o.visible) gis.updateOverlay(o.id, { visible: true });
                    router.navigate('/(tabs)');
                  }}>
                  <Text style={T.link}>Show on map</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={() =>
                    Alert.alert('Delete overlay?', `"${o.name}" will be removed from this device.`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => gis.deleteOverlay(o.id) },
                    ])
                  }>
                  <Text style={[T.link, { color: C.danger }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        {editing ? (
          <OverlayEditor
            uri={editing.uri}
            initial={editing.corners}
            initialOpacity={editing.opacity}
            onCancel={() => setEditing(null)}
            onSave={(corners, opacity) => {
              gis.updateOverlay(editing.id, { corners, opacity });
              finish({ ...editing, corners }, `"${editing.name}" placed.`);
              setEditing(null);
            }}
          />
        ) : null}
      </Modal>
    </View>
  );
}

function AddButton({ title, detail, onPress, disabled }: { title: string; detail: string; onPress: () => void; disabled?: boolean }) {
  const styles = useStyles();
  const C = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.add, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}
      accessibilityRole="button">
      <View style={styles.addIcon}>
        <ImageIcon color={C.accentText} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.addTitle}>{title}</Text>
        <Text style={styles.addDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((C) => ({
  card: { borderWidth: 1, borderColor: C.line90, borderRadius: Radius.xl, padding: 14, marginBottom: 12 },
  overlayHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: Radius.sm, backgroundColor: C.bg95 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', marginTop: 10, borderTopWidth: 1, borderTopColor: C.line92, paddingTop: 8 },
  action: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: C.line90,
    borderRadius: Radius.lg,
    padding: 14,
  },
  addIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTitle: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: Fonts.sans },
  addDetail: { fontSize: 12, color: C.ink55, marginTop: 2, lineHeight: 17, fontFamily: Fonts.sans },
}));
