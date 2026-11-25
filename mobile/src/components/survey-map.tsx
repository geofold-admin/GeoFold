import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Close, CloudOffIcon, CrosshairIcon, GpsIcon, LayersIcon, RecordDot, RulerIcon, SurveyGridIcon } from './icons';
import { CompassButton, publishBearing } from './map/compass';
import { FeatureSaveSheet } from './map/feature-sheet';
import { LayersSheet } from './map/layers-sheet';
import { MeasurePanel } from './map/measure-panel';
import { MarkerIcon, markerAnchor, markerColor } from './marker-icon';
import { Empty, MapButton } from './ui';
import { Fonts, Radius, makeStyles, useTheme } from '@/constants/theme';
import {
  boundsOf,
  distance,
  formatArea,
  formatLength,
  isPosition,
  type Position,
} from '@/lib/geometry';
import { layerById, useGis, type GeometryKind } from '@/lib/gis';
import {
  CELL_SIZES,
  DEFAULT_CELL_SIZE,
  buildGrid,
  cellId,
  cellIndexAt,
  formatCellSize,
  gridFeatureCollection,
  gridFrame,
  type CellSizeSetting,
  type GridAnchor,
} from '@/lib/grid';
import { DEV_BUILD_REQUIRED, getMapLibre } from '@/lib/native';
import { STREET_STYLE_URL, blankStyle, offlineStreetStyle, useOfflineBasemap, useSettledOnline } from '@/lib/offline-map';
import { markerFor, useSettings } from '@/lib/settings';
import { useSync } from '@/lib/sync-context';
import { useTracker } from '@/lib/tracker';
import type { ProjectResponse } from '@/lib/types';
import { onMapFocusRequest, setLastViewport, takeMapFocus, type FocusRequest } from '@/lib/viewport';
// Type-only imports: erased at compile time, so they do NOT load the native module at runtime and
// are safe in Expo Go (unlike the deferred require in native.ts, which the map itself still needs).
import type {
  CameraRef,
  LngLatBounds,
  MapRef,
  MarkerEvent,
  PressEvent,
  PressEventWithFeatures,
  StyleSpecification,
  ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';

/**
 * The map, rendered with MapLibre over OpenFreeMap tiles.
 *
 * Deliberately not Google Maps: the Android Maps SDK needs an API key from a billing-enabled Google
 * Cloud account. MapLibre is MIT and OpenFreeMap serves vector tiles with no key and no account, so
 * the app has no paid dependency. OpenFreeMap is donation-funded with no SLA — fine here, but a
 * production deployment should self-host tiles or use a paid provider.
 *
 * Everything MapLibre-shaped lives in this file and `components/map/` so the rest of the app never
 * imports it directly — see `lib/native.ts` for why that matters.
 *
 * LAYER ORDER. MapLibre stacks layers in the order they are *added*, and a layer mounted later —
 * an overlay switched on, the grid toggled — lands on top of everything. Three empty anchor layers
 * are mounted first and every banded layer is inserted beneath its anchor with `beforeId`, so the
 * stack is fixed however things are toggled: basemap → MBTiles → image overlays → grid → features
 * → tracks → survey points → the shape being measured. Pins are native views and sit above all of it.
 */

/*
 * The street basemap is OpenFreeMap's positron, a light, low-chroma style and the closest match to
 * the design's pale map, with its night counterpart in dark mode so the map doesn't open white.
 * Both URLs live in `lib/offline-map.ts`, along with the copies the map draws without a connection.
 */

/**
 * Satellite basemap as an inline raster style, mirroring the web map. Esri World Imagery needs no
 * key or billing account (the same reason positron is the street default), plus a transparent
 * boundaries/places overlay so the imagery still carries names.
 *
 * NOTE the {z}/{y}/{x} tile order — Esri differs from the OSM {z}/{x}/{y} convention, and swapping
 * them yields blank tiles with no error. A style *object* is passed, not a JSON string: MapLibre
 * treats a string `mapStyle` as a URL, which would silently fail to load.
 *
 * `maxzoom: 18` is the level past which MapLibre stops requesting tiles and starts upscaling the
 * last one it has, so zooming closer goes pixelated instead of blank. The number is measured, not
 * nominal: beyond its real coverage Esri answers 200 OK with a *placeholder JPEG* reading "Map data
 * not yet available" — byte-identical everywhere (2521 bytes) — so a too-high maxzoom shows that
 * image rather than failing in any way MapLibre could detect and fall back from.
 *
 * Sampled 2026-08-29: rural Kalimantan and Balikpapan carry real imagery only to **z18**; Jakarta
 * and Pontianak reach z19. 18 is therefore the global cap — this is a field app for rural
 * Indonesia, and one blurrier zoom level over a city beats the placeholder over a survey site.
 */
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  // Needed for the grid's cell labels: a symbol layer draws nothing at all without a glyph source,
  // silently. The street style ships its own; this one is ours, so it has to declare it.
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    esri: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 18,
      attribution: 'Tiles © Esri — Esri, Maxar, Earthstar Geographics',
    },
    'esri-labels': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 18,
    },
  },
  layers: [
    { id: 'esri', type: 'raster', source: 'esri' },
    { id: 'esri-labels', type: 'raster', source: 'esri-labels' },
  ],
};

type Basemap = 'street' | 'satellite';
type Tool = 'none' | 'measure' | 'grid';

/** Roughly central Kalimantan, so an empty map still opens somewhere meaningful. */
const FALLBACK_CENTER: [number, number] = [111.284, -0.0376];

/**
 * Level-of-detail rendering (spec 3.3). Below this zoom every survey point is a GPU-drawn dot with
 * a static minimum radius — cheap however many there are, and never shrinking to nothing as the
 * map zooms out. From it upward, points in view become full native markers with labels, unless
 * there are more in view than MAX_PINS, where native views would cost more than they show.
 * Coordinates are never touched; only the representation changes.
 */
const PIN_ZOOM = 14;

/** How close, in screen pixels, a dragged corner has to be let go to a survey point to snap onto it. */
const VERTEX_SNAP_PX = 28;
const MAX_PINS = 120;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const NO_PINS: SurveyMarker[] = [];

// ── Coordinates ─────────────────────────────────────────────────────────────────

/**
 * Nothing but a real, in-range pair is handed to MapLibre. A `null` is caught by an ordinary
 * null check, but `NaN` is not — and NaN reaches the native camera or a marker's position as a
 * `Double.NaN`, which takes the renderer down rather than raising anything catchable in JS.
 */
function isCoord(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' && typeof longitude === 'number' &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  );
}

interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * MapLibre reports the touched location as `lngLat`, a `[longitude, latitude]` **tuple** — not an
 * object with `.lng`/`.lat`, and not GeoJSON. Reading it the wrong way yields `undefined` with no
 * error, so a wrong guess here shows up as a map that simply ignores every tap.
 */
function pressCoords(
  event: NativeSyntheticEvent<PressEvent | MarkerEvent> | undefined,
): LatLng | null {
  const lngLat = event?.nativeEvent?.lngLat;
  if (!Array.isArray(lngLat) || lngLat.length < 2) return null;

  const [longitude, latitude] = lngLat;
  return isCoord(latitude, longitude) ? { latitude, longitude } : null;
}

