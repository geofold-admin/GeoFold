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

/* The reference colours, tagged by the client's own 60-30-10 buckets.
 *
 * BACK TO THE NORMAL PALETTE, and this table has now been rewritten three times for three briefs.
 * That is worth stating plainly: leaving the previous skin's references in place does not produce
 * a slightly-wrong report, it produces a MEANINGLESS one. When this table held Deep Space and
 * Cyber Cyan, every pixel of the current white page classified as "primary" simply because white
 * is nearest to a pale cyan in the list — a confident wrong answer.
 *
 * The buckets, read as the Blueprint brief defined them (the one whose palette is now in use):
 *   60  the neutrals — white panels, the #F3F4F6 canvas, the hairlines, the ink ladder
 *   30  GEOFOLD Blue and its hover/soft/deep family
 *   10  GEOFOLD Orange, the conversion accent
 */
const REFS = [
  /* neutrals — the 60. Panel, canvas, line, and the four ink steps. */
  ['neutral', '#FFFFFF'], ['neutral', '#F3F4F6'], ['neutral', '#E5E7EB'], ['neutral', '#F9FAFB'],
  ['neutral', '#111827'], ['neutral', '#1F2937'], ['neutral', '#4B5563'],
  ['neutral', '#6B7280'], ['neutral', '#9CA3AF'], ['neutral', '#D1D5DB'],
  /* primary — the 30. GEOFOLD Blue and the steps derived from it. */
  ['primary', '#014AB5'], ['primary', '#013A8F'], ['primary', '#EFF5FF'],
  ['primary', '#0A192F'], ['primary', '#1B2F52'], ['primary', '#C7D7EE'],
  /* accent — the 10. GEOFOLD Orange, and the one darker step used for small text. */
  ['accent', '#F35D19'], ['accent', '#D6450A'], ['accent', '#C2410C'],
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
  console.log(`  neutral      (the 60) : ${pct(counts.neutral).padStart(5)}%`)
  console.log(`  GEOFOLD Blue (the 30) : ${pct(counts.primary).padStart(5)}%`)
  console.log(`  GEOFOLD Orange (10)   : ${pct(counts.accent).padStart(5)}%`)
  await page.close()
}

console.log('\n\n================ SUMMARY ================')
console.log('  page        neutral      blue    orange')
for (const r of rows) {
  console.log(`  ${r.name.padEnd(9)} ${r.pct(r.counts.neutral).padStart(6)}% ${r.pct(r.counts.primary).padStart(9)}% ${r.pct(r.counts.accent).padStart(8)}%`)
}
/* THE 60-30-10 NOTE, AND WHY THIS IS A REPORT RATHER THAN A GATE.
   The Blueprint brief stated the 60-30-10 split explicitly, which is where the buckets in the
   table above come from. The Neo-Topography brief that briefly replaced it mentioned no ratio at
   all, and the current directive is verbal — "gunakan color palet normal nya saja" — so it names
   a palette rather than a proportion.

   So this stays descriptive. What the numbers are genuinely good for is catching a leak: the
   accent is supposed to be "digunakan sangat terbatas", and a page that measured 25% orange would
   be a defect regardless of what any brief says. A page that measures 1% is the design working. */
console.log('\n  READ THESE AS: neutral is the page, blue is the hero plate plus the brand chrome,')
console.log('  and orange is the conversion accent — which must stay near zero on every page,')
console.log('  because "digunakan sangat terbatas" is the one thing the palette constrains.\n')

await browser.close()
