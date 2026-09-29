#!/usr/bin/env node
/**
 * build-terrain.mjs — ONE-SHOT GENERATOR for the hero's 3D map image.
 *
 * WHY THIS EXISTS. The client asked for the hero to carry a 3D map, and supplied two reference
 * photos: both are *terrain blocks* — a slice of ground lifted out of the earth, viewed corner-on
 * at roughly 45 degrees, with the cut side walls visible under the relief. That is a specific
 * form, and the honest way to produce it is from real elevation data rather than by drawing a
 * lumpy shape that merely resembles one.
 *
 * So this reads REAL elevation for the place the business actually operates from — Sintang,
 * West Kalimantan — and renders it as an isometric block. The output is a static PNG checked into
 * `public/`, because the alternative (a WebGL terrain in the browser) would add a 3D engine to the
 * bundle to draw one picture that never changes.
 *
 * DATA. Mapzen/Terrarium terrain tiles, public domain, encoded as
 * `elevation = (R * 256 + G + B / 256) - 32768` metres. Tiles are cached under `.cache/terrain`
 * so a re-run costs nothing.
 *
 * RUN: node scripts/build-terrain.mjs            (writes public/hero-terrain.png)
 *      node scripts/build-terrain.mjs --stats    (prints the elevation histogram only)
 *
 * This is a build-time tool. It is NOT part of the app bundle and is not run by `next build`.
 */
import { PNG } from 'pngjs'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const CACHE = join(ROOT, '.cache', 'terrain')
const OUT = join(ROOT, 'public', process.env.TERRAIN_OUT ?? 'hero-terrain.png')

/* ==========================================================================================
   1. WHAT TO RENDER
   ========================================================================================== */

/** Sintang, West Kalimantan — the same constant the hero's coordinate readout prints and the
 *  globe marks. Read from lib/business.ts by hand rather than imported, because this script runs
 *  outside the Next module graph (no TS transform) and importing a .ts file here would need a
 *  loader for one pair of numbers. If the site location ever moves, this line moves with it. */
const SITE = { lat: 0.0756, lon: 111.4954 } // Sintang itself — kept for the containment check

/* WHY THE BLOCK IS NOT CENTRED ON THE OFFICE.
   Sintang sits in the Kapuas basin, and the DEM there is flat to a measured 26 m of relief
   within 38 km of the town. Stretched to fill a hero block that reads as a featureless plate
   with its noise magnified into sawteeth — the first two renders did exactly that.
   The real relief begins about 60 km south, so the window is pulled south far enough to include
   the highlands while still containing the site. The block therefore shows the truth: the flat
   working basin, and the range beyond it. `SITE` is asserted to fall inside the window below,
   so this cannot silently become a picture of somewhere the business does not work. */
const CENTRE = { lat: Number(process.env.TERRAIN_LAT ?? -0.12), lon: Number(process.env.TERRAIN_LON ?? 111.28) }

const Z = 12 // tile zoom. ~31 m/px at the equator: finer than a 208-sample grid can show.
const SPAN = Number(process.env.TERRAIN_SPAN ?? 0.44) // degrees each way from the centre — about 38 km across, so the block reads as
// a REGION rather than as a field. A tighter box on this part of Borneo is flat swamp forest and
// renders as a featureless slab; wider and the Kapuas basin's real relief stops being legible.
const N = Number(process.env.TERRAIN_N ?? 208) // samples per side in the working grid
const SS = 2 // supersample factor: the render is done at 2x and box-filtered down, which is the
// only anti-aliasing a scanline rasteriser gets for free.

/* ==========================================================================================
   2. THE LOOK
   ========================================================================================== */

const CANVAS = { w: 1200, h: 880 }
const SY = 0.5 // 2:1 isometric. True 30-degree isometric is 0.577; 2:1 is the classic pixel-art
// ratio and reads more cleanly at small sizes.
const RELIEF_FRACTION = Number(process.env.TERRAIN_RF ?? 0.42) // the terrain's vertical amplitude, as a fraction of the top
// diamond's projected height. Higher and the block reads as mountains rather than as ground.
const WALL_MIN = 0.30 // the cut face's MINIMUM thickness, same units. This is what makes it a
// BLOCK rather than a floating skin — both reference photos show a slab of roughly even
// thickness, and the wall must survive the terrain dipping to zero.
const PAD = 0.035 // fraction of each axis kept clear, so the block never touches the crop

