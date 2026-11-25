/**
 * Coordinate systems for imported data (`.prj` files and world files).
 *
 * The app's own data is WGS 84 longitude/latitude throughout, and every export is written that
 * way. Imports are not so tidy: Indonesian field data is as often in UTM (WGS 84 / UTM zone 49S,
 * EPSG:32749) or in the national TM-3 grid as in degrees, so a shapefile has to be reprojected on
 * the way in or it lands thousands of kilometres off the coast of Africa.
 *
 * Supported: geographic (any datum, treated as WGS 84), transverse Mercator with any parameters
 * (UTM, TM-3, Gauss–Krüger), and Web Mercator. Anything else is reported, not guessed at.
 *
 * DATUMS ARE NOT SHIFTED. DGN95 and WGS 84 agree to well under a metre, so for current Indonesian
 * data this is exact enough; older local datums (Batavia, ID74) differ by tens to hundreds of
 * metres, and the import says so when it sees one.
 */

export type Projection =
  | { kind: 'geographic'; name: string; datum: string }
  | {
      kind: 'tm';
      name: string;
      datum: string;
      lon0: number;
      lat0: number;
      k0: number;
      fe: number;
      fn: number;
      a: number;
      invF: number;
      /** Metres per linear unit (1 for metres, 0.3048 for feet). */
      unit: number;
    }
  | { kind: 'webmercator'; name: string; datum: string }
  | { kind: 'unsupported'; name: string; datum: string };

/** WGS 84 geographic — written as the `.prj` of every export. ESRI's flavour, which QGIS reads too. */
export const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

const WGS84_A = 6_378_137;
const WGS84_INVF = 298.257223563;

/** Old local datums whose offset from WGS 84 is large enough to mention. */
const SHIFTED_DATUMS = /batavia|id74|indonesian_1974|gunung_segara|bukit_rimpah|kertau|timbalai/i;

function param(wkt: string, ...names: string[]): number | null {
  for (const name of names) {
    const m = new RegExp(`PARAMETER\\[\\s*"${name}"\\s*,\\s*([-+0-9.eE]+)\\s*\\]`, 'i').exec(wkt);
    if (m) return Number(m[1]);
  }
  return null;
}

function quoted(wkt: string, keyword: string): string {
  const m = new RegExp(`${keyword}\\[\\s*"([^"]*)"`, 'i').exec(wkt);
  return m ? m[1] : '';
}

