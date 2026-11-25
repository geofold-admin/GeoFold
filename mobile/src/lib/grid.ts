/**
 * A metric survey grid — the quadrats a land surveyor lays over a parcel, and the sampling cells a
 * wildlife surveyor walks a protected block in.
 *
 * The grid is built in **UTM, not in degrees**, and that choice is the whole point of this file.
 * A "100 m" grid drawn as a fixed number of degrees is not square — a degree of longitude shrinks
 * towards the poles — and worse, it drifts: the same patch of ground falls in a different cell
 * depending on where the viewport happens to be. That makes coverage meaningless, which is the one
 * thing a survey grid exists to record. UTM is metres on the ground, so cells are square, are
 * anchored to absolute eastings and northings, and name the same ground on every visit and on
 * every device.
 *
 * The projection is Snyder's transverse Mercator series on the WGS84 ellipsoid — the same series
 * every UTM implementation uses, good to well under a centimetre inside a zone. It is written out
 * here rather than pulled in: it is sixty lines, and the app carries no geodesy dependency.
 */

// ── WGS84 / UTM constants ───────────────────────────────────────────────────────

const A = 6_378_137; // semi-major axis, metres
const F = 1 / 298.257223563; // flattening
const K0 = 0.9996; // UTM scale factor along the central meridian
const E2 = F * (2 - F); // first eccentricity squared
const EP2 = E2 / (1 - E2); // second eccentricity squared
const FALSE_EASTING = 500_000;
const FALSE_NORTHING = 10_000_000; // added in the southern hemisphere to keep northings positive

/** UTM is only defined between these latitudes; beyond them the series diverges. */
const MIN_LAT = -80;
const MAX_LAT = 84;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const clampLat = (lat: number) => Math.min(MAX_LAT, Math.max(MIN_LAT, lat));

export interface UtmPoint {
  easting: number;
  northing: number;
}

/** The 6°-wide zone a longitude falls in, 1–60. */
export function utmZone(longitude: number): number {
  const wrapped = (((longitude + 180) % 360) + 360) % 360;
  return Math.floor(wrapped / 6) + 1;
}

/** Central meridian of a zone, in degrees. */
function centralMeridian(zone: number): number {
  return (zone - 1) * 6 - 180 + 3;
}

/**
 * The MGRS latitude band letter, so a reference reads "48M" the way a surveyor writes it.
 * I and O are skipped — they are too easily read as 1 and 0 on a wet field notebook.
 */
export function latitudeBand(latitude: number): string {
  const bands = 'CDEFGHJKLMNPQRSTUVWX';
  const index = Math.floor((clampLat(latitude) + 80) / 8);
  return bands[Math.min(bands.length - 1, Math.max(0, index))];
}

/**
 * Project to UTM in an **explicitly given zone** rather than the point's natural one. Pinning one
 * zone across the whole grid is what keeps cells continuous for a survey area that straddles a
 * zone boundary; the slight extra scale distortion outside the zone is far smaller than the seam
 * a zone switch would put through the middle of the grid.
 */
export function toUtm(
  latitude: number,
  longitude: number,
  zone: number,
  southern?: boolean,
): UtmPoint {
  const phi = rad(clampLat(latitude));

  // Wrapped into (-180°, 180°] so a grid straddling the antimeridian still projects sensibly.
  let dLambda = rad(longitude) - rad(centralMeridian(zone));
  while (dLambda > Math.PI) dLambda -= 2 * Math.PI;
  while (dLambda < -Math.PI) dLambda += 2 * Math.PI;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const n = A / Math.sqrt(1 - E2 * sinPhi * sinPhi);
  const t = tanPhi * tanPhi;
  const c = EP2 * cosPhi * cosPhi;
  const a = dLambda * cosPhi;

  // Meridional arc from the equator.
  const m =
    A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi));

  const easting =
    K0 *
      n *
      (a +
        ((1 - t + c) * a ** 3) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5) / 120) +
    FALSE_EASTING;

  let northing =
    K0 *
    (m +
      n *
        tanPhi *
        ((a * a) / 2 +
          ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6) / 720));

  // The hemisphere convention is a property of the *grid*, not of the individual point. Deciding it
  // per point puts a 10 000 km cliff through the equator — and this app's own default view sits on
  // it, in Kalimantan. A grid passes its own hemisphere so every cell shares one origin; the
  // `latitude < 0` default is only for one-off conversions that have no grid to belong to.
  if (southern ?? latitude < 0) northing += FALSE_NORTHING;

  return { easting, northing };
}

