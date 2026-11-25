import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { pathLength, ringArea, ringPerimeter, type Position } from './geometry';

/**
 * The device's own spatial data: what a surveyor draws or imports on the map, sorted into layers.
 *
 * Survey points are the server's; everything here is local to the phone — sketched road centre
 * lines, building footprints, vegetation blocks, imported shapefiles, georeferenced map overlays
 * and offline basemaps. It leaves the device through the shapefile export (`lib/shapefile.ts`),
 * which is also what the backup reminders point at.
 *
 * One JSON file in the document directory. Loaded asynchronously after the first frame (an
 * imported road network can run to megabytes, and blocking startup on it would be a poor trade),
 * and written back debounced, never before the load has finished — an early write would replace
 * the stored data with the empty initial state.
 */

export type GeometryKind = 'point' | 'line' | 'polygon';
export type AttributeValue = string | number | boolean | null;

export interface GisLayer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  /** The category layers the app ships with. They can be renamed and recoloured, not deleted. */
  builtin?: boolean;
  createdAt: number;
}

export interface GisFeature {
  id: string;
  layerId: string;
  projectId: string | null;
  kind: GeometryKind;
  /** `[lng, lat]` positions. A point has one; a line is its path; a polygon is its open ring. */
  coordinates: Position[];
  name: string;
  /**
   * The attribute table row. Geometry fields (`length_m`, `area_m2`, `perim_m`, `lat`, `lon`) are
   * written automatically whenever the geometry is set — they are what "a new line creates a new
   * length field" means — and the surveyor's own fields sit beside them.
   */
  attributes: Record<string, AttributeValue>;
  createdAt: number;
  updatedAt: number;
}

export interface MapOverlay {
  id: string;
  name: string;
  /** `file://` copy in app storage. */
  uri: string;
  /** Top-left, top-right, bottom-right, bottom-left as `[lng, lat]` — MapLibre ImageSource order. */
  corners: [Position, Position, Position, Position];
  opacity: number;
  visible: boolean;
  /** How it was placed: from a world file, from a GeoPDF's own georeferencing, or by hand. */
  source: 'worldfile' | 'geopdf' | 'manual';
  width: number;
  height: number;
  createdAt: number;
}

/** A raster MBTiles file used as an offline basemap layer. */
export interface Basemap {
  id: string;
  name: string;
  uri: string;
  visible: boolean;
  opacity: number;
  sizeBytes: number;
  createdAt: number;
}

interface GisState {
  version: 1;
  layers: GisLayer[];
  features: GisFeature[];
  overlays: MapOverlay[];
  basemaps: Basemap[];
  surveysVisible: boolean;
  tracksVisible: boolean;
}

/** Spec categories: roads, buildings, vegetation — plus a catch-all so nothing needs a category. */
export const BUILTIN_LAYERS: GisLayer[] = [
  { id: 'roads', name: 'Jalan', color: '#e07b24', visible: true, builtin: true, createdAt: 0 },
  { id: 'buildings', name: 'Bangunan', color: '#8a5cd6', visible: true, builtin: true, createdAt: 0 },
  { id: 'vegetation', name: 'Vegetasi', color: '#2e9b4f', visible: true, builtin: true, createdAt: 0 },
  { id: 'general', name: 'Umum', color: '#0a84d6', visible: true, builtin: true, createdAt: 0 },
];

export const LAYER_COLORS = [
  '#e07b24',
  '#8a5cd6',
  '#2e9b4f',
  '#0a84d6',
  '#d6336c',
  '#c9a100',
  '#0f9d9a',
  '#6b7280',
  '#b5462b',
  '#1f2937',
];

const EMPTY: GisState = {
  version: 1,
  layers: BUILTIN_LAYERS,
  features: [],
  overlays: [],
  basemaps: [],
  surveysVisible: true,
  tracksVisible: true,
};

/* ── geometry attributes ─────────────────────────────────────────────── */

const GEOMETRY_KEYS = ['length_m', 'area_m2', 'perim_m', 'lat', 'lon'];

/** True for the attribute keys the app computes itself — shown read-only, never hand-edited. */
export function isGeometryAttribute(key: string): boolean {
  return GEOMETRY_KEYS.includes(key);
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

export function geometryAttributes(kind: GeometryKind, coords: Position[]): Record<string, number> {
  if (kind === 'point') {
    const [lon, lat] = coords[0] ?? [0, 0];
    return { lat: round(lat, 7), lon: round(lon, 7) };
  }
  if (kind === 'line') return { length_m: round(pathLength(coords), 2) };
  return { area_m2: round(ringArea(coords), 2), perim_m: round(ringPerimeter(coords), 2) };
}

/** Attributes with the geometry fields refreshed and the surveyor's own fields kept. */
function withGeometry(
  kind: GeometryKind,
  coords: Position[],
  attributes: Record<string, AttributeValue>,
): Record<string, AttributeValue> {
  const own = Object.fromEntries(Object.entries(attributes).filter(([k]) => !isGeometryAttribute(k)));
  return { ...geometryAttributes(kind, coords), ...own };
}

/* ── files ──────────────────────────────────────────────────────────── */

function stateFile(): File | null {
  if (Platform.OS === 'web') return null;
  const dir = new Directory(Paths.document, 'gis');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, 'state.json');
}

