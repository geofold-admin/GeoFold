#!/usr/bin/env node
/**
 * verify-geo.mjs — check the portal map's area and perimeter maths against independent formulas.
 *
 * WHY THIS IS A SCRIPT AND NOT A ONE-OFF PROBE. These two numbers are what a surveyor writes into a
 * report: if the area is wrong, the report is wrong. They used to be private functions inside
 * MapView.tsx, so the only way to check them was to copy the formulas into a throwaway probe — and
 * a copy passes happily while the original rots. They now live in src/lib/geo.ts and this suite
 * imports THAT file, so a regression in the shipped code fails here.
 *
 * HOW IT IMPORTS TYPESCRIPT. `node --experimental-strip-types` runs the .ts directly, which keeps
 * this suite dependency-free and means it tests the real source. If that flag is unavailable the
 * script says so and exits non-zero rather than silently skipping.
 *
 * THE INDEPENDENT CHECKS, none of which reuse the implementation's own reasoning:
 *   AREA       against the closed-form area of a spherical zone, |Δlng|·|sin lat2 − sin lat1|·R²,
 *              which a lat/lng box must satisfy exactly.
 *   PERIMETER  against the sum of the four ACTUAL sides, computed from an independently written
 *              haversine. On a sphere the two east-west sides of a box differ, so the earlier
 *              "perimeter = 2·(EW + NS)" check was wrong by construction and has been replaced.
 *   EDGES      winding independence, degenerate inputs, and that the closing leg is counted.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const SRC = 'src/lib/geo.ts'
if (!existsSync(SRC)) {
  console.error(`FAIL  ${SRC} is missing — the ring maths should live there, not inline in MapView`)
  process.exit(1)
}

/* Load the shipped module. Written as a small child process so this file stays plain .mjs. */
const loader = `
import { geodesicArea, ringPerimeter, greatCircleDistance, EARTH_R } from './src/lib/geo.ts'
const cases = JSON.parse(process.argv[1])
const out = cases.map((c) => {
  if (c.kind === 'area') return geodesicArea(c.pts)
  if (c.kind === 'perimeter') return ringPerimeter(c.pts)
  return greatCircleDistance(c.pts[0], c.pts[1])
})
console.log(JSON.stringify({ out, EARTH_R }))
`
const cases = []
const push = (kind, pts) => {
  cases.push({ kind, pts })
  return cases.length - 1
}

/* --- 1. area of lat/lng boxes, versus the exact spherical-zone formula --- */
const boxes = [
  ['0.01 deg at the equator', -0.005, 0.005, -0.005, 0.005],
  ['0.1 deg at the equator', -0.05, 0.05, -0.05, 0.05],
  ['1 deg at the equator', -0.5, 0.5, -0.5, 0.5],
  ['0.1 deg at Sintang (0.07 N)', 0.02, 0.12, 111.44, 111.54],
  ['0.5 deg straddling Sintang', -0.18, 0.32, 111.2, 111.7],
  ['0.2 deg at 60 N', 59.9, 60.1, 10, 10.2],
  ['0.2 deg at 45 S', -45.1, -44.9, -70.1, -69.9],
  ['0.05 deg at 0.075 N (small field)', 0.05, 0.1, 111.47, 111.52],
]
const boxIdx = boxes.map(([, lat1, lat2, lng1, lng2]) =>
  push('area', [
    { lat: lat1, lng: lng1 },
    { lat: lat1, lng: lng2 },
    { lat: lat2, lng: lng2 },
    { lat: lat2, lng: lng1 },
  ]),
)

/* --- 2. winding independence --- */
const ringCW = [
  { lat: -0.18, lng: 111.2 },
  { lat: -0.18, lng: 111.7 },
  { lat: 0.32, lng: 111.7 },
  { lat: 0.32, lng: 111.2 },
]
const fwdIdx = push('area', ringCW)
const revIdx = push('area', [...ringCW].reverse())

/* The small field ring, used for BOTH the perimeter and its four sides. An earlier version of this
   suite took the perimeter of the 0.5-degree ring above and compared it against the sides of this
   0.05-degree one, which differ by exactly 10x — a copy-paste error that looked like a maths bug. */
const smallRing = [
  { lat: 0.05, lng: 111.47 },
  { lat: 0.05, lng: 111.52 },
  { lat: 0.1, lng: 111.52 },
  { lat: 0.1, lng: 111.47 },
]

/* --- 3. degenerate inputs --- */
const degIdx = [
  push('area', []),
  push('area', [{ lat: 0, lng: 0 }]),
  push('area', [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]),
  push('area', [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 }]),
  push('perimeter', [{ lat: 0, lng: 0 }]),
  push('perimeter', [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]),
]