/** Inverse of {@link toUtm}. */
export function fromUtm(
  easting: number,
  northing: number,
  zone: number,
  southern: boolean,
): { latitude: number; longitude: number } {
  const x = easting - FALSE_EASTING;
  const y = southern ? northing - FALSE_NORTHING : northing;

  const mu = y / K0 / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));

  // Footpoint latitude.
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const c1 = EP2 * cosPhi1 * cosPhi1;
  const t1 = tanPhi1 * tanPhi1;
  const n1 = A / Math.sqrt(1 - E2 * sinPhi1 * sinPhi1);
  const r1 = (A * (1 - E2)) / (1 - E2 * sinPhi1 * sinPhi1) ** 1.5;
  const d = x / (n1 * K0);

  const latitude = deg(
    phi1 -
      ((n1 * tanPhi1) / r1) *
        ((d * d) / 2 -
          ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4) / 24 +
          ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6) / 720),
  );

  const longitude =
    centralMeridian(zone) +
    deg(
      (d -
        ((1 + 2 * t1 + c1) * d ** 3) / 6 +
        ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5) / 120) /
        cosPhi1,
    );

  return { latitude, longitude };
}

// ── Grid ────────────────────────────────────────────────────────────────────────

/** Cell edge lengths offered as chips in the UI, in metres. */
export const CELL_SIZES = [10, 25, 50, 100, 250, 500, 1000] as const;

/** A fixed edge length in metres, or `'auto'` to follow the zoom. */
export type CellSizeSetting = number | 'auto';

export const DEFAULT_CELL_SIZE: CellSizeSetting = 'auto';

/**
 * What `'auto'` may choose from. Wider than the chips at both ends: zoomed right out a surveyor
 * still wants *a* grid rather than none, and zoomed onto a single tree they want metres.
 */
const AUTO_LADDER = [
  1, 2, 5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000,
];

/** Roughly how many cells should span the viewport's width under `'auto'`. */
const TARGET_CELLS_ACROSS = 10;

/**
 * Pick the ladder step closest to `width / TARGET_CELLS_ACROSS`, compared on a log scale — the
 * gaps between steps are multiplicative, so 250 sits between 100 and 500 by ratio and not by
 * subtraction. Nearest-by-ratio is what stops a step feeling like a jump.
 */
