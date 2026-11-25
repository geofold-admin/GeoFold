import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Empty } from '../ui';
import { Fonts, Radius, makeStyles, useColors, useTheme } from '@/constants/theme';
import { boundsOf, type Position } from '@/lib/geometry';
import { DEV_BUILD_REQUIRED, getMapLibre } from '@/lib/native';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_URL_DARK = 'https://tiles.openfreemap.org/styles/dark';
const SATELLITE = 'satellite';

type Corners = [Position, Position, Position, Position];
const OPACITIES = [0.35, 0.6, 0.85, 1];

/**
 * Pinning an image overlay onto the ground by hand (spec 1.5) — or nudging a georeferenced one
 * that sits a little off. The image is drawn live under four draggable corner handles and a centre
 * handle that moves it whole; corners move independently, so a photographed paper map that is
 * skewed or rotated can still be laid square on the real roads.
 *
 * Satellite imagery is offered underneath because matching a scanned plan to the ground is done
 * by eye against field boundaries and rivers, which a street map does not show.
 */
export function OverlayEditor({
  uri,
  initial,
  initialOpacity,
  onSave,
  onCancel,
}: {
  uri: string;
  initial: Corners;
  initialOpacity: number;
  onSave: (corners: Corners, opacity: number) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const C = useColors();
  const { dark } = useTheme();
  const insets = useSafeAreaInsets();
  const [corners, setCorners] = useState<Corners>(initial);
  const [opacity, setOpacity] = useState(initialOpacity);
  const [basemap, setBasemap] = useState<'street' | typeof SATELLITE>(SATELLITE);

  // Fitted once to where the image starts; moving handles never moves the camera.
  const startBounds = useMemo(() => boundsOf(initial), [initial]);
  const center = useMemo<Position>(
    () => [(corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4, (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4],
    [corners],
  );

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return (
      <View style={styles.fallback}>
        <Empty>Placing overlays needs the map, which is available on the Android and iOS builds.</Empty>
      </View>
    );
  }
  const lib = getMapLibre();
  if (!lib) {
    return (
      <View style={styles.fallback}>
        <Empty>{`The map is unavailable. ${DEV_BUILD_REQUIRED}`}</Empty>
      </View>
    );
  }
  const { Map, Camera, ImageSource, Layer, ViewAnnotation } = lib;

  const satelliteStyle = {
    version: 8 as const,
    sources: {
      esri: {
        type: 'raster' as const,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 18,
        attribution: 'Tiles © Esri — Esri, Maxar, Earthstar Geographics',
      },
    },
    layers: [{ id: 'esri', type: 'raster' as const, source: 'esri' }],
  };

  const dragCorner = (i: number) => (event: { nativeEvent: { lngLat: [number, number] } }) => {
    const ll = event.nativeEvent.lngLat;
    if (!Array.isArray(ll) || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return;
    setCorners((prev) => {
      const next = [...prev] as Corners;
      next[i] = [ll[0], ll[1]];
      return next;
    });
  };

  const dragCenter = (event: { nativeEvent: { lngLat: [number, number] } }) => {
    const ll = event.nativeEvent.lngLat;
    if (!Array.isArray(ll) || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return;
    const dx = ll[0] - center[0];
    const dy = ll[1] - center[1];
    setCorners((prev) => prev.map(([x, y]) => [x + dx, y + dy]) as Corners);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map
        mapStyle={basemap === SATELLITE ? satelliteStyle : dark ? STYLE_URL_DARK : STYLE_URL}
        style={StyleSheet.absoluteFill}
        logo={false}
        attribution
        compass={false}>
        {startBounds ? (
          <Camera bounds={startBounds} padding={{ top: insets.top + 80, bottom: 200, left: 40, right: 40 }} duration={0} />
        ) : null}
        <ImageSource id="edit-overlay" url={uri} coordinates={corners}>
          <Layer id="edit-overlay-layer" type="raster" paint={{ 'raster-opacity': opacity, 'raster-fade-duration': 0 }} />
        </ImageSource>
        {corners.map((c, i) => (
          <ViewAnnotation key={`corner-${i}`} id={`corner-${i}`} lngLat={c} anchor="center" draggable onDragEnd={dragCorner(i)}>
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>
          </ViewAnnotation>
        ))}
        <ViewAnnotation key="center" id="center" lngLat={center} anchor="center" draggable onDragEnd={dragCenter}>
          <View style={styles.handleWrap}>
            <View style={styles.centerHandle}>
              <Text style={styles.centerGlyph}>✥</Text>
            </View>
          </View>
        </ViewAnnotation>
      </Map>

      <View style={[styles.topCard, { top: insets.top + 12 }]}>
        <Text style={styles.topText}>Drag the corners onto matching ground features. Drag the centre to move it whole.</Text>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.row}>
          <Text style={styles.label}>Opacity</Text>
          {OPACITIES.map((o) => (
            <Pressable key={o} onPress={() => setOpacity(o)} style={[styles.chip, opacity === o && { backgroundColor: C.accent }]}>
              <Text style={[styles.chipText, opacity === o && { color: '#fff' }]}>{`${Math.round(o * 100)}%`}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Beneath</Text>
          {(['street', SATELLITE] as const).map((b) => (
            <Pressable key={b} onPress={() => setBasemap(b)} style={[styles.chip, basemap === b && { backgroundColor: C.accent }]}>
              <Text style={[styles.chipText, basemap === b && { color: '#fff' }]}>{b === 'street' ? 'Street' : 'Satellite'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.row, { marginTop: 6 }]}>
          <Pressable onPress={onCancel} style={[styles.button, styles.buttonOutline]}>
            <Text style={styles.buttonOutlineText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={() => setCorners(initial)} style={[styles.button, styles.buttonOutline]}>
            <Text style={styles.buttonOutlineText}>Reset</Text>
          </Pressable>
          <Pressable onPress={() => onSave(corners, opacity)} style={[styles.button, { backgroundColor: C.accent, flex: 1.4 }]}>
            <Text style={styles.buttonText}>Save placement</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  fallback: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: C.surface },
  handleWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  handle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffd60a',
    borderWidth: 3,
    borderColor: '#10171c',
  },
  centerHandle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(16,23,28,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  centerGlyph: { color: '#fff', fontSize: 18, lineHeight: 22 },
  topCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(16,23,28,0.78)',
    borderRadius: Radius.md,
    padding: 12,
  },
  topText: { color: '#fff', fontSize: 13, lineHeight: 18, fontFamily: Fonts.sans },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { width: 64, fontSize: 12, color: C.ink55, fontFamily: Fonts.sans },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: C.bg95 },
  chipText: { fontSize: 12, fontWeight: '600', color: C.ink46, fontFamily: Fonts.sans },
  button: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: Radius.md },
  buttonOutline: { borderWidth: 1, borderColor: C.line88 },
  buttonOutlineText: { fontSize: 14, fontWeight: '500', color: C.ink30, fontFamily: Fonts.sans },
  buttonText: { fontSize: 14, fontWeight: '600', color: '#fff', fontFamily: Fonts.sans },
}));