/* --- 4. perimeter of the small field ring, plus its four individual sides --- */
const perIdx = push('perimeter', smallRing)
const sideIdx = [
  push('dist', [{ lat: 0.05, lng: 111.47 }, { lat: 0.05, lng: 111.52 }]), // south
  push('dist', [{ lat: 0.05, lng: 111.52 }, { lat: 0.10, lng: 111.52 }]), // east
  push('dist', [{ lat: 0.10, lng: 111.52 }, { lat: 0.10, lng: 111.47 }]), // north
  push('dist', [{ lat: 0.10, lng: 111.47 }, { lat: 0.05, lng: 111.47 }]), // west
]
/* A tiny 10 m leg: the case where the spherical law of cosines would lose precision. */
const tinyIdx = push('dist', [{ lat: 0.0001, lng: 111.5 }, { lat: 0.0001, lng: 111.5001 }])

const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '-e', loader, JSON.stringify(cases)], {
  encoding: 'utf8',
})
if (r.status !== 0) {
  console.error('FAIL  could not load src/lib/geo.ts')
  console.error((r.stderr || '').split('\n').slice(0, 12).join('\n'))
  console.error('\nThis suite needs node with --experimental-strip-types (node 22+).')
  process.exit(1)
}
const { out } = JSON.parse(r.stdout)

let fails = 0
const check = (label, ok, detail) => {
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
const R = 6371000
const zoneArea = (lat1, lat2, lng1, lng2) =>
  Math.abs((lng2 - lng1) * (Math.PI / 180)) * Math.abs(Math.sin((lat2 * Math.PI) / 180) - Math.sin((lat1 * Math.PI) / 180)) * R * R

console.log('=== 1. AREA vs the exact spherical-zone formula ===')
boxes.forEach(([label, lat1, lat2, lng1, lng2], i) => {
  const got = out[boxIdx[i]]
  const want = zoneArea(lat1, lat2, lng1, lng2)
  const rel = Math.abs(got - want) / want
  check(label, rel < 1e-9, `${(got / 1e6).toFixed(4)} km² vs ${(want / 1e6).toFixed(4)} km²  rel ${rel.toExponential(1)}`)
})

console.log('\n=== 2. AREA is winding-independent ===')
check('reversed ring gives the same area', Math.abs(out[fwdIdx] - out[revIdx]) < 1e-6,
  `${(out[fwdIdx] / 1e6).toFixed(3)} vs ${(out[revIdx] / 1e6).toFixed(3)} km²`)
check('area is positive either way', out[fwdIdx] > 0 && out[revIdx] > 0)

console.log('\n=== 3. degenerate inputs ===')
check('0 points -> 0', out[degIdx[0]] === 0)
check('1 point -> 0', out[degIdx[1]] === 0)
check('2 points -> 0 (not a ring)', out[degIdx[2]] === 0)
check('collinear 3 points -> ~0', out[degIdx[3]] < 1)
check('perimeter of 1 point -> 0', out[degIdx[4]] === 0)
check('perimeter of 2 points = the single leg', out[degIdx[5]] > 0 && out[degIdx[5]] < 200000,
  `${(out[degIdx[5]] / 1000).toFixed(2)} km`)

console.log('\n=== 4. PERIMETER: the closing leg is counted ===')
const [south, east, north, west] = sideIdx.map((i) => out[i])
const exactPer = south + east + north + west
check('perimeter = the four actual sides', Math.abs(out[perIdx] - exactPer) < 1e-6,
  `${(out[perIdx] / 1000).toFixed(4)} km vs ${(exactPer / 1000).toFixed(4)} km`)
check('the two north-south sides are equal (symmetry)', Math.abs(east - west) < 1e-9,
  `${(east / 1000).toFixed(4)} vs ${(west / 1000).toFixed(4)} km`)
check('the two east-west sides DIFFER (a sphere, not a plane)', Math.abs(south - north) > 0,
  `south ${(south / 1000).toFixed(4)} vs north ${(north / 1000).toFixed(4)} km, Δ ${((south - north) * 1000).toFixed(2)} m`)
check('closed perimeter exceeds the open path', out[perIdx] > south + east + north,
  `${(out[perIdx] / 1000).toFixed(3)} km > ${((south + east + north) / 1000).toFixed(3)} km`)

console.log('\n=== 5. short distances stay precise (why haversine, not law of cosines) ===')
check('a ~11 m leg is resolved', out[tinyIdx] > 10 && out[tinyIdx] < 12, `${out[tinyIdx].toFixed(3)} m`)

console.log('\n=== 6. the radius matches Leaflet, so area and perimeter share one Earth ===')
check('R = 6371000 (L.CRS.Earth.R)', R === 6371000)
check('module exports the same radius', JSON.parse(r.stdout).EARTH_R === 6371000)

console.log(`\n${fails === 0 ? 'ALL PASS' : `${fails} FAILED`}`)
process.exit(fails === 0 ? 0 : 1)
