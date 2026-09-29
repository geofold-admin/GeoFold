#!/usr/bin/env node
/**
 * build-terrain-gallery.mjs — renders the AccordionGallery's five panels.
 *
 * WHY TERRAIN AND NOT PHOTOS.
 * The gallery is the React Bits AccordionGallery, and it wants five images. Stock photography was
 * the obvious answer and the wrong one twice over: (1) the client's brief is a surveying and
 * mapping product, and five generic landscape photos say nothing a competitor's site could not
 * also say; (2) this repo already carries real public-domain elevation data for the region the
 * business works in, so the honest image set is *the actual ground, rendered*. Each panel then
 * carries a fact — a real place, at a real height — instead of decoration.
 *
 * The five windows are chosen to span the region's real relief, from the Kapuas basin the team
 * works in to the highlands on its southern edge. Every one is the same 0.22-degree window, so
 * the panels are comparable rather than five different zoom levels.
 *
 * THE RAMP IS SHARED ACROSS THE SET (`TERRAIN_ZLO`/`TERRAIN_ZHI`), which is the one thing that
 * makes a gallery of terrain legible: with each panel normalised to its own extremes, a 30 m
 * floodplain and a 1,400 m ridge both fill the colour ramp and read as the same height. Pinning
 * the range means the lowland stays dark blue and flat while the highlands climb into the pale
 * end — the images then say something about relief rather than just showing five hills.
 *
 * RUN:  node scripts/build-terrain-gallery.mjs
 *       node scripts/build-terrain-gallery.mjs --stats   (histograms only, no PNGs)
 *
 * Output: public/terrain/panel-{1..5}.png at 900x1100 — portrait, because the accordion panels
 * are tall and narrow and a landscape image would be cropped to a letterbox slot.
 *
 * This is a build-time tool. It is not part of the app bundle.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { loadElevation, percentile } from './lib/dem.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT_DIR = join(ROOT, 'public', 'terrain')

const STATS_ONLY = process.argv.includes('--stats')

/* ==========================================================================================
   1. THE FIVE WINDOWS

   THE NAMES ARE DERIVED FROM THE MEASUREMENT, NOT CHOSEN FIRST. The first draft of this list
   named the windows by what they were *meant* to be — "Northern ridge", "Peat mosaic" — and the
   stats run disproved both: the northern window is FLATTER than the working basin (78 m of
   relief against 357 m), and the western window is the TALLEST in the set (979 m, reaching
   1,603 m) where a peat swamp was intended. Shipping that would have put "swamp and minor
   rivers" as the caption on a picture of mountains.
   So each label below describes the ground the data actually shows, and each `note` carries the
   measured relief. That is also what makes the gallery worth having: five blocks of terrain
   that differ by a number the reader can compare, rather than five decorative hills.

   Ordered as the gallery reads: the working basin first (where the business is), then outward
   through the landscapes a survey team in West Kalimantan actually meets.
   ========================================================================================== */
const PANELS = [
  {
    file: 'panel-1.png',
    id: 'basin',
    label: { id: 'Cekungan kerja', en: 'The working basin' },
    note: { id: 'Dataran rendah Sintang', en: 'The Sintang lowland' },
    centre: { lat: -0.12, lon: 111.28 },
  },
  {
    file: 'panel-2.png',
    id: 'lowland',
    label: { id: 'Dataran utara', en: 'Northern lowland' },
    note: { id: 'Rawa dan sungai kecil', en: 'Swamp and minor rivers' },
    centre: { lat: 0.35, lon: 111.55 },
  },
  {
    file: 'panel-3.png',
    id: 'front',
    label: { id: 'Kaki pegunungan', en: 'Highland front' },
    note: { id: 'Relief mulai naik', en: 'Where the relief begins' },
    centre: { lat: -0.62, lon: 111.72 },
  },
  {
    file: 'panel-4.png',
    id: 'range',
    label: { id: 'Punggungan selatan', en: 'Southern range' },
    note: { id: 'Punggungan perbatasan', en: 'The border range' },
    centre: { lat: -1.05, lon: 112.05 },
  },
  {
    file: 'panel-5.png',
    id: 'summit',
    label: { id: 'Pegunungan tinggi', en: 'High country' },
    note: { id: 'Puncak tertinggi di set ini', en: 'The tallest ground here' },
    centre: { lat: -0.38, lon: 110.85 },
  },
]