/** The first feature's point coordinates from a source press, as `[lng, lat]`. */
function pressedPoint(feature: GeoJSON.Feature | undefined): Position | null {
  const geometry = feature?.geometry;
  if (geometry?.type !== 'Point') return null;
  const [lng, lat] = geometry.coordinates;
  return isPosition([lng, lat]) ? [lng, lat] : null;
}

function padBounds(b: LngLatBounds, ratio: number): LngLatBounds {
  const dx = (b[2] - b[0]) * ratio;
  const dy = (b[3] - b[1]) * ratio;
  return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
}

// ── Types ───────────────────────────────────────────────────────────────────────

export interface SurveyMarker {
  id: string;
  coordinates: { latitude?: number; longitude?: number };
  title: string;
  showCallout: boolean;
  /** Still in the local outbox rather than on the server. */
  pending: boolean;
  /** Which project's marker style to draw it with. */
  projectId?: string | null;
  /** Label text, already resolved from the label settings. Null or absent draws no label. */
  label?: string | null;
}

// ── Component ───────────────────────────────────────────────────────────────────

function SurveyMapView({
  markers,
  camera,
  onMarkerPress,
  onMapPress,
  pickMode = false,
  pickedLocation,
  projects = [],
  activeProjectId = null,
  controlsTop,
  statusTop,
  bottomInset,
}: {
  markers: SurveyMarker[];
  camera?: { coordinates?: { latitude?: number; longitude?: number }; zoom?: number };
  onMarkerPress: (id?: string) => void;
  /** Optional: fired when the user taps on the map (for tap-to-pick coordinates). */
  onMapPress?: (coords: { latitude: number; longitude: number }) => void;
  /** When true, shows a crosshair at the picked location and disables marker press. */
  pickMode?: boolean;
  /** The currently picked location (shown as a crosshair marker). */
  pickedLocation?: { latitude: number; longitude: number } | null;
  /** Projects a saved feature can be filed under. */
  projects?: ProjectResponse[];
  /** The project the screen is focused on; the default for new features. */
  activeProjectId?: string | null;
  /** Where the right-hand control column starts — below the screen's own top-right button. */
  controlsTop?: number;
  /** Where status cards sit — below the screen's own chip rows. */
  statusTop?: number;
  /**
   * Space the screen keeps clear at the bottom edge. Defaults to the system navigation inset; a
   * screen whose map ends at a tab bar passes less, because the tab bar has cleared it already.
   */
  bottomInset?: number;
}) {
  // Hooks must run unconditionally, before the platform/module early-returns below.
  const styles = useStyles();
  const { C, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings, update } = useSettings();
  const gis = useGis();
  const tracker = useTracker();
  const { online } = useSync();
  const connected = useSettledOnline(online);
  const offlineBasemap = useOfflineBasemap(connected);

  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);

  const [basemap, setBasemap] = useState<Basemap>('street');
  const [tool, setTool] = useState<Tool>('none');
  const [view, setView] = useState<{ bounds: LngLatBounds; zoom: number } | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [locating, setLocating] = useState(false);

  // Measure tool.
  const [measureMode, setMeasureMode] = useState<GeometryKind>('line');
  const [measurePoints, setMeasurePoints] = useState<Position[]>([]);
  const [redoStack, setRedoStack] = useState<Position[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [lastLayerId, setLastLayerId] = useState('general');

  // Grid.
  const [cellSize, setCellSize] = useState<CellSizeSetting>(DEFAULT_CELL_SIZE);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<GridAnchor>(null);
  /** Armed by "Set origin"; the next tap on the map places it. */
  const [anchorArmed, setAnchorArmed] = useState(false);

  // Read once: callbacks that read `view?.zoom` inside would make the compiler track all of `view`.
  const currentZoom = view?.zoom ?? 0;
  const gridActive = tool === 'grid';
  const measuring = tool === 'measure';
  const top = controlsTop ?? insets.top + 16;
  const statusY = statusTop ?? insets.top + 116;
  const bottom = bottomInset ?? insets.bottom;

  // The location layer is shown only once permission already exists — the map never prompts.
  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
    Location.getForegroundPermissionsAsync()
      .then((p) => setLocationGranted(p.granted))
      .catch(() => {});
  }, []);

  // The tile cache is what keeps recently viewed ground usable with no signal (spec 3.1).
  useEffect(() => {
    const lib = getMapLibre();
    lib?.OfflineManager.setMaximumAmbientCacheSize(settings.tileCacheMb * 1024 * 1024).catch(() => {});
  }, [settings.tileCacheMb]);

  // The frame the cells are drawn in. Derived up here rather than read back off the built grid so
  // the tap handler can resolve a cell without depending on the whole cell array.
  const frame = useMemo(
    () => (gridActive && view ? gridFrame(view.bounds, cellSize, anchor) : null),
    [anchor, cellSize, gridActive, view],
  );

  /* ── camera helpers ─────────────────────────────────────────────── */

  const fitTo = useCallback(
    (points: Position[], minZoomForPoint = 17) => {
      const b = boundsOf(points);
      if (!b) return;
      if (points.length === 1 || (b[0] === b[2] && b[1] === b[3])) {
        cameraRef.current?.flyTo({ center: [b[0], b[1]], zoom: Math.max(currentZoom, minZoomForPoint), duration: 600 });
        return;
      }
      cameraRef.current?.fitBounds(b, {
        padding: { top: statusY + 40, bottom: bottom + 260, left: 48, right: 48 },
        duration: 600,
      });
    },
    [bottom, currentZoom, statusY],
  );

  const applyFocus = useCallback(
    (request: FocusRequest | null) => {
      if (!request) return;
      if (request.kind === 'bounds') {
        const [w, s, e, n] = request.bounds;
        fitTo([
          [w, s],
          [e, n],
        ]);
      } else {
        cameraRef.current?.flyTo({ center: request.center, zoom: request.zoom ?? 17, duration: 600 });
      }
    },
    [fitTo],
  );

  // Other screens ask the map to show something ("zoom to this feature"); the map is a tab and
  // stays mounted, so the request can be applied the moment it is made.
  useEffect(() => {
    if (pickMode) return;
    applyFocus(takeMapFocus());
    return onMapFocusRequest(() => applyFocus(takeMapFocus()));
  }, [applyFocus, pickMode]);

  const locateMe = useCallback(async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      setLocationGranted(true);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      // Precise navigation: land zoomed in far enough to place a vertex or find a pin by eye.
      cameraRef.current?.flyTo({
        center: [pos.coords.longitude, pos.coords.latitude],
        zoom: Math.max(currentZoom, 17),
        duration: 700,
      });
    } catch {
      Alert.alert('Location unavailable', 'Could not get a GPS fix. Check that location is on and try again.');
    } finally {
      setLocating(false);
    }
  }, [currentZoom]);

  /* ── measure ────────────────────────────────────────────────────── */

  const addVertex = useCallback(
    (p: Position) => {
      setMeasurePoints((prev) => (measureMode === 'point' ? [p] : [...prev, p]));
      setRedoStack([]);
    },
    [measureMode],
  );

  /**
   * Moves one corner of the shape being drawn to where it was dragged. Let go near a survey point
   * and it lands exactly on that point's recorded position — the same snap a tap on a pin gives —
   * which is how a parcel is traced from the points captured at its corners: drag each corner
   * from one point to the next and the polygon follows.
   */
  const moveVertex = (index: number, to: Position) => {
    // The snap is a fingertip wide on screen, whatever the zoom: MapLibre's zoom levels are for
    // 512 px tiles, so one pixel covers this many metres at the corner's latitude.
    const metresPerPixel = (78271.517 * Math.cos((to[1] * Math.PI) / 180)) / 2 ** currentZoom;
    const reach = VERTEX_SNAP_PX * metresPerPixel;
    let target = to;
    let nearest = reach;
    for (const marker of markers) {
      const { latitude, longitude } = marker.coordinates;
      if (!isCoord(latitude, longitude)) continue;
      const at: Position = [longitude!, latitude!];
      const d = distance(to, at);
      if (d <= nearest) {
        nearest = d;
        target = at;
      }
    }
    setMeasurePoints((prev) => prev.map((p, i) => (i === index ? target : p)));
    setRedoStack([]);
  };

  const undo = () => {
    if (!measurePoints.length) return;
    setRedoStack((r) => [...r, measurePoints[measurePoints.length - 1]]);
    setMeasurePoints(measurePoints.slice(0, -1));
  };

  const redo = () => {
    if (!redoStack.length) return;
    const p = redoStack[redoStack.length - 1];
    setRedoStack(redoStack.slice(0, -1));
    setMeasurePoints(measureMode === 'point' ? [p] : [...measurePoints, p]);
  };

  const addCenter = async () => {
    try {
      const c = await mapRef.current?.getCenter();
      if (c && isPosition(c)) addVertex([c[0], c[1]]);
    } catch {
      // The map was mid-teardown; nothing to add.
    }
  };

  const addGps = async () => {
    setGpsBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Location needed', 'Allow location access to add your GPS position as a vertex.');
        return;
      }
      setLocationGranted(true);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      const p: Position = [pos.coords.longitude, pos.coords.latitude];
      addVertex(p);
      cameraRef.current?.easeTo({ center: p, zoom: Math.max(currentZoom, 17), duration: 500 });
    } catch {
      Alert.alert('No GPS fix', 'Could not get a position. Move into the open and try again.');
    } finally {
      setGpsBusy(false);
    }
  };

  const changeMeasureMode = (mode: GeometryKind) => {
    setMeasureMode(mode);
    // A line's vertices carry straight over into a polygon and back; a point keeps only the last.
    if (mode === 'point') setMeasurePoints((prev) => prev.slice(-1));
    setRedoStack([]);
  };

  /* ── tool switching ─────────────────────────────────────────────── */

  // The measure tool and the grid both want the map's taps, so they are mutually exclusive.
  // Switching either on clears the other's state rather than leaving a stale shape on screen.
  const toggleMeasure = () => {
    const next: Tool = measuring ? 'none' : 'measure';
    setTool(next);
    setMeasurePoints([]);
    setRedoStack([]);
    setSelectedCell(null);
    setAnchorArmed(false);
    setSelectedFeatureId(null);
  };

  const toggleGrid = () => {
    const next: Tool = gridActive ? 'none' : 'grid';
    setTool(next);
    setSelectedCell(null);
    setAnchorArmed(false);
    setMeasurePoints([]);
    setRedoStack([]);
    setSelectedFeatureId(null);
    if (next !== 'grid') return;
    // `onRegionDidChange` fires on the next move, not now, so the grid's first frame would be blank
    // until the surveyor happened to pan. Ask the map where it is already looking instead.
    void mapRef.current
      ?.getViewState()
      .then((vs) => setView({ bounds: vs.bounds, zoom: vs.zoom }))
      .catch(() => {});
  };

  /* ── map events ─────────────────────────────────────────────────── */

  const handleMapPress = useCallback(
    (event: NativeSyntheticEvent<PressEvent | MarkerEvent>) => {
      const point = pressCoords(event);
      if (!point) return;

      if (onMapPress) {
        onMapPress(point);
        return;
      }

      if (tool === 'measure') {
        addVertex([point.longitude, point.latitude]);
        return;
      }

      if (tool !== 'grid') {
        // Nothing armed: a tap on empty ground clears the feature selection.
        setSelectedFeatureId(null);
        return;
      }

      if (anchorArmed) {
        setAnchor(point);
        setAnchorArmed(false);
        setSelectedCell(null);
        return;
      }

      // Resolved arithmetically rather than by querying rendered features: the cell a coordinate
      // falls in is a division. It must use the frame the cells were drawn in — resolving a tap in
      // a different zone or against a different origin names the wrong cell, and nothing on screen
      // would look wrong.
      if (!frame) return;
      const { col, row } = cellIndexAt(point.latitude, point.longitude, frame);
      const id = cellId(col, row, frame.cellMetres);
      setSelectedCell((prev) => (prev === id ? null : id));
    },
    [addVertex, anchorArmed, frame, onMapPress, tool],
  );

  const handleRegionChange = useCallback((event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const e = event?.nativeEvent;
    if (!e) return;
    publishBearing(e.bearing ?? 0);
    const bounds = e.bounds;
    if (Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite)) {
      setView({ bounds, zoom: e.zoom });
      if (Array.isArray(e.center)) setLastViewport({ bounds, zoom: e.zoom, center: [e.center[0], e.center[1]] });
    }
  }, []);

  const handleRegionChanging = useCallback((event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    publishBearing(event?.nativeEvent?.bearing ?? 0);
  }, []);

  const handleMapLoaded = useCallback(() => {
    void mapRef.current
      ?.getViewState()
      .then((vs) => {
        setView({ bounds: vs.bounds, zoom: vs.zoom });
        setLastViewport({ bounds: vs.bounds, zoom: vs.zoom, center: [vs.center[0], vs.center[1]] });
        publishBearing(vs.bearing);
      })
      .catch(() => {});
  }, []);

  /* ── derived data ───────────────────────────────────────────────── */

  // Keyed on the numbers, not on the `camera` object, so a re-render with the same target reuses
  // the same array. `Camera` is memoised on prop identity and re-applies its stop whenever one
  // changes — a fresh array every render made it fly back to `center` on every parent re-render,
  // which is to say on every basemap toggle, every refresh, and every touch of the picker map.
  const centerLat = camera?.coordinates?.latitude;
  const centerLng = camera?.coordinates?.longitude;
  const center = useMemo<[number, number]>(
    () => (isCoord(centerLat, centerLng) ? [centerLng!, centerLat!] : FALLBACK_CENTER),
    [centerLat, centerLng],
  );

  // Points with a missing or non-finite position are dropped here rather than at the marker, so
  // nothing downstream has to repeat the check.
  const plottable = useMemo(
    () => markers.filter((m) => isCoord(m.coordinates.latitude, m.coordinates.longitude)),
    [markers],
  );

  const zoom = view?.zoom ?? camera?.zoom ?? 12;

  // Pins only for what is (nearly) on screen — padded so a short pan does not reveal bare dots.
  const pinCandidates = useMemo(() => {
    if (pickMode || !gis.surveysVisible || !view || zoom < PIN_ZOOM) return [];
    const [w, s, e, n] = padBounds(view.bounds, 0.3);
    return plottable.filter((m) => {
      const lat = m.coordinates.latitude!;
      const lng = m.coordinates.longitude!;
      return lng >= w && lng <= e && lat >= s && lat <= n;
    });
  }, [gis.surveysVisible, pickMode, plottable, view, zoom]);

  const pinned = pinCandidates.length <= MAX_PINS ? pinCandidates : NO_PINS;
  const pinnedIds = useMemo(() => new Set(pinned.map((m) => m.id)), [pinned]);

  const dotData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (pickMode || !gis.surveysVisible) return EMPTY_FC;
    return {
      type: 'FeatureCollection',
      features: plottable
        .filter((m) => !pinnedIds.has(m.id))
        .map((m) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [m.coordinates.longitude!, m.coordinates.latitude!] },
          properties: {
            id: m.id,
            pending: m.pending,
            color: markerColor(markerFor(settings, m.projectId), C.accent),
          },
        })),
    };
  }, [C.accent, gis.surveysVisible, pickMode, pinnedIds, plottable, settings]);

  const visibleLayerIds = useMemo(
    () => new Set(gis.layers.filter((l) => l.visible).map((l) => l.id)),
    [gis.layers],
  );

  const featureData = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    for (const f of gis.features) {
      if (!visibleLayerIds.has(f.layerId) || !f.coordinates.length) continue;
      const color = layerById(gis.layers, f.layerId).color;
      const properties = { id: f.id, color, name: f.name };
      if (f.kind === 'point') {
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: f.coordinates[0] }, properties });
      } else if (f.kind === 'line' && f.coordinates.length >= 2) {
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: f.coordinates }, properties });
      } else if (f.kind === 'polygon' && f.coordinates.length >= 3) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[...f.coordinates, f.coordinates[0]]] },
          properties,
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [gis.features, gis.layers, visibleLayerIds]);

  const selectedFeature = useMemo(
    () => (selectedFeatureId ? (gis.features.find((f) => f.id === selectedFeatureId) ?? null) : null),
    [gis.features, selectedFeatureId],
  );

  const trackData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!gis.tracksVisible) return EMPTY_FC;
    return {
      type: 'FeatureCollection',
      features: tracker.mapLines.map((l) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: l.coordinates },
        properties: { id: l.id, active: l.active },
      })),
    };
  }, [gis.tracksVisible, tracker.mapLines]);

  const liveTip = tracker.recording && tracker.activePoints.length ? tracker.activePoints[tracker.activePoints.length - 1] : null;

  const measureData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!measuring || !measurePoints.length) return EMPTY_FC;
    const features: GeoJSON.Feature[] = [];
    if (measureMode === 'polygon' && measurePoints.length >= 3) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...measurePoints, measurePoints[0]]] },
        properties: {},
      });
    } else if (measureMode !== 'point' && measurePoints.length >= 2) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: measurePoints }, properties: {} });
    }
    measurePoints.forEach((p, i) =>
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: p },
        properties: { last: i === measurePoints.length - 1 },
      }),
    );
    return { type: 'FeatureCollection', features };
  }, [measureMode, measurePoints, measuring]);

  const grid = useMemo(() => {
    if (!gridActive || !view) return null;
    return buildGrid(
      view.bounds,
      cellSize,
      plottable.map((m) => ({ latitude: m.coordinates.latitude!, longitude: m.coordinates.longitude! })),
      anchor,
    );
  }, [anchor, cellSize, gridActive, plottable, view]);

  const gridData = useMemo(
    () => (grid && grid.cells.length ? gridFeatureCollection(grid.cells) : null),
    [grid],
  );

  const selectedDetail = useMemo(
    () => grid?.cells.find((cell) => cell.id === selectedCell) ?? null,
    [grid, selectedCell],
  );

  /* ── basemap ────────────────────────────────────────────────────── */

  // The street style pinned to the downloaded areas' tile addresses (see lib/offline-map.ts).
  const savedStreet = useMemo(
    () => (offlineBasemap.saved ? offlineStreetStyle(offlineBasemap.saved, dark, offlineBasemap.packTemplates) : null),
    [dark, offlineBasemap.packTemplates, offlineBasemap.saved],
  );
  const blank = useMemo(() => blankStyle(C.mapBase), [C.mapBase]);

  // The styles to try, in order. Each one that fails to load moves the map one step down the list.
  // Online: the live style first. Offline: the saved copy, which always loads and finds the
  // downloaded areas; or, with nothing downloaded, the live style out of MapLibre's tile cache. The
  // plain background comes last, so points, tracks and overlays still draw when no basemap can.
  const styleChain = useMemo<(string | StyleSpecification)[]>(() => {
    if (basemap === 'satellite') return [SATELLITE_STYLE];
    const live = dark ? STREET_STYLE_URL.dark : STREET_STYLE_URL.light;
    if (!connected) return savedStreet ? [savedStreet, blank] : [live, blank];
    return savedStreet ? [live, savedStreet, blank] : [live, blank];
  }, [basemap, blank, connected, dark, savedStreet]);

  // Tied to the list it was counted against: a new list (back online, basemap toggled, an area
  // downloaded) starts again from its first style.
  const [styleFailure, setStyleFailure] = useState<{ chain: unknown; step: number } | null>(null);
  const styleStep = styleFailure?.chain === styleChain ? styleFailure.step : 0;
  const mapStyle = styleChain[Math.min(styleStep, styleChain.length - 1)];
  const handleStyleFailed = useCallback(() => {
    setStyleFailure((prev) => ({ chain: styleChain, step: (prev?.chain === styleChain ? prev.step : 0) + 1 }));
  }, [styleChain]);

  const offlineNote = pickMode
    ? null
    : mapStyle === blank
      ? 'No map saved here · points still show'
      : connected
        ? null
        : basemap === 'satellite'
          ? 'Offline · satellite only where viewed before'
          : mapStyle === savedStreet
            ? 'Offline · using downloaded areas'
            : 'Offline · map as far as viewed before';

  // Platform first: MapLibre is native-only, which is a different reason from a native client that
  // simply doesn't carry the module.
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return (
      <View style={styles.fallback}>
        <Empty>The map is available on the iOS and Android builds. Points are listed under each project.</Empty>
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

  const { Map, Camera, Marker, ViewAnnotation, GeoJSONSource, ImageSource, RasterSource, Layer, UserLocation } = lib;

  // Grid lines and labels sit on whatever the basemap is: near-black over pale positron, white
  // over satellite imagery or the night map. Either one alone is invisible on the other.
  const overDark = basemap === 'satellite' || dark;
  const gridInk = overDark ? '#ffffff' : '#282f34';
  const halo = overDark ? 'rgba(0,0,0,0.7)' : '#ffffff';

  const labels = settings.labels;
  const labelStyle = {
    color: labels.textColor,
    fontSize: labels.size,
    textShadowColor: labels.haloColor,
    textShadowRadius: 2.5,
    textShadowOffset: { width: 0, height: 0 },
  } as const;

  const selectedLayer = selectedFeature ? layerById(gis.layers, selectedFeature.layerId) : null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map
        ref={mapRef}
        mapStyle={mapStyle}
        style={StyleSheet.absoluteFill}
        attribution
        attributionPosition={{ bottom: 8, right: 8 }}
        logo={false}
        // The native compass sat under the sync button and could not be pressed; ours replaces it.
        compass={false}
        onPress={handleMapPress}
        onDidFinishLoadingMap={handleMapLoaded}
        onDidFailLoadingMap={handleStyleFailed}
        onRegionIsChanging={pickMode ? undefined : handleRegionChanging}
        onRegionDidChange={handleRegionChange}>
        <Camera ref={cameraRef} center={center} zoom={camera?.zoom ?? 12} duration={600} maxZoom={22} minZoom={2} />

        {/* Anchors: empty, never drawn, mounted first so every band below has a fixed slot. */}
        <GeoJSONSource id="gf-anchors" data={EMPTY_FC}>
          <Layer id="gf-a-basemap" type="line" />
          <Layer id="gf-a-overlay" type="line" />
          <Layer id="gf-a-grid" type="line" />
        </GeoJSONSource>

        {/* Offline MBTiles basemaps (spec 3.1) — read straight from the file by MapLibre. */}
        {gis.basemaps
          .filter((b) => b.visible)
          .map((b) => (
            <RasterSource key={b.id} id={`gf-bm-${b.id}`} url={`mbtiles://${b.uri.replace(/^file:\/\//, '')}`} tileSize={256}>
              <Layer
                id={`gf-bm-layer-${b.id}`}
                type="raster"
                beforeId="gf-a-basemap"
                paint={{ 'raster-opacity': b.opacity, 'raster-fade-duration': 0 }}
              />
            </RasterSource>
          ))}

        {/* Georeferenced map overlays (spec 1.5). */}
        {gis.overlays
          .filter((o) => o.visible)
          .map((o) => (
            <ImageSource key={o.id} id={`gf-ov-${o.id}`} url={o.uri} coordinates={o.corners}>
              <Layer
                id={`gf-ov-layer-${o.id}`}
                type="raster"
                beforeId="gf-a-overlay"
                paint={{ 'raster-opacity': o.opacity, 'raster-fade-duration': 0 }}
              />
            </ImageSource>
          ))}

        {/* Survey grid. */}
        {gridData && (
          <GeoJSONSource id="survey-grid" data={gridData}>
            {/* Covered ground reads at a glance — the question a quadrat survey exists to answer
                is which cells have been walked, not where the individual points are. */}
            <Layer
              id="survey-grid-fill"
              type="fill"
              beforeId="gf-a-grid"
              paint={{
                'fill-color': C.ok,
                'fill-opacity': ['case', ['>', ['get', 'count'], 0], 0.28, 0],
              }}
            />
            <Layer
              id="survey-grid-selected"
              type="fill"
              beforeId="gf-a-grid"
              filter={['==', ['get', 'id'], selectedCell ?? '']}
              paint={{ 'fill-color': C.accent, 'fill-opacity': 0.35 }}
            />
            {/* Ground outside the plot stays visible so the lattice is continuous, but it is
                greyed and unlabelled — it is not part of what is being surveyed. */}
            <Layer
              id="survey-grid-offplot"
              type="fill"
              beforeId="gf-a-grid"
              filter={['!', ['get', 'onPlot']]}
              paint={{
                'fill-color': overDark ? '#000000' : '#282f34',
                'fill-opacity': 0.18,
              }}
            />
            <Layer
              id="survey-grid-line"
              type="line"
              beforeId="gf-a-grid"
              paint={{
                'line-color': gridInk,
                'line-width': ['case', ['get', 'onPlot'], 1, 0.5],
                'line-opacity': overDark ? 0.75 : 0.5,
              }}
            />
            <Layer
              id="survey-grid-label"
              type="symbol"
              beforeId="gf-a-grid"
              filter={['get', 'onPlot']}
              layout={{
                'text-field': ['get', 'label'],
                'text-font': ['Noto Sans Regular'],
                'text-size': 10,
              }}
              paint={{
                'text-color': gridInk,
                'text-halo-color': halo,
                'text-halo-width': 1.2,
              }}
            />
          </GeoJSONSource>
        )}

        {/* Feature layers (spec 1.8): every visible layer's points, lines and polygons, coloured
            by layer. A tap selects the feature, unless a tool has claimed the map's taps. */}
        <GeoJSONSource
          id="gf-features"
          data={featureData}
          onPress={(event: NativeSyntheticEvent<PressEventWithFeatures>) => {
            if (pickMode || tool !== 'none') return;
            const id = event.nativeEvent.features?.[0]?.properties?.id;
            if (typeof id === 'string') {
              event.stopPropagation();
              setSelectedFeatureId(id);
            }
          }}>
          <Layer
            id="gf-feat-fill"
            type="fill"
            filter={['==', ['geometry-type'], 'Polygon']}
            paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 }}
          />
          <Layer
            id="gf-feat-line"
            type="line"
            filter={['!=', ['geometry-type'], 'Point']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': ['get', 'color'],
              'line-width': ['case', ['==', ['geometry-type'], 'LineString'], 3.5, 2],
            }}
          />
          <Layer
            id="gf-feat-selected"
            type="line"
            filter={['==', ['get', 'id'], selectedFeatureId ?? '']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#ffd60a', 'line-width': 6, 'line-opacity': 0.75 }}
          />
          <Layer
            id="gf-feat-point"
            type="circle"
            filter={['==', ['geometry-type'], 'Point']}
            paint={{
              'circle-radius': ['case', ['==', ['get', 'id'], selectedFeatureId ?? ''], 9, 6.5],
              'circle-color': ['get', 'color'],
              'circle-stroke-color': ['case', ['==', ['get', 'id'], selectedFeatureId ?? ''], '#ffd60a', '#ffffff'],
              'circle-stroke-width': 2,
            }}
          />
          <Layer
            id="gf-feat-label"
            type="symbol"
            minzoom={15}
            filter={['!=', ['geometry-type'], 'LineString']}
            layout={{ 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.2] }}
            paint={{ 'text-color': overDark ? '#ffffff' : '#10171c', 'text-halo-color': halo, 'text-halo-width': 1.4 }}
          />
          <Layer
            id="gf-feat-line-label"
            type="symbol"
            minzoom={15}
            filter={['==', ['geometry-type'], 'LineString']}
            layout={{
              'symbol-placement': 'line',
              'text-field': ['get', 'name'],
              'text-font': ['Noto Sans Regular'],
              'text-size': 11,
            }}
            paint={{ 'text-color': overDark ? '#ffffff' : '#10171c', 'text-halo-color': halo, 'text-halo-width': 1.4 }}
          />
        </GeoJSONSource>

        {/* GPS logger routes (spec 1.7). The one recording now is red; finished ones amber. */}
        <GeoJSONSource id="gf-tracks" data={trackData}>
          <Layer
            id="gf-track-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': ['case', ['get', 'active'], '#e5484d', '#d9822b'],
              'line-width': 3.5,
              'line-opacity': 0.9,
            }}
          />
        </GeoJSONSource>

        {/* Survey points as GPU dots — every point at low zoom, the rest beside the pins at high. */}
        <GeoJSONSource
          id="gf-survey-dots"
          data={dotData}
          onPress={(event: NativeSyntheticEvent<PressEventWithFeatures>) => {
            if (pickMode) return;
            const feature = event.nativeEvent.features?.[0];
            const id = feature?.properties?.id;
            const at = pressedPoint(feature);
            if (typeof id !== 'string' || !at) return;
            event.stopPropagation();
            // While placing a grid origin or measuring, a survey point snaps the vertex to the
            // survey's *recorded* position — a known point on the ground, not the fingertip.
            if (gridActive && anchorArmed) {
              setAnchor({ latitude: at[1], longitude: at[0] });
              setAnchorArmed(false);
              setSelectedCell(null);
            } else if (measuring) {
              addVertex(at);
            } else if (tool === 'none') {
              onMarkerPress(id);
            }
          }}>
          <Layer
            id="gf-survey-dot"
            type="circle"
            paint={{
              // Static floor of 3 px however far out the map zooms — points never vanish.
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 10, 4, 14, 5.5, 18, 7],
              'circle-color': ['get', 'color'],
              'circle-stroke-color': ['case', ['get', 'pending'], C.warn, '#ffffff'],
              'circle-stroke-width': ['case', ['get', 'pending'], 2.5, 1.5],
            }}
          />
        </GeoJSONSource>

        {/* The shape being measured. */}
        {measuring && measurePoints.length > 0 && (
          <GeoJSONSource id="gf-measure" data={measureData}>
            <Layer
              id="gf-measure-fill"
              type="fill"
              filter={['==', ['geometry-type'], 'Polygon']}
              paint={{ 'fill-color': '#e63946', 'fill-opacity': 0.16 }}
            />
            <Layer
              id="gf-measure-line"
              type="line"
              filter={['!=', ['geometry-type'], 'Point']}
              paint={{ 'line-color': '#e63946', 'line-width': 2.5, 'line-dasharray': [2, 1.5] }}
            />
            <Layer
              id="gf-measure-vertex"
              type="circle"
              filter={['==', ['geometry-type'], 'Point']}
              paint={{
                'circle-radius': ['case', ['get', 'last'], 6.5, 5],
                'circle-color': '#ffffff',
                'circle-stroke-color': '#e63946',
                'circle-stroke-width': 2.5,
              }}
            />
          </GeoJSONSource>
        )}

        {/* A handle on every corner of the shape being drawn. Hold one, then drag: the shape is
            redrawn when it is let go, and a corner let go on a survey point snaps to it.
            `ViewAnnotation`, like the grid's origin handle, because dragging lives there. */}
        {measuring &&
          measurePoints.map((p, i) => (
            <ViewAnnotation
              key={`vertex-${i}`}
              id={`vertex-${i}`}
              lngLat={p}
              anchor="center"
              draggable
              onDragEnd={(event) => {
                const point = pressCoords(event);
                if (point) moveVertex(i, [point.longitude, point.latitude]);
              }}>
              <View style={styles.vertexWrap}>
                <View style={styles.vertexDot}>
                  <Text style={styles.vertexNum}>{i + 1}</Text>
                </View>
              </View>
            </ViewAnnotation>
          ))}

        {locationGranted && <UserLocation />}

        {/* Survey pins — native views, only for points in view at high zoom (see PIN_ZOOM). */}
        {pinned.map((marker) => {
          const style = markerFor(settings, marker.projectId);
          const size = 30;
          const iconAnchor = markerAnchor(style);
          const label = labels.enabled && marker.label ? marker.label : null;
          return (
            <Marker
              key={marker.id}
              id={marker.id}
              lngLat={[marker.coordinates.longitude!, marker.coordinates.latitude!]}
              // With a label the view is [icon][label]; anchoring it by its left edge and pulling
              // it back by half an icon keeps the icon exactly where it is without one.
              anchor={label ? 'left' : iconAnchor}
              offset={label ? [-size / 2, iconAnchor === 'bottom' ? -size / 2 : 0] : undefined}
              // A marker consumes the tap before the map ever sees it, so measuring across two
              // points would be impossible wherever a pin happens to sit. While a tool is up the
              // tap goes to the tool instead, snapped to the survey's recorded position.
              onPress={(event) => {
                const at: Position = [marker.coordinates.longitude!, marker.coordinates.latitude!];
                if (gridActive && anchorArmed) {
                  setAnchor({ latitude: at[1], longitude: at[0] });
                  setAnchorArmed(false);
                  setSelectedCell(null);
                  return;
                }
                if (measuring) return addVertex(at);
                if (gridActive) return handleMapPress(event);
                onMarkerPress(marker.id);
              }}>
              <View style={styles.pinRow}>
                <MarkerIcon style={style} size={size} pending={marker.pending} pendingColor={C.warn} />
                {label ? (
                  <View
                    style={[
                      styles.labelBox,
                      labels.boxColor ? { backgroundColor: labels.boxColor } : { paddingHorizontal: 2 },
                    ]}>
                    <Text style={labelStyle} numberOfLines={1}>
                      {label}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Marker>
          );
        })}

        {/* Live position of the route being recorded. */}
        {liveTip && gis.tracksVisible && isCoord(liveTip[1], liveTip[0]) && (
          <Marker key="track-tip" id="track-tip" lngLat={[liveTip[0], liveTip[1]]} anchor="center">
            <View style={styles.trackTip} />
          </Marker>
        )}

        {/* Picked location crosshair (tap-to-pick mode) */}
        {pickMode && pickedLocation && isCoord(pickedLocation.latitude, pickedLocation.longitude) && (
          <Marker
            key="picked"
            id="picked"
            lngLat={[pickedLocation.longitude, pickedLocation.latitude]}
            anchor="center"
            // Without this, the one place you cannot re-pick is the spot you already picked,
            // because the crosshair swallows the tap.
            onPress={handleMapPress}>
            <View style={styles.crosshairWrap}>
              <View style={styles.crosshairOuter}>
                <View style={styles.crosshairDot} />
              </View>
            </View>
          </Marker>
        )}

        {/* Plot origin — the south-west corner of cell A1, and draggable to move the whole grid.
            `ViewAnnotation` rather than `Marker` because dragging lives on the annotation: it
            renders its children to a bitmap on Android, which is fine for a static handle. */}
        {gridActive && anchor && (
          <ViewAnnotation
            key="grid-origin"
            id="grid-origin"
            lngLat={[anchor.longitude, anchor.latitude]}
            anchor="center"
            draggable
            // Only on drag *end*: rebuilding several hundred cell polygons for every frame of the
            // gesture would make the drag itself stutter.
            onDragEnd={(event) => {
              const point = pressCoords(event);
              if (point) {
                setAnchor(point);
                setSelectedCell(null);
              }
            }}>
            <View style={styles.originWrap}>
              <View style={styles.originRing}>
                <View style={styles.originMark} />
              </View>
            </View>
          </ViewAnnotation>
        )}
      </Map>

      {/* Centre crosshair while measuring — where "+ Centre" puts the next vertex. */}
      {measuring && (
        <View pointerEvents="none" style={styles.centerCross}>
          <CrosshairIcon color={overDark ? '#ffffff' : '#e63946'} size={30} />
        </View>
      )}

      {/* Right-hand control column: layers, compass, locate. */}
      {!pickMode && (
        <View style={[styles.rightColumn, { top }]} pointerEvents="box-none">
          <MapButton onPress={() => setLayersOpen(true)} label="Layers">
            <LayersIcon color={C.ink30} />
          </MapButton>
          <CompassButton onPress={() => void cameraRef.current?.setStop({ bearing: 0, duration: 300 })} />
          <MapButton onPress={() => void locateMe()} label="Go to my location" active={locating}>
            <GpsIcon color={locating ? '#fff' : C.ink30} />
          </MapButton>
        </View>
      )}

      {/* Recording indicator — the logger runs in the background, so the map says it is on. */}
      {!pickMode && tracker.recording && (
        <Pressable onPress={() => router.push('/tracks')} style={[styles.recPill, { top: statusY }]}>
          <RecordDot />
          <Text style={styles.recText}>
            {`Recording route · ${formatLength(tracker.active?.distanceM ?? 0, settings.lengthUnit)}`}
          </Text>
        </Pressable>
      )}

      {/* No connection: say what the map is drawing from, and offer the screen that saves more. */}
      {offlineNote && (
        <Pressable
          onPress={() => router.push('/offline')}
          accessibilityRole="button"
          accessibilityHint="Opens offline maps"
          style={[styles.recPill, { top: statusY + (!pickMode && tracker.recording ? 42 : 0) }]}>
          <CloudOffIcon color={C.ink46} size={15} />
          <Text style={styles.recText}>{offlineNote}</Text>
        </Pressable>
      )}

      {/* Grid status. One line by default; the full reference only once a cell is tapped. */}
      {gridActive && grid && (
        <View style={[styles.gridStatus, { top: statusY + (tracker.recording ? 42 : 0) + (offlineNote ? 42 : 0) }]}>
          <Text style={styles.gridStatusLine} numberOfLines={1}>
            {grid.tooDense
              ? `Zoom in for the ${formatCellSize(grid.frame.cellMetres)} grid`
              : `${grid.covered}/${grid.total} surveyed · ${formatCellSize(grid.frame.cellMetres)}${
                  cellSize === 'auto' ? ' auto' : ''
                }`}
          </Text>

          {selectedDetail && (
            <View style={styles.gridCellRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gridCellRef} numberOfLines={1}>
                  {`${selectedDetail.label} · ${selectedDetail.reference}`}
                </Text>
                <Text style={styles.gridCellMeta}>
                  {selectedDetail.count === 1 ? '1 survey' : `${selectedDetail.count} surveys`}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedCell(null)} hitSlop={8}>
                <Close color={C.ink55} size={10} />
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Measure tool card. */}
      {measuring && (
        <MeasurePanel
          bottom={bottom + 96}
          mode={measureMode}
          onModeChange={changeMeasureMode}
          points={measurePoints}
          canUndo={measurePoints.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={undo}
          onRedo={redo}
          onClear={() => {
            setMeasurePoints([]);
            setRedoStack([]);
          }}
          onFit={() => fitTo(measurePoints)}
          onAddCenter={() => void addCenter()}
          onAddGps={() => void addGps()}
          gpsBusy={gpsBusy}
          onSave={() => setSaveOpen(true)}
          onClose={toggleMeasure}
          lengthUnit={settings.lengthUnit}
          areaUnit={settings.areaUnit}
          onLengthUnit={(u) => update({ lengthUnit: u })}
          onAreaUnit={(u) => update({ areaUnit: u })}
        />
      )}

      {/* Selected feature. */}
      {selectedFeature && selectedLayer && !measuring && (
        <View style={[styles.featureCard, { bottom: bottom + 96 }]}>
          <View style={styles.featureHead}>
            <View style={[styles.swatch, { backgroundColor: selectedLayer.color }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.featureName} numberOfLines={1}>
                {selectedFeature.name}
              </Text>
              <Text style={styles.featureMeta} numberOfLines={1}>
                {`${selectedLayer.name} · ${
                  selectedFeature.kind === 'line'
                    ? formatLength(Number(selectedFeature.attributes.length_m ?? 0), settings.lengthUnit)
                    : selectedFeature.kind === 'polygon'
                      ? formatArea(Number(selectedFeature.attributes.area_m2 ?? 0), settings.areaUnit)
                      : `${Number(selectedFeature.attributes.lat ?? 0).toFixed(6)}, ${Number(selectedFeature.attributes.lon ?? 0).toFixed(6)}`
                }`}
              </Text>
            </View>
            <Pressable onPress={() => setSelectedFeatureId(null)} hitSlop={10} accessibilityLabel="Deselect">
              <Close color={C.ink55} size={12} />
            </Pressable>
          </View>
          <View style={styles.featureActions}>
            <Pressable style={styles.featureAction} onPress={() => fitTo(selectedFeature.coordinates)}>
              <Text style={styles.featureActionText}>Zoom to</Text>
            </Pressable>
            <Pressable style={styles.featureAction} onPress={() => router.push(`/feature/${selectedFeature.id}`)}>
              <Text style={styles.featureActionText}>Attributes</Text>
            </Pressable>
            <Pressable
              style={styles.featureAction}
              onPress={() =>
                Alert.alert('Delete feature?', `"${selectedFeature.name}" will be removed from this device.`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      gis.deleteFeature(selectedFeature.id);
                      setSelectedFeatureId(null);
                    },
                  },
                ])
              }>
              <Text style={[styles.featureActionText, { color: C.danger }]}>Delete</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Bottom controls, stacked so the tool row clears the map screen's capture FAB. */}
      <View style={[styles.bottomControls, { bottom: bottom + 24 }]} pointerEvents="box-none">
        {/* One card for every grid setting, rather than a stack of loose floating pills. */}
        {gridActive && !pickMode && (
          <View style={styles.gridCard}>
            {/* Horizontally scrolled: eight sizes wrapped onto two rows took a quarter of the
                screen, and the map is what the surveyor came for. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipStrip}>
              {(['auto', ...CELL_SIZES] as const).map((size) => {
                const active = size === cellSize;
                return (
                  <Pressable
                    key={size}
                    onPress={() => {
                      setCellSize(size);
                      // The old selection names a cell of the old size, which no longer exists.
                      setSelectedCell(null);
                    }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {size === 'auto' ? 'Auto' : formatCellSize(size)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.cardDivider} />

            <View style={styles.originRow}>
              <Pressable
                onPress={() => {
                  setAnchorArmed((armed) => !armed);
                  setSelectedCell(null);
                }}
                style={[styles.chip, anchorArmed && styles.chipActive]}>
                <Text style={[styles.chipText, anchorArmed && styles.chipTextActive]}>
                  {anchorArmed ? 'Placing…' : anchor ? 'Move origin' : 'Set origin'}
                </Text>
              </Pressable>

              {anchor && (
                <Pressable
                  onPress={() => {
                    setAnchor(null);
                    setAnchorArmed(false);
                    setSelectedCell(null);
                  }}
                  style={styles.chip}>
                  <Text style={styles.chipText}>Clear</Text>
                </Pressable>
              )}

              {/* Once an origin exists this shows its reference rather than an instruction: it is
                  the number that has to go in the field notebook for the grid to be reproducible,
                  and the handle on the map is its own affordance for dragging. */}
              <Text
                style={[styles.originHint, anchor && !anchorArmed && styles.originHintRef]}
                numberOfLines={2}>
                {anchorArmed
                  ? 'Tap the map, or a survey pin to snap to it'
                  : anchor && grid?.originReference
                    ? grid.originReference
                    : 'Anchor the grid to a plot corner, then drag to adjust'}
              </Text>
            </View>
          </View>
        )}

        {/* Tools and basemap in one bar — two pills instead of four stacked containers. */}
        <View style={styles.bottomBar}>
          <View style={styles.basemapToggle}>
            {(['street', 'satellite'] as const).map((key) => {
              const active = basemap === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setBasemap(key)}
                  style={[styles.basemapButton, active && styles.basemapButtonActive]}>
                  <Text style={[styles.basemapText, active && styles.basemapTextActive]}>
                    {key === 'street' ? 'Street' : 'Satellite'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Grouped into one pill so the tools read as a set, matching the toggle beside them. */}
          {!pickMode && (
            <View style={styles.toolPill}>
              <Pressable
                onPress={toggleGrid}
                accessibilityLabel="Toggle survey grid"
                style={[styles.toolButton, gridActive && styles.toolButtonActive]}>
                <SurveyGridIcon color={gridActive ? '#fff' : C.ink30} size={18} />
              </Pressable>
              <Pressable
                onPress={toggleMeasure}
                accessibilityLabel="Measure and draw"
                style={[styles.toolButton, measuring && styles.toolButtonActive]}>
                <RulerIcon color={measuring ? '#fff' : C.ink30} size={18} />
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {!pickMode && (
        <>
          <LayersSheet visible={layersOpen} onClose={() => setLayersOpen(false)} />
          <FeatureSaveSheet
            // Remounted per save so its form starts empty with the current defaults.
            key={saveOpen ? 'open' : 'closed'}
            visible={saveOpen}
            kind={measureMode}
            coordinates={measurePoints}
            projects={projects}
            defaultProjectId={activeProjectId}
            defaultLayerId={lastLayerId}
            lengthUnit={settings.lengthUnit}
            areaUnit={settings.areaUnit}
            onCancel={() => setSaveOpen(false)}
            onSaved={(featureId, layerId) => {
              const saved = measurePoints;
              setSaveOpen(false);
              setLastLayerId(layerId);
              setTool('none');
              setMeasurePoints([]);
              setRedoStack([]);
              setSelectedFeatureId(featureId);
              fitTo(saved);
            }}
          />
        </>
      )}
    </View>
  );
}

/**
 * The map is the one screen built on a native renderer fed by data off the network, and it is the
 * tab the app opens on — so a render error here is the difference between "the map is unavailable"
 * and a surveyor standing in a field holding a dead app. The boundary is deliberately narrow:
 * everything above it, including the capture FAB, keeps working.
 *
 * This catches errors thrown during React's render/commit. A crash inside MapLibre's own native
 * code is not recoverable from JS and is not what this is for.
 */
class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // No error reporting in the app yet, so at least leave it in the device log (see NEXT-STEPS).
    console.error('[survey-map] render failed', error);
  }

  render() {
    if (this.state.failed) return <MapFailed />;
    return this.props.children;
  }
}

function MapFailed() {
  const styles = useStyles();
  return (
    <View style={styles.fallback}>
      <Empty>The map could not be drawn. Your points are safe — they are all listed under each project.</Empty>
    </View>
  );
}

export function SurveyMap(props: ComponentProps<typeof SurveyMapView>) {
  return (
    <MapBoundary>
      <SurveyMapView {...props} />
    </MapBoundary>
  );
}

const useStyles = makeStyles((C) => ({
  fallback: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: C.surface },

  // Icon plus optional label, laid out as one row so a single Marker carries both.
  pinRow: { flexDirection: 'row', alignItems: 'center' },
  labelBox: { marginLeft: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, maxWidth: 180 },

  // Anchored bottom-left and never allowed to reach the right edge: the map screen's capture FAB
  // sits bottom-right, is drawn later and at a higher zIndex, so anything sliding under it would be
  // visible but unpressable. `right` is deliberately absent.
  bottomControls: {
    position: 'absolute',
    left: 16,
    alignItems: 'flex-start',
    gap: 10,
    maxWidth: 268,
  },

  rightColumn: { position: 'absolute', right: 16, gap: 10, alignItems: 'center', zIndex: 2 },

  // Tools and the basemap toggle read as one row of pills rather than four stacked boxes.
  bottomBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  toolPill: {
    flexDirection: 'row',
    backgroundColor: C.raised,
    borderRadius: Radius.pill,
    padding: 3,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  toolButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolButtonActive: { backgroundColor: C.accent },

  // Every grid setting in one card.
  gridCard: {
    alignSelf: 'stretch',
    backgroundColor: C.raised,
    borderRadius: Radius.lg,
    paddingVertical: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  chipStrip: { paddingHorizontal: 8, gap: 6, alignItems: 'center' },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: C.bg95,
  },
  chipActive: { backgroundColor: C.accent },
  chipText: { fontSize: 11, fontWeight: '500', color: C.ink46, fontFamily: Fonts.sans },
  chipTextActive: { color: '#fff' },

  cardDivider: { height: 1, backgroundColor: C.line92, marginVertical: 8 },
  originRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  originHint: { flex: 1, fontSize: 10, color: C.ink55, fontFamily: Fonts.sans },
  originHintRef: { fontFamily: Fonts.mono, color: C.ink46 },

  // Grid status
  gridStatus: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '70%',
    backgroundColor: C.raised,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
  },
  gridStatusLine: { fontSize: 12, fontWeight: '600', color: C.ink, fontFamily: Fonts.sans },

  recPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: C.raised,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  recText: { fontSize: 12, fontWeight: '600', color: C.ink, fontFamily: Fonts.sans },
  trackTip: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#e5484d',
    borderWidth: 2.5,
    borderColor: '#fff',
  },

  // A corner of the shape being drawn: numbered in drawing order, and a full 44 pt target because
  // it is held and dragged with a fingertip.
  vertexWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  vertexDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: '#e63946',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vertexNum: { fontSize: 11, fontWeight: '700', color: '#b3202c', fontFamily: Fonts.mono },

  // Plot origin handle — square, to read as a corner rather than a point, and larger than the
  // picker's crosshair because it is dragged with a fingertip.
  originWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  originRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 112, 187, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  originMark: {
    width: 14,
    height: 14,
    borderWidth: 3,
    borderColor: C.accent,
    backgroundColor: '#fff',
  },
  gridCellRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: C.line92,
    paddingTop: 8,
    marginTop: 8,
  },
  gridCellRef: { fontSize: 13, color: C.ink, fontFamily: Fonts.mono },
  gridCellMeta: { fontSize: 11, color: C.ink55, fontFamily: Fonts.sans, marginTop: 2 },

  basemapToggle: {
    flexDirection: 'row',
    backgroundColor: C.raised,
    borderRadius: Radius.pill,
    padding: 3,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  // 38 tall, like the tool buttons beside it, so the two pills in the bottom row share one height.
  basemapButton: { height: 38, justifyContent: 'center', paddingHorizontal: 14, borderRadius: Radius.pill },
  basemapButtonActive: { backgroundColor: C.accent },
  basemapText: { fontSize: 12, fontWeight: '500', color: C.ink46, fontFamily: Fonts.sans },
  basemapTextActive: { color: '#fff' },

  centerCross: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -15,
    marginTop: -15,
  },

  featureCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: C.raised,
    borderRadius: Radius.lg,
    padding: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 4,
  },
  featureHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  featureName: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: Fonts.sans },
  featureMeta: { fontSize: 12, color: C.ink55, marginTop: 2, fontFamily: Fonts.sans },
  featureActions: {
    flexDirection: 'row',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.line92,
    paddingTop: 8,
  },
  featureAction: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  featureActionText: { fontSize: 13, fontWeight: '600', color: C.accentText, fontFamily: Fonts.sans },

  // Crosshair for tap-to-pick
  crosshairWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  crosshairOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 112, 187, 0.15)',
  },
  crosshairDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
}));
