import type { GridCell } from './grid';

/**
 * Turns the survey grid into a flight plan.
 *
 * This is the join the whole grid exists for: the grid answers *which ground has been covered*, and
 * a mission answers *how to cover the rest*. Cell centres are the natural waypoints — a photo taken
 * at the centre of a cell is the one that best represents it, and it is what makes a cell count as
 * surveyed when the points come back.
 *
 * **The order matters more than the points.** Waypoints visited row by row, always west to east,
 * make the aircraft fly the width of the plot backwards between every row — on a 20-cell-wide plot
 * that is nineteen wasted crossings, and on a Mini's battery that is the difference between
 * finishing a plot and not. So rows alternate direction: a boustrophedon, the way a field is
 * ploughed.
 *
 * Planning is deliberately separate from flying. It works on any aircraft, including the ones DJI
 * refuses to fly missions on — a surveyor with a Mavic Mini can read the plan off the map and fly
 * it by hand, and still get the coverage the grid is asking for.
 */

export interface MissionWaypoint {
  latitude: number;
  longitude: number;
  /** Metres above the take-off point, which is how DJI measures a waypoint's altitude. */
  altitude: number;
  /** The cell this waypoint sits in, so a captured photo can be tied back to the grid. */
  cellId: string;
  label: string;
}

export interface MissionPlan {
  waypoints: MissionWaypoint[];
  /** Straight-line ground distance along the route, metres. Excludes climb and descent. */
  distanceMetres: number;
  altitude: number;
}

/** The DJI limit: a single waypoint mission may hold at most this many points. */
export const MAX_WAYPOINTS = 99;

/** Centre of a cell's ring. The ring is a closed lng/lat rectangle, south-west corner first. */
function centre(cell: GridCell): { latitude: number; longitude: number } | null {
  // The closing point repeats the first, so it is dropped before averaging or the south-west
  // corner would be counted twice and pull the centre towards it.
  const ring = cell.ring.slice(0, 4);
  if (ring.length < 4) return null;

  let lng = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  const point = { longitude: lng / ring.length, latitude: lat / ring.length };
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude) ? point : null;
}

/** Metres between two WGS-84 points. Haversine is ample at the scale of one survey plot. */
export function metresBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Builds a route over the cells that still need covering.
 *
 * `onlyUncovered` is the default because re-flying ground that already has a survey point wastes
 * the battery that the rest of the plot needs. Passing false plans the whole plot, which is what a
 * fresh survey wants.
 */
export function planFromGrid(
  cells: GridCell[],
  altitude: number,
  options: { onlyUncovered?: boolean } = {},
): MissionPlan {
  const onlyUncovered = options.onlyUncovered ?? true;

  const wanted = cells.filter(
    (cell) => cell.onPlot && (onlyUncovered ? cell.count === 0 : true),
  );

  // Grouped by row so the serpentine can alternate direction. The cell id is
  // `${cellMetres}:${col}:${row}`, which is the only place the row index survives on a GridCell.
  const rows = new Map<number, { col: number; cell: GridCell }[]>();
  for (const cell of wanted) {
    const parts = cell.id.split(':');
    const col = Number(parts[1]);
    const row = Number(parts[2]);
    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
    const list = rows.get(row) ?? [];
    list.push({ col, cell });
    rows.set(row, list);
  }

  const waypoints: MissionWaypoint[] = [];
  const ordered = [...rows.keys()].sort((a, b) => a - b);

  ordered.forEach((row, index) => {
    const list = rows.get(row)!.sort((a, b) => a.col - b.col);
    // Every other row is flown east to west, so the aircraft never crosses the plot empty.
    if (index % 2 === 1) list.reverse();

    for (const { cell } of list) {
      const point = centre(cell);
      if (!point) continue;
      waypoints.push({
        latitude: point.latitude,
        longitude: point.longitude,
        altitude,
        cellId: cell.id,
        label: cell.label,
      });
    }
  });

  // Truncated rather than rejected: a plot larger than one mission is normal, and half a plot
  // flown is worth more than an error. The screen says how many were dropped.
  const capped = waypoints.slice(0, MAX_WAYPOINTS);

  let distanceMetres = 0;
  for (let i = 1; i < capped.length; i += 1) {
    distanceMetres += metresBetween(
      capped[i - 1].latitude,
      capped[i - 1].longitude,
      capped[i].latitude,
      capped[i].longitude,
    );
  }

  return { waypoints: capped, distanceMetres, altitude };
}

/** "1.2 km" or "840 m" — the same rounding the ruler uses. */
export function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(2)} km`;
}
