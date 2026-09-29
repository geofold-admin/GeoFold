/**
 * build-land.mjs — generate the simplified world outlines that SurveyGlobe draws.
 *
 * ONE-SHOT GENERATOR, not part of the build. It fetches Natural Earth's 110m land polygons
 * (public domain) through world-atlas, decodes the TopoJSON, simplifies with Douglas-Peucker, and
 * writes src/components/land.ts. Run it only to regenerate that file:
 *
 *   node scripts/build-land.mjs
 *
 * WHY A GENERATOR AND NOT A DEPENDENCY. The globe needs coastlines; it does not need a projection
 * library, a GeoJSON parser and 200 KB of vector data at runtime. The output is a few hundred
 * coordinate pairs, which is all a 300px globe can actually show.
 */
import { writeFileSync } from 'node:fs'

const SRC = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json'
const TOL = 0.55 // degrees; on a 300px globe a degree is under a pixel, so this is below the noise floor
const MIN_SPAN = 1.2 // degrees; drops specks that would render as one pixel

const res = await fetch(SRC)
if (!res.ok) throw new Error(`fetch ${SRC} -> ${res.status}`)
const topo = await res.json()

const obj = topo.objects.land ?? Object.values(topo.objects)[0]
console.log(`source object: ${obj.type}, ${obj.geometries?.length ?? 'n/a'} geometries`)

const [sx, sy] = topo.transform.scale
const [tx, ty] = topo.transform.translate

/* TopoJSON arcs are delta-encoded against a running position that starts at the origin. */
const arcs = topo.arcs.map((arc) => {
  let x = 0
  let y = 0
  return arc.map(([dx, dy]) => {
    x += dx
    y += dy
    return [x * sx + tx, y * sy + ty]
  })
})

function ringFor(indexes) {
  const pts = []
  for (const i of indexes) {
    const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]
    if (pts.length) pts.pop() // consecutive arcs share their endpoint
    for (const p of a) pts.push(p)
  }
  return pts
}

const rings = []
for (const g of obj.geometries ?? []) {
  const polys = g.type === 'MultiPolygon' ? g.arcs : [g.arcs]
  for (const poly of polys) for (const r of poly) rings.push(ringFor(r))
}

/* Douglas-Peucker, iterative so a long coastline cannot blow the stack. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [lo, hi] = stack.pop()
    if (hi - lo < 2) continue
    const [x1, y1] = pts[lo]
    const [x2, y2] = pts[hi]
    const dx = x2 - x1
    const dy = y2 - y1
    const norm = Math.hypot(dx, dy)
    let best = 0
    let at = -1
    for (let i = lo + 1; i < hi; i++) {
      const [x, y] = pts[i]
      const d = norm === 0 ? Math.hypot(x - x1, y - y1) : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm
      if (d > best) {
        best = d
        at = i
      }
    }
    if (best > tol && at > 0) {
      keep[at] = 1
      stack.push([lo, at], [at, hi])
    }
  }
  return pts.filter((_, i) => keep[i])
}

const out = []
let dropped = 0
for (const r of rings) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of r) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const span = Math.max(maxX - minX, maxY - minY)
  if (span < MIN_SPAN) { dropped++; continue }
  const s = simplify(r, TOL)
  if (s.length < 4) { dropped++; continue }
  const flat = []
  for (const [lon, lat] of s) flat.push(Math.round(lon * 10) / 10, Math.round(lat * 10) / 10)
  out.push(flat)
}

const points = out.reduce((n, r) => n + r.length / 2, 0)
console.log(`rings kept ${out.length}, dropped ${dropped}, points ${points}`)

const header = `/**
 * Simplified world land outlines for SurveyGlobe.
 *
 * GENERATED — do not edit by hand. Regenerate with \`node scripts/build-land.mjs\`.
 *
 * Source: Natural Earth 110m land (public domain), via the world-atlas package on jsDelivr.
 * Simplification: Douglas-Peucker at ${TOL} degrees; rings spanning under ${MIN_SPAN} degrees dropped.
 * Encoding: one flat array per ring, \`[lon, lat, lon, lat, ...]\`, rounded to 0.1 degrees.
 * ${out.length} rings, ${points} points.
 *
 * WHY THE DATA IS IN THE BUNDLE AND NOT FETCHED. A globe that needs the network to draw its
 * coastlines cannot draw them offline — and a marketing page for an offline-first survey tool
 * should not depend on a CDN to show the one thing it is about.
 */
`

const body = `export const LAND_RINGS: readonly (readonly number[])[] = [\n${out.map((r) => `  [${r.join(',')}],`).join('\n')}\n]\n`

writeFileSync('src/components/land.ts', header + '\n' + body)
console.log('wrote src/components/land.ts')