/** The hypsometric ramp: elevation → colour, as [position, [r, g, b]].
 *
 *  WHY NOT THE REFERENCE'S GREEN. Both reference photos are photoreal green terrain, but the
 *  brief for this round is a corporate palette — white ground, blue #0246B1, orange #FA5F1F — and
 *  a saturated forest-green slab dropped into that page would read as a stock photo from a
 *  different product. This ramp keeps the *form* the references asked for (a real block, real
 *  relief, a cut face) and re-tints it into the brand: a cool blue base climbing through teal and
 *  sage to a snow white. That is a standard professional DEM tint, and it is the one colour
 *  decision that lets the image sit on the page instead of on top of it. */
const RAMP = [
  /* The low end is lifted well clear of the ramp's floor. The first render put the basin at
     0x2f,0x5c,0x80 and the contour ink at 0x1b,0x33,0x4d — only ~1.5:1 apart, so the contours
     vanished into the lowland and a third of the surface read as flat colour. Both ends moved
     inward: the ground up, the ink is unchanged, and the measured separation is now well above
     the visibility floor. */
  [0.0, [0x47, 0x74, 0x94]],
  [0.1, [0x50, 0x7e, 0x9a]],
  [0.22, [0x5b, 0x8e, 0x99]],
  [0.34, [0x6b, 0x9e, 0x94]],
  [0.46, [0x80, 0xac, 0x8f]],
  [0.58, [0x9b, 0xb9, 0x91]],
  [0.7, [0xb6, 0xc5, 0x9b]],
  [0.8, [0xcc, 0xd1, 0xb0]],
  [0.9, [0xdd, 0xdf, 0xcb]],
  /* THE TOP OF THE RAMP IS NOT WHITE, AND THAT IS A LAYOUT DECISION.
     This image sits on a white page. A snow-white summit would dissolve into the ground it is
     drawn on and the block would lose its outline exactly where it is most interesting. The
     last stop is a pale ice blue-grey instead, which still reads as snow and still holds an
     edge against #FFFFFF. */
  [1.0, [0xec, 0xee, 0xf0]],
]

/* ==========================================================================================
   THE ELEVATION CURVE — the fix that made the lowlands read as land.

   A linear map from elevation to colour put this window's lowland (20-45 m, which is most of
   the Kapuas basin in frame) into the bottom 2% of the ramp. Measured on the render, the whole
   basin came out as ONE flat blue — and a flat blue region on a map reads as water, or as
   missing data, never as ground. Vision described it as "a flat blue plain with no texture,
   like missing data", and it was right.

   Real hypsometric maps solve this the same way: the elevation scale is not linear. A power
   curve below 1 expands the low end of the range across more of the ramp, so a basin that
   occupies 2% of the metres occupies a third of the colours, and its river valleys become
   visible. The highlands compress correspondingly, which is also what you want — the top of a
   mountain has less to say than the ground people work on.
   `GAMMA` is the exponent: 1.0 is linear, smaller expands the lowlands harder. */
const GAMMA = Number(process.env.TERRAIN_GAMMA ?? 0.52)

/* ==========================================================================================
   CONTOUR LINES — the single highest-signal mark this image can carry.

   The brief is a surveying and mapping company, and a smooth shaded hill does not say
   "surveyed" to anyone. Contour lines do, instantly and in every language: they are the one
   graphic convention that means *measured terrain* rather than *rendered landscape*. They also
   fix a legibility problem — vision read the low-contrast basin as "flat, like missing data",
   and regular contour banding gives that ground texture and scale even where the relief is
   only a few metres.

   Drawn per cell with marching squares: for each cell, find where each contour level crosses
   its four edges and join the crossings. The segments are drawn INSIDE the painter loop, right
   after their own cell, so nearer terrain correctly occludes the contours behind it. */
const LEVELS = Number(process.env.TERRAIN_LEVELS ?? 26) // contour interval, in ramp units
const INDEX_EVERY = 5 // every Nth contour is drawn heavier, the standard index-contour rule

/* THE CONTOUR INK HOLDS A CONSTANT LUMINANCE STEP, WHICH A RATIO CANNOT DO.
   First attempt multiplied the ground colour by a fixed ratio. That fails at both ends for the
   same reason: a ratio preserves a *proportion*, but the eye judges a *difference*. At the pale
   end 0.42x is a big jump; at the dark end the same 0.42x is a few units and the line vanishes.
   Vision measured the result twice — "lines disappear into the background over the plain" and
   "white-on-white on the summits".
   So the ink is chosen to sit a fixed luminance step away from the ground it crosses, and it
   flips direction with the ground: DARKER ink on light ground, LIGHTER ink on dark ground. A
   contour line is a value contrast, not a shade, and this is how a printed sheet does it. */
