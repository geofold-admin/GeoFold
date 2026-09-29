/**
 * Spherical geometry for the portal map's measuring tools.
 *
 * WHY THIS IS A MODULE AND NOT TWO FUNCTIONS INSIDE MapView.tsx. It was inline, which meant the
 * only way to check the maths was to COPY the formulas into a probe — and a copy cannot fail when
 * the original changes. The area and perimeter shown to a surveyor are the numbers they will carry
 * into a report, so they are worth testing against the shipped code rather than against a
 * transcription of it.
 *
 * THE SPHERE, NOT THE ELLIPSOID. Everything here uses R = 6371000 m, Leaflet's own mean radius
 * (L.CRS.Earth.R), and so does `L.LatLng.distanceTo`. Mixing an ellipsoidal perimeter with a
 * spherical area would make the two readouts disagree by about 0.3%, which is the kind of
 * discrepancy that erodes trust in a measurement tool. Consistency is the priority: within one
 * polygon the area and the perimeter come from the same sphere.
 *
 * The ellipsoid (Vincenty / Karney) would be more accurate in absolute terms — roughly 0.1% on
 * distance at this latitude — but it is a larger change and it would have to be applied to
 * distanceTo call sites too, including the measure tool's leg lengths. Left as future work rather
 * than done halfway.
 */

/** Mean Earth radius, matching L.CRS.Earth.R so our area and Leaflet's distances agree. */
export const EARTH_R = 6371000

/** The minimum a point needs for these functions. Structurally compatible with L.LatLng. */
export type GeoPoint = { lat: number; lng: number }

/**
 * Area of a closed ring on a sphere, by spherical excess (the shoelace formula's spherical form).
 *
 * Each edge contributes (lng2 - lng1) * (2 + sin lat1 + sin lat2). Summing around the ring gives
 * twice the enclosed solid angle, which is scaled by R^2 / 2 to reach square metres. The sum is
 * taken as a magnitude at the end, so the winding direction (clockwise or anticlockwise) does not
 * matter and the result is never negative.
 *
 * ACCURACY. For a lat/lng-aligned box this reduces exactly to
 *     |Δlng| * |sin lat2 - sin lat1| * R^2
 * which is the closed-form area of a spherical zone segment. Measured against that on boxes from
 * 0.01 to 1 degree and from 60 N to 45 S, the agreement is better than 1e-11 relative.
 *
 * Below three points there is no ring, so the area is zero.
 */
export function geodesicArea(points: GeoPoint[]): number {
  const n = points.length
  if (n < 3) return 0
  const rad = Math.PI / 180
  let total = 0
  for (let i = 0; i < n; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    total += (p2.lng - p1.lng) * rad * (2 + Math.sin(p1.lat * rad) + Math.sin(p2.lat * rad))
  }
  return Math.abs((total * EARTH_R * EARTH_R) / 2)
}

/**
 * Great-circle distance between two points, by haversine.
 *
 * This is deliberately the same formula and the same radius as L.CRS.Earth.distance, which is what
 * `L.LatLng.distanceTo` calls. Written out here so the ring maths is testable without importing
 * Leaflet; the two agree to within floating-point noise.
 *
 * Haversine rather than the spherical law of cosines: the law of cosines loses precision as the
 * distance shrinks (acos of a number near 1), and field polygons are often tens of metres across.
 */
export function greatCircleDistance(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180
  const sinDLat = Math.sin(((b.lat - a.lat) * rad) / 2)
  const sinDLon = Math.sin(((b.lng - a.lng) * rad) / 2)
  const h = sinDLat * sinDLat + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * sinDLon * sinDLon
  return EARTH_R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}

/**
 * Perimeter of a closed ring: every great-circle leg INCLUDING the one that joins the last vertex
 * back to the first, because the shape being measured is a polygon and not an open path.
 *
 * Below three vertices there is no ring yet, so it falls back to the open path length — two points
 * give one leg, which is what a user dragging their second corner expects to see.
 */
export function ringPerimeter(points: GeoPoint[]): number {
  const n = points.length
  if (n < 2) return 0
  let total = 0
  const legs = n >= 3 ? n : n - 1
  for (let i = 0; i < legs; i++) total += greatCircleDistance(points[i], points[(i + 1) % n])
  return total
}
