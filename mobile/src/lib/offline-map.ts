import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';

import { readJsonSync, writeJsonSync } from './kv';
import { getMapLibre } from './native';

/**
 * The street basemap without a connection (spec 3.1).
 *
 * OpenFreeMap puts the date of each map-data release in its tile addresses
 * (`…/planet/20261101_080013_pt/{z}/{x}/{y}.pbf`). The style only points at a TileJSON that says
 * which release is current, and the phone trusts that answer for one hour. A downloaded area holds
 * the tiles of one release. Once OpenFreeMap publishes the next release and the phone sees it, the
 * live style looks for tiles the download never fetched, and the area goes blank offline. It looks
 * as if nothing was downloaded.
 *
 * So every download records the tile address it was made with. Without a connection the map draws
 * a copy of the street style, kept on the phone, whose vector source is pinned to those exact
 * addresses. There is one copy of the source per release, so areas downloaded weeks apart all
 * draw. Online, the map keeps using the live style and its current release.
 */

/** OpenFreeMap's street styles: positron by day, and its night counterpart. */
export const STREET_STYLE_URL = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

const FONTS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const KEY = 'offline-basemap';

/** The TileJSON is cached for an hour, so a copy refreshed as often stays in step with the live map. */
const REFRESH_MS = 60 * 60 * 1000;

/** At most this many map-data releases are drawn at once. The style grows by one copy of its layers per release. */
const MAX_RELEASES = 4;

export interface SavedBasemap {
  savedAt: number;
  light: StyleSpecification;
  dark: StyleSpecification;
  /** The vector source both styles read through a TileJSON, as resolved when saved. Null if the styles have none. */
  source: {
    url: string;
    template: string;
    minzoom?: number;
    maxzoom?: number;
    attribution?: string;
    bounds?: [number, number, number, number];
  } | null;
}

interface TileJson {
  tiles?: string[];
  minzoom?: number;
  maxzoom?: number;
  attribution?: string;
  bounds?: [number, number, number, number];
}

/* ── the saved styles ───────────────────────────────────────────────────── */

let memo: SavedBasemap | null | undefined;
const listeners = new Set<() => void>();