function chooseCellSize(groundWidthMetres: number): number {
  if (!Number.isFinite(groundWidthMetres) || groundWidthMetres <= 0) return 100;

  const ideal = groundWidthMetres / TARGET_CELLS_ACROSS;
  let best = AUTO_LADDER[0];
  let bestDistance = Infinity;

  for (const step of AUTO_LADDER) {
    const distance = Math.abs(Math.log(step) - Math.log(ideal));
    if (distance < bestDistance) {
      best = step;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Above this, the grid is not drawn at all. It would be a grey wash at that density anyway, and
 * every cell is a polygon the native renderer has to parse on each pan.
 */
export const MAX_CELLS = 600;

export function formatCellSize(metres: number): string {
  return metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
}

export interface GridCell {
  /** Stable across pans and devices — it is the cell's position in the grid, not in the view. */
  id: string;
  /** On-map label; empty for off-plot cells. See the note in `buildGrid`. */
  label: string;
  /** Full grid reference of the cell's south-west corner, e.g. "48M 654300E 9871200N". */
  reference: string;
  /** How many of the supplied points fall inside. Zero means uncovered ground. */
  count: number;
  /** False only for cells south or west of a set origin — ground outside the plot. */
  onPlot: boolean;
  /** Closed lng/lat ring, south-west corner first. */
  ring: [number, number][];
}

/**
 * Everything needed to place a coordinate in the grid: the zone and hemisphere the grid is pinned
 * to, and the origin its cells are counted from. Carried as one value so a tap can be resolved
 * with exactly the frame the cells were drawn in — a tap resolved in a different zone or against a
 * different origin would name the wrong cell, and nothing in the UI would look wrong.
 */
export interface GridFrame {
  zone: number;
  southern: boolean;
  /** {0, 0} for the absolute UTM grid; the anchor's easting/northing when one is set. */
  origin: UtmPoint;
  cellMetres: number;
  anchored: boolean;
}

export interface Grid {
  cells: GridCell[];
  frame: GridFrame;
  /** On-plot cells in view holding at least one point. */
  covered: number;
  /** On-plot cells in view. */
  total: number;
  /** True when the viewport holds more than {@link MAX_CELLS}; `cells` is empty and the UI says so. */
  tooDense: boolean;
  /** Grid reference of the origin, when one is set. */
  originReference: string | null;
}

export interface GridPoint {
  latitude: number;
  longitude: number;
}

/** An origin the surveyor placed by tapping — normally the plot's south-west corner. */
export type GridAnchor = GridPoint | null;

/**
 * Spreadsheet-style column names: A…Z, AA, AB… Bijective base-26, so there is no "column zero"
 * to trip over the way a plain base conversion would.
 */
export function columnLabel(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Which cell a coordinate falls in. Exported so a tap resolves by arithmetic, not by hit-testing. */
export function cellIndexAt(
  latitude: number,
  longitude: number,
  frame: GridFrame,
): { col: number; row: number } {
  const { easting, northing } = toUtm(latitude, longitude, frame.zone, frame.southern);
  return {
    col: Math.floor((easting - frame.origin.easting) / frame.cellMetres),
    row: Math.floor((northing - frame.origin.northing) / frame.cellMetres),
  };
}

export function cellId(col: number, row: number, cellMetres: number): string {
  return `${cellMetres}:${col}:${row}`;
}

/**
 * The frame a grid will be drawn in. Split out from {@link buildGrid} because the zone and
 * hemisphere have to be decided once — from the anchor if there is one, so the grid does not
 * renumber itself when the surveyor pans towards a zone boundary or across the equator.
 */
export function gridFrame(
  bounds: [number, number, number, number],
  cellSize: CellSizeSetting,
  anchor: GridAnchor = null,
): GridFrame {
  const [west, south, east, north] = bounds;
  const zone = utmZone(anchor ? anchor.longitude : (west + east) / 2);
  const southern = anchor ? anchor.latitude < 0 : (south + north) / 2 < 0;
  const origin = anchor
    ? toUtm(anchor.latitude, anchor.longitude, zone, southern)
    : { easting: 0, northing: 0 };

  let cellMetres: number;
  if (cellSize === 'auto') {
    // Ground width of the viewport, measured in the grid's own projection so it is metres rather
    // than degrees — which is the whole reason the cell it picks stays square.
    const eastings = [
      toUtm(south, west, zone, southern).easting,
      toUtm(south, east, zone, southern).easting,
      toUtm(north, west, zone, southern).easting,
      toUtm(north, east, zone, southern).easting,
    ];
    cellMetres = chooseCellSize(Math.max(...eastings) - Math.min(...eastings));
  } else {
    cellMetres = cellSize;
  }

  return { zone, southern, origin, cellMetres, anchored: anchor != null };
}

/**
 * Build the cells covering `bounds` ([west, south, east, north]) and tally `points` into them.
 *
 * **Labels.** With an origin set, cells are named from it the way a survey plot is: A1 is the cell
 * whose south-west corner is the origin, columns run east, rows run north. Ground south or west of
 * the origin is off-plot — still drawn, so the lattice stays continuous, but unlabelled and
 * excluded from the coverage count, because it is not part of the plot being surveyed.
 *
 * Without an origin the grid is absolute UTM, and cells carry the last two digits of their column
 * and row — "43·71". The full indices run to five or six digits, unreadable at cell size; two is
 * enough to tell a cell from its neighbours, and the tapped cell's panel carries the full
 * reference for anything that has to be written down.
 */
export function buildGrid(
  bounds: [number, number, number, number],
  cellSize: CellSizeSetting,
  points: GridPoint[],
  anchor: GridAnchor = null,
): Grid {
  const [west, south, east, north] = bounds;
  const frame = gridFrame(bounds, cellSize, anchor);
  const { zone, southern, origin, cellMetres } = frame;

  const project = (lat: number, lng: number) => toUtm(lat, lng, zone, southern);

  // All four corners, because a projected rectangle is not axis-aligned — taking only the
  // south-west and north-east corners would leave a wedge of the viewport ungridded.
  const corners = [
    project(south, west),
    project(south, east),
    project(north, west),
    project(north, east),
  ];
  const cols = corners.map((c) => Math.floor((c.easting - origin.easting) / cellMetres));
  const rows = corners.map((c) => Math.floor((c.northing - origin.northing) / cellMetres));

  const colMin = Math.min(...cols);
  const colMax = Math.max(...cols);
  const rowMin = Math.min(...rows);
  const rowMax = Math.max(...rows);

  const cellCount = (colMax - colMin + 1) * (rowMax - rowMin + 1);
  const band = latitudeBand(anchor ? anchor.latitude : (south + north) / 2);
  const originReference = anchor
    ? `${zone}${band} ${Math.round(origin.easting)}E ${Math.round(origin.northing)}N`
    : null;

  if (!Number.isFinite(cellCount) || cellCount <= 0 || cellCount > MAX_CELLS) {
    return {
      cells: [],
      frame,
      covered: 0,
      total: 0,
      tooDense: cellCount > MAX_CELLS,
      originReference,
    };
  }

  // Tally first, so each cell is a lookup rather than a scan of every point.
  const counts = new Map<string, number>();
  for (const point of points) {
    const { col, row } = cellIndexAt(point.latitude, point.longitude, frame);
    const key = `${col}:${row}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const pad2 = (n: number) => String(((n % 100) + 100) % 100).padStart(2, '0');

  const cells: GridCell[] = [];
  let covered = 0;
  let total = 0;

  for (let col = colMin; col <= colMax; col++) {
    for (let row = rowMin; row <= rowMax; row++) {
      const e0 = origin.easting + col * cellMetres;
      const n0 = origin.northing + row * cellMetres;
      const e1 = e0 + cellMetres;
      const n1 = n0 + cellMetres;

      const sw = fromUtm(e0, n0, zone, southern);
      const se = fromUtm(e1, n0, zone, southern);
      const ne = fromUtm(e1, n1, zone, southern);
      const nw = fromUtm(e0, n1, zone, southern);

      const onPlot = !anchor || (col >= 0 && row >= 0);
      const count = counts.get(`${col}:${row}`) ?? 0;
      if (onPlot) {
        total++;
        if (count > 0) covered++;
      }

      cells.push({
        id: cellId(col, row, cellMetres),
        label: anchor
          ? onPlot
            ? `${columnLabel(col)}${row + 1}`
            : ''
          : `${pad2(col)}·${pad2(row)}`,
        reference: `${zone}${band} ${Math.round(e0)}E ${Math.round(n0)}N`,
        count,
        onPlot,
        ring: [
          [sw.longitude, sw.latitude],
          [se.longitude, se.latitude],
          [ne.longitude, ne.latitude],
          [nw.longitude, nw.latitude],
          [sw.longitude, sw.latitude],
        ],
      });
    }
  }

  return { cells, frame, covered, total, tooDense: false, originReference };
}

/** The cells as a GeoJSON FeatureCollection, ready to hand to a MapLibre source. */
export function gridFeatureCollection(cells: GridCell[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cells.map((cell) => ({
      type: 'Feature',
      id: cell.id,
      geometry: { type: 'Polygon', coordinates: [cell.ring] },
      properties: { id: cell.id, label: cell.label, count: cell.count, onPlot: cell.onPlot },
    })),
  };
}