const CONTOUR_STEP = 0.30 // luminance difference between a contour and its ground
const CONTOUR_FLIP = 0.46 // ground luminance above which the ink goes darker rather than lighter
const CONTOUR_ALPHA = 0.60
const CONTOUR_ALPHA_INDEX = 0.82

/* THE CUT FACES, measured rather than guessed.
   The first values were 0x12,0x1f,0x33 → 0x05,0x0a,0x12, which composited to a luminance of
   10-16/255 — near-black. On a white page that is a heavy black slab, and the two faces were
   only 4.5 luminance apart, so they read as one mass rather than as two lit planes.
   These sit in the brand's own deep blue (#0A192F is the brief's dark ground) and the shading
   split is applied on top, giving a measured separation above the ~8 luminance that reads as
   two faces at a glance. */
const WALL_TOP = [0x1c, 0x30, 0x4a] // the cut face at its top edge
const WALL_BOTTOM = [0x0c, 0x17, 0x28] // and at the base — a gradient, so the block has depth
const RIM = [0x8f, 0xa8, 0xbe] // the thin lighter bevel where vegetation meets the cut
const RIM_PX = 1.6 // its thickness, in final-canvas pixels

const HILL_LIGHT = { azimuth: 315, altitude: 45 } // NW sun, the cartographic convention: a NW
// light leaves no slope ambiguous between a ridge and a valley, which is why every relief map
// since the 19th century uses it.
const SLOPE_SCALE = 3.6 // vertical exaggeration applied to the SHADING only. The DEM around
// Sintang is a river basin: real slopes are a degree or two, and an unexaggerated hillshade is a
// uniform grey. The geometry keeps its true proportions; only the light exaggerates.
const SHADE_MIN = 0.66
/* SHADE_MAX IS CAPPED BELOW 1.0 + headroom ON PURPOSE. At 1.16 the lit slopes multiplied the
   already-pale upper ramp past 255 and clipped to flat white — vision read the result as
   "blown specular highlights, melted wax". Nothing in a matte relief map should reach pure
   white except the snow line, so the gain stops short of clipping. */
const SHADE_MAX = 1.07

/* ==========================================================================================
   3. TILES
   ========================================================================================== */

const lonToX = (lon, z) => ((lon + 180) / 360) * 2 ** z
const latToY = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

async function fetchTile(z, x, y) {
  mkdirSync(CACHE, { recursive: true })
  const file = join(CACHE, `${z}_${x}_${y}.png`)
  if (existsSync(file)) return readFileSync(file)
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(file, buf)
  return buf
}

/** Terrarium decode, in metres. */
const decodeElevation = (r, g, b) => r * 256 + g + b / 256 - 32768

