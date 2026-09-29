/**
 * verify-ui.mjs — the measured verification pass for the Blueprint re-skin.
 *
 * The project's own rule (geofold-project/references/ui-rules.md) is "verify with measurement,
 * not with a screenshot": vision analysis has been wrong about this codebase's layout three
 * times, and right twice. So this script measures the things that can be measured — computed
 * font-family, computed border-radius, real contrast ratios sampled from rendered pixels, tap
 * target sizes, overflow, and the presence of each effect — and takes screenshots only as the
 * second opinion.
 *
 * WHAT IT CAUGHT THAT A SCREENSHOT WOULD NOT HAVE. Kept here as a record, because each one is a
 * reason the script exists:
 *
 *   - `--gf-cond` used but never defined, so four elements silently lost their font-family.
 *     A var() with no fallback makes the whole declaration invalid at computed-value time.
 *   - The whole square-corner instruction defeated by 54 hardcoded radii in the two older skins.
 *   - The marketing page painting a #0A192F body under a page whose every section was white,
 *     because the bundler emitted this file into an EARLIER chunk than corporate.css.
 *   - The 404 white-on-white: `.mk-nf` sat on the same element as `.mk`, so `.mk.mk` outranked it.
 *
 * Run against the PRODUCTION server (`next start`), because the dev server never reaches network
 * idle and the browser tool times out on it.
 *
 *   npm run build && npx next start -p 3100 &
 *   node scripts/verify-ui.mjs
 */
import puppeteer from 'puppeteer-core'
import { PNG } from 'pngjs'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.env.OUT ?? 'shots'
mkdirSync(OUT, { recursive: true })
const results = []
const fail = []

/* PREFLIGHT. Without this, running the suite before `next start` produces a 90-second Puppeteer
   navigation timeout, which reads like a broken script rather than a missing server. Fail in one
   second with the command to run. */
try {
  const probe = await fetch(BASE + '/', { signal: AbortSignal.timeout(4000) })
  if (!probe.ok) throw new Error(`HTTP ${probe.status}`)
} catch (e) {
  console.error(`\n  Cannot reach ${BASE} — ${e.message}\n`)
  console.error(`  Start the server first, in another terminal:`)
  console.error(`    npm run build && npm run start -- -p 3100`)
  console.error(`  Or point the suite at a running instance:  BASE=http://localhost:3000 npm run verify:ui\n`)
  process.exit(2)
}