/** A directory under app storage for copied-in files (overlays, basemaps). */
export function storageDir(name: 'overlays' | 'basemaps' | 'markers' | 'exports'): Directory {
  const dir = new Directory(Paths.document, name);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function deleteFile(uri: string | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // A file that is already gone must never block removing its record.
  }
}

function normalise(raw: Partial<GisState> | null): GisState {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const layers = Array.isArray(raw.layers) ? raw.layers : [];
  // The category layers are always present, whatever an older or hand-edited file says.
  for (const builtin of BUILTIN_LAYERS) {
    if (!layers.some((l) => l.id === builtin.id)) layers.push(builtin);
  }
  return {
    version: 1,
    layers,
    features: Array.isArray(raw.features) ? raw.features : [],
    overlays: Array.isArray(raw.overlays) ? raw.overlays : [],
    basemaps: Array.isArray(raw.basemaps) ? raw.basemaps : [],
    surveysVisible: raw.surveysVisible !== false,
    tracksVisible: raw.tracksVisible !== false,
  };
}

/* ── context ────────────────────────────────────────────────────────── */

export interface NewFeature {
  layerId: string;
  projectId: string | null;
  kind: GeometryKind;
  coordinates: Position[];
  name: string;
  attributes?: Record<string, AttributeValue>;
}

interface GisValue extends GisState {
  ready: boolean;
  addFeature: (input: NewFeature) => GisFeature;
  addFeatures: (inputs: NewFeature[]) => number;
  updateFeature: (id: string, patch: Partial<Omit<GisFeature, 'id' | 'createdAt'>>) => void;
  deleteFeature: (id: string) => void;
  addLayer: (name: string, color: string) => GisLayer;
  updateLayer: (id: string, patch: Partial<Pick<GisLayer, 'name' | 'color' | 'visible'>>) => void;
  /** Removes a custom layer; its features move to the general layer rather than vanish. */
  deleteLayer: (id: string) => void;
  addOverlay: (overlay: Omit<MapOverlay, 'id' | 'createdAt'>) => MapOverlay;
  updateOverlay: (id: string, patch: Partial<Omit<MapOverlay, 'id' | 'createdAt'>>) => void;
  deleteOverlay: (id: string) => void;
  addBasemap: (basemap: Omit<Basemap, 'id' | 'createdAt'>) => Basemap;
  updateBasemap: (id: string, patch: Partial<Omit<Basemap, 'id' | 'createdAt'>>) => void;
  deleteBasemap: (id: string) => void;
  setSurveysVisible: (visible: boolean) => void;
  setTracksVisible: (visible: boolean) => void;
}

const noop = () => {};
const GisContext = createContext<GisValue>({
  ...EMPTY,
  ready: false,
  addFeature: () => {
    throw new Error('GisProvider missing');
  },
  addFeatures: () => 0,
  updateFeature: noop,
  deleteFeature: noop,
  addLayer: () => {
    throw new Error('GisProvider missing');
  },
  updateLayer: noop,
  deleteLayer: noop,
  addOverlay: () => {
    throw new Error('GisProvider missing');
  },
  updateOverlay: noop,
  deleteOverlay: noop,
  addBasemap: () => {
    throw new Error('GisProvider missing');
  },
  updateBasemap: noop,
  deleteBasemap: noop,
  setSurveysVisible: noop,
  setTracksVisible: noop,
});

export const useGis = () => useContext(GisContext);

