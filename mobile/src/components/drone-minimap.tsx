import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { getMapLibre } from '@/lib/native';

/**
 * The aircraft's position, as a small map that sits on top of the live camera feed.
 *
 * Deliberately **not** `SurveyMap`. That component carries a basemap toggle, a ruler, the survey
 * grid and its panels, all sized against the safe area for a full screen — none of which belongs
 * in a 250 px box over a video feed, and its chrome would cover the feed it is floating on.
 *
 * Two things here are load-bearing and neither is obvious:
 *
 * 1. **`androidView="texture"`.** MapLibre renders to a `GLSurfaceView` by default on Android, and
 *    the camera feed underneath is itself a `SurfaceView`. Two surfaces in one window are composited
 *    by SurfaceFlinger *outside* the view hierarchy, so their z-order is not the hierarchy's — the
 *    map would either vanish behind the video or punch a hole through it, with nothing in the log.
 *    A `TextureView` draws inside the hierarchy like an ordinary view, so it stacks the way the JSX
 *    says it does. This costs some rendering performance, which for a map this size is nothing.
 * 2. **`pointerEvents="none"`.** v11 exposes no props to disable panning or zooming, and a pilot
 *    who nudges the minimap while reaching for the shutter would drag it off the aircraft with no
 *    way back. Refusing touches outright is what makes it a readout rather than a map.
 */

/** Light, low-chroma basemap — the same tiles the survey map uses. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/** Roughly central Kalimantan, so the box shows somewhere meaningful before a fix arrives. */
const FALLBACK_CENTER: [number, number] = [111.284, -0.0376];

export interface MinimapPoint {
  id: string;
  latitude: number;
  longitude: number;
  /** Queued locally rather than confirmed by the server — drawn in the pending colour. */
  pending?: boolean;
}

/** Same guard as the survey map: `NaN` passes a null check and then kills the native renderer. */
function isCoord(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' && typeof longitude === 'number' &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  );
}

export function DroneMinimap({
  latitude,
  longitude,
  heading,
  points = [],
  path = [],
}: {
  latitude: number | null;
  longitude: number | null;
  /** Compass heading in degrees; rotates the aircraft mark. Null leaves it pointing north. */
  heading: number | null;
  points?: MinimapPoint[];
  /** The planned route, drawn as a line so the pattern is readable at a glance. */
  path?: { latitude: number; longitude: number }[];
}) {
  const styles = useStyles();
  const C = useColors();
  const hasFix = isCoord(latitude, longitude);

  // Memoised on the numbers, not on an array literal: `Camera` is memo'd on prop identity, so a
  // fresh `[lng, lat]` built during render re-flies the camera on every re-render — and telemetry
  // re-renders this screen several times a second.
  const center = useMemo<[number, number]>(
    () => (hasFix ? [longitude as number, latitude as number] : FALLBACK_CENTER),
    [hasFix, latitude, longitude],
  );

  const plottable = useMemo(
    () => points.filter((p) => isCoord(p.latitude, p.longitude)),
    [points],
  );

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return <View style={styles.fallback}><Text style={styles.fallbackText}>Map unavailable</Text></View>;
  }

  const lib = getMapLibre();
  if (!lib) {
    return <View style={styles.fallback}><Text style={styles.fallbackText}>Map unavailable</Text></View>;
  }

  // `GeoJSONSource` + `Layer`, the same pair the survey map uses — v11 has no ShapeSource/LineLayer.
  const { Map, Camera, Marker, GeoJSONSource, Layer } = lib;

  // GeoJSON rather than a stack of markers: a 99-point route as 99 views would cost more to render
  // than the map underneath it, and a line is what makes the pattern legible anyway.
  const route =
    path.length > 1
      ? ({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: path
                  .filter((p) => isCoord(p.latitude, p.longitude))
                  .map((p) => [p.longitude, p.latitude]),
              },
            },
          ],
        } as GeoJSON.FeatureCollection)
      : null;

  return (
    <View style={styles.frame}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Map
          mapStyle={STYLE_URL}
          style={StyleSheet.absoluteFill}
          androidView="texture"
          attribution={false}
          logo={false}
          compass={false}>
          <Camera center={center} zoom={16} duration={400} maxZoom={20} minZoom={2} />

          {route ? (
            <GeoJSONSource id="mission-route" data={route}>
              {/* `paint`, not the deprecated `style` prop — that one goes away in MapLibre RN v12. */}
              <Layer
                id="mission-route-line"
                type="line"
                paint={{ 'line-color': C.accent, 'line-width': 2, 'line-opacity': 0.9 }}
              />
            </GeoJSONSource>
          ) : null}

          {/* Points already captured this flight, so the pilot can see the pattern being flown
              rather than only the aircraft. */}
          {plottable.map((point) => (
            <Marker
              key={point.id}
              id={point.id}
              lngLat={[point.longitude, point.latitude]}
              anchor="center">
              <View style={[styles.point, point.pending ? styles.pointPending : null]} />
            </Marker>
          ))}

          {/* The aircraft. Drawn last so it stays above the captured points. */}
          {hasFix && (
            <Marker key="aircraft" id="aircraft" lngLat={center} anchor="center">
              <View style={styles.aircraftWrap}>
                <View
                  style={[
                    styles.aircraft,
                    // Heading is degrees clockwise from north, which is what a CSS rotation of the
                    // same sign gives — the mark points where the nose points.
                    { transform: [{ rotate: `${heading ?? 0}deg` }] },
                  ]}
                />
              </View>
            </Marker>
          )}
        </Map>
      </View>

      {!hasFix && (
        <View style={styles.noFix} pointerEvents="none">
          <Text style={styles.noFixText}>No GPS fix</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  frame: {
    flex: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  fallback: {
    flex: 1,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: Fonts.sans },
  aircraftWrap: { alignItems: 'center', justifyContent: 'center', width: 28, height: 28 },
  // A triangle from a border trick — a nose direction reads instantly where a dot does not.
  aircraft: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: C.accent,
  },
  point: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.ok,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  pointPending: { backgroundColor: C.warn },
  noFix: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  noFixText: { color: '#fff', fontSize: 10, fontFamily: Fonts.mono },
}));
