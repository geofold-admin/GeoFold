// A picture of the survey points on the satellite basemap, drawn in the browser for the Excel
// export. No map library and no server: the same Esri imagery tiles the interactive map shows are
// laid onto a canvas and the points are drawn over them.

import type { XlsxImage } from './export'

export interface MapPoint {
  latitude: number
  longitude: number
}

export interface StaticMap {
  image: XlsxImage
  width: number
  height: number
}

const TILE = 256
const MAX_ZOOM = 18
/** The picture is at most this many tiles, however spread out the points are. */
const MAX_TILES = 48
const TILE_URL = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
const ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics'

// Web Mercator, in pixels of the whole world at a zoom level.
const worldX = (lng: number, z: number) => ((lng + 180) / 360) * TILE * 2 ** z
const worldY = (lat: number, z: number) => {
  const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z
}

/**
 * Loads one tile as an image the canvas may read back. `crossOrigin` is what keeps the canvas
 * exportable: without it the first tile drawn taints the canvas and `toBlob` throws. The tile
 * server sends `Access-Control-Allow-Origin: *`, and the request is an image load, so it is the
 * page's img-src that governs it — which already lists this host for the interactive map.
 */
function loadTile(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => resolve(null), 12_000)
    img.onload = () => { clearTimeout(timer); resolve(img) }
    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = url
  })
}

/**
 * Draws `points` over satellite imagery and returns it as a JPEG, or null when there is nothing to
 * draw or the imagery could not be fetched — a map of markers on a blank ground would look like a
 * result and say nothing, so the export simply goes without the picture.
 *
 * Points are numbered in the order given, which is the order of the rows in the data sheet.
 */
export async function renderStaticMap(points: MapPoint[], width = 1200, height = 800): Promise<StaticMap | null> {
  const valid = points
    .map((p, index) => ({ ...p, index }))
    .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180)
  if (valid.length === 0 || typeof document === 'undefined') return null

  const lats = valid.map((p) => p.latitude)
  const lngs = valid.map((p) => p.longitude)
  const [south, north, west, east] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]

  // The closest zoom at which every point fits inside the frame with a margin around it. A single
  // point, or several on the same spot, has no extent to fit and gets a street-level view.
  const pad = 90
  let zoom = MAX_ZOOM
  for (; zoom > 1; zoom--) {
    const w = worldX(east, zoom) - worldX(west, zoom)
    const h = worldY(south, zoom) - worldY(north, zoom)
    if (w <= width - pad * 2 && h <= height - pad * 2) break
  }
  if (north === south && east === west) zoom = Math.min(zoom, 17)

  const left = Math.round((worldX(west, zoom) + worldX(east, zoom)) / 2 - width / 2)
  const top = Math.round((worldY(north, zoom) + worldY(south, zoom)) / 2 - height / 2)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#F3F4F6'
  ctx.fillRect(0, 0, width, height)

  const n = 2 ** zoom
  const jobs: Promise<boolean>[] = []
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height - 1) / TILE); ty++) {
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width - 1) / TILE); tx++) {
      if (ty < 0 || ty >= n || jobs.length >= MAX_TILES) continue
      const wrapped = ((tx % n) + n) % n
      jobs.push(
        loadTile(TILE_URL(zoom, wrapped, ty)).then((img) => {
          if (!img) return false
          ctx.drawImage(img, tx * TILE - left, ty * TILE - top, TILE, TILE)
          return true
        }),
      )
    }
  }
  const drawn = (await Promise.all(jobs)).filter(Boolean).length
  if (drawn < jobs.length / 2) return null

  // The survey pin: the orange disc in a white collar with a dark ring, as on the interactive map.
  const numbered = valid.length <= 80
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  for (const p of valid) {
    const x = worldX(p.longitude, zoom) - left
    const y = worldY(p.latitude, zoom) - top
    ctx.beginPath()
    ctx.arc(x, y, 9, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, 8, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#F35D19'
    ctx.fill()
    if (!numbered) continue
    const label = String(p.index + 1)
    const w = ctx.measureText(label).width + 10
    ctx.fillStyle = 'rgba(10,25,47,0.86)'
    ctx.fillRect(x + 11, y - 10, w, 20)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, x + 16, y + 0.5)
  }

  // The imagery's licence asks for this line wherever the tiles are shown.
  ctx.font = '11px system-ui, sans-serif'
  const aw = ctx.measureText(ATTRIBUTION).width + 12
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  ctx.fillRect(width - aw, height - 20, aw, 20)
  ctx.fillStyle = '#111827'
  ctx.fillText(ATTRIBUTION, width - aw + 6, height - 10)

  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    if (!blob) return null
    return { image: { data: new Uint8Array(await blob.arrayBuffer()), ext: 'jpeg' }, width, height }
  } catch {
    // A tile served without the CORS header taints the canvas; the export goes without the map.
    return null
  }
}
