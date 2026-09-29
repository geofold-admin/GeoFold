/**
 * neo-headline-paint2.mjs — the same differential test, with two corrections to the method.
 *
 * CORRECTION 1 — the reveal must be given a chance to fire. The previous pass screenshotted
 * /pricing without scrolling, so `data-anim` headings below the fold were still at their
 * pre-reveal opacity and reported "0 px painted". That is a measurement artifact, not a design
 * fault: the page reveals on scroll by design. This scrolls the whole document first, exactly as
 * a visitor would, and only then freezes and measures.
 *
 * CORRECTION 2 — the <em> inside a gradient heading is measured separately. It is the one part
 * of the headline that is NOT meant to carry the gradient, and it is also the part most likely to
 * be silently invisible, because `-webkit-text-fill-color` inherits and the parent sets it to
 * transparent. Measuring the heading as a single box would average that failure away.
 */
import puppeteer from 'puppeteer-core'
import { PNG } from 'pngjs'
import { readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

const at = (p, x, y) => { const i = (y * p.width + x) << 2; return [p.data[i], p.data[i + 1], p.data[i + 2]] }
const diff = (p, q, x, y) => { const a = at(p, x, y), b = at(q, x, y); return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) }
/* WHAT COUNTS AS "PAINTED" CHANGES WITH THE PALETTE, and this is the third palette this script
   has seen. Under Neo-Topography the headings were gradient-filled in Cyber Cyan and the highlight
   word was Neon Emerald, so the predicates looked for those. The client has since retired that
   skin for the normal palette, where headings are flat ink and the highlight word is GEOFOLD Blue.

   The MEASUREMENT is unchanged and is the point of the script: it diffs the heading against the
   page without the heading to prove the glyphs actually reach the screen. Only the colour
   predicates move. The `em` highlight is still checked separately, because "the emphasis word is
   invisible" was a real bug this script caught. */
const isBlue = (r, g, b) => b > 110 && b > r + 55 && g < b
const isInk = (r, g, b) => r < 90 && g < 90 && b < 100
/* THE HERO HEADING IS WHITE ON THE DARK PLATE, and that is correct rather than a defect. A
   predicate that only accepts dark ink reports it as "check the mean ink", which is a false alarm
   on the one heading that must be light. Measured: the H1 reads mean ink rgb(231,233,235). */
const isLight = (r, g, b) => r > 200 && g > 200 && b > 200

