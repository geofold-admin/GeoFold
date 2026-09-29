/**
 * crop.mjs — screenshot a specific element, zoomed, for close inspection.
 * Usage: node scripts/crop.mjs [path] [selector] [name] [pad]
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = 'shots/crop'
mkdirSync(OUT, { recursive: true })

const path = process.argv[2] ?? '/'
const selector = process.argv[3] ?? 'body'
const name = process.argv[4] ?? 'crop'
const pad = Number(process.argv[5] ?? 8)
const W = Number(process.env.W ?? 1440)

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: W, height: 900, deviceScaleFactor: 2 })
await page.goto(BASE + path, { waitUntil: 'networkidle0', timeout: 60000 })
await new Promise((r) => setTimeout(r, 900))

const box = await page.evaluate((sel) => {
  const el = document.querySelector(sel)
  if (!el) return null
  el.scrollIntoView({ block: 'center', behavior: 'instant' })
  const r = el.getBoundingClientRect()
  /* clip is PAGE-absolute: add the scroll offset back. */
  return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height }
}, selector)
if (!box) { console.log('NOT FOUND', selector); process.exit(1) }
await new Promise((r) => setTimeout(r, 300))

const shot = await page.screenshot({
  clip: {
    x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
    width: Math.min(W, box.w + pad * 2), height: box.h + pad * 2,
  },
})
writeFileSync(`${OUT}/${name}.png`, shot)
console.log(`${OUT}/${name}.png  box=${JSON.stringify(box)}`)
await browser.close()
