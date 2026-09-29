#!/usr/bin/env node
/**
 * verify-hero-3d.mjs — MEASURES the hero's WebGL terrain in headless Chrome.
 *
 * What this proves, with numbers rather than assertions:
 *
 *   1. IT RENDERS. The canvas element paints real content, and it is the WEBGL canvas doing it —
 *      not the static PNG fallback showing through. The fallback <img> is hidden and the canvas
 *      is re-measured; if the content survives, the pixels came from WebGL.
 *   2. IT ROTATES WHEN DRAGGED. A synthetic pointer drag across the canvas changes the pixels by a
 *      measured amount, and it keeps changing after release (the coast). This is the rotation that
 *      matters: the block is turned by the reader.
 *   3. IT IS STILL WHEN LEFT ALONE. Two frames of an untouched hero, 1.5 s apart, are
 *      BYTE-IDENTICAL. This is the site's own rule (the client asked twice for no moving
 *      background) and an earlier auto-spinning version of this component broke it.
 *   4. IT HOLDS A STATIC FRAME UNDER REDUCED MOTION. With `prefers-reduced-motion: reduce`, the
 *      same two-frame test is byte-identical AND the drag does nothing — the block cannot move.
 *
 * HOW THE MEASUREMENT IS TAKEN, AND WHY IT MATTERS — two false negatives were found the hard way:
 *
 *   (a) `page.screenshot({ clip })` FREEZES requestAnimationFrame in this headless session. The
 *       component's own frame counter stuck at 51,51,51,51,51 under a clipped screenshot every 2 s,
 *       and read 59,113,169,225,275 under a full-viewport one. So the canvas is captured by taking
 *       a FULL-VIEWPORT screenshot and cropping to the canvas rect here in Node. Never clip the
 *       screenshot of a canvas whose animation you are about to measure.
 *   (b) `canvas.toDataURL()` reads the WebGL drawing buffer, which with the default
 *       `preserveDrawingBuffer: false` is cleared after compositing — it returns a blank canvas for
 *       one that is visibly rendering. Never read the drawing buffer.
 *
 * It also asserts there are NO page errors and NO console warnings, because ogl reports a shader
 * LINK failure with `console.warn` — so a silent link failure would otherwise pass as "it
 * loaded". A failed link leaves ogl's `uniformLocations` undefined and throws on the next frame,
 * which the pageerror check catches too.
 *
 * RUN: npm run build && npm run start -- -p 3100      (or point BASE at a running server)
 *      node scripts/verify-hero-3d.mjs
 */
import puppeteer from 'puppeteer-core'
import { PNG } from 'pngjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.env.OUT ?? 'shots'
mkdirSync(OUT, { recursive: true })

const results = []
const fail = []
const check = (name, ok, detail) => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

/* ---- preflight: fail in one second with the command to run, not a 60 s navigation timeout ---- */
try {
  const probe = await fetch(BASE + '/', { signal: AbortSignal.timeout(4000) })
  if (!probe.ok) throw new Error(`HTTP ${probe.status}`)
} catch (e) {
  console.error(`\n  Cannot reach ${BASE} — ${e.message}`)
  console.error(`  Start the server first:  npm run build && npm run start -- -p 3100`)
  console.error(`  Or point at a running one:  BASE=http://localhost:3000 node scripts/verify-hero-3d.mjs\n`)
  process.exit(2)
}

