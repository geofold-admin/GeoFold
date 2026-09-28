/**
 * skew-verify.mjs — the corrected measurement of the scroll-velocity skew.
 *
 * WHAT WENT WRONG IN THE PREVIOUS PROBE, kept here because it is the whole point of the script:
 * I parsed the computed transform with /matrix\(([^)]+)\)/ and treated a non-match as "no skew".
 * GSAP writes `translate3d(...)` for these elements, and a 3D transform computes to `matrix3d(...)`
 * — which does not contain the substring "matrix(" at all. So a working effect measured as exactly
 * 0.00deg, and I nearly reported a bug that did not exist. A non-match must be an ERROR, never a
 * zero.
 *
 * It also confirms the two things that actually matter to a reader: the heading leans while the
 * page moves, and it is square again when the page stops.
 */
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE ?? 'http://localhost:3100'

/** skewX in degrees from any computed transform, 2D or 3D. Returns null when unparseable.
 *
 *  THE INDICES ARE THE WHOLE POINT OF THIS HELPER, and I got them wrong twice:
 *    matrix(a, b, c, d, e, f)      skewX = atan2(c, a) = atan2(p[2], p[0])
 *    matrix3d(16 values, col-major) skewX = atan2(m21, m11) = atan2(p[4], p[0])
 *  `p[1]` is m12/b — the ROTATION term, always 0 for a skew — so using it reported a working
 *  effect as exactly 0.00deg. GSAP writes translate3d(), so skewed elements compute to matrix3d,
 *  which does NOT contain the substring "matrix(". A non-match returns null, never 0.
 */
const SKEW_FROM_TRANSFORM = `
  (function (el) {
    const t = getComputedStyle(el).transform
    if (!t || t === 'none') return 0
    const m3 = t.match(/matrix3d\\(([^)]+)\\)/)
    if (m3) {
      const p = m3[1].split(',').map(Number)
      return Math.abs(Math.atan2(p[4], p[0]) * 180 / Math.PI)
    }
    const m2 = t.match(/matrix\\(([^)]+)\\)/)
    if (m2) {
      const p = m2[1].split(',').map(Number)
      return Math.abs(Math.atan2(p[2], p[0]) * 180 / Math.PI)
    }
    return null   // <- an error, not a zero
  })
`

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))

await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 2600))

const readAll = () =>
  page.evaluate(
    (fn) => {
      const skew = eval(fn)
      const out = { headings: [], rows: [], unparsed: 0 }
      for (const el of document.querySelectorAll('.pg-d2[data-anim="lines"]')) {
        const v = skew(el)
        if (v === null) out.unparsed++
        else out.headings.push(v)
      }
      for (const el of document.querySelectorAll('.pg-marquee-row')) {
        const v = skew(el)
        if (v === null) out.unparsed++
        else out.rows.push(v)
      }
      return out
    },
    SKEW_FROM_TRANSFORM,
  )

console.log('=== scroll with real wheel events, sampling continuously ===')
await page.mouse.move(720, 450)
await page.evaluate(() => window.scrollTo(0, 300))
await new Promise((r) => setTimeout(r, 400))

let maxHead = 0, maxRow = 0, samples = 0, unparsed = 0
for (let i = 0; i < 34; i++) {
  await page.mouse.wheel({ deltaY: 300 })
  for (let k = 0; k < 4; k++) {
    const s = await readAll()
    samples++
    unparsed += s.unparsed
    if (s.headings.length) maxHead = Math.max(maxHead, ...s.headings)
    if (s.rows.length) maxRow = Math.max(maxRow, ...s.rows)
    await new Promise((r) => setTimeout(r, 22))
  }
}

console.log(`   samples=${samples}  unparseable transforms=${unparsed}`)
console.log(`   max |skew| on HEADINGS (.pg-d2)   : ${maxHead.toFixed(2)}deg   (cap 1.5)`)
console.log(`   max |skew| on BAND rows (.pg-marquee-row): ${maxRow.toFixed(2)}deg   (cap 3.0)`)
console.log(`   headings lean while scrolling : ${maxHead > 0.05 ? 'YES' : 'NO'}`)
console.log(`   band leans while scrolling    : ${maxRow > 0.05 ? 'YES' : 'NO'}`)
console.log(`   heading lean < band lean      : ${maxHead <= maxRow + 0.01 ? 'YES (deliberate: 1.5 vs 3.0 cap)' : 'NO'}`)

console.log('\n=== after the page stops ===')
await new Promise((r) => setTimeout(r, 1000))
const s = await readAll()
console.log(`   max |skew| = ${Math.max(0, ...s.headings, ...s.rows).toFixed(3)}deg  ${Math.max(0, ...s.headings, ...s.rows) < 0.05 ? '(square — settles correctly)' : '(STILL SKEWED — bug)'}`)

/* the reveal must be intact: the headings were already animated by SplitText */
const reveal = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('.pg-d2[data-anim="lines"]')) {
    const r = el.getBoundingClientRect()
    const line = el.querySelector('.pg-split-line')
    out.push({
      h: Math.round(r.height),
      op: getComputedStyle(el).opacity,
      lineOp: line ? getComputedStyle(line).opacity : null,
      lineY: line ? getComputedStyle(line).transform.slice(0, 30) : null,
    })
  }
  return out
})
console.log('\n=== the SplitText reveal is still intact on every heading ===')
for (const r of reveal) console.log(`   h=${r.h} opacity=${r.op} lineOpacity=${r.lineOp} lineTransform=${r.lineY}`)
console.log(`   all readable: ${reveal.every((r) => r.h > 20 && r.op === '1' && r.lineOp === '1')}`)

console.log('\n=== js errors ===')
console.log(errors.length ? errors.slice(0, 5).map((e) => '   ' + e).join('\n') : '   none')

await browser.close()