async function loadElevation() {
  const x0 = Math.floor(lonToX(CENTRE.lon - SPAN, Z))
  const x1 = Math.floor(lonToX(CENTRE.lon + SPAN, Z))
  const y0 = Math.floor(latToY(CENTRE.lat + SPAN, Z))
  const y1 = Math.floor(latToY(CENTRE.lat - SPAN, Z))
  const cols = x1 - x0 + 1
  const rows = y1 - y0 + 1
  const W = cols * 256
  const H = rows * 256
  const mosaic = new Float32Array(W * H)

  process.stdout.write(`tiles ${cols}x${rows} at z${Z} `)
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const png = PNG.sync.read(await fetchTile(Z, tx, ty))
      const ox = (tx - x0) * 256
      const oy = (ty - y0) * 256
      for (let py = 0; py < 256; py++) {
        for (let px = 0; px < 256; px++) {
          const s = (py * 256 + px) << 2
          mosaic[(oy + py) * W + ox + px] = decodeElevation(
            png.data[s],
            png.data[s + 1],
            png.data[s + 2],
          )
        }
      }
      process.stdout.write('.')
    }
  }
  process.stdout.write('\n')

  // The exact pixel window this bounding box covers inside the mosaic.
  const gx0 = lonToX(CENTRE.lon - SPAN, Z) * 256 - x0 * 256
  const gx1 = lonToX(CENTRE.lon + SPAN, Z) * 256 - x0 * 256
  const gy0 = latToY(CENTRE.lat + SPAN, Z) * 256 - y0 * 256
  const gy1 = latToY(CENTRE.lat - SPAN, Z) * 256 - y0 * 256

  /* Box-average each target cell over the source pixels it covers. Sampling the nearest pixel
     instead would keep every DEM quirk as a spike and give the block a rash of single-pixel
     bumps that no real hillside has. */
  const grid = new Float32Array(N * N)
  for (let j = 0; j < N; j++) {
    const sy0 = gy0 + ((gy1 - gy0) * j) / N
    const sy1 = gy0 + ((gy1 - gy0) * (j + 1)) / N
    for (let i = 0; i < N; i++) {
      const sx0 = gx0 + ((gx1 - gx0) * i) / N
      const sx1 = gx0 + ((gx1 - gx0) * (i + 1)) / N
      let sum = 0
      let n = 0
      for (let py = Math.floor(sy0); py < Math.max(Math.floor(sy1), Math.floor(sy0) + 1); py++) {
        for (let px = Math.floor(sx0); px < Math.max(Math.floor(sx1), Math.floor(sx0) + 1); px++) {
          if (px < 0 || py < 0 || px >= W || py >= H) continue
          sum += mosaic[py * W + px]
          n++
        }
      }
      grid[j * N + i] = n ? sum / n : 0
    }
  }

  /* =====================================================================================
     THE DENOISE CHAIN, AND IT IS LOAD-BEARING RATHER THAN COSMETIC.

     Measured on the raw grid: adjacent cells differ by 1.9 m on average but by up to 89 m at
     worst, while the WHOLE p2..p98 relief of this window is only about 26 m near the basin.
     So a single bad cell is three times taller than the entire landscape around it, and
     rendered as geometry each one becomes a needle-thin spire. The first renders had several
     of them standing on the surface, and the cut edge came out at 13.6 px of sawtooth — which
     is what "looks like leftover geometry glitches" measured.

     A BOX BLUR CANNOT FIX THIS. It averages the spike into its neighbours, lowering it while
     smearing it sideways, so it trades a spike for a bump. A MEDIAN FILTER deletes it: the
     outlier is not among the middle values of its neighbourhood, so it is simply replaced.
     That is why the chain is median first, then a light box pass to take the staircase off
     the median's own output. This is the standard order for DEM conditioning.

     5x5 (radius 2) because one cell is ~400 m here: it removes anything narrower than about
     1.2 km, and the real features in this landscape — river valleys, ridges, the highland
     front — are several kilometres wide. Nothing true is being deleted. */
  let smoothed = grid
  {
    const R = Number(process.env.TERRAIN_MED ?? 2)
    const win = (2 * R + 1) ** 2
    const buf = new Float32Array(win)
    const next = new Float32Array(N * N)
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        let n = 0
        for (let dj = -R; dj <= R; dj++) {
          for (let di = -R; di <= R; di++) {
            const a = i + di
            const b = j + dj
            if (a < 0 || b < 0 || a >= N || b >= N) continue
            buf[n++] = smoothed[b * N + a]
          }
        }
        const slice = buf.subarray(0, n)
        slice.sort()
        next[j * N + i] = slice[n >> 1]
      }
    }
    smoothed = next
  }
  const passes = Number(process.env.TERRAIN_BLUR ?? 2)
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float32Array(N * N)
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        let s = 0
        let n = 0
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const a = i + di
            const b = j + dj
            if (a < 0 || b < 0 || a >= N || b >= N) continue
            s += smoothed[b * N + a]
            n++
          }
        }
        next[j * N + i] = s / n
      }
    }
    smoothed = next
  }

  const cellX = ((SPAN * 2 * 111320 * Math.cos((CENTRE.lat * Math.PI) / 180)) / N)
  const cellY = (SPAN * 2 * 110540) / N

  /* THE SITE MUST BE INSIDE THE FRAME. A hero image captioned with a place it does not show is
     worse than one that names nowhere, so this fails loudly instead of drifting. */
  const inside =
    Math.abs(SITE.lat - CENTRE.lat) <= SPAN && Math.abs(SITE.lon - CENTRE.lon) <= SPAN
  if (!inside) throw new Error(`SITE ${JSON.stringify(SITE)} is outside the ${SPAN} deg window`)

  return { grid: smoothed, cellX, cellY }
}

/* ==========================================================================================
   4. RASTERISER
   ========================================================================================== */

/** Source-over compositing into a straight (non-premultiplied) RGBA buffer. */
function blend(data, idx, r, g, b, a) {
  if (a <= 0) return
  if (a >= 1) {
    data[idx] = r
    data[idx + 1] = g
    data[idx + 2] = b
    data[idx + 3] = 255
    return
  }
  const da = data[idx + 3] / 255
  const oa = a + da * (1 - a)
  data[idx] = (r * a + data[idx] * da * (1 - a)) / oa
  data[idx + 1] = (g * a + data[idx + 1] * da * (1 - a)) / oa
  data[idx + 2] = (b * a + data[idx + 2] * da * (1 - a)) / oa
  data[idx + 3] = oa * 255
}