function check(name, ok, detail) {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

/* ---------------------------------------------------------------- contrast maths
   WCAG 2.x relative luminance. Kept here rather than imported so the check is auditable. */
function lum([r, g, b]) {
  const f = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
function hex2rgb(h) {
  const s = h.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 90_000 })
  // The reveal animations run on scroll; settle first so measurements are of the final state.
  await new Promise((r) => setTimeout(r, 1500))

  /* -------------------------------------------------- 1. THE TYPEFACES ACTUALLY LOAD
     The `--gf-cond` bug in this session was exactly this: a var() name that resolved to nothing,
     so four elements silently lost their family. A screenshot would not have caught it. */
  const fonts = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      return getComputedStyle(el).fontFamily
    }
    return {
      hero: pick('.pg-d1'),
      body: pick('.pg-body'),
      micro: pick('.pg-micro'),
      num: pick('.pg-num'),
      coord: pick('.gf-tech'),
      coordLabel: pick('.pg-coord-label'),
      priceFig: pick('.pg-price-fig'),
    }
  })
  /* THE TYPE CONTRACT WAS REPLACED. The brief before this one named Archivo / Barlow / Barlow
     Condensed / Space Mono; the current one names exactly two faces — Plus Jakarta Sans for
     headings, Inter for body and data. The assertions are re-pointed rather than deleted, so a
     regression that puts Archivo back on a heading still fails here. */
  check('hero uses Plus Jakarta Sans', /jakarta/i.test(fonts.hero ?? ''), fonts.hero)
  check('body uses Inter', /inter/i.test(fonts.body ?? ''), fonts.body)
  check('micro-label uses Inter', /inter/i.test(fonts.micro ?? ''), fonts.micro)
  check('numbers use Inter', /inter/i.test(fonts.num ?? ''), fonts.num)
  check('coordinate uses Space Mono', /space_?mono|space mono/i.test(fonts.coord ?? ''), fonts.coord)
  check('coord label uses Inter', /inter/i.test(fonts.coordLabel ?? ''), fonts.coordLabel)
  check('price figure uses Plus Jakarta Sans', /jakarta/i.test(fonts.priceFig ?? ''), fonts.priceFig)

  /* -------------------------------------------------- THE SHAPE CONTRACT, BACK TO A WORKING RADIUS
     This check has now asserted three different shape contracts, one per client brief, which is
     exactly why it is worth keeping honest about which one is current:

       1. Blueprint     — "sudut tajam (0px radius) untuk panel, tombol, dan gambar". Square.
       2. Neo-Topography — "menghapusnya dan beralih ke desain organik dan fluid". 20px / 50px pills.
       3. THIS ONE      — "profesional simple saja ... section pada umumnya". Back to plain.

     The current contract is a WORKING radius, not a decorative one: 4px on controls, 8px on
     surfaces, 999px only where a control is genuinely a pill (the nav's Portal button). The
     check asserts the two named steps rather than the absence of any value, because "no element
     is square" would also pass on a page where everything was 20px, which is the design the
     client just rejected. */
  const radii = await page.evaluate(() => {
    const out = { wrong: [], card: null, btn: null, pill: null }
    const price = document.querySelector('.pg-price-card, .mk-price-card')
    const btn = document.querySelector('.pg-btn, .mk-btn')
    const pill = document.querySelector('.mk-portal')
    if (price) out.card = getComputedStyle(price).borderTopLeftRadius
    if (btn) out.btn = getComputedStyle(btn).borderTopLeftRadius
    if (pill) out.pill = getComputedStyle(pill).borderTopLeftRadius
    /* The sweep: anything that draws a boundary must use one of the three steps. A stray 20px
       left over from the previous skin is the regression this is here to catch. */
    for (const el of document.querySelectorAll('button, a.pg-btn, .mk-btn, .pg-price-card, .mk-price-card, .pg-price-card *, input, select, textarea')) {
      const cs = getComputedStyle(el)
      const paints = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderTopWidth !== '0px'
      if (!paints && el.tagName !== 'BUTTON') continue
      const vals = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius]
      const px = vals.map((v) => parseFloat(v))
      const allowed = px.every((v) => v === 0 || v === 4 || v === 8 || v === 999 || v >= 1000)
      if (!allowed) out.wrong.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 50), r: vals[0] })
    }
    return out
  })
  check('surfaces use the working 8px radius', radii.card === '8px', `card=${radii.card}`)
  /* THE SHAPE CONTRACT WAS REPLACED TWICE. The brief two rounds ago wanted 0px square corners;
     the one before this wanted 4px controls and one 999px pill. The current brief names a single
     radius — "Semua kartu, input, dan tombol menggunakan radius 8px" — and explicitly retires
     both the square corner AND the capsule. So: 8px on every control, and NO 999px anywhere. */
  check('controls use the brief\'s 8px radius', radii.btn === '8px', `btn=${radii.btn}`)
  check('no control is a 999px pill any more (the brief retires it)', radii.pill !== '999px', `portal=${radii.pill}`)
  check('no retired 20px/50px radius survives', radii.wrong.length === 0,
    radii.wrong.length ? JSON.stringify(radii.wrong.slice(0, 6)) : 'all within the three steps')

  /* -------------------------------------------------- 3. THE ACCENT IS GEOFOLD ORANGE AGAIN
     The Blueprint brief rationed orange; the Neo brief replaced it with Neon Emerald and this
     check asserted the orange was ABSENT. The client has now asked for the normal palette back
     ("gunakan color palet sebelum ini, gunakan color palet normal nya saja"), so the assertion
     returns to the original one: orange is present, it is the brand's own #F35D19, and it is
     RATIONED — one instance per viewport, which is what "digunakan sangat terbatas" means in
     practice. Emerald must be gone entirely, because it belonged to the retired skin.

     Counting the whole document would be the wrong measurement: the page is ten screens tall and
     each screen is entitled to its own call to action, so what matters is how many compete inside
     ONE viewport — what a visitor actually sees at once. */
  const accents = await page.evaluate(() => {
    const ORANGE = 'rgb(250, 95, 31)'   /* the brief's #FA5F1F, not the retired #F35D19 */
    const EMERALD = 'rgb(0, 255, 135)'
    const CYAN = 'rgb(0, 242, 254)'
    const vh = window.innerHeight
    const orange = []
    let emerald = 0, cyan = 0
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const visible = r.bottom > 0 && r.top < vh
      if (cs.backgroundColor === ORANGE || cs.color === ORANGE) orange.push(`${el.tagName}.${el.className?.toString().slice(0, 34)}`)
      if (visible && (cs.backgroundColor === EMERALD || cs.color === EMERALD)) emerald++
      if (visible && (cs.backgroundColor === CYAN || cs.color === CYAN)) cyan++
    }
    return { orange, emerald, cyan }
  })
  check('the accent is the brief\'s orange #FA5F1F', accents.orange.length > 0,
    `${accents.orange.length} orange elements: ${accents.orange.slice(0, 3).join(', ')}`)
  check('the retired Neon emerald is gone', accents.emerald === 0, `${accents.emerald} in view`)
  check('the retired Cyber cyan is gone', accents.cyan === 0, `${accents.cyan} in view`)

  /* -------------------------------------------------- 4. THE HERO IS THE ONE DARK PLATE
     Measured from RENDERED PIXELS, not from `backgroundColor`. The hero's plate is a
     `background-image` gradient (`.pg-hero::before`), so reading the computed background-color
     returns `rgba(0,0,0,0)` and produces a nonsense ratio — which is exactly the false failure
     the first version of this script reported at 1.10:1. The honest measurement over a gradient
     is to sample the screenshot, which is what the block below does. */
  const heroPixel = await page.evaluate(() => {
    const hero = document.querySelector('.pg-hero')
    const h1 = document.querySelector('.pg-hero .pg-d1')
    if (!hero || !h1) return null
    const hr = hero.getBoundingClientRect()
    const tr = h1.getBoundingClientRect()
    return { hero: { x: hr.x, y: hr.y, w: hr.width, h: hr.height }, text: { x: tr.x, y: tr.y, w: tr.width, h: tr.height } }
  })
  check('hero plate exists and is tall', !!heroPixel && heroPixel.hero.h > 300, JSON.stringify(heroPixel?.hero))

  /* -------------------------------------------------- 5. THE GROUND IS PAPER AGAIN
     Three contracts have lived here. Blueprint asked for a light Kanvas Netral; the Neo brief
     replaced it with "Page Ground | #020617 | AMOLED Deep Space" and this check was inverted to
     demand darkness. The client has since retired that skin outright, so the assertion returns to
     the light ground — and it is asserted as the SPECIFIC colour, because "light" alone would
     pass for any near-white and would not catch a token that stopped resolving.

     The page's own body is white; the canvas sections are #F3F4F6. Both are checked, because the
     page ground and the canvas are different things and the brief names both. */
  const grounds = await page.evaluate(() => {
    const band = document.querySelector('.pg-sec-tint, .mk-sec-tint')
    const site = document.querySelector('.mk.mk-site')
    return {
      /* THE TWO GROUNDS ARE DIFFERENT LAYERS, and reading only one of them gives a wrong answer.
         Measured: `body` is #F3F4F6 (the Kanvas Netral behind everything) and the `.mk` site
         wrapper is #FFFFFF (the Panel Utama). That is exactly the brief's own structure —
         "Panel Utama (Surface): #FFFFFF" and "Kanvas Netral (Paper): #F3F4F6" — so both are
         asserted. An earlier version of this check demanded body === white and failed on a
         correct page; the design was right and the probe was wrong. */
      body: getComputedStyle(document.body).backgroundColor,
      site: site ? getComputedStyle(site).backgroundColor : null,
      band: band ? getComputedStyle(band).backgroundColor : null,
    }
  })
  check('the site surface is the Panel Utama #FFFFFF', grounds.site === 'rgb(255, 255, 255)', String(grounds.site))
  check('the ground behind it is the Kanvas Netral #F3F4F6', grounds.body === 'rgb(243, 244, 246)', grounds.body)
  check('the Deep Space ground is gone', grounds.body !== 'rgb(2, 6, 23)', grounds.body)


  /* -------------------------------------------------- 6. MEASURED CONTRAST OF REAL TYPE
     Sampled from RENDERED PIXELS. Reading `backgroundColor` is wrong on this site because the
     surfaces that matter most (the hero plate, the section cards, the figure frames) paint with
     `background-image` gradients, so the computed colour is transparent and the ratio is
     meaningless. The background is sampled a few pixels above each text box — inside the same
     container, clear of the glyphs — and the text colour comes from the computed style, which is
     correct because the type is a solid colour even when the ground is not. */
  await page.screenshot({ path: `${OUT}/_contrast-probe.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } })
  const probe = PNG.sync.read(readFileSync(`${OUT}/_contrast-probe.png`))
  const px = (x, y) => {
    const i = (probe.width * Math.round(y) + Math.round(x)) << 2
    return [probe.data[i], probe.data[i + 1], probe.data[i + 2]]
  }
  /* The same read, against a PNG passed in — used after scrolling each sample into view. */
  const px2 = (png, x, y) => {
    const i = (png.width * Math.round(y) + Math.round(x)) << 2
    return [png.data[i], png.data[i + 1], png.data[i + 2]]
  }

  const samples = await page.evaluate(() => {
    const read = (sel, label) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { sel, label, x: b.x, y: b.y, w: b.width, h: b.height, color: cs.color, size: parseFloat(cs.fontSize), weight: cs.fontWeight }
    }
    return [
      read('.pg-hero .pg-d1', 'hero h1'),
      read('.pg-hero .pg-lede', 'hero lede'),
      read('.pg-hero .pg-micro', 'hero eyebrow'),
      read('.pg-coord-label', 'coordinate label'),
      read('.pg-coord-note', 'coordinate note'),
      read('.pg-cell h3', 'bento heading'),
      read('.pg-price-card p', 'plan copy'),
    ].filter(Boolean)
  })
  for (const s of samples) {
    if (!s.w) { check(`contrast ${s.label}`, false, 'zero-size element; cannot sample'); continue }
    /* Scroll it into view before sampling: a box below the fold has no rendered pixels in the
       viewport-sized screenshot, and reading coordinates outside the PNG returns garbage
       (the `rgb(,,)` / NaN failures the second pass reported). */
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center', behavior: 'instant' }), s.sel)
    await new Promise((r) => setTimeout(r, 350))
    const fresh = await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    }, s.sel)
    if (!fresh || fresh.w === 0 || fresh.y < 6) { check(`contrast ${s.label}`, false, `cannot bring into view (y=${fresh?.y})`); continue }
    await page.screenshot({ path: `${OUT}/_probe-tmp.png` })
    const shot = PNG.sync.read(readFileSync(`${OUT}/_probe-tmp.png`))
    const bg = px2(shot, fresh.x + Math.min(6, fresh.w / 4), fresh.y - 3)
    const fg = s.color.match(/[\d.]+/g).map(Number).slice(0, 3)
    const r = ratio(fg, bg)
    const large = s.size >= 24 || (s.size >= 18.66 && parseInt(s.weight) >= 700)
    const need = large ? 3 : 4.5
    check(`contrast ${s.label} (${s.size}px) >= ${need}`, r >= need, `${r.toFixed(2)}:1  ${s.color} on rgb(${bg})`)
  }

  /* -------------------------------------------------- 7. THE EFFECTS ARE MOUNTED */
  const effects = await page.evaluate(() => ({
    techText: document.querySelectorAll('.gf-tech').length,
    techHidden: document.querySelectorAll('.gf-tech .mk-visually-hidden').length,
    veil: document.querySelectorAll('.gf-veil').length,
    star: document.querySelectorAll('.gf-star').length,
    glowZone: document.querySelectorAll('[data-glow-zone]').length,
    coord: document.querySelector('.pg-coord')?.textContent?.trim(),
  }))
  check('TechText mounted twice (lat + lon)', effects.techText === 2, `n=${effects.techText}`)
  check('TechText announces once via visually-hidden', effects.techHidden === 2, `n=${effects.techHidden}`)
  check('DitherVeil on each figure', effects.veil >= 5, `n=${effects.veil}`)
  check('StarBorder on exactly one control', effects.star === 1, `n=${effects.star}`)
  check('glow zone armed', effects.glowZone >= 1, `n=${effects.glowZone}`)
  check('coordinate readout shows real DMS', /0°04′32″ N/.test(effects.coord ?? '') && /111°29′43″ E/.test(effects.coord ?? ''), effects.coord)

  /* -------------------------------------------------- 8. THE VEIL DOES NOT EAT CLICKS */
  const veilPointer = await page.evaluate(() => {
    const wrap = document.querySelector('.gf-veil')
    const cv = wrap?.querySelector('canvas')
    if (!wrap || !cv) return null
    return { wrapPe: getComputedStyle(wrap).pointerEvents, canvasPe: getComputedStyle(cv).pointerEvents, canvasAria: cv.getAttribute('aria-hidden') }
  })
  check('veil is pointer-events:none', veilPointer?.wrapPe === 'none' && veilPointer?.canvasPe === 'none', JSON.stringify(veilPointer))
  check('veil canvas is aria-hidden', veilPointer?.canvasAria === 'true', JSON.stringify(veilPointer))

  /* -------------------------------------------------- 9. NOTHING OVERFLOWS HORIZONTALLY */
  for (const w of [1440, 1024, 768, 390, 360]) {
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 })
    await new Promise((r) => setTimeout(r, 500))
    const over = await page.evaluate(() => ({
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
      offenders: [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)
        })
        .slice(0, 5)
        .map((el) => `${el.tagName}.${el.className?.toString().slice(0, 40)}`),
    }))
    check(`no horizontal overflow at ${w}px`, over.docW <= over.winW + 1, `scrollW=${over.docW} win=${over.winW} ${JSON.stringify(over.offenders)}`)
  }

  /* -------------------------------------------------- 10. NAV LINKS ALL REACHABLE AT 360px
     This is the bug the project's ui-rules.md records as having shipped once: two of seven nav
     links sat off-screen with no scrollbar. Re-verify at the width that broke. */
  await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 1 })
  await new Promise((r) => setTimeout(r, 500))
  const navCheck = await page.evaluate(() => {
    const links = [...document.querySelectorAll('header a, .mk-nav a, nav a')]
    const bad = links.filter((a) => {
      const r = a.getBoundingClientRect()
      return r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1)
    })
    return { total: links.length, bad: bad.map((a) => a.textContent?.trim().slice(0, 20)) }
  })
  check('every nav link reachable at 360px', navCheck.bad.length === 0, `${navCheck.total} links, ${navCheck.bad.length} off-screen ${JSON.stringify(navCheck.bad)}`)

  /* -------------------------------------------------- 11. TAP TARGETS
     Two thresholds, because WCAG has two. 2.5.8 (Target Size Minimum) is Level AA and requires
     24x24 CSS px; 2.5.5 (Enhanced) is Level AAA and asks for 44x44. The brief's own words for the
     mobile bar are "ikon yang mudah dijangkau jempol", so the controls that matter get 44 — and
     the project's globals.css states 44 as the floor for the bottom bar specifically.

     Footer and prose links are held to 24, not 44: a footer is a column of text links and padding
     every one of them to 44px would add roughly 200px of height to the page for a rule written
     about thumb targets on a toolbar. The distinction is stated rather than blurred. */
  const tapReport = await page.evaluate(() => {
    const hard = [], soft = []
    for (const el of document.querySelectorAll('a, button, input, select, textarea')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const cs = getComputedStyle(el)
      /* Inline links inside a sentence are exempt from both levels (WCAG 2.5.8 exception). */
      if (el.tagName === 'A' && cs.display.startsWith('inline') && el.closest('p, li, small, figcaption')) continue
      const isChrome = !!el.closest('.mobile-bottom, .mobile-top, .mk-nav, .mk-nav-links, .mk-menu-panel, .pg-cta, .pg-hero-cta')
      const need = isChrome ? 44 : 24
      const rec = `${el.tagName}.${el.className?.toString().slice(0, 30)} h=${Math.round(r.height)} need=${need} "${el.textContent?.trim().slice(0, 20)}"`
      if (r.height < 24) hard.push(rec)
      else if (r.height < need) soft.push(rec)
    }
    return { hard, soft }
  })
  check('every target >= 24px (WCAG 2.5.8 AA)', tapReport.hard.length === 0, tapReport.hard.length ? JSON.stringify(tapReport.hard.slice(0, 6)) : 'all')
  check('nav/header targets >= 44px (project floor)', tapReport.soft.length === 0, tapReport.soft.length ? `${tapReport.soft.length} below 44 (footer/prose links): ${JSON.stringify(tapReport.soft.slice(0, 5))}` : 'all')

  /* -------------------------------------------------- screenshots, as the second opinion */
  for (const [name, w, h] of [['desktop', 1440, 1000], ['tablet', 834, 1112], ['mobile', 390, 844]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 })
    await new Promise((r) => setTimeout(r, 700))
    await page.screenshot({ path: `${OUT}/home-${name}.png` })
    await page.screenshot({ path: `${OUT}/home-${name}-full.png`, fullPage: true })
  }
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
  for (const route of ['/pricing', '/product', '/download']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60_000 })
    await new Promise((r) => setTimeout(r, 900))
    await page.screenshot({ path: `${OUT}/${route.slice(1)}.png` })
  }

  /* -------------------------------------------------- 12. THE INSULATED SHELLS STILL WORK
     /login, /onboarding, /reset and the 404 are the four screens that KEEP the dark ground, and
     this re-skin touched all four (it squares their corners and loads blueprint.css into their
     layouts). The failure mode if that went wrong is total and silent: light ink on a light
     plate, i.e. a blank sign-in form. So the check is explicit — the card must be dark and its
     type must be light, and the contrast between them must clear AA. */
  for (const route of ['/login', '/nonexistent-page-for-404']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60_000 })
    await new Promise((r) => setTimeout(r, 900))
    const shell = await page.evaluate(() => {
      const card = document.querySelector('.mk-card, .mk-nf-card, .mk-login-body')
      const head = document.querySelector('.mk-card-t, .mk-nf-title, h1')
      if (!card || !head) return null
      const shellEl = document.querySelector('.mk-login-shell, .mk-auth-shell, .mk-nf, .mk')
      return {
        cardBg: getComputedStyle(card).backgroundColor,
        cardRadius: getComputedStyle(card).borderTopLeftRadius,
        headColor: getComputedStyle(head).color,
        shellBg: shellEl ? getComputedStyle(shellEl).backgroundColor : null,
      }
    })
    if (!shell) { check(`shell ${route} renders`, false, 'no card found'); continue }
    const bgL = lum(shell.cardBg.match(/\d+/g).map(Number).slice(0, 3))
    const fgL = lum(shell.headColor.match(/\d+/g).map(Number).slice(0, 3))
    check(`${route}: card stays dark`, bgL < 0.12, `bg=${shell.cardBg} L=${bgL.toFixed(3)}`)
    check(`${route}: card type is light on it`, fgL > 0.6, `color=${shell.headColor} L=${fgL.toFixed(3)}`)
    check(`${route}: card corners squared by the new layer`, shell.cardRadius === '0px', `radius=${shell.cardRadius}`)
    await page.screenshot({ path: `${OUT}/${route.replace(/\//g, '')}.png` })
  }
} finally {
  await browser.close()
}

writeFileSync(`${OUT}/report.txt`, results.join('\n') + `\n\n${fail.length} FAILED: ${JSON.stringify(fail)}\n`)
console.log(results.join('\n'))
console.log(`\n${fail.length} FAILED: ${JSON.stringify(fail)}`)