export function GisProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GisState>(EMPTY);
  const [ready, setReady] = useState(false);
  // Read by the delete callbacks, which need the record (for its file) without depending on state.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded: GisState = EMPTY;
      try {
        const file = stateFile();
        if (file?.exists) loaded = normalise(JSON.parse(await file.text()));
      } catch {
        // Unreadable state starts empty rather than crashing the map; the file is left in place.
      }
      if (cancelled) return;
      setState(loaded);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      try {
        const file = stateFile();
        if (!file) return;
        if (!file.exists) file.create();
        file.write(JSON.stringify(state));
      } catch {
        // Keep the in-memory state; the next change tries again.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [ready, state]);

  const addFeature = useCallback((input: NewFeature) => {
    const now = Date.now();
    const feature: GisFeature = {
      id: randomUUID(),
      layerId: input.layerId,
      projectId: input.projectId,
      kind: input.kind,
      coordinates: input.coordinates,
      name: input.name,
      attributes: withGeometry(input.kind, input.coordinates, input.attributes ?? {}),
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => ({ ...prev, features: [...prev.features, feature] }));
    return feature;
  }, []);

  const addFeatures = useCallback((inputs: NewFeature[]) => {
    const now = Date.now();
    const created = inputs.map<GisFeature>((input) => ({
      id: randomUUID(),
      layerId: input.layerId,
      projectId: input.projectId,
      kind: input.kind,
      coordinates: input.coordinates,
      name: input.name,
      attributes: withGeometry(input.kind, input.coordinates, input.attributes ?? {}),
      createdAt: now,
      updatedAt: now,
    }));
    setState((prev) => ({ ...prev, features: [...prev.features, ...created] }));
    return created.length;
  }, []);

  const updateFeature = useCallback((id: string, patch: Partial<Omit<GisFeature, 'id' | 'createdAt'>>) => {
    setState((prev) => ({
      ...prev,
      features: prev.features.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...patch, updatedAt: Date.now() };
        next.attributes = withGeometry(next.kind, next.coordinates, next.attributes);
        return next;
      }),
    }));
  }, []);

  const deleteFeature = useCallback((id: string) => {
    setState((prev) => ({ ...prev, features: prev.features.filter((f) => f.id !== id) }));
  }, []);

  const addLayer = useCallback((name: string, color: string) => {
    const layer: GisLayer = { id: randomUUID(), name, color, visible: true, createdAt: Date.now() };
    setState((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    return layer;
  }, []);

  const updateLayer = useCallback((id: string, patch: Partial<Pick<GisLayer, 'name' | 'color' | 'visible'>>) => {
    setState((prev) => ({ ...prev, layers: prev.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }, []);

  const deleteLayer = useCallback((id: string) => {
    setState((prev) => {
      const layer = prev.layers.find((l) => l.id === id);
      if (!layer || layer.builtin) return prev;
      return {
        ...prev,
        layers: prev.layers.filter((l) => l.id !== id),
        features: prev.features.map((f) => (f.layerId === id ? { ...f, layerId: 'general' } : f)),
      };
    });
  }, []);

  const addOverlay = useCallback((overlay: Omit<MapOverlay, 'id' | 'createdAt'>) => {
    const created: MapOverlay = { ...overlay, id: randomUUID(), createdAt: Date.now() };
    setState((prev) => ({ ...prev, overlays: [...prev.overlays, created] }));
    return created;
  }, []);

  const updateOverlay = useCallback((id: string, patch: Partial<Omit<MapOverlay, 'id' | 'createdAt'>>) => {
    setState((prev) => ({ ...prev, overlays: prev.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  }, []);

  const deleteOverlay = useCallback((id: string) => {
    deleteFile(stateRef.current.overlays.find((o) => o.id === id)?.uri);
    setState((prev) => ({ ...prev, overlays: prev.overlays.filter((o) => o.id !== id) }));
  }, []);

  const addBasemap = useCallback((basemap: Omit<Basemap, 'id' | 'createdAt'>) => {
    const created: Basemap = { ...basemap, id: randomUUID(), createdAt: Date.now() };
    setState((prev) => ({ ...prev, basemaps: [...prev.basemaps, created] }));
    return created;
  }, []);

  const updateBasemap = useCallback((id: string, patch: Partial<Omit<Basemap, 'id' | 'createdAt'>>) => {
    setState((prev) => ({ ...prev, basemaps: prev.basemaps.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  }, []);

  const deleteBasemap = useCallback((id: string) => {
    deleteFile(stateRef.current.basemaps.find((b) => b.id === id)?.uri);
    setState((prev) => ({ ...prev, basemaps: prev.basemaps.filter((b) => b.id !== id) }));
  }, []);

  const setSurveysVisible = useCallback((visible: boolean) => {
    setState((prev) => ({ ...prev, surveysVisible: visible }));
  }, []);

  const setTracksVisible = useCallback((visible: boolean) => {
    setState((prev) => ({ ...prev, tracksVisible: visible }));
  }, []);

  const value = useMemo<GisValue>(
    () => ({
      ...state,
      ready,
      addFeature,
      addFeatures,
      updateFeature,
      deleteFeature,
      addLayer,
      updateLayer,
      deleteLayer,
      addOverlay,
      updateOverlay,
      deleteOverlay,
      addBasemap,
      updateBasemap,
      deleteBasemap,
      setSurveysVisible,
      setTracksVisible,
    }),
    [
      state,
      ready,
      addFeature,
      addFeatures,
      updateFeature,
      deleteFeature,
      addLayer,
      updateLayer,
      deleteLayer,
      addOverlay,
      updateOverlay,
      deleteOverlay,
      addBasemap,
      updateBasemap,
      deleteBasemap,
      setSurveysVisible,
      setTracksVisible,
    ],
  );

  return <GisContext.Provider value={value}>{children}</GisContext.Provider>;
}

export function layerById(layers: GisLayer[], id: string): GisLayer {
  return layers.find((l) => l.id === id) ?? layers.find((l) => l.id === 'general') ?? BUILTIN_LAYERS[3];
}