/** Fill a convex quad. Cross-product test, so winding does not matter. */
function fillQuad(buf, w, h, pts, r, g, b, a) {
  let minx = Infinity
  let maxx = -Infinity
  let miny = Infinity
  let maxy = -Infinity
  for (const p of pts) {
    if (p[0] < minx) minx = p[0]
    if (p[0] > maxx) maxx = p[0]
    if (p[1] < miny) miny = p[1]
    if (p[1] > maxy) maxy = p[1]
  }
  const x0 = Math.max(0, Math.floor(minx))
  const x1 = Math.min(w - 1, Math.ceil(maxx))
  const y0 = Math.max(0, Math.floor(miny))
  const y1 = Math.min(h - 1, Math.ceil(maxy))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5
      const py = y + 0.5
      let neg = 0
      let pos = 0
      for (let i = 0; i < 4; i++) {
        const p = pts[i]
        const q = pts[(i + 1) % 4]
        const cr = (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0])
        if (cr < 0) neg++
        else if (cr > 0) pos++
      }
      if (neg && pos) continue
      blend(buf, (y * w + x) << 2, r, g, b, a)
    }
  }
}

const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

function rampAt(t) {
  const v = clamp01(t)
  for (let i = 1; i < RAMP.length; i++) {
    if (v <= RAMP[i][0]) {
      const [p0, c0] = RAMP[i - 1]
      const [p1, c1] = RAMP[i]
      const k = (v - p0) / (p1 - p0 || 1)
      return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)]
    }
  }
  return RAMP[RAMP.length - 1][1]
}

function hillshade(grid, i, j, cellX, cellY) {
  const at = (a, b) =>
    grid[Math.min(N - 1, Math.max(0, b)) * N + Math.min(N - 1, Math.max(0, a))]
  const dzdx = ((at(i + 1, j) - at(i - 1, j)) / (2 * cellX)) * SLOPE_SCALE
  const dzdy = ((at(i, j + 1) - at(i, j - 1)) / (2 * cellY)) * SLOPE_SCALE
  const slope = Math.atan(Math.hypot(dzdx, dzdy))
  const aspect = Math.atan2(dzdy, -dzdx)
  const az = ((HILL_LIGHT.azimuth * Math.PI) / 180)
  const alt = ((HILL_LIGHT.altitude * Math.PI) / 180)
  const s =
    Math.sin(alt) * Math.cos(slope) + Math.cos(alt) * Math.sin(slope) * Math.cos(az - aspect)
  return SHADE_MIN + (SHADE_MAX - SHADE_MIN) * clamp01(s)
}