async function run(url, tag, sel) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90_000 })
  await sleep(1500)

  /* Scroll the whole page so every `data-anim` reveal fires, then return to the top. */
  const h = await page.evaluate(() => document.body.scrollHeight)
  for (let y = 0; y < h; y += 500) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(110) }
  await sleep(1400)
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(900)

  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })
  await page.evaluate(() => { document.querySelectorAll('canvas').forEach((c) => { c.style.visibility = 'hidden' }) })
  await sleep(700)

  const boxes = await page.evaluate((s) => s.map((q) => {
    const el = document.querySelector(q)
    if (!el) return { q, missing: true }
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      q, missing: false,
      x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height),
      text: (el.textContent || '').trim().slice(0, 40),
      grad: cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage),
      fill: cs.webkitTextFillColor,
      anim: cs.animationName,
    }
  }), sel)

  await page.screenshot({ path: `shots/_p2-${tag}-a.png`, fullPage: true })
  await sleep(600)
  await page.screenshot({ path: `shots/_p2-${tag}-a2.png`, fullPage: true })
  await page.evaluate((s) => s.forEach((q) => { const el = document.querySelector(q); if (el) el.style.visibility = 'hidden' }), sel)
  await sleep(700)
  await page.screenshot({ path: `shots/_p2-${tag}-b.png`, fullPage: true })

  const A = PNG.sync.read(readFileSync(`shots/_p2-${tag}-a.png`))
  const A2 = PNG.sync.read(readFileSync(`shots/_p2-${tag}-a2.png`))
  const B = PNG.sync.read(readFileSync(`shots/_p2-${tag}-b.png`))

  let drift = 0
  for (let y = 0; y < A.height; y += 4) for (let x = 0; x < A.width; x += 4) if (diff(A, A2, x, y) > 30) drift++

  console.log(`\n########## ${tag}  (${url})  ${A.width}x${A.height} ##########`)
  console.log(`  control drift : ${drift * 16} px  (noise floor; signal must stand clear of this)`)

  for (const b of boxes) {
    if (!b || b.missing) { console.log(`\n  ${b?.q}  -- NOT FOUND`); continue }
    let changed = 0, blue = 0, ink = 0, light = 0, rs = 0, gs = 0, bs = 0
    for (let y = b.y; y < b.y + b.h && y < A.height; y++) {
      for (let x = b.x; x < b.x + b.w && x < A.width; x++) {
        if (diff(A, B, x, y) > 30) {
          changed++
          const [r, g, bl] = at(A, x, y)
          rs += r; gs += g; bs += bl
          if (isBlue(r, g, bl)) blue++
          if (isInk(r, g, bl)) ink++
          if (isLight(r, g, bl)) light++
        }
      }
    }
    const mean = changed ? `rgb(${Math.round(rs / changed)}, ${Math.round(gs / changed)}, ${Math.round(bs / changed)})` : '—'
    console.log(`\n  ${b.q}  "${b.text}"`)
    console.log(`     computed : grad=${b.grad} fill=${b.fill} anim=${b.anim}`)
    console.log(`     measured : ${changed} px, mean ink ${mean}, blue ${(blue / Math.max(1, changed) * 100).toFixed(0)}%, ink ${(ink / Math.max(1, changed) * 100).toFixed(0)}%`)
    console.log(`     >> ${changed <= 400
      ? 'NOT PAINTED'
      : blue / changed > 0.35
        ? 'VISIBLE, inked GEOFOLD Blue (the highlight word)'
        : ink / changed > 0.35
          ? 'VISIBLE as flat ink (the normal palette)'
          : light / changed > 0.35
            ? 'VISIBLE as white ink on the dark plate'
            : 'VISIBLE, but check the mean ink above'}`)

    /* Write a zoomed crop of each heading's box so the same region can be read by eye. Cropped in
       Node rather than with Puppeteer's `clip`, which is document-relative while
       getBoundingClientRect is viewport-relative — the mismatch is a trap this project has hit. */
    const pad = 6, scale = 2
    const cw = Math.min(b.w + pad * 2, A.width - Math.max(0, b.x - pad))
    const ch = Math.min(b.h + pad * 2, A.height - Math.max(0, b.y - pad))
    if (cw > 0 && ch > 0) {
      const out = new PNG({ width: cw * scale, height: ch * scale })
      for (let py = 0; py < ch * scale; py++) {
        for (let px = 0; px < cw * scale; px++) {
          const sx = Math.max(0, b.x - pad) + Math.floor(px / scale)
          const sy = Math.max(0, b.y - pad) + Math.floor(py / scale)
          const si = (sy * A.width + sx) << 2, di = (py * cw * scale + px) << 2
          out.data[di] = A.data[si]; out.data[di + 1] = A.data[si + 1]
          out.data[di + 2] = A.data[si + 2]; out.data[di + 3] = 255
        }
      }
      const safe = b.q.replace(/[^a-z0-9]/gi, '_')
      writeFileSync(`shots/_crop-${tag}-${safe}.png`, PNG.sync.write(out))
      console.log(`     crop : shots/_crop-${tag}-${safe}.png`)
    }
  }
}

await run(BASE + '/', 'landing', ['h1.pg-d1', 'h2.pg-d2'])
await run(BASE + '/pricing', 'pricing', ['h1.mk-h-title', '.mk-h-title em', '.mk-sec-head h2', '.mk-close h2'])

await browser.close()