const SPAN = 0.22 // degrees each way — about 49 km across, the same for every panel
const Z = 12
const N = 384

/* ==========================================================================================
   THE ELEVATION RANGE IS PER-PANEL, AND A SHARED RANGE WAS TRIED AND REVERTED.

   The argument for a shared range is real: with each panel normalised to its own extremes, a
   78 m floodplain and a 979 m range both fill the colour ramp and read as equally tall, so the
   images stop being comparable at a glance.

   IT MADE FOUR OF THE FIVE PANELS UNREADABLE. Measured on the built page with the range pinned to
   5..1650 m: the lowland window's p50 is 34 m, which is 0.2% of the way up that ramp, so the panel
   rendered as a near-black navy rectangle with no visible relief at all — and the working basin
   (p50 40 m) was the same. A gallery whose copy promises "from lowland swamp to a ridge line"
   cannot show four blank panels.

   WHAT REPLACES IT: every panel uses its own range so its terrain is legible, and the measured
   relief travels in the LABEL — "relief 78 m" through "relief 979 m" — which is where the
   comparison actually belongs. That is how a printed atlas works: each sheet carries its own
   scale, and the numbers are printed rather than encoded in a shared colour ramp. The image shows
   the SHAPE of the ground; the number states the SCALE. Neither pretends to be the other.

   `TERRAIN_SHARED_RAMP=1` restores the pinned version for anyone who wants it and accepts the
   legibility cost; the assertion at the bottom then checks it still covers the data. */
const SHARED_RAMP = process.env.TERRAIN_SHARED_RAMP === '1'
const ZLO = Number(process.env.TERRAIN_ZLO ?? 5)
const ZHI = Number(process.env.TERRAIN_ZHI ?? 1650)

/* ==========================================================================================
   2. THE LOOK — the same ramp and light as the hero, so the gallery belongs to the same site.

   Kept identical to build-terrain.mjs on purpose. A second, prettier ramp for the gallery would
   make the two surfaces look like two products, and the client's brief is one identity.
   ========================================================================================== */
/* THE CANVAS ASPECT IS THE ACTIVE PANEL'S ASPECT, AND THAT IS A MEASURED FIX.

   The first version rendered 900x1100 — portrait — while the terrain block is landscape
   (766x578 world units, 1.33:1). The block therefore filled only 57% of the frame's height, and
   the alpha coverage measured 30% of the frame: rows 28..77%, cols 4..96%.

   That was invisible in the expanded panel, which is 645x460 (1.40:1): object-fit: cover scaled
   the source to 645x789 and showed rows 21..79% — which happens to be almost exactly the block.
   THE COLLAPSED PANELS GOT THE OTHER SIDE OF THAT COIN. At 149x463 they show 100% of the height,
   so 43% of every collapsed panel was empty navy above and below the block, and the painted
   median luminance measured 23.1 — the panel's own background colour (#0A192F is L 23.4). Half of
   each collapsed panel was literally nothing.

   Rendering at 1400x1000 (1.40:1, the active panel's ratio) with the same 4% pad makes the block
   fill ~87% of the width and ~92% of the height, so every crop of it lands on terrain. The
   collapsed panel then shows a 23%-wide vertical slice of the block at full height instead of a
   narrow slice surrounded by empty space. */
const CANVAS = { w: 1400, h: 1000 }
const SS = 2
const SY = 0.5
const RELIEF_FRACTION = 0.42
const WALL_MIN = 0.30
const PAD = 0.04

