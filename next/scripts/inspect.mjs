/**
 * inspect.mjs — quick screenshot + metrics capture for visual review.
 * Usage: node scripts/inspect.mjs [path] [name]
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = 'shots/inspect'
mkdirSync(OUT, { recursive: true })

const path = process.argv[2] ?? '/'
const name = process.argv[3] ?? 'home'
const width = Number(process.env.W ?? 1440)
const height = Number(process.env.H ?? 900)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width, height, deviceScaleFactor: 1 })

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE + path, { waitUntil: 'networkidle0', timeout: 60000 })
await new Promise((r) => setTimeout(r, 1200))

// full page screenshot
await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true })
// viewport screenshot
await page.screenshot({ path: `${OUT}/${name}-fold.png` })

const metrics = await page.evaluate(() => {
  const de = document.documentElement
  const overflow = de.scrollWidth > de.clientWidth ? { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth } : null
  const overflowing = []
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && (r.right > de.clientWidth + 2 || r.left < -2)) {
      overflowing.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 80),
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
      })
    }
  })
  return {
    title: document.title,
    bodyH: document.body.scrollHeight,
    docW: de.clientWidth,
    overflow,
    overflowing: overflowing.slice(0, 20),
    canvases: document.querySelectorAll('canvas').length,
    sections: [...document.querySelectorAll('section')].map((s) => ({
      id: s.id || null,
      cls: (s.className || '').slice(0, 70),
      h: Math.round(s.getBoundingClientRect().height),
    })),
  }
})

console.log(JSON.stringify({ path, errors, metrics }, null, 2))
await browser.close()
