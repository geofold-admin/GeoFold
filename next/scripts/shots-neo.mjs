/**
 * shots-neo.mjs — viewport crops for a visual read of the new skin.
 *
 * Full-page captures of this site are ~2.4MB and get rejected by the vision endpoint, so this
 * writes one image per viewport-sized band down the landing page plus the key app screens, which
 * is what a reviewer can actually look at.
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const OUT = 'shots'
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 3500))

/* Scroll through the whole page first so every scroll-triggered reveal has fired, then come back
   to the top. Without this the captures show headings mid-animation or still masked. */
const height = await page.evaluate(() => document.body.scrollHeight)
for (let y = 0; y < height; y += 700) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y)
  await new Promise((r) => setTimeout(r, 130))
}
await page.evaluate(() => window.scrollTo(0, 0))
await new Promise((r) => setTimeout(r, 1200))

const bands = [
  ['hero', 0],
  ['bento', 900],
  ['bento2', 1750],
  ['globe', 2600],
  ['pricing', 3450],
  ['closer', 4300],
]
for (const [name, y] of bands) {
  if (y > height - 200) continue
  await page.evaluate((yy) => window.scrollTo(0, yy), y)
  await new Promise((r) => setTimeout(r, 900))
  await page.screenshot({ path: `${OUT}/neo-${name}.png` })
  console.log(`  wrote ${OUT}/neo-${name}.png`)
}

/* The nav in its stuck state, which is the one surface that changes on scroll. */
await page.evaluate(() => window.scrollTo(0, 1400))
await new Promise((r) => setTimeout(r, 900))
await page.screenshot({ path: `${OUT}/neo-nav-stuck.png`, clip: { x: 0, y: 0, width: 1440, height: 120 } })
console.log(`  wrote ${OUT}/neo-nav-stuck.png`)

/* A mobile viewport, because the brief's shapes and the pill CTA have to survive it. */
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await page.evaluate(() => window.scrollTo(0, 0))
await new Promise((r) => setTimeout(r, 1200))
await page.screenshot({ path: `${OUT}/neo-mobile.png` })
console.log(`  wrote ${OUT}/neo-mobile.png`)

/* Pricing, where the featured card and the StarBorder CTA live. */
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
await page.goto(BASE + '/pricing', { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 3000))
await page.evaluate(() => window.scrollTo(0, 700))
await new Promise((r) => setTimeout(r, 900))
await page.screenshot({ path: `${OUT}/neo-pricing.png` })
console.log(`  wrote ${OUT}/neo-pricing.png`)

/* The app, to show it is UNCHANGED — the isolation claim, visually. */
await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 1500))
await page.evaluate(() => {
  const set = (el, v) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  const e = document.querySelector('input[type="email"], #email'), p = document.querySelector('input[type="password"], #password')
  if (e) set(e, 'demo@geofold.app'); if (p) set(p, 'demo-password')
  document.querySelector('form button[type="submit"]')?.click()
})
await new Promise((r) => setTimeout(r, 4000))
await page.screenshot({ path: `${OUT}/neo-app-unchanged.png` })
console.log(`  wrote ${OUT}/neo-app-unchanged.png`)

await browser.close()
