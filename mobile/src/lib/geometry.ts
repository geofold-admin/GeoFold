/**
 * Spherical measurement for the map's geometry tools — the same sphere and the same formulas as
 * the web portal's `next/src/lib/geo.ts`, so a polygon measured on the phone and on the portal
 * reports the same area. Read that file's header for why it is the sphere and not the ellipsoid.
 *
 * Positions are GeoJSON order, `[longitude, latitude]`, because that is what MapLibre and the
 * shapefile writer both take; nothing here ever has to swap a pair.
 *
 * Pure and dependency-free on purpose: it is exercised directly by the checks in NEXT-STEPS.md.
 */

export type Position = [number, number];

/** Mean Earth radius — Leaflet's L.CRS.Earth.R, which the web portal measures with. */
export const EARTH_R = 6371000;

const RAD = Math.PI / 180;

/** Great-circle distance by haversine; stable for the tens-of-metres legs field shapes have. */
export function distance(a: Position, b: Position): number {
  const sinDLat = Math.sin(((b[1] - a[1]) * RAD) / 2);
  const sinDLon = Math.sin(((b[0] - a[0]) * RAD) / 2);
  const h = sinDLat * sinDLat + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * sinDLon * sinDLon;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/** Length of an open path: the sum of its legs. */
export function pathLength(points: Position[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

/**
 * Perimeter of a closed ring, including the leg back from the last vertex to the first. With
 * fewer than three vertices there is no ring yet, so it is the open path length.
 */
export function ringPerimeter(points: Position[]): number {
  const n = points.length;
  if (n < 3) return pathLength(points);
  return pathLength(points) + distance(points[n - 1], points[0]);
}

/**
 * Area of a closed ring on the sphere by spherical excess. Winding direction does not matter.
 * The ring is given open — the first vertex is not repeated at the end — but a repeated closing
 * vertex contributes a zero-length edge, so passing a closed ring gives the same answer.
 */
export function ringArea(points: Position[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    total += (p2[0] - p1[0]) * RAD * (2 + Math.sin(p1[1] * RAD) + Math.sin(p2[1] * RAD));
  }
  return Math.abs((total * EARTH_R * EARTH_R) / 2);
}

/** `[west, south, east, north]` of a set of positions, or null for none. */
export function boundsOf(points: Position[]): [number, number, number, number] | null {
  if (!points.length) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lng, lat] of points) {
    if (lng < w) w = lng;
    if (lng > e) e = lng;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [w, s, e, n];
}

/** Vertex average — where a shape's label goes. Good enough for the convex-ish shapes of fieldwork. */
export function centroid(points: Position[]): Position | null {
  if (!points.length) return null;
  let x = 0;
  let y = 0;
  for (const [lng, lat] of points) {
    x += lng;
    y += lat;
  }
  return [x / points.length, y / points.length];
}

export function isPosition(p: unknown): p is Position {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    typeof p[0] === 'number' &&
    typeof p[1] === 'number' &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    p[0] >= -180 &&
    p[0] <= 180 &&
    p[1] >= -90 &&
    p[1] <= 90
  );
}

/* ── units ─────────────────────────────────────────────────────────────── */

export type LengthUnitSetting = 'auto' | 'm' | 'km';
export type AreaUnitSetting = 'auto' | 'm2' | 'ha' | 'km2';

const LENGTH_FACTOR = { m: 1, km: 1000 } as const;
const AREA_FACTOR = { m2: 1, ha: 10_000, km2: 1_000_000 } as const;
const AREA_SUFFIX = { m2: 'm²', ha: 'ha', km2: 'km²' } as const;

/** Below 1 km in metres, above it in kilometres — what `auto` resolves to. */
export function resolveLengthUnit(metres: number, unit: LengthUnitSetting): 'm' | 'km' {
  if (unit !== 'auto') return unit;
  return metres >= 1000 ? 'km' : 'm';
}

/** Square metres up to a hectare, hectares up to a square kilometre, then km² — `auto`. */
export function resolveAreaUnit(squareMetres: number, unit: AreaUnitSetting): 'm2' | 'ha' | 'km2' {
  if (unit !== 'auto') return unit;
  if (squareMetres >= 1_000_000) return 'km2';
  if (squareMetres >= 10_000) return 'ha';
  return 'm2';
}

/** Enough decimals to be meaningful at the size shown, and no more. */
function decimals(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 100) return 1;
  if (abs >= 1) return 2;
  return 3;
}

export function formatLength(metres: number, unit: LengthUnitSetting = 'auto'): string {
  const u = resolveLengthUnit(metres, unit);
  const value = metres / LENGTH_FACTOR[u];
  // Whole metres read cleaner than "12.40 m" — sub-metre precision is below what GPS delivers.
  const text = u === 'm' ? (value >= 100 ? Math.round(value).toString() : value.toFixed(1)) : value.toFixed(decimals(value));
  return `${text} ${u}`;
}

export function formatArea(squareMetres: number, unit: AreaUnitSetting = 'auto'): string {
  const u = resolveAreaUnit(squareMetres, unit);
  const value = squareMetres / AREA_FACTOR[u];
  const text = u === 'm2' ? Math.round(value).toLocaleString('en-US') : value.toFixed(decimals(value));
  return `${text} ${AREA_SUFFIX[u]}`;
}

/** Numeric value in a chosen unit, for attribute tables and exports. */
export function lengthIn(metres: number, unit: 'm' | 'km'): number {
  return metres / LENGTH_FACTOR[unit];
}

export function areaIn(squareMetres: number, unit: 'm2' | 'ha' | 'km2'): number {
  return squareMetres / AREA_FACTOR[unit];
}

export const LENGTH_UNITS: { key: LengthUnitSetting; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'm', label: 'm' },
  { key: 'km', label: 'km' },
];

export const AREA_UNITS: { key: AreaUnitSetting; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'm2', label: 'm²' },
  { key: 'ha', label: 'ha' },
  { key: 'km2', label: 'km²' },
];