export function parsePrj(wkt: string | null | undefined): Projection | null {
  if (!wkt || !wkt.trim()) return null;
  const text = wkt.trim();
  const datum = quoted(text, 'DATUM') || 'unknown datum';

  if (/^\s*(GEOGCS|GEOGCRS|GEODCRS)\[/i.test(text)) {
    return { kind: 'geographic', name: quoted(text, '(?:GEOGCS|GEOGCRS|GEODCRS)'), datum };
  }

  if (!/^\s*(PROJCS|PROJCRS)\[/i.test(text)) return { kind: 'unsupported', name: text.slice(0, 60), datum };
  const name = quoted(text, '(?:PROJCS|PROJCRS)');
  const projection = (quoted(text, 'PROJECTION') || quoted(text, 'METHOD')).toLowerCase().replace(/[\s-]+/g, '_');

  if (
    projection.includes('mercator_auxiliary_sphere') ||
    projection.includes('pseudo_mercator') ||
    projection.includes('popular_visualisation') ||
    /web_mercator|pseudo.mercator|EPSG"?\s*,\s*"?(3857|900913|102100)/i.test(text)
  ) {
    return { kind: 'webmercator', name, datum };
  }

  if (projection.includes('transverse_mercator') || projection.includes('gauss_kruger') || projection.includes('utm')) {
    const sph = /SPHEROID\[\s*"[^"]*"\s*,\s*([0-9.eE+]+)\s*,\s*([0-9.eE+]+)/i.exec(text) ??
      /ELLIPSOID\[\s*"[^"]*"\s*,\s*([0-9.eE+]+)\s*,\s*([0-9.eE+]+)/i.exec(text);
    // The linear unit is the PROJCS's own last UNIT, after its parameters.
    const units = [...text.matchAll(/UNIT\[\s*"[^"]*"\s*,\s*([0-9.eE+]+)/gi)];
    const unit = units.length > 1 ? Number(units[units.length - 1][1]) : 1;

    let lon0 = param(text, 'central_meridian', 'longitude_of_natural_origin', 'longitude_of_origin', 'longitude_of_center');
    let k0 = param(text, 'scale_factor', 'scale_factor_at_natural_origin');
    let fe = param(text, 'false_easting');
    let fn = param(text, 'false_northing');
    const lat0 = param(text, 'latitude_of_origin', 'latitude_of_natural_origin', 'latitude_of_center') ?? 0;

    // A bare "UTM zone 49S" name with the parameters left out still has only one meaning.
    const zone = /UTM[_\s]*zone[_\s]*(\d{1,2})\s*([NS])?/i.exec(name);
    if (zone && lon0 == null) lon0 = Number(zone[1]) * 6 - 183;
    if (zone && k0 == null) k0 = 0.9996;
    if (zone && fe == null) fe = 500_000;
    if (zone && fn == null) fn = zone[2]?.toUpperCase() === 'S' ? 10_000_000 : 0;

    if (lon0 == null || k0 == null) return { kind: 'unsupported', name, datum };
    return {
      kind: 'tm',
      name,
      datum,
      lon0,
      lat0,
      k0,
      fe: fe ?? 0,
      fn: fn ?? 0,
      a: sph ? Number(sph[1]) : WGS84_A,
      invF: sph && Number(sph[2]) > 0 ? Number(sph[2]) : WGS84_INVF,
      unit: Number.isFinite(unit) && unit > 0 ? unit : 1,
    };
  }

  return { kind: 'unsupported', name: name || projection, datum };
}

export function datumWarning(p: Projection): string | null {
  return SHIFTED_DATUMS.test(p.datum)
    ? `The data uses the ${p.datum} datum, which is not shifted to WGS 84 here — positions may be off by tens of metres.`
    : null;
}

/* ── inverse projections ────────────────────────────────────────────── */

const RAD = Math.PI / 180;

/** Meridional arc from the equator to latitude `phi` (radians), Snyder (3-21). */
function meridianArc(phi: number, a: number, e2: number): number {
  return (
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi))
  );
}

/** Inverse transverse Mercator, Snyder (8-12)…(8-25) — the same series as `grid.ts`, parameterised. */
function tmInverse(x: number, y: number, p: Extract<Projection, { kind: 'tm' }>): [number, number] {
  const f = 1 / p.invF;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const m0 = meridianArc(p.lat0 * RAD, p.a, e2);
  const m = m0 + (y * p.unit - p.fn * p.unit) / p.k0;
  const mu = m / (p.a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const c1 = ep2 * cos1 * cos1;
  const t1 = tan1 * tan1;
  const n1 = p.a / Math.sqrt(1 - e2 * sin1 * sin1);
  const r1 = (p.a * (1 - e2)) / (1 - e2 * sin1 * sin1) ** 1.5;
  const d = (x * p.unit - p.fe * p.unit) / (n1 * p.k0);

  const lat =
    phi1 -
    ((n1 * tan1) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720);
  const lon =
    p.lon0 * RAD +
    (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120) /
      cos1;
  return [lon / RAD, lat / RAD];
}

function webMercatorInverse(x: number, y: number): [number, number] {
  return [(x / WGS84_A) / RAD, (2 * Math.atan(Math.exp(y / WGS84_A)) - Math.PI / 2) / RAD];
}

/**
 * A function from source coordinates to `[lng, lat]`, or null for an unsupported system.
 * With no projection at all, coordinates are taken as degrees if every one of them could be.
 */
export function toWgs84(p: Projection | null): ((x: number, y: number) => [number, number]) | null {
  if (!p || p.kind === 'geographic') return (x, y) => [x, y];
  if (p.kind === 'tm') return (x, y) => tmInverse(x, y, p);
  if (p.kind === 'webmercator') return webMercatorInverse;
  return null;
}

export function describeProjection(p: Projection | null): string {
  if (!p) return 'No .prj — read as WGS 84 degrees';
  if (p.kind === 'geographic') return `${p.name || 'Geographic'} (degrees)`;
  if (p.kind === 'tm') return `${p.name || 'Transverse Mercator'} → WGS 84`;
  if (p.kind === 'webmercator') return 'Web Mercator → WGS 84';
  return p.name || 'Unsupported coordinate system';
}