function render({ grid, cellX, cellY, zLo, zHi }) {
  const w = CANVAS.w * SS
  const h = CANVAS.h * SS
  const buf = new Uint8ClampedArray(w * h * 4) // starts fully transparent

  const span = zHi - zLo || 1
  const worldW = 2 * (N - 1)

  /* THE VERTICAL EXTENT, AND THIS WAS THE BUG THAT CLIPPED THE BLOCK.
     The top face is a rhombus, so its vertical extent is TWICE (N-1)*SY — the grid spans
     (N-1) in each axis and the two axes add. Computing it as (N-1)*SY made the renderer
     believe the block was half its real height: `k` came out too large, the block was drawn
     at twice the height the canvas allowed, and the bottom of it ran off the image while the
     top half of the frame stayed empty. Measured on the first render: the block's top edge sat
     at y=807 of 1760 and its bottom at y=2392, i.e. 632px below the crop.
     The wall then hangs BELOW the base plane, so it is counted twice — once for the surface's
     own rise, once for the cut face under it. */
  const diamondH = 2 * (N - 1) * SY

  /* THE WALL HAS A MINIMUM THICKNESS, AND WITHOUT ONE IT DISAPPEARS.
     First attempt made the wall's height equal to the terrain's height above the base plane.
     That is what a real cut block does, but it fails here for a measurable reason: this basin's
     front edge sits at the LOW end of the elevation ramp, so `t` there is ~0 and the wall's
     thickness collapsed to nearly nothing exactly along the two edges the viewer can see. The
     block read as a sheet of paper with a dark stripe under it.
     The reference photos both show a slab of roughly even thickness, so: a constant minimum
     (`WALL_MIN`) plus the terrain's own rise. The lowest ground still has a cut face. */
  const reliefWorld = (N - 1) * SY * RELIEF_FRACTION
  const wallMinWorld = diamondH * WALL_MIN
  const worldH = diamondH + reliefWorld + wallMinWorld
  const padX = w * PAD
  const padY = h * PAD
  const k = Math.min((w - 2 * padX) / worldW, (h - 2 * padY) / worldH)

  const blockW = worldW * k
  const blockH = worldH * k
  const cx = w / 2
  /* The origin is the BASE PLANE's top corner (grid point (0,0) at height zero). The surface
     rises above it, the cut face hangs below it, and the whole block is centred by offsetting
     the origin down by the relief's share of the total height. */
  const cy = (h - blockH) / 2 + reliefWorld * k

  /** The base plane: grid point (i,j) at height zero. */
  const baseY = (i, j) => cy + (i + j) * SY * k
  /** The surface: the base plane lifted by the normalised height `t`. */
  const px = (i, j) => cx + (i - j) * k
  const py = (i, j, t) => baseY(i, j) - t * reliefWorld * k

  // ---- the contact shadow, drawn first so the block sits on top of it ----
  {
    const A = (N - 1) * k * 1.02
    const B = (N - 1) * SY * k * 1.02
    const sx = cx + w * 0.009
    const sy = cy + (N - 1) * SY * k + wallMinWorld * k * 0.55
    for (let y = Math.floor(sy - B); y <= Math.ceil(sy + B); y++) {
      if (y < 0 || y >= h) continue
      for (let x = Math.floor(sx - A); x <= Math.ceil(sx + A); x++) {
        if (x < 0 || x >= w) continue
        const d = Math.abs((x - sx) / A) + Math.abs((y - sy) / B)
        if (d >= 1) continue
        const a = ((1 - d) ** 1.8) * 0.26
        blend(buf, (y * w + x) << 2, 0x0b, 0x14, 0x22, a)
      }
    }
  }

  /* The elevation curve. Every use of a height goes through here, so the geometry, the ramp and
     the contour bands can never disagree about where a metre sits. */
  const norm = (v) => clamp01((v - zLo) / span) ** GAMMA
  const shade = (i, j) => hillshade(grid, i, j, cellX, cellY)

  const drawCell = (i, j) => {
    const t00 = norm(grid[j * N + i])
    const t10 = norm(grid[j * N + i + 1])
    const t11 = norm(grid[(j + 1) * N + i + 1])
    const t01 = norm(grid[(j + 1) * N + i])
    const sh = shade(i, j)
    const [r, g, b] = rampAt((t00 + t10 + t11 + t01) / 4)
    const quad = [
      [px(i, j), py(i, j, t00)],
      [px(i + 1, j), py(i + 1, j, t10)],
      [px(i + 1, j + 1), py(i + 1, j + 1, t11)],
      [px(i, j + 1), py(i, j + 1, t01)],
    ]
    fillQuad(buf, w, h, quad, r * sh, g * sh, b * sh, 1)

    /* The contours for this cell, drawn immediately so the painter order still holds. */
    const corners = [t00, t10, t11, t01]
    const lo = Math.min(t00, t10, t11, t01)
    const hi = Math.max(t00, t10, t11, t01)
    const first = Math.ceil(lo * LEVELS)
    const last = Math.floor(hi * LEVELS)
    for (let L = first; L <= last; L++) {
      const level = L / LEVELS
      /* Marching squares, without the saddle cases: collect the crossing on each of the four
         edges, then join the two (or four) that exist. */
      const hits = []
      for (let e = 0; e < 4; e++) {
        const a = corners[e]
        const b = corners[(e + 1) % 4]
        if (a === b) continue
        if ((a - level) * (b - level) > 0) continue
        const u = (level - a) / (b - a)
        const p0 = quad[e]
        const p1 = quad[(e + 1) % 4]
        hits.push([lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u)])
      }
      if (hits.length < 2) continue
      const heavy = L % INDEX_EVERY === 0
      const thick = (heavy ? 0.66 : 0.36) * SS
      const alpha = heavy ? CONTOUR_ALPHA_INDEX : CONTOUR_ALPHA
      /* The cell's own painted colour, then a fixed luminance step away from it. */
      const gR = r * sh
      const gG = g * sh
      const gB = b * sh
      const gY = (0.2126 * gR + 0.7152 * gG + 0.0722 * gB) / 255
      const wantDarker = gY > CONTOUR_FLIP
      const target = wantDarker
        ? Math.max(0, gY - CONTOUR_STEP)
        : Math.min(1, gY + CONTOUR_STEP)
      /* Scale the ground toward the target luminance; the ratio is clamped so a very dark ground
         cannot produce an absurd multiplier. */
      const k2 = gY > 0.004 ? target / gY : 1
      const cR = Math.min(255, gR * Math.min(k2, 6))
      const cG = Math.min(255, gG * Math.min(k2, 6))
      const cB = Math.min(255, gB * Math.min(k2, 6))
      const nSeg = hits.length === 4 ? 2 : 1
      for (let s2 = 0; s2 < nSeg; s2++) {
        const p0 = hits[s2 * 2]
        const p1 = hits[s2 * 2 + 1]
        if (!p0 || !p1) continue
        const dx = p1[0] - p0[0]
        const dy = p1[1] - p0[1]
        const len = Math.hypot(dx, dy)
        if (len < 0.01) continue
        // a thin quad along the segment, so there is one rasteriser for everything
        const nx = (-dy / len) * thick * 0.5
        const ny = (dx / len) * thick * 0.5
        fillQuad(
          buf,
          w,
          h,
          [
            [p0[0] + nx, p0[1] + ny],
            [p1[0] + nx, p1[1] + ny],
            [p1[0] - nx, p1[1] - ny],
            [p0[0] - nx, p0[1] - ny],
          ],
          cR,
          cG,
          cB,
          alpha,
        )
      }
    }
  }

  /* The two cut faces are shaded differently, which is what stops the block reading as a flat
     dark cutout: the light comes from the north-west, so the face on the viewer's right (the
     one turned away from it) is darker than the one on the left. */
  const wallPanel = (p0, p1, base0, base1, faceShade = 1) => {
    const top0 = [p0[0], p0[1]]
    const top1 = [p1[0], p1[1]]
    /* The bottom edge is the FOOTPRINT — the same grid points at t=0 — not the surface shifted
       down by a constant. A constant offset gives a slab of even thickness that follows every
       bump, which is not what a cut block of ground looks like: the reference has a flat base
       and a wall that gets taller wherever the terrain is lower. */
    const bot1 = [p1[0], base1 + wallMinWorld * k]
    const bot0 = [p0[0], base0 + wallMinWorld * k]
    /* The face is painted as a stack of horizontal slices rather than one flat fill, because the
       gradient down the cut is what makes the block read as solid rather than as a sticker. */
    const slices = 48
    for (let s = 0; s < slices; s++) {
      const u0 = s / slices
      const u1 = (s + 1) / slices
      const mix = (u0 + u1) / 2
      const r = lerp(WALL_TOP[0], WALL_BOTTOM[0], mix) * faceShade
      const g = lerp(WALL_TOP[1], WALL_BOTTOM[1], mix) * faceShade
      const b = lerp(WALL_TOP[2], WALL_BOTTOM[2], mix) * faceShade
      fillQuad(
        buf,
        w,
        h,
        [
          [lerp(top0[0], bot0[0], u0), lerp(top0[1], bot0[1], u0)],
          [lerp(top1[0], bot1[0], u0), lerp(top1[1], bot1[1], u0)],
          [lerp(top1[0], bot1[0], u1), lerp(top1[1], bot1[1], u1)],
          [lerp(top0[0], bot0[0], u1), lerp(top0[1], bot0[1], u1)],
        ],
        r,
        g,
        b,
        1,
      )
    }
    /* The rim: a thin lighter band along the top of the cut, which is where the reference photos
       put a lighter bevel between the vegetation and the exposed face. */
    const rim = RIM_PX * SS
    fillQuad(
      buf,
      w,
      h,
      [
        top0,
        top1,
        [top1[0], top1[1] + rim],
        [top0[0], top0[1] + rim],
      ],
      RIM[0],
      RIM[1],
      RIM[2],
      0.30,
    )
  }

  /* ---- the painter's loop ------------------------------------------------------------------
     Isometric heightfields sort correctly by (i + j): a cell occludes another only if BOTH of
     its grid indices are greater, so increasing i + j is a valid topological order.

     The walls have to be interleaved into that order rather than drawn afterwards. The cut face
     at i = N-1 has the same sort key as the surface cells diagonally behind it, and if the walls
     were painted last they would cover a slope that is genuinely in front of them. */
  for (let s = 0; s <= 2 * (N - 1); s++) {
    for (let i = Math.max(0, s - (N - 2)); i <= Math.min(N - 2, s); i++) {
      const j = s - i
      if (j < 0 || j > N - 2) continue
      drawCell(i, j)
    }
    const jw = s - (N - 1)
    if (jw >= 0 && jw <= N - 2) {
      // the i = N-1 cut face, panel between (N-1, jw) and (N-1, jw+1)
      const a = [px(N - 1, jw), py(N - 1, jw, norm(grid[jw * N + N - 1]))]
      const b = [px(N - 1, jw + 1), py(N - 1, jw + 1, norm(grid[(jw + 1) * N + N - 1]))]
      wallPanel(a, b, py(N - 1, jw, 0), py(N - 1, jw + 1, 0), 0.80)
    }
    const iw = s - (N - 1)
    if (iw >= 0 && iw <= N - 2) {
      // the j = N-1 cut face, panel between (iw, N-1) and (iw+1, N-1)
      const a = [px(iw, N - 1), py(iw, N - 1, norm(grid[(N - 1) * N + iw]))]
      const b = [px(iw + 1, N - 1), py(iw + 1, N - 1, norm(grid[(N - 1) * N + iw + 1]))]
      wallPanel(a, b, py(iw, N - 1, 0), py(iw + 1, N - 1, 0), 1.22)
    }
  }

  // ---- box-filter the supersample down to the final canvas ----
  const out = new PNG({ width: CANVAS.w, height: CANVAS.h })
  for (let y = 0; y < CANVAS.h; y++) {
    for (let x = 0; x < CANVAS.w; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const s = ((y * SS + sy) * w + (x * SS + sx)) << 2
          const sa = buf[s + 3] / 255
          r += buf[s] * sa
          g += buf[s + 1] * sa
          b += buf[s + 2] * sa
          a += sa
        }
      }
      const n = SS * SS
      const d = (y * CANVAS.w + x) << 2
      out.data[d] = a > 0 ? Math.round(r / a) : 0
      out.data[d + 1] = a > 0 ? Math.round(g / a) : 0
      out.data[d + 2] = a > 0 ? Math.round(b / a) : 0
      out.data[d + 3] = Math.round((a / n) * 255)
    }
  }
  return out
}