function loadSaved(): SavedBasemap | null {
  if (memo === undefined) memo = readJsonSync<SavedBasemap>(KEY);
  return memo;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`The map server answered ${res.status}.`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

let refreshing: Promise<SavedBasemap> | null = null;

/** Fetches both street styles and the current tile address, and keeps them on the phone. */
export function refreshSavedBasemap(): Promise<SavedBasemap> {
  refreshing ??= (async () => {
    try {
      const [light, dark] = await Promise.all([
        fetchJson<StyleSpecification>(STREET_STYLE_URL.light),
        fetchJson<StyleSpecification>(STREET_STYLE_URL.dark),
      ]);
      let source: SavedBasemap['source'] = null;
      const vector = Object.values(light.sources).find((s) => s.type === 'vector' && typeof s.url === 'string');
      if (vector?.type === 'vector' && vector.url) {
        const tilejson = await fetchJson<TileJson>(vector.url);
        const template = tilejson.tiles?.[0];
        if (template) {
          source = {
            url: vector.url,
            template,
            minzoom: tilejson.minzoom,
            maxzoom: tilejson.maxzoom,
            attribution: tilejson.attribution,
            bounds: tilejson.bounds,
          };
        }
      }
      const next: SavedBasemap = { savedAt: Date.now(), light, dark, source };
      memo = next;
      writeJsonSync(KEY, next);
      notify();
      return next;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/* ── downloaded areas ───────────────────────────────────────────────────── */

/** Call after an area is downloaded or deleted, so open maps pick up the change. */
export function notifyPacksChanged(): void {
  notify();
}

/** The tile addresses the downloaded areas were made with, oldest download first. */
async function packTemplates(): Promise<string[]> {
  const lib = getMapLibre();
  if (!lib) return [];
  const packs = await lib.OfflineManager.getPacks();
  return packs
    .map((p) => ({
      template: typeof p.metadata?.template === 'string' ? p.metadata.template : null,
      createdAt: typeof p.metadata?.createdAt === 'number' ? p.metadata.createdAt : 0,
    }))
    .filter((p): p is { template: string; createdAt: number } => p.template !== null)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((p) => p.template);
}

/** "…/planet/20261101_080013_pt/…" → the date of that map-data release, or null. */
export function releaseDate(template: string | null | undefined): Date | null {
  const m = template?.match(/\/(\d{4})(\d{2})(\d{2})_\d{6}/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

/**
 * What a map needs to draw the street basemap offline: the styles saved on the phone and the tile
 * addresses of the downloaded areas. While online, it keeps the saved styles no more than an hour old.
 */
export function useOfflineBasemap(online: boolean): { saved: SavedBasemap | null; packTemplates: string[] } {
  const [saved, setSaved] = useState(loadSaved);
  const [templates, setTemplates] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const reload = () => {
      void packTemplates()
        .then((t) => {
          if (!alive) return;
          setTemplates(t);
          setSaved(loadSaved());
        })
        .catch(() => {});
    };
    reload();
    listeners.add(reload);
    return () => {
      alive = false;
      listeners.delete(reload);
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    const current = loadSaved();
    if (current && Date.now() - current.savedAt < REFRESH_MS) return;
    void refreshSavedBasemap().catch(() => {});
  }, [online]);

  return { saved, packTemplates: templates };
}

/**
 * Becomes `online` only once that value has held for `ms`. A weak signal flickers on and off, and
 * each flip changes the map's style, which redraws the whole map.
 */
export function useSettledOnline(online: boolean, ms = 4000): boolean {
  const [settled, setSettled] = useState(online);
  useEffect(() => {
    if (online === settled) return;
    const timer = setTimeout(() => setSettled(online), ms);
    return () => clearTimeout(timer);
  }, [ms, online, settled]);
  return settled;
}

/* ── styles ─────────────────────────────────────────────────────────────── */

/**
 * The saved street style with its vector source pinned to the downloaded areas' tile addresses,
 * plus the current one, which holds the tiles viewed recently. There is one copy of the source per
 * release. Each layer is repeated per copy, side by side, so the stacking order of the style holds
 * and the newest release draws on top where two overlap. Null if there is nothing to pin.
 */
export function offlineStreetStyle(saved: SavedBasemap, dark: boolean, downloaded: string[]): StyleSpecification | null {
  if (!downloaded.length || !saved.source) return null;
  const base = dark ? saved.dark : saved.light;
  const { url, template: current, minzoom, maxzoom, attribution, bounds } = saved.source;
  const sourceId = Object.keys(base.sources).find((id) => {
    const s = base.sources[id];
    return s.type === 'vector' && s.url === url;
  });
  if (!sourceId) return null;

  // Oldest first, keeping each release's latest position, then the newest MAX_RELEASES.
  const releases = [...new Set([...downloaded, current].reverse())].reverse().slice(-MAX_RELEASES);
  const ids = releases.map((_, i) => (i === releases.length - 1 ? sourceId : `${sourceId}~${i}`));

  const sources: StyleSpecification['sources'] = {};
  for (const [id, s] of Object.entries(base.sources)) if (id !== sourceId) sources[id] = s;
  releases.forEach((template, i) => {
    sources[ids[i]] = {
      type: 'vector',
      tiles: [template],
      ...(minzoom != null ? { minzoom } : {}),
      ...(maxzoom != null ? { maxzoom } : {}),
      ...(bounds ? { bounds } : {}),
      // Credited once, not once per release.
      ...(attribution && i === releases.length - 1 ? { attribution } : {}),
    };
  });

  const layers: StyleSpecification['layers'] = [];
  for (const layer of base.layers) {
    if (!('source' in layer) || layer.source !== sourceId) {
      layers.push(layer);
      continue;
    }
    ids.forEach((id, i) =>
      layers.push(i === ids.length - 1 ? layer : ({ ...layer, id: `${layer.id}~${i}`, source: id } as typeof layer)),
    );
  }

  return { ...base, sources, layers };
}

/**
 * A plain background in the map's own colour. This is the last resort when no basemap can be
 * loaded at all. Survey points, tracks, drawn features, overlays and MBTiles still draw on it, so
 * the map never goes blank just because there is no connection.
 */
export function blankStyle(color: string): StyleSpecification {
  return {
    version: 8,
    // Grid labels need glyphs; ones viewed before are in MapLibre's cache, others silently skip.
    glyphs: FONTS_URL,
    sources: {},
    layers: [{ id: 'gf-blank', type: 'background', paint: { 'background-color': color } }],
  };
}