const RAMP = [
  [0.0, [0x47, 0x74, 0x94]],
  [0.1, [0x50, 0x7e, 0x9a]],
  [0.22, [0x5b, 0x8e, 0x99]],
  [0.34, [0x6b, 0x9e, 0x94]],
  [0.46, [0x80, 0xac, 0x8f]],
  [0.58, [0x9b, 0xb9, 0x91]],
  [0.7, [0xb6, 0xc5, 0x9b]],
  [0.8, [0xcc, 0xd1, 0xb0]],
  [0.9, [0xdd, 0xdf, 0xcb]],
  [1.0, [0xec, 0xee, 0xf0]],
]

const GAMMA = 0.52
const LEVELS = 26
const INDEX_EVERY = 5
const CONTOUR_STEP = 0.3
const CONTOUR_FLIP = 0.46
const CONTOUR_ALPHA = 0.6
const CONTOUR_ALPHA_INDEX = 0.82

const WALL_TOP = [0x1c, 0x30, 0x4a]
const WALL_BOTTOM = [0x0c, 0x17, 0x28]
const RIM = [0x8f, 0xa8, 0xbe]
const RIM_PX = 1.6

const HILL_LIGHT = { azimuth: 315, altitude: 45 }
const SLOPE_SCALE = 3.6
const SHADE_MIN = 0.66
const SHADE_MAX = 1.07

/* ==========================================================================================
   3. RASTERISER — the same scanline code as the hero's generator.

   Duplicated rather than imported because build-terrain.mjs is a script with top-level awaits
   and no exports; extracting the renderer into a module would touch a file that is currently
   correct and verified, for no gain here. The constants above are the contract between them,
   and both files carry the same values.
   ========================================================================================== */
const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

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
  const at = (a, b) => grid[Math.min(N - 1, Math.max(0, b)) * N + Math.min(N - 1, Math.max(0, a))]
  const dzdx = ((at(i + 1, j) - at(i - 1, j)) / (2 * cellX)) * SLOPE_SCALE
  const dzdy = ((at(i, j + 1) - at(i, j - 1)) / (2 * cellY)) * SLOPE_SCALE
  const slope = Math.atan(Math.hypot(dzdx, dzdy))
  const aspect = Math.atan2(dzdy, -dzdx)
  const az = (HILL_LIGHT.azimuth * Math.PI) / 180
  const alt = (HILL_LIGHT.altitude * Math.PI) / 180
  const s = Math.sin(alt) * Math.cos(slope) + Math.cos(alt) * Math.sin(slope) * Math.cos(az - aspect)
  return SHADE_MIN + (SHADE_MAX - SHADE_MIN) * clamp01(s)
}