/* ==========================================================================================
   5. MAIN
   ========================================================================================== */

const { grid, cellX, cellY } = await loadElevation()

const sorted = Float32Array.from(grid).sort()
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))]
const WLO = Number(process.env.TERRAIN_WLO ?? 0.005)
const WHI = Number(process.env.TERRAIN_WHI ?? 0.995)
const zLo = pct(WLO)
const zHi = pct(WHI)

console.log(
  `elevation  min ${sorted[0].toFixed(0)}  p0.5 ${zLo.toFixed(0)}  p50 ${pct(0.5).toFixed(0)}  ` +
    `p${(WHI * 100).toFixed(1)} ${zHi.toFixed(0)}  max ${sorted[sorted.length - 1].toFixed(0)}  (metres)`,
)
console.log(`cell       ${cellX.toFixed(0)} x ${cellY.toFixed(0)} m`)

/* THE EDGE-QUALITY METRIC, and the one that would have caught the sawtooth immediately.
   What a viewer sees is not metres but pixels, so the question is: how far does the block's cut
   edge jump between two neighbouring columns of the finished image? Under ~0.6 px the edge reads
   as a drawn line; above ~1.5 px it reads as a saw. Expressing the terrain's per-cell variation
   in final-canvas pixels is what turns "it looks jagged" into a number that can be tuned. */
{
  const range = (zHi - zLo) || 1
  const reliefPx = (N - 1) * SY * RELIEF_FRACTION * (CANVAS.w * (1 - 2 * PAD)) / (2 * (N - 1))
  const cellPx = reliefPx / range
  const edgeRow = []
  const edgeCol = []
  for (let k = 0; k < N - 1; k++) {
    edgeCol.push(Math.abs(grid[k * N + (N - 1)] - grid[(k + 1) * N + (N - 1)]))
    edgeRow.push(Math.abs(grid[(N - 1) * N + k] - grid[(N - 1) * N + k + 1]))
  }
  const worst = Math.max(...edgeCol, ...edgeRow)
  const mean = [...edgeCol, ...edgeRow].reduce((a, b) => a + b, 0) / (edgeCol.length + edgeRow.length)
  console.log(
    `cut edge   ${(mean * cellPx).toFixed(2)} px mean, ${(worst * cellPx).toFixed(2)} px worst ` +
      `(relief ${range.toFixed(0)} m over ${reliefPx.toFixed(0)} px)`,
  )
}

if (process.argv.includes('--stats')) process.exit(0)

const png = render({ grid, cellX, cellY, zLo, zHi })
writeFileSync(OUT, PNG.sync.write(png))
console.log(`wrote      ${OUT}  ${CANVAS.w}x${CANVAS.h}  ${(png.data.length / 1024).toFixed(0)} KB raw`)
