/**
 * measure.mjs — measure specific elements' geometry on the live page.
 * Usage: node scripts/measure.mjs [path] [selector...]
 */
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const path = process.argv[2] ?? '/'
const selectors = process.argv.slice(3)

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: Number(process.env.W ?? 1440), height: 900 })
await page.goto(BASE + path, { waitUntil: 'networkidle0', timeout: 60000 })
await new Promise((r) => setTimeout(r, 800))

const out = await page.evaluate((sels) => {
  const res = {}
  for (const sel of sels) {
    const els = [...document.querySelectorAll(sel)]
    res[sel] = els.slice(0, 8).map((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        text: (el.textContent || '').trim().slice(0, 40),
        x: Math.round(r.x), y: Math.round(r.y + window.scrollY),
        w: Math.round(r.width), h: Math.round(r.height),
        font: cs.fontSize + '/' + cs.lineHeight + ' ' + cs.fontFamily.split(',')[0],
        radius: cs.borderRadius,
        pad: cs.padding,
        gap: cs.gap,
        color: cs.color,
        bg: cs.backgroundColor,
        border: cs.borderWidth + ' ' + cs.borderColor,
        display: cs.display,
        overflow: cs.overflow,
      }
    })
  }
  return res
}, selectors)

console.log(JSON.stringify(out, null, 2))
await browser.close()