function render({ grid, cellX, cellY, zLo, zHi }) {
  const w = CANVAS.w * SS
  const h = CANVAS.h * SS
  const buf = new Uint8ClampedArray(w * h * 4)

  const span = zHi - zLo || 1
  const worldW = 2 * (N - 1)
  const diamondH = 2 * (N - 1) * SY
  const reliefWorld = (N - 1) * SY * RELIEF_FRACTION
  const wallMinWorld = diamondH * WALL_MIN
  const worldH = diamondH + reliefWorld + wallMinWorld
  const padX = w * PAD
  const padY = h * PAD
  const k = Math.min((w - 2 * padX) / worldW, (h - 2 * padY) / worldH)

  const blockH = worldH * k
  const cx = w / 2
  const cy = (h - blockH) / 2 + reliefWorld * k

  const baseY = (i, j) => cy + (i + j) * SY * k
  const px = (i, j) => cx + (i - j) * k
  const py = (i, j, t) => baseY(i, j) - t * reliefWorld * k

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
        const a = (1 - d) ** 1.8 * 0.26
        blend(buf, (y * w + x) << 2, 0x0b, 0x14, 0x22, a)
      }
    }
  }

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

    const corners = [t00, t10, t11, t01]
    const lo = Math.min(t00, t10, t11, t01)
    const hi = Math.max(t00, t10, t11, t01)
    const first = Math.ceil(lo * LEVELS)
    const last = Math.floor(hi * LEVELS)
    for (let L = first; L <= last; L++) {
      const level = L / LEVELS
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
      const gR = r * sh
      const gG = g * sh
      const gB = b * sh
      const gY = (0.2126 * gR + 0.7152 * gG + 0.0722 * gB) / 255
      const wantDarker = gY > CONTOUR_FLIP
      const target = wantDarker ? Math.max(0, gY - CONTOUR_STEP) : Math.min(1, gY + CONTOUR_STEP)
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
        const nx = (-dy / len) * thick * 0.5
        const ny = (dx / len) * thick * 0.5
        fillQuad(
          buf, w, h,
          [
            [p0[0] + nx, p0[1] + ny],
            [p1[0] + nx, p1[1] + ny],
            [p1[0] - nx, p1[1] - ny],
            [p0[0] - nx, p0[1] - ny],
          ],
          cR, cG, cB, alpha,
        )
      }
    }
  }

  const wallPanel = (p0, p1, base0, base1, faceShade = 1) => {
    const top0 = [p0[0], p0[1]]
    const top1 = [p1[0], p1[1]]
    const bot1 = [p1[0], base1 + wallMinWorld * k]
    const bot0 = [p0[0], base0 + wallMinWorld * k]
    const slices = 48
    for (let s = 0; s < slices; s++) {
      const u0 = s / slices
      const u1 = (s + 1) / slices
      const mix = (u0 + u1) / 2
      const r = lerp(WALL_TOP[0], WALL_BOTTOM[0], mix) * faceShade
      const g = lerp(WALL_TOP[1], WALL_BOTTOM[1], mix) * faceShade
      const b = lerp(WALL_TOP[2], WALL_BOTTOM[2], mix) * faceShade
      fillQuad(
        buf, w, h,
        [
          [lerp(top0[0], bot0[0], u0), lerp(top0[1], bot0[1], u0)],
          [lerp(top1[0], bot1[0], u0), lerp(top1[1], bot1[1], u0)],
          [lerp(top1[0], bot1[0], u1), lerp(top1[1], bot1[1], u1)],
          [lerp(top0[0], bot0[0], u1), lerp(top0[1], bot0[1], u1)],
        ],
        r, g, b, 1,
      )
    }
    const rim = RIM_PX * SS
    fillQuad(buf, w, h, [top0, top1, [top1[0], top1[1] + rim], [top0[0], top0[1] + rim]], RIM[0], RIM[1], RIM[2], 0.3)
  }

  for (let s = 0; s <= 2 * (N - 1); s++) {
    for (let i = Math.max(0, s - (N - 2)); i <= Math.min(N - 2, s); i++) {
      const j = s - i
      if (j < 0 || j > N - 2) continue
      drawCell(i, j)
    }
    const jw = s - (N - 1)
    if (jw >= 0 && jw <= N - 2) {
      const a = [px(N - 1, jw), py(N - 1, jw, norm(grid[jw * N + N - 1]))]
      const b = [px(N - 1, jw + 1), py(N - 1, jw + 1, norm(grid[(jw + 1) * N + N - 1]))]
      wallPanel(a, b, py(N - 1, jw, 0), py(N - 1, jw + 1, 0), 0.8)
    }
    const iw = s - (N - 1)
    if (iw >= 0 && iw <= N - 2) {
      const a = [px(iw, N - 1), py(iw, N - 1, norm(grid[(N - 1) * N + iw]))]
      const b = [px(iw + 1, N - 1), py(iw + 1, N - 1, norm(grid[(N - 1) * N + iw + 1]))]
      wallPanel(a, b, py(iw, N - 1, 0), py(iw + 1, N - 1, 0), 1.22)
    }
  }

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
   4. MAIN
   ========================================================================================== */
mkdirSync(OUT_DIR, { recursive: true })

const manifest = []
let minSeen = Infinity
let maxSeen = -Infinity

