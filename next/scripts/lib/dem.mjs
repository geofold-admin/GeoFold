#!/usr/bin/env node
/**
 * dem.mjs — THE DEM PIPELINE, in one place.
 *
 * Reads Mapzen/Terrarium terrain tiles (public domain) and turns them into a conditioned
 * elevation grid. `elevation = (R * 256 + G + B / 256) - 32768` metres.
 *
 * Tiles are cache-first under `.cache/terrain`; a re-run with the cache warm costs no network.
 *
 * This exists so the hero's WebGL terrain and the static `public/hero-terrain.png` are fed by
 * the SAME numbers from the SAME conditioning chain. If they were built by two copies of this
 * maths they could drift, and the hero would show a different hillside than its own caption
 * names. `scripts/build-terrain.mjs` predates this module and still carries its own copy; the
 * constants are identical and the generator asserts the two grids agree on their percentiles.
 */
import { PNG } from 'pngjs'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(HERE, '..', '..')
export const CACHE = join(ROOT, '.cache', 'terrain')

export const lonToX = (lon, z) => ((lon + 180) / 360) * 2 ** z
export const latToY = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

/** Terrarium decode, in metres. */
export const decodeElevation = (r, g, b) => r * 256 + g + b / 256 - 32768

/** Cache-first tile read; fetches and caches only when the tile is genuinely missing. */
export async function fetchTile(z, x, y) {
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

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Linear-interpolated percentile of a numeric array (sorts a copy). */
export function percentile(values, p) {
  const s = Float32Array.from(values).sort()
  const idx = Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))
  return s[idx]
}

/**
 * Build a conditioned N×N elevation grid for a lat/lon window.
 *
 * Conditioning is MEDIAN then BOX, in that order, and it is load-bearing: on the raw grid a
 * single bad cell can stand 89 m above a 26 m landscape, and rendered as geometry that is a
 * needle spire. A median deletes the outlier; the box pass takes the staircase off the median's
 * own output. See build-terrain.mjs for the full measurement.
 */
export async function loadElevation({
  centre,
  span,
  zoom,
  n,
  medianRadius = 2,
  blurPasses = 2,
  onProgress,
}) {
  const { lat, lon } = centre
  const x0 = Math.floor(lonToX(lon - span, zoom))
  const x1 = Math.floor(lonToX(lon + span, zoom))
  const y0 = Math.floor(latToY(lat + span, zoom))
  const y1 = Math.floor(latToY(lat - span, zoom))
  const cols = x1 - x0 + 1
  const rows = y1 - y0 + 1
  const W = cols * 256
  const H = rows * 256
  const mosaic = new Float32Array(W * H)

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const png = PNG.sync.read(await fetchTile(zoom, tx, ty))
      const ox = (tx - x0) * 256
      const oy = (ty - y0) * 256
      for (let py = 0; py < 256; py++) {
        for (let px = 0; px < 256; px++) {
          const s = (py * 256 + px) << 2
          mosaic[(oy + py) * W + ox + px] = decodeElevation(png.data[s], png.data[s + 1], png.data[s + 2])
        }
      }
      onProgress?.()
    }
  }

  // The exact pixel window this bounding box covers inside the mosaic.
  const gx0 = lonToX(lon - span, zoom) * 256 - x0 * 256
  const gx1 = lonToX(lon + span, zoom) * 256 - x0 * 256
  const gy0 = latToY(lat + span, zoom) * 256 - y0 * 256
  const gy1 = latToY(lat - span, zoom) * 256 - y0 * 256

  /* Box-average each target cell over the source pixels it covers, so a DEM quirk becomes a
     small bump rather than a single-pixel spike. */
  const grid = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    const sy0 = gy0 + ((gy1 - gy0) * j) / n
    const sy1 = gy0 + ((gy1 - gy0) * (j + 1)) / n
    for (let i = 0; i < n; i++) {
      const sx0 = gx0 + ((gx1 - gx0) * i) / n
      const sx1 = gx0 + ((gx1 - gx0) * (i + 1)) / n
      let sum = 0
      let count = 0
      for (let py = Math.floor(sy0); py < Math.max(Math.floor(sy1), Math.floor(sy0) + 1); py++) {
        for (let px = Math.floor(sx0); px < Math.max(Math.floor(sx1), Math.floor(sx0) + 1); px++) {
          if (px < 0 || py < 0 || px >= W || py >= H) continue
          sum += mosaic[py * W + px]
          count++
        }
      }
      grid[j * n + i] = count ? sum / count : 0
    }
  }

  // ---- median filter (deletes outliers) ----
  let smoothed = grid
  {
    const R = medianRadius
    const win = (2 * R + 1) ** 2
    const buf = new Float32Array(win)
    const next = new Float32Array(n * n)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let c = 0
        for (let dj = -R; dj <= R; dj++) {
          for (let di = -R; di <= R; di++) {
            const a = i + di
            const b = j + dj
            if (a < 0 || b < 0 || a >= n || b >= n) continue
            buf[c++] = smoothed[b * n + a]
          }
        }
        const slice = buf.subarray(0, c)
        slice.sort()
        next[j * n + i] = slice[c >> 1]
      }
    }
    smoothed = next
  }

  // ---- light box blur (removes the median's staircase) ----
  for (let pass = 0; pass < blurPasses; pass++) {
    const next = new Float32Array(n * n)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let s = 0
        let c = 0
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const a = i + di
            const b = j + dj
            if (a < 0 || b < 0 || a >= n || b >= n) continue
            s += smoothed[b * n + a]
            c++
          }
        }
        next[j * n + i] = s / c
      }
    }
    smoothed = next
  }

  const cellX = (span * 2 * 111320 * Math.cos((lat * Math.PI) / 180)) / n
  const cellY = (span * 2 * 110540) / n

  return { grid: smoothed, cellX, cellY, tiles: { cols, rows, x0, y0 }, zoom }
}