/* ---------------------------------------------------------------- image maths */
function decode(buf) {
  // puppeteer's screenshot() returns a Uint8Array; pngjs needs a Buffer.
  return PNG.sync.read(Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
}

/** Fraction of pixels that differ by more than `tol` in any channel, plus the mean abs diff. */
function diff(a, b, tol = 12) {
  const A = decode(a)
  const B = decode(b)
  if (A.width !== B.width || A.height !== B.height) {
    return { mismatch: true, changedPct: 100, meanDiff: 255 }
  }
  let changed = 0
  let sum = 0
  const total = A.width * A.height
  for (let i = 0; i < A.data.length; i += 4) {
    const d0 = Math.abs(A.data[i] - B.data[i])
    const d1 = Math.abs(A.data[i + 1] - B.data[i + 1])
    const d2 = Math.abs(A.data[i + 2] - B.data[i + 2])
    if (d0 > tol || d1 > tol || d2 > tol) changed++
    sum += d0 + d1 + d2
  }
  return { mismatch: false, changedPct: +((100 * changed) / total).toFixed(2), meanDiff: +(sum / (total * 3)).toFixed(2) }
}

/** Fraction of pixels that are not the page background (white). */
function contentPct(buf, bg = [255, 255, 255], tol = 24) {
  const P = decode(buf)
  let content = 0
  const total = P.width * P.height
  for (let i = 0; i < P.data.length; i += 4) {
    const d = Math.abs(P.data[i] - bg[0]) + Math.abs(P.data[i + 1] - bg[1]) + Math.abs(P.data[i + 2] - bg[2])
    if (d > tol) content++
  }
  return +((100 * content) / total).toFixed(2)
}

/** Mean luminance of the non-background pixels, and how wide the luminance range is. */
function luminance(buf) {
  const P = decode(buf)
  let sum = 0
  let n = 0
  let min = 255
  let max = 0
  for (let i = 0; i < P.data.length; i += 4) {
    const l = 0.2126 * P.data[i] + 0.7152 * P.data[i + 1] + 0.0722 * P.data[i + 2]
    if (l < min) min = l
    if (l > max) max = l
    sum += l
    n++
  }
  return { mean: +(sum / n).toFixed(1), min: +min.toFixed(1), max: +max.toFixed(1), range: +(max - min).toFixed(1) }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* THE CAPTURE METHOD, AND IT IS LOAD-BEARING — two false negatives were found here.
 *
 * (1) `page.screenshot({ clip })` FREEZES requestAnimationFrame IN THIS HEADLESS SESSION. Measured:
 *     with a clipped screenshot every 2 s the component's own frame counter stuck at 51,51,51,51,51
 *     (and 56,103,138,138,138), i.e. the animation stopped after the first capture — so a rotation
 *     test built on it reports a false "it does not rotate". A FULL-VIEWPORT `page.screenshot()`
 *     does not: the same run read 59,113,169,225,275. So the canvas is captured by taking a full
 *     viewport screenshot and cropping to the canvas rect here in Node.
 *
 * (2) `canvas.toDataURL()` reads the WebGL drawing buffer, which with the default
 *     `preserveDrawingBuffer: false` is cleared after compositing — it returns a blank canvas for a
 *     canvas that is visibly rendering. Do not use it.
 *
 * The rule that falls out: never clip the screenshot of a canvas whose animation you are about to
 * measure, and never read the drawing buffer. */
const shoot = async (page, rect) => {
  const full = await page.screenshot()
  return crop(full, rect)
}

/** Crop a PNG buffer to an integer rect, in the buffer's own pixels. */
function crop(buf, rect) {
  const P = decode(buf)
  const x = Math.max(0, Math.min(P.width - 1, Math.round(rect.x)))
  const y = Math.max(0, Math.min(P.height - 1, Math.round(rect.y)))
  const w = Math.max(1, Math.min(P.width - x, Math.round(rect.width)))
  const h = Math.max(1, Math.min(P.height - y, Math.round(rect.height)))
  const out = new PNG({ width: w, height: h })
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const s = ((y + j) * P.width + (x + i)) << 2
      const d = (j * w + i) << 2
      out.data[d] = P.data[s]
      out.data[d + 1] = P.data[s + 1]
      out.data[d + 2] = P.data[s + 2]
      out.data[d + 3] = P.data[s + 3]
    }
  }
  return PNG.sync.write(out)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--force-color-profile=srgb',
  ],
})

const report = { BASE, chrome: CHROME }

async function newPage({ reduce = false } = {}) {
  const page = await browser.newPage()
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }])
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 300)}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))
  return { page, errors }
}

/** Wait for the canvas, scroll the hero into view (so its IntersectionObserver runs), settle. */
async function openHero(page) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60_000 })
  await page.waitForSelector('[data-hero-terrain-3d] canvas', { timeout: 30_000 })
  await page.evaluate(() => {
    document.querySelector('[data-hero-terrain-3d]')?.scrollIntoView({ block: 'center' })
  })
  await sleep(2000)
}

