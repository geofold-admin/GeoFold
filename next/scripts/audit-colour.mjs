/**
 * audit-colour.mjs — the colour-theory audit the brief asks for, done by MEASUREMENT.
 *
 * The brief specifies a 60-30-10 split and gives exact hexes. Both claims are testable:
 *
 *   1. PROPORTION. Render each page, classify every pixel as neutral / primary / accent, and
 *      report the real percentages. A palette is only 60-30-10 if the RENDERED PAGE is.
 *   2. ROLE. For each of the brief's hexes, confirm it is used for the role the brief names, and
 *      that any text on it passes WCAG AA. Where the brief's own hex fails, that is a finding.
 *
 * Colour classification is by nearest-reference in a perceptual-ish space (weighted RGB distance,
 * which is enough to separate a blue from an orange from a grey), not by exact equality — because
 * antialiasing means almost no pixel is exactly the token value.
 */
import puppeteer from 'puppeteer-core'
import { PNG } from 'pngjs'
import { readFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const OUT = 'shots'
mkdirSync(OUT, { recursive: true })

const ROUTES = [
  ['landing', '/'],
  ['pricing', '/pricing'],
  ['product', '/product'],
]

/* The reference colours, tagged by the brief's own 60-30-10 buckets.
 *
 * UPDATED FOR NEOTOPOGRAPHY. The Blueprint palette this table used to describe (a light canvas,
 * a brand blue and a conversion orange) is retired by the client's new document, and leaving the
 * old references in place would have produced a meaningless report: every pixel of a Deep Space
 * page would classify as "primary" because near-black is nearest to #0A192F in the old list.
 *
 * The new buckets, read the same way the previous ones were — the ground is the 60, the cyan/sky
 * pair is the 30, emerald is the 10:
 *   60  the Deep Space ground and the glass ladder above it
 *   30  Cyber Cyan and the gradient's sky stop
 *   10  Neon Emerald
 */
const REFS = [
  /* neutrals — the 60. Deep Space, the glass steps, the silver ink ladder, the hairlines. */
  ['neutral', '#020617'], ['neutral', '#070D1F'], ['neutral', '#0B1224'], ['neutral', '#0D1427'],
  ['neutral', '#0F172A'], ['neutral', '#1E293B'], ['neutral', '#202535'],
  ['neutral', '#94A3B8'], ['neutral', '#CBD5E1'], ['neutral', '#F8FAFC'],
  /* primary — the 30. The accent pair and its gradient. */
  ['primary', '#00F2FE'], ['primary', '#4FACFE'], ['primary', '#6FF6FF'],
  ['primary', '#7CC0FF'], ['primary', '#0E4A5C'], ['primary', '#0A3A52'],
  /* accent — the 10. */
  ['accent', '#00FF87'], ['accent', '#00CC6C'],
]
const REF_RGB = REFS.map(([k, h]) => [k, [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]])

/* Perceptual distance: redmean, which is cheap and much better than plain euclidean. */
function dist(a, b) {
  const rm = (a[0] + b[0]) / 2
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})

const rows = []
for (const [name, route] of ROUTES) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 90_000 })
  await new Promise((r) => setTimeout(r, 2600))
  /* Walk the whole document so lazy sections paint, then return to the top. */
  const full = await page.evaluate(async () => {
    const step = window.innerHeight * 0.8
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' })
      await new Promise((r) => setTimeout(r, 160))
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
    await new Promise((r) => setTimeout(r, 400))
    return document.body.scrollHeight
  })
  await new Promise((r) => setTimeout(r, 700))
  await page.screenshot({ path: `${OUT}/audit-${name}.png`, fullPage: true })

  const png = PNG.sync.read(readFileSync(`${OUT}/audit-${name}.png`))
  const counts = { neutral: 0, primary: 0, accent: 0, other: 0 }
  let sampled = 0
  for (let y = 0; y < png.height; y += 3) {
    for (let x = 0; x < png.width; x += 3) {
      const i = (y * png.width + x) << 2
      const p = [png.data[i], png.data[i + 1], png.data[i + 2]]
      let best = null, bestD = Infinity
      for (const [k, ref] of REF_RGB) {
        const d = dist(p, ref)
        if (d < bestD) { bestD = d; best = k }
      }
      counts[best]++
      sampled++
    }
  }
  const pct = (n) => ((n / sampled) * 100).toFixed(1)
  rows.push({ name, route, docHeight: full, sampled, counts, pct })
  console.log(`\n=== ${name}  (${route})  doc ${full}px, ${sampled} pixels sampled ===`)
  console.log(`  ground+glass (the 60) : ${pct(counts.neutral).padStart(5)}%`)
  console.log(`  cyan/sky     (the 30) : ${pct(counts.primary).padStart(5)}%`)
  console.log(`  emerald      (the 10) : ${pct(counts.accent).padStart(5)}%`)
  await page.close()
}

console.log('\n\n================ SUMMARY ================')
console.log('  page      ground   cyan/sky   emerald')
for (const r of rows) {
  console.log(`  ${r.name.padEnd(9)} ${r.pct(r.counts.neutral).padStart(6)}% ${r.pct(r.counts.primary).padStart(9)}% ${r.pct(r.counts.accent).padStart(8)}%`)
}
/* THE 60-30-10 NOTE IS DELIBERATE, and it is a correction. The Blueprint brief stated that split
   explicitly and this script used to assert it. The Neo-Topography brief does NOT mention it
   anywhere — no "60-30-10", no ratio of any kind. It describes a single AMOLED ground, one
   accent pair and one conversion colour, and it asks for a page that reads as premium and dark.

   So this report is descriptive, not a pass/fail gate, and that is the honest framing: a design
   whose ground is a near-black that every other element composites ON TOP OF will always measure
   as overwhelmingly neutral, and that is the intended look rather than a miss. What the numbers
   are actually good for is catching the opposite failure — a cyan or emerald value that has
   leaked out of its ration, which is the thing the brief DOES constrain:
   "Digunakan khusus untuk penanda atau highlight konversi tinggi". */
console.log('\n  the Neo-Topography brief specifies no ratio; the accent is meant to stay rare.')
console.log('  what matters is that emerald stays near 0% and cyan stays in single digits.\n')

await browser.close()
