/**
 * sections.mjs — screenshot each section of a page separately for review.
 * Usage: node scripts/sections.mjs [path] [name]
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const path = process.argv[2] ?? '/'
const name = process.argv[3] ?? 'home'
const OUT = `shots/sections-${name}`
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE + path, { waitUntil: 'networkidle0', timeout: 60000 })
await new Promise((r) => setTimeout(r, 1000))

const info = await page.evaluate(() => {
  const out = []
  const nodes = document.querySelectorAll('main > *, section, footer')
  let i = 0
  nodes.forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.height < 40) return
    out.push({
      i: i++,
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
      top: Math.round(r.top + window.scrollY),
      h: Math.round(r.height),
    })
  })
  return out
})

let n = 0
for (const s of info) {
  const shot = await page.screenshot({
    clip: { x: 0, y: s.top, width: 1440, height: Math.min(s.h, 2400) },
    captureBeyondViewport: true,
  })
  const file = `${OUT}/${String(n).padStart(2, '0')}-${s.tag}-${s.cls.replace(/[^a-z0-9]+/gi, '_').slice(0, 30)}.png`
  const { writeFileSync } = await import('node:fs')
  writeFileSync(file, shot)
  console.log(`${file}  h=${s.h}`)
  n++
}
await browser.close()
