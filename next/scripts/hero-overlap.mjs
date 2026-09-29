/**
 * hero-overlap.mjs — prove or disprove that the static PNG and the WebGL canvas both paint.
 *
 * Method: screenshot the hero stage three times — canvas hidden, canvas shown, image hidden —
 * and diff them. If "canvas shown" differs from "image hidden" only inside the block's own
 * silhouette, the two agree. Any difference OUTSIDE that silhouette is the PNG showing through
 * the transparent canvas, which is the overlap a reader would see as a doubled edge.
 */
import puppeteer from 'puppeteer-core'
import { PNG } from 'pngjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
mkdirSync('shots/overlap', { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 60000 })
/* Wait for the hero stage itself rather than assuming networkidle means painted — the canvas is
   created in an effect after the module chunk lands. */
await page.waitForSelector('.pg-hero-stage', { timeout: 30000 })
await new Promise((r) => setTimeout(r, 2500))

const box = await page.evaluate(() => {
  const el = document.querySelector('.pg-hero-stage')
  if (!el) throw new Error('no .pg-hero-stage')
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})

const shot = async (name) => {
  const raw = await page.screenshot({
    clip: { x: box.x, y: box.y, width: box.w, height: box.h },
    captureBeyondViewport: true,
  })
  // puppeteer returns a Uint8Array on this version; pngjs needs a Buffer.
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
  writeFileSync(`shots/overlap/${name}.png`, buf)
  return PNG.sync.read(buf)
}

// 1. both layers as shipped
const both = await shot('both')

// 2. canvas only (image hidden)
await page.evaluate(() => { document.querySelector('.pg-hero-map').style.visibility = 'hidden' })
await new Promise((r) => setTimeout(r, 300))
const canvasOnly = await shot('canvas-only')

// 3. image only (canvas hidden)
await page.evaluate(() => {
  document.querySelector('.pg-hero-map').style.visibility = ''
  document.querySelector('.pg-hero-canvas').style.visibility = 'hidden'
})
await new Promise((r) => setTimeout(r, 300))
const imageOnly = await shot('image-only')

const diff = (a, b) => {
  let n = 0
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > 8 ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > 8 ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > 8
    ) n++
  }
  return n
}

const px = box.w * box.h
console.log(`stage box      ${Math.round(box.w)}x${Math.round(box.h)} = ${Math.round(px)} px`)
console.log(`both vs canvas-only  ${diff(both, canvasOnly)} px  (PNG visible where canvas is transparent)`)
console.log(`both vs image-only   ${diff(both, imageOnly)} px  (canvas covering the PNG)`)
console.log(`canvas-only vs image-only  ${diff(canvasOnly, imageOnly)} px  (how different the two drawings are)`)

// Where do the "both vs canvas-only" differences sit? A bounding box tells us whether they are
// inside the block or spread around it.
let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
for (let y = 0; y < both.height; y++) {
  for (let x = 0; x < both.width; x++) {
    const i = (y * both.width + x) << 2
    if (
      Math.abs(both.data[i] - canvasOnly.data[i]) > 8 ||
      Math.abs(both.data[i + 1] - canvasOnly.data[i + 1]) > 8 ||
      Math.abs(both.data[i + 2] - canvasOnly.data[i + 2]) > 8
    ) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
console.log(`PNG-visible region bbox: x ${minX}..${maxX}  y ${minY}..${maxY}  (stage is ${Math.round(box.w)}x${Math.round(box.h)})`)

await browser.close()
