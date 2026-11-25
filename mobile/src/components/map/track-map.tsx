import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Empty } from '../ui';
import { makeStyles, useTheme } from '@/constants/theme';
import { boundsOf, type Position } from '@/lib/geometry';
import { DEV_BUILD_REQUIRED, getMapLibre } from '@/lib/native';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_URL_DARK = 'https://tiles.openfreemap.org/styles/dark';

/**
 * One GPS track on a small map, with a cursor at the moment picked on the timeline. Fitted to the
 * track once; the cursor moves without moving the camera, so scrubbing reads as movement.
 */
export function TrackMap({ coordinates, cursor }: { coordinates: Position[]; cursor: Position | null }) {
  const styles = useStyles();
  const { dark } = useTheme();

  const bounds = useMemo(() => boundsOf(coordinates), [coordinates]);
  const line = useMemo<GeoJSON.Feature>(
    () => ({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} }),
    [coordinates],
  );
  const ends = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: coordinates.length
        ? [
            { type: 'Feature', geometry: { type: 'Point', coordinates: coordinates[0] }, properties: { end: 'start' } },
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: coordinates[coordinates.length - 1] },
              properties: { end: 'finish' },
            },
          ]
        : [],
    }),
    [coordinates],
  );

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return (
      <View style={styles.fallback}>
        <Empty>The map is available on the iOS and Android builds.</Empty>
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
  const { Map, Camera, GeoJSONSource, Layer, Marker } = lib;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map mapStyle={dark ? STYLE_URL_DARK : STYLE_URL} style={StyleSheet.absoluteFill} logo={false} attribution compass={false}>
        {bounds ? (
          <Camera
            bounds={bounds}
            padding={{ top: 36, bottom: 36, left: 36, right: 36 }}
            duration={0}
            maxZoom={19}
          />
        ) : null}
        {coordinates.length > 1 ? (
          <GeoJSONSource id="track-line" data={line}>
            <Layer
              id="track-line-layer"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#e5484d', 'line-width': 4 }}
            />
          </GeoJSONSource>
        ) : null}
        <GeoJSONSource id="track-ends" data={ends}>
          <Layer
            id="track-ends-layer"
            type="circle"
            paint={{
              'circle-radius': 6,
              'circle-color': ['case', ['==', ['get', 'end'], 'start'], '#2e9b4f', '#1f2937'],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            }}
          />
        </GeoJSONSource>
        {cursor ? (
          <Marker id="track-cursor" lngLat={cursor} anchor="center">
            <View style={styles.cursor} />
          </Marker>
        ) : null}
      </Map>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  fallback: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: C.surface },
  cursor: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.accent,
    borderWidth: 3,
    borderColor: '#fff',
  },
}));