try {
  /* ============================================================ 1. IT RENDERS
     Motion allowed, so we are measuring the animated path. */
  {
    const { page, errors } = await newPage({ reduce: false })
    await openHero(page)

    const meta = await page.evaluate(() => {
      const host = document.querySelector('[data-hero-terrain-3d]')
      const canvas = host?.querySelector('canvas')
      if (!canvas) return null
      const r = canvas.getBoundingClientRect()
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
      return {
        hostFound: !!host,
        cssW: Math.round(r.width),
        cssH: Math.round(r.height),
        bufW: canvas.width,
        bufH: canvas.height,
        dpr: window.devicePixelRatio,
        contextLost: gl ? gl.isContextLost() : null,
        glVersion: gl ? gl.getParameter(gl.VERSION) : null,
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER),
        pointerEvents: getComputedStyle(canvas).pointerEvents,
        ariaHidden: host?.getAttribute('aria-hidden'),
        fallbackImg: !!document.querySelector('.pg-hero-map'),
      }
    })
    report.canvas = meta

    check('canvas is present in the hero', !!meta, meta ? `${meta.cssW}x${meta.cssH} CSS px` : 'no canvas')
    check('canvas has a non-zero drawing buffer', !!meta && meta.bufW > 0 && meta.bufH > 0, meta ? `${meta.bufW}x${meta.bufH} px` : '—')
    check('WebGL context is alive', !!meta && meta.contextLost === false, meta?.glVersion ?? '—')
    check('the PNG fallback is still in the DOM (accessible layer)', !!meta?.fallbackImg)
    check('no page errors or console errors/warnings', errors.length === 0, errors.length ? JSON.stringify(errors.slice(0, 4)) : 'none')

    // The canvas rect, in viewport CSS pixels — what `crop` slices the full screenshot to.
    const rect = await page.evaluate(() => {
      const c = document.querySelector('[data-hero-terrain-3d] canvas').getBoundingClientRect()
      return { x: Math.round(c.x), y: Math.round(c.y), width: Math.round(c.width), height: Math.round(c.height) }
    })
    report.canvasRect = rect

    // (a) content WITH the fallback visible
    const withFallback = await shoot(page, rect)
    writeFileSync(`${OUT}/hero3d-with-fallback.png`, withFallback)
    // (b) content with the fallback HIDDEN — if content survives, WebGL drew it
    await page.evaluate(() => {
      const img = document.querySelector('.pg-hero-map')
      if (img) img.style.visibility = 'hidden'
    })
    await sleep(400)
    const noFallback = await shoot(page, rect)
    writeFileSync(`${OUT}/hero3d-no-fallback.png`, noFallback)
    await page.evaluate(() => {
      const img = document.querySelector('.pg-hero-map')
      if (img) img.style.visibility = ''
    })

    const cNoFallback = contentPct(noFallback)
    const lum = luminance(noFallback)
    report.render = { contentWithFallbackPct: contentPct(withFallback), contentNoFallbackPct: cNoFallback, luminance: lum }

    check(
      'the WEBGL canvas paints content (fallback hidden)',
      cNoFallback > 5,
      `${cNoFallback}% of the canvas is non-background with the PNG hidden`,
    )
    check(
      'the render has real tonal range, not a flat fill',
      lum.range > 30,
      `luminance ${lum.min}..${lum.max} (range ${lum.range}), mean ${lum.mean}`,
    )

    /* ============================================================ 2. IT IS STILL WHEN IDLE
       The site's own rule: the page must not move while nothing is touched. Two frames 1.5 s
       apart, no input, must be byte-identical. An earlier auto-spinning version of this component
       broke exactly this, so it is checked before the drag test rather than after. */
    const idleA = await shoot(page, rect)
    await sleep(1500)
    const idleB = await shoot(page, rect)
    writeFileSync(`${OUT}/hero3d-idle-a.png`, idleA)
    writeFileSync(`${OUT}/hero3d-idle-b.png`, idleB)
    const idle = diff(idleA, idleB)
    report.idle = { diff: idle, gapSeconds: 1.5 }

    check(
      'the hero is STILL when left alone (byte-identical after 1.5 s)',
      idle.changedPct === 0 && idle.meanDiff === 0,
      `${idle.changedPct}% pixels changed, mean diff ${idle.meanDiff}`,
    )

    /* ============================================================ 3. IT ROTATES WHEN DRAGGED
       A synthetic horizontal drag across the middle of the canvas. The block is grabbed, turned,
       and released; we measure the change during the drag and again after release (the coast). */
    const before = await shoot(page, rect)
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    await page.mouse.move(cx - 90, cy)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(cx - 90 + i * 30, cy + i * 4)
      await sleep(30)
    }
    const during = await shoot(page, rect)
    await page.mouse.up()
    await sleep(500) // let the coast run and settle
    const after = await shoot(page, rect)
    writeFileSync(`${OUT}/hero3d-drag-before.png`, before)
    writeFileSync(`${OUT}/hero3d-drag-during.png`, during)
    writeFileSync(`${OUT}/hero3d-drag-after.png`, after)

    const dragDiff = diff(before, during)
    const coastDiff = diff(during, after)
    report.rotation = { dragDiff, coastDiff, dragPx: 180 }
    report.rotationSettled = diff(after, await shoot(page, rect))

    check(
      'the block rotates when dragged',
      dragDiff.changedPct > 3,
      `${dragDiff.changedPct}% of pixels changed by a ${report.rotation.dragPx}px drag (mean diff ${dragDiff.meanDiff})`,
    )
    check(
      'the block keeps turning after release (inertia)',
      coastDiff.changedPct > 0.5,
      `${coastDiff.changedPct}% changed during the 500ms coast`,
    )

    await page.close()
  }

  /* ============================================================ 4. REDUCED MOTION HOLDS STILL */
  {
    const { page, errors } = await newPage({ reduce: true })
    await openHero(page)

    const media = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    check('reduced-motion media query is active in the page', media === true, `matches=${media}`)

    const rect = await page.evaluate(() => {
      const c = document.querySelector('[data-hero-terrain-3d] canvas').getBoundingClientRect()
      return { x: Math.round(c.x), y: Math.round(c.y), width: Math.round(c.width), height: Math.round(c.height) }
    })
    const a = await shoot(page, rect)
    await sleep(1500)
    const b = await shoot(page, rect)
    writeFileSync(`${OUT}/hero3d-reduced-a.png`, a)
    writeFileSync(`${OUT}/hero3d-reduced-b.png`, b)

    const d = diff(a, b)
    const cA = contentPct(a)
    report.reducedMotion = { diff: d, contentPct: cA, gapSeconds: 1.5 }

    check(
      'reduced motion still draws a frame (canvas not empty)',
      cA > 5,
      `${cA}% non-background`,
    )
    check(
      'reduced motion holds a STATIC frame (byte-identical after 1.5 s)',
      d.changedPct === 0 && d.meanDiff === 0,
      `${d.changedPct}% pixels changed, mean diff ${d.meanDiff}`,
    )

    /* A drag under reduced motion must do NOTHING — the component does not even wire the pointer
       listeners, so the block cannot be turned at all. */
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    await page.mouse.move(cx - 90, cy)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(cx - 90 + i * 30, cy + i * 4)
      await sleep(30)
    }
    await page.mouse.up()
    await sleep(600)
    const afterDrag = await shoot(page, rect)
    const dragUnderReduce = diff(a, afterDrag)
    report.reducedMotion.dragDiff = dragUnderReduce
    check(
      'reduced motion ignores the drag (the block cannot be moved)',
      dragUnderReduce.changedPct === 0 && dragUnderReduce.meanDiff === 0,
      `${dragUnderReduce.changedPct}% pixels changed by a drag under reduced motion`,
    )
    check('reduced-motion page has no page errors or console warnings', errors.length === 0, errors.length ? JSON.stringify(errors.slice(0, 4)) : 'none')

    await page.close()
  }
} finally {
  await browser.close()
}

/* ---- report ---- */
console.log('\n  GeoFold hero 3D terrain — measured in headless Chrome\n')
for (const r of results) console.log('  ' + r)
console.log('\n  ---- numbers ----')
console.log('  ' + JSON.stringify(report, null, 2).split('\n').join('\n  '))
console.log(`\n  ${results.length - fail.length} pass, ${fail.length} fail\n`)

writeFileSync(`${OUT}/hero3d-report.json`, JSON.stringify(report, null, 2))
process.exit(fail.length ? 1 : 0)
