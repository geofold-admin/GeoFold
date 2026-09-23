import type { FormField } from './types'

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('This device does not support location.'))
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const u = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(u); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('Could not read the photo.')) }
    img.src = u
  })
}

// Burns coordinate + timestamp into the photo (the spec's "koordinat embedded di foto") and caps
// the longest edge. Returns a JPEG blob ready to upload.
export async function watermarkPhoto(file: File, lines: string[]): Promise<Blob> {
  const img = await loadImage(file)
  const maxEdge = 1600
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  const width = Math.round(img.width * scale)
  const height = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available on this device.')
  ctx.drawImage(img, 0, 0, width, height)
  const pad = Math.round(width * 0.02)
  const fontSize = Math.max(14, Math.round(width * 0.026))
  const lineH = Math.round(fontSize * 1.35)
  const boxH = lineH * lines.length + pad
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(0, height - boxH, width, boxH)
  ctx.fillStyle = '#fff'
  ctx.font = `${fontSize}px monospace`
  ctx.textBaseline = 'top'
  lines.forEach((l, i) => ctx.fillText(l, pad, height - boxH + pad / 2 + i * lineH))
  return encodeUnderLimit(canvas)
}

/**
 * Hard ceiling on an uploaded photo, matching MAX_BYTES in the mobile app.
 *
 * Storage is the binding cost here — a survey *is* a photo — so both clients have to agree, or the
 * cheaper one just moves the cost around. A 1600 px JPEG at q0.85 is usually well under this; a
 * photo off a modern phone camera, or a scan, is not.
 */
const MAX_BYTES = 1_000_000
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4]

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not process the photo.'))),
      'image/jpeg',
      quality,
    ),
  )
}

/**
 * Encodes at descending quality until the blob fits, then shrinks the canvas if it still does not.
 * Quality first: these photos carry coordinates burned into the frame, and those have to stay
 * readable, which survives a quality drop better than it survives losing pixels.
 */
async function encodeUnderLimit(canvas: HTMLCanvasElement): Promise<Blob> {
  let blob = await toBlob(canvas, QUALITY_STEPS[0])
  if (blob.size <= MAX_BYTES) return blob

  for (const quality of QUALITY_STEPS.slice(1)) {
    blob = await toBlob(canvas, quality)
    if (blob.size <= MAX_BYTES) return blob
  }

  // Bounded: three halvings takes 1600 px to 200 px, past which something else is wrong.
  let working = canvas
  for (let i = 0; i < 3 && blob.size > MAX_BYTES; i += 1) {
    const scale = Math.max(0.5, Math.sqrt(MAX_BYTES / blob.size))
    const next = document.createElement('canvas')
    next.width = Math.max(1, Math.round(working.width * scale))
    next.height = Math.max(1, Math.round(working.height * scale))
    const ctx = next.getContext('2d')
    if (!ctx) break
    ctx.drawImage(working, 0, 0, next.width, next.height)
    working = next
    blob = await toBlob(working, QUALITY_STEPS[QUALITY_STEPS.length - 1])
  }

  return blob
}

export function buildDetails(fields: FormField[], values: Record<string, string | boolean>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = values[f.key]
    if (v === undefined || v === '') continue
    const t = f.type.toLowerCase()
    if (t === 'number') out[f.key] = Number(v)
    else if (t === 'integer') out[f.key] = parseInt(String(v), 10)
    else if (t === 'boolean' || t === 'bool') out[f.key] = Boolean(v)
    else out[f.key] = String(v)
  }
  return out
}
