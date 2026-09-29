#!/usr/bin/env node
/**
 * build-terrain-3d.mjs — emits the hero's REAL DEM as a compact binary the browser can decode.
 *
 * WHY THIS EXISTS. The hero used to carry `public/hero-terrain.png`: a 1200x880 render of a
 * terrain block, generated at build time by build-terrain.mjs. It is a good picture and a dead
 * one — it cannot be turned. The client asked for the hero map to be a real 3D map. A WebGL
 * mesh can be turned; a PNG cannot. But the mesh has to be driven by the SAME elevation the PNG
 * was drawn from, or the two disagree about the ground.
 *
 * So this runs the identical conditioning chain (scripts/lib/dem.mjs) over the SAME cached
 * terrarium tiles and writes the grid as a small binary instead of a picture.
 *
 * FORMAT (`public/hero-terrain-dem.bin`, little-endian, 38-byte header + uint16 payload):
 *
 *   0   u32   magic 0x33464447 ("GFD3")
 *   4   u16   N            samples per side
 *   6   f32   zLo          low  clip, metres (p0.5)
 *   10  f32   zHi          high clip, metres (p99.5)
 *   14  f32   cellX        metres per cell, east-west
 *   18  f32   cellY        metres per cell, north-south
 *   22  f32   spanDeg      degrees each way from the centre
 *   26  f32   centreLat
 *   30  f32   centreLon
 *   34  u32   count        N*N
 *   38  int16[] decimetres, row-major, north-to-south then west-to-east
 *
 * Decimetres rather than metres: this window spans 19..1397 m, so uint16 metres would quantise
 * the whole inhabited basin into ~26 distinct heights and give the lowland visible terracing.
 * A decimetre step is 0.1 m — below the DEM's own vertical noise — and still fits in int16.
 * SIGNED, so a cell below the p0.5 clip (this window's floor is 19 m against a 21 m clip) is
 * kept rather than clamped flat.
 *
 * RUN: node scripts/build-terrain-3d.mjs            (writes public/hero-terrain-dem.bin)
 *      node scripts/build-terrain-3d.mjs --stats    (prints the grid summary only)
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadElevation, percentile, ROOT } from './lib/dem.mjs'

/* The same window build-terrain.mjs renders, and the same constants. Sintang sits in the Kapuas
   basin, whose relief within 38 km of the town is a measured 26 m; the window is pulled south to
   include the highland front so the block reads as a region rather than a plate. SITE must fall
   inside it, asserted below — a hero captioned with a place it does not show is worse than one
   that names nowhere. */
const SITE = { lat: 0.0756, lon: 111.4954 }
const CENTRE = { lat: Number(process.env.TERRAIN_LAT ?? -0.12), lon: Number(process.env.TERRAIN_LON ?? 111.28) }
const SPAN = Number(process.env.TERRAIN_SPAN ?? 0.44)
const Z = 12
const N = Number(process.env.TERRAIN_N3D ?? 256)

const WLO = 0.005
const WHI = 0.995

const { grid, cellX, cellY, tiles } = await loadElevation({
  centre: CENTRE,
  span: SPAN,
  zoom: Z,
  n: N,
  medianRadius: 2,
  blurPasses: 2,
})

const zLo = percentile(grid, WLO)
const zHi = percentile(grid, WHI)
const span = zHi - zLo || 1

const inside = Math.abs(SITE.lat - CENTRE.lat) <= SPAN && Math.abs(SITE.lon - CENTRE.lon) <= SPAN
if (!inside) throw new Error(`SITE ${JSON.stringify(SITE)} is outside the ${SPAN} deg window`)

const sorted = Float32Array.from(grid).sort()
console.log(
  `grid       ${N}x${N}  tiles ${tiles.cols}x${tiles.rows} at z${Z}  ` +
    `elevation min ${sorted[0].toFixed(0)}  p0.5 ${zLo.toFixed(0)}  p50 ${percentile(grid, 0.5).toFixed(0)}  ` +
    `p99.5 ${zHi.toFixed(0)}  max ${sorted[sorted.length - 1].toFixed(0)}  (metres)`,
)
console.log(`cell       ${cellX.toFixed(0)} x ${cellY.toFixed(0)} m`)

/* THE QUANTISATION CHECK. This is the number that would have caught a metres-per-unit payload:
   how many distinct heights survive the encoding, and how large a step one unit represents. */
let dmMin = Infinity
let dmMax = -Infinity
const distinct = new Set()
for (const v of grid) {
  const dm = Math.round((v - zLo) * 10)
  if (dm < dmMin) dmMin = dm
  if (dm > dmMax) dmMax = dm
  distinct.add(dm)
}
if (dmMin < -32768 || dmMax > 32767) throw new Error(`decimetre range ${dmMin}..${dmMax} does not fit int16`)
console.log(
  `encoding   int16 decimetres  range ${dmMin}..${dmMax}  ` +
    `step 0.100 m  distinct ${distinct.size}  payload ${(2 * N * N / 1024).toFixed(1)} KiB`,
)

if (process.argv.includes('--stats')) process.exit(0)

/* ---- pack ---- */
const HEADER = 38
const buf = Buffer.alloc(HEADER + 2 * N * N)
buf.writeUInt32LE(0x33464447, 0) // "GFD3"
buf.writeUInt16LE(N, 4)
buf.writeFloatLE(zLo, 6)
buf.writeFloatLE(zHi, 10)
buf.writeFloatLE(cellX, 14)
buf.writeFloatLE(cellY, 18)
buf.writeFloatLE(SPAN, 22)
buf.writeFloatLE(CENTRE.lat, 26)
buf.writeFloatLE(CENTRE.lon, 30)
buf.writeUInt32LE(N * N, 34)
for (let i = 0; i < grid.length; i++) {
  const dm = Math.max(-32768, Math.min(32767, Math.round((grid[i] - zLo) * 10)))
  buf.writeInt16LE(dm, HEADER + i * 2)
}

const OUT = join(ROOT, 'public', 'hero-terrain-dem.bin')
writeFileSync(OUT, buf)
console.log(`wrote      public/hero-terrain-dem.bin  ${(buf.length / 1024).toFixed(1)} KiB`)