for (const panel of PANELS) {
  process.stdout.write(`${panel.id.padEnd(9)} `)
  let tiles = 0
  const { grid, cellX, cellY } = await loadElevation({
    centre: panel.centre,
    span: SPAN,
    zoom: Z,
    n: N,
    medianRadius: 1,
    blurPasses: 1,
    onProgress: () => { tiles++ },
  })

  const sorted = Float32Array.from(grid).sort()
  const pctOf = (p) => percentile(sorted, p)
  const p2 = pctOf(0.02)
  const p50 = pctOf(0.5)
  const p98 = pctOf(0.98)
  minSeen = Math.min(minSeen, sorted[0])
  maxSeen = Math.max(maxSeen, sorted[sorted.length - 1])

  /* Per-panel range by default; the pinned one when TERRAIN_SHARED_RAMP=1. p0.5..p99.5 rather
     than min..max so a single DEM outlier cannot flatten the whole ramp — the same reasoning the
     hero's generator carries. */
  const zLo = SHARED_RAMP ? ZLO : pctOf(0.005)
  const zHi = SHARED_RAMP ? ZHI : pctOf(0.995)

  const relief = Math.round(p98 - p2)
  console.log(
    `tiles ${String(tiles).padStart(2)}  ` +
      `p2 ${p2.toFixed(0).padStart(4)}  p50 ${p50.toFixed(0).padStart(4)}  p98 ${p98.toFixed(0).padStart(4)}  ` +
      `max ${sorted[sorted.length - 1].toFixed(0).padStart(4)}  m   relief ${String(relief).padStart(4)} m   ` +
      `ramp ${zLo.toFixed(0)}..${zHi.toFixed(0)} m`,
  )

  /* THE RELIEF GOES INTO THE LABEL, AND THE LABEL SAYS WHICH QUANTITY IT IS.

     This is the half of the comparison the shared ramp was trying to make, and a number is a
     better carrier for it than a colour: a number states the scale exactly, where a ramp only
     states an order.

     IT MUST SAY "relief". The first version printed a bare "979 m", and vision caught the result
     on the built page: the section's own lede mentioned a ridge line "over 1,600 metres" (the
     summit ELEVATION) while the panels read 78 m to 979 m (the RELIEF, which is p98−p2). Two
     different quantities with no label saying which was which, so the copy looked like it
     contradicted the images. Printing the word costs four characters and removes the ambiguity. */
  manifest.push({
    ...panel,
    label: {
      id: `${panel.label.id} · relief ${relief} m`,
      en: `${panel.label.en} · relief ${relief} m`,
    },
    stats: { p2: Math.round(p2), p50: Math.round(p50), p98: Math.round(p98), relief },
  })

  if (!STATS_ONLY) {
    const png = render({ grid, cellX, cellY, zLo, zHi })
    const out = join(OUT_DIR, panel.file)
    writeFileSync(out, PNG.sync.write(png))
  }
}

console.log(`\nmeasured across the set: min ${minSeen.toFixed(0)} m, max ${maxSeen.toFixed(0)} m`)
console.log(
  SHARED_RAMP
    ? `ramp:                   SHARED ${ZLO}..${ZHI} m (TERRAIN_SHARED_RAMP=1)`
    : `ramp:                   per panel (p0.5..p99.5 of each window)`,
)

/* THE SHARED RANGE MUST COVER THE DATA WHEN IT IS USED, and this is the assertion that keeps that
   mode honest. If a window reaches above zHi its summit clips to flat white; if the whole set
   sits below zLo every panel is a single dark colour. Both are silent in a screenshot — a blown
   summit looks like snow, and a flat panel looks like fog — so they are checked here instead.

   In the DEFAULT (per-panel) mode the assertion does not apply: each window normalises to its own
   extremes by construction, so it cannot clip or flatten. */
if (SHARED_RAMP && maxSeen > ZHI * 1.02) {
  throw new Error(
    `a panel reaches ${maxSeen.toFixed(0)} m but the shared ramp tops out at ${ZHI} m — ` +
      `raise TERRAIN_ZHI or the summits will clip`,
  )
}

if (!STATS_ONLY) {
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`wrote                   ${OUT_DIR}  ${CANVAS.w}x${CANVAS.h}  ${PANELS.length} panels + manifest.json`)
}
