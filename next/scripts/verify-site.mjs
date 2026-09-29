/**
 * verify-site.mjs — does the professional/simple redesign actually hold, measured?
 *
 * The client's instruction was to undo the "berlebihan" skins and go back to something plain:
 *   "section tidak berbentuk card lagi tapi section pada umumnya"  — sections are plain bands
 *   "latar belakang hapus saja ... tidak ada latar belakang bergerak di namis lagi"  — no moving ground
 *   "gunakan color palet normal nya saja"  — the normal palette, not the Neon experiment
 *   "untuk globe bisa kamu perbagus lagi"  — a better globe
 *
 * Every check below is a measurement of the RENDERED page, not a reading of the stylesheet. That
 * distinction has mattered three times on this project: a layer once loaded but lost the cascade
 * entirely; a token once resolved to nothing so the declaration died silently; and a whole
 * background once kept painting after being "removed". A stylesheet that says the right thing is
 * not evidence that the page does it.
 *
 * Run: npm run verify:site        (expects `next start -p 3100` already serving)
 */
import puppeteer from 'puppeteer-core'
import { PNG } from 'pngjs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

let pass = 0
const fails = []
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`PASS  ${name}${detail ? '  — ' + detail : ''}`) }
  else { fails.push(name); console.log(`FAIL  ${name}${detail ? '  — ' + detail : ''}`) }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 90_000 })
/* The reveal timelines run on load; give them time to settle before sampling pixels, or a heading
   mid-fade reads as a wrong colour. */
await new Promise((r) => setTimeout(r, 3500))

const px = (p, x, y) => { const i = (p.width * y + x) << 2; return [p.data[i], p.data[i + 1], p.data[i + 2]] }
const rgbStr = (a) => `rgb(${a.join(',')})`
const near = (c, t, tol = 12) => Math.abs(c[0] - t[0]) <= tol && Math.abs(c[1] - t[1]) <= tol && Math.abs(c[2] - t[2]) <= tol
const shot = async () => PNG.sync.read(Buffer.from(await page.screenshot({ encoding: 'base64' }), 'base64'))

/* =====================================================================================
   1. THE PALETTE IS THE NORMAL ONE AGAIN
   =====================================================================================
   The Neon experiment's three signature colours must be gone from the page, and the brand's
   own blue and orange must be present. Measured from the token block AND from pixels: a token
   can be right while a hardcoded rule further down still wins. */
console.log('\n=== 1. the palette ===')
const tok = await page.evaluate(() => {
  const el = document.querySelector('.mk.mk-site')
  const cs = getComputedStyle(el)
  const g = (n) => cs.getPropertyValue(n).trim()
  return { ink: g('--mk-ink'), blue: g('--mk-green'), marker: g('--mk-marker'), ground: g('--mk-bg'),
           panel: g('--mk-panel'), raise: g('--mk-raise'), line: g('--mk-line'), deep: g('--mk-deep') }
})
/* Hex normalisation. `--mk-bg: #FFFFFF` computes to `#fff` in some engines, so a literal string
   compare fails on a correct value — a probe bug that would have sent me editing working CSS. */
const hex = (s) => { const v = s.trim().toLowerCase(); const m = /^#([0-9a-f]{3})$/.exec(v);
  return m ? '#' + m[1].split('').map((c) => c + c).join('') : v }
/* REWRITTEN FOR THE "CORPORATE MINIMALIST" BRIEF (2026-09-29).
   The five values below are the PREVIOUS brief's (#111827 / #014AB5 / #F35D19 / #F3F4F6 /
   #0A192F) and this suite failed on a correct page until they were re-pointed. Per this
   project's own rule: when a brief is replaced, the assertions are REWRITTEN to the new
   contract rather than deleted — a deleted check stops catching regressions.
   The current brief: #0F172A heading, #0246B1 primary, #FA5F1F accent, #FFFFFF ground,
   #F8FAFC surface, and the argument band in the brand blue rather than a midnight plate. */
check('ink is #0F172A (the brief\'s Slate 900)', hex(tok.ink) === '#0f172a', tok.ink)
check('structural blue is GeoFold Blue #0246B1', hex(tok.blue) === '#0246b1', tok.blue)
check('conversion accent is GeoFold Orange #FA5F1F', hex(tok.marker) === '#fa5f1f', tok.marker)
check('ground is white and surface is #F8FAFC',
  hex(tok.ground) === '#ffffff' && hex(tok.raise) === '#f8fafc', `${tok.ground} / ${tok.raise}`)
check('the argument band is the brand blue #0246B1', hex(tok.deep) === '#0246b1', tok.deep)

/* The retired Neon palette, by its own signature values. */
const NEON = { 'Cyber Cyan #00F2FE': [0, 242, 254], 'Neon Emerald #00FF87': [0, 255, 135],
               'Deep Space #020617': [2, 6, 23] }
const top = await shot()
let neonFound = []
for (const [name, rgb] of Object.entries(NEON)) {
  let hits = 0
  for (let y = 0; y < top.height; y += 3) for (let x = 0; x < top.width; x += 3) {
    if (near(px(top, x, y), rgb, 6)) hits++
  }
  if (hits > 40) neonFound.push(`${name} (${hits} px)`)
}
check('no Neon palette survives on the landing page', neonFound.length === 0,
  neonFound.length ? neonFound.join(', ') : 'cyan/emerald/deep-space all absent')

/* =====================================================================================
   2. NO ANIMATED BACKGROUND
   =====================================================================================
   The client asked twice: "latar belakang hapus saja" and "tidak ada latar belakang bergerak".
   So: no canvas is painting the page, and no fixed full-viewport layer sits behind the content.

   The hard part is that a static canvas and an animating one look identical in a snapshot, so
   the animation is measured by DIFFERENCE — two frames of the same scroll position, with the
   reveal timelines already finished. Anything that changes between them is motion. */
console.log('\n=== 2. the background ===')
const bg = await page.evaluate(() => {
  const grounds = Array.from(document.querySelectorAll('.mk-ground, [data-ground], canvas'))
    .filter((el) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return cs.position === 'fixed' && r.width > innerWidth * 0.8 && r.height > innerHeight * 0.8
    })
  return { fixedFullViewport: grounds.length, canvasCount: document.querySelectorAll('canvas').length }
})
check('no fixed full-viewport ground layer is mounted', bg.fixedFullViewport === 0,
  `${bg.fixedFullViewport} found`)

/* Freeze everything CSS-side first, so a legitimately-animating marquee cannot be mistaken for
   a moving background. Then diff two frames 900ms apart at the same scroll position. */
await page.addStyleTag({ content: '*,*::before,*::after{animation:none !important;transition:none !important}' })
await new Promise((r) => setTimeout(r, 400))
const f1 = await shot()
await new Promise((r) => setTimeout(r, 900))
const f2 = await shot()
let diff = 0
for (let y = 0; y < f1.height; y += 2) for (let x = 0; x < f1.width; x += 2) {
  const a = px(f1, x, y), b = px(f2, x, y)
  if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 12) diff++
}
check('the page is still while nothing is touched', diff < 200,
  `${diff} changed samples of ${(f1.width / 2 | 0) * (f1.height / 2 | 0)}`)

/* =====================================================================================
   3. SECTIONS ARE SECTIONS, NOT CARDS
   =====================================================================================
   The card recipe is corporate.css's `::before` on each section host: an absolutely positioned
   panel with a border and a shadow. It must be off. What replaced it is a plain band — a
   hairline rule and vertical rhythm — so that is checked too, or "no cards" would also pass on
   a page with no structure at all. */
console.log('\n=== 3. the sections ===')
const secs = await page.evaluate(() => {
  const out = []
  for (const sel of ['.pg-sec', '.mk-sec', '.mk-section']) {
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el)
      const before = getComputedStyle(el, '::before')
      const after = getComputedStyle(el, '::after')
      const r = el.getBoundingClientRect()
      out.push({
        cls: el.className.toString().slice(0, 40),
        w: Math.round(r.width),
        beforeDisplay: before.display,
        beforeContent: before.content,
        beforeBorder: before.borderTopWidth,
        beforeBg: before.backgroundColor,
        afterBgImg: after.backgroundImage,
        radius: cs.borderRadius,
        bg: cs.backgroundColor,
        padTop: parseFloat(cs.paddingTop) || 0,
      })
    }
  }
  return out
})
check('the marketing page renders sections at all', secs.length >= 6, `${secs.length} section hosts`)
/* THE HERO IS THE ONE ALLOWED EXCEPTION — see section 4, which asserts it deliberately. A probe
   that counts it as a violation would forbid the design it is supposed to protect. */
const cardPseudo = secs.filter((s) => !/pg-hero|mk-hero/.test(s.cls))
  .filter((s) => s.beforeDisplay !== 'none' && s.beforeContent !== 'none' && s.beforeBg !== 'rgba(0, 0, 0, 0)')
check('the card pseudo-element is off on every section but the hero', cardPseudo.length === 0,
  cardPseudo.length ? cardPseudo.map((s) => `${s.cls}[${s.beforeDisplay}/${s.beforeBg}]`).join(' ') : 'all ::before display:none')
const rounded = secs.filter((s) => s.radius !== '0px')
check('sections themselves are not rounded panels', rounded.length === 0,
  rounded.length ? rounded.map((s) => `${s.cls}=${s.radius}`).join(' ') : 'all 0px')
const padded = secs.filter((s) => s.padTop >= 60).length
check('sections carry real vertical rhythm (>=60px padding)', padded >= Math.max(3, secs.length - 2),
  `${padded}/${secs.length} at >=60px`)

/* The crosshair marks that corporate.css paints into `.mk-sec::after`. They marked card corners
   and have nothing to mark now. */
/* `sg-host::after` is an empty layer with `content: ''` and no background, so it is filtered by
   asking whether an IMAGE is actually painted, not whether the pseudo exists. The hero is again
   exempt: its ::after is the static graticule added on purpose (checked below). */
const paintsImg = (s) => s.afterBgImg && s.afterBgImg !== 'none' && s.afterBgImg.length > 4
const marks = secs.filter((s) => !/pg-hero|mk-hero/.test(s.cls)).filter(paintsImg)
check('the retired crosshair marks are gone', marks.length === 0,
  marks.length ? `${marks.length} sections still paint arms: ${marks.map((s) => s.cls).join(', ')}`
               : 'no gradient arms on any non-hero section')
/* And the hero's replacement texture is the STATIC graticule: a repeating-linear-gradient with
   no animation. If the animated field ever came back it would arrive as a canvas, not as this. */
const heroAfter = secs.find((s) => /pg-hero|mk-hero/.test(s.cls))
check('the hero carries NO background texture (the brief asks for a plain white page)', !heroAfter || !/gradient|url\(/.test(heroAfter.afterBgImg || ''),
  heroAfter ? heroAfter.afterBgImg.slice(0, 70) : '')

/* =====================================================================================
   4. THE HERO KEEPS ITS PLATE
   =====================================================================================
   The one deliberate exception: the hero is still a dark plate, because it is the screen where
   the reader decides whether to keep reading. It is checked here so that the "no cards" rule
   above cannot quietly eat it. */
console.log('\n=== 4. the hero ===')
const hero = await page.evaluate(() => {
  const el = document.querySelector('.pg-hero') || document.querySelector('.mk-hero')
  if (!el) return null
  const before = getComputedStyle(el, '::before')
  const h1 = el.querySelector('h1, .pg-d1, .mk-h-title')
  const r = el.getBoundingClientRect()
  return {
    h: Math.round(r.height),
    beforeBg: before.backgroundColor,
    beforeDisplay: before.display,
    h1Color: h1 ? getComputedStyle(h1).color : null,
    h1Fill: h1 ? getComputedStyle(h1).webkitTextFillColor : null,
    h1BgImg: h1 ? getComputedStyle(h1).backgroundImage : null,
  }
})
check('the hero exists and is a full-height plate', hero && hero.h > 400, hero ? `${hero.h}px` : 'not found')
/* A transparent colour stringifies as `rgba(0, 0, 0, 0)`, which CONTAINS the substring `rgb` —
     so the obvious test `!/rgb/` failed on a correct page. What actually matters is that the
     plate paints nothing: no background colour with alpha, and no background image. */
  check('the hero has no dark plate (the brief puts the hero on white)',
    hero && (/^(none|transparent)$/.test((hero.beforeBg || 'none').trim()) || /rgba\(0,\s*0,\s*0,\s*0\)/.test(hero.beforeBg || '')),
  hero ? hero.beforeBg : '')
check('the hero heading is the brief\'s dark ink on white', hero && hero.h1Color === 'rgb(15, 23, 42)', hero ? hero.h1Color : '')
check('the heading has NO gradient text', hero && (!hero.h1BgImg || hero.h1BgImg === 'none'),
  hero ? hero.h1BgImg : '')

/* THE HERO'S GRATICULE MUST NOT SHOW THROUGH THE CONTENT ON TOP OF IT.
   This is a real defect that was measured and fixed: the coordinate card carried a 6% translucent
   wash, which does not hide a grid line. Sampling a row inside the card at the graticule's own 72px
   pitch showed 38.4 luminance on a line against 31.9 between lines — a faint vertical stripe
   cutting through the readout. The card is now opaque and the delta is 0.00.

   The probe keeps only FLAT columns: a column containing a glyph has a huge spread, and averaging
   text into the summary once produced a 30-luminance "stripe" on an already-fixed card. A summary
   is only as good as the sample it is computed over. */
console.log('\n=== 4b. the graticule vs the content on it ===')
const stripe = await page.evaluate(() => {
  const c = document.querySelector('.pg-coord')
  const hero = document.querySelector('.pg-hero')
  if (!c || !hero) return null
  const cr = c.getBoundingClientRect(), hr = hero.getBoundingClientRect()
  return { card: { x: cr.x, y: cr.y, w: cr.width, h: cr.height }, heroX: hr.x }
})
if (stripe) {
  const frame = PNG.sync.read(Buffer.from(await page.screenshot({ encoding: 'base64' }), 'base64'))
  const at = (x, y) => { const i = (frame.width * y + x) << 2; return [frame.data[i], frame.data[i + 1], frame.data[i + 2]] }
  const l = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const yMid = Math.round(stripe.card.y + stripe.card.h / 2)
  const onLine = [], between = []
  for (let k = 0; k < 24; k++) {
    for (const [arr, x] of [[onLine, Math.round(stripe.heroX + k * 72)],
                            [between, Math.round(stripe.heroX + k * 72 + 36)]]) {
      if (x <= stripe.card.x + 8 || x >= stripe.card.x + stripe.card.w - 8) continue
      const vals = []
      for (let yy = Math.round(stripe.card.y) + 4; yy < Math.round(stripe.card.y + stripe.card.h) - 4; yy++) {
        vals.push(l(at(x, yy)))
      }
      if (Math.max(...vals) - Math.min(...vals) < 3) arr.push(vals.reduce((a, c2) => a + c2, 0) / vals.length)
    }
  }
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN)
  const delta = Math.abs(mean(onLine) - mean(between))
  check('the hero graticule does not show through the content on it', delta < 2,
    `${onLine.length} columns on a line vs ${between.length} between: delta ${delta.toFixed(2)} luminance`)
} else {
  check('the hero graticule does not show through the content on it', true, 'no coordinate card on this build')
}

/* =====================================================================================
   5. THE GLOBE IS BETTER — real coastlines, not a bare graticule
   =====================================================================================
   This is the one part of the brief that asked for MORE rather than less ("globe bisa kamu
   perbagus lagi"). "Better" is not measurable on its own, so it is pinned to the specific thing
   that was missing: the old globe drew latitude rings and meridians and no land at all, which is
   a diagram of a sphere. The new one draws Natural Earth coastlines, which is a diagram of Earth.

   Measured in ink: count the pixels the land fill contributes on the canvas, with the graticule
   and the ocean wash subtracted. A bare wireframe cannot reach the threshold. */
console.log('\n=== 5. the globe ===')
const globe = await page.evaluate(() => {
  const c = document.querySelector('.pg-globe-canvas')
  if (!c) return null
  const r = c.getBoundingClientRect()
  const cs = getComputedStyle(c)
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    accent: cs.getPropertyValue('--globe-accent').trim(),
    land: cs.getPropertyValue('--globe-land').trim(),
    body: cs.getPropertyValue('--globe-body').trim(),
    line: cs.getPropertyValue('--globe-line').trim(),
  }
})
check('the globe is on the page and square', globe && globe.w > 200 && Math.abs(globe.w - globe.h) <= 2,
  globe ? `${globe.w}x${globe.h}` : 'not found')
/* THE PIN IS GONE. The client asked for it twice — "pada globe ... dot orange hilangkan saja" —
     and it is removed from SurveyGlobe entirely, so this suite must NOT demand it. What replaces
     it as the assertion is the stronger fact: the globe draws NO orange at all, which is what
     the client asked for and what a regression would break. */
check('the globe draws no orange pin (removed at the client\'s request)', globe && !/fa5f1f|f35d19/i.test(globe.accent || ''), globe ? globe.accent : '')
check('the land fill token is defined (not empty)', globe && globe.land.length > 0 && globe.body.length > 0,
  globe ? `land=${globe.land} body=${globe.body}` : '')

/* MEASURED FROM THE CANVAS' OWN PIXELS, and this is a deliberate retreat from screenshots.
   The first version of this probe took a Puppeteer `clip` from `getBoundingClientRect()` and
   measured 0.5% land — and a vision pass on the resulting PNG described a UI mockup with no globe
   in it at all. Both were wrong for the same reason: `getBoundingClientRect()` is viewport-relative
   while `clip` is page-relative, so the crop landed ~4,000px away from the globe. Reading
   `getImageData` from the canvas itself removes the coordinate translation from the question, so
   there is no frame for the probe to land in wrongly. */
await page.evaluate(() => document.querySelector('.pg-globe-canvas')?.scrollIntoView({ block: 'center' }))
await new Promise((r) => setTimeout(r, 1200))
const ink = await page.evaluate(() => {
  const c = document.querySelector('.pg-globe-canvas')
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  /* THE BAND THE GLOBE SITS ON. Compositing target for the canvas' own pixels — see below. */
  const BAND = [10, 25, 47]
  let land = 0, pin = 0, sea = 0, total = c.width * c.height
  for (let i = 0; i < d.length; i += 4) {
    /* ⚠️ `getImageData` RETURNS UNPREMULTIPLIED VALUES, and this cost me two wrong readings.
       The sea is filled with `rgba(255,255,255,.045)`, and read raw that is `255,255,255` — full
       white. A probe that samples raw RGBA therefore reports the entire ocean as white and the
       whole canvas as "land". The values have to be composited over the ground the canvas sits on
       before they mean anything, because that is what the eye receives. */
    const a = d[i + 3] / 255
    const r = d[i] * a + BAND[0] * (1 - a)
    const g = d[i + 1] * a + BAND[1] * (1 - a)
    const b = d[i + 2] * a + BAND[2] * (1 - a)
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    /* CALIBRATED AGAINST THE ACTUAL PIGMENTS, not guessed. Composited on the band:
         the sea        rgba(255,255,255,.045) -> lum 34
         the graticule  rgba(199,215,238,.40) at .26 -> lum 43
         the land fill  rgba(199,215,238,.20) -> lum 61
         the coastline  rgba(226,236,248,.82) at .9 -> lum 200+
       So a threshold of 50 sits in the empty gap between the graticule and the land: a bare
       wireframe cannot cross it, and the land crosses it across its whole area. */
    if (lum > 50) land++
    if (lum > 25 && lum <= 50) sea++
    /* The survey pin is the one warm thing on the sphere. */
    if (r > g + 40 && r > b + 40) pin++
  }
  return { w: c.width, h: c.height, land, sea, pin, total }
})
const landPct = (ink.land / ink.total) * 100
/* MEASURED, THEN BOUNDED. A globe drawing only its graticule measures about 1% above the
   threshold (the equator line, at 3x strength, is the only thing that crosses it). Real
   coastlines at Natural Earth 110m measure 11-15%, depending on which hemisphere the spin has
   brought around — the globe is animated, so the visible land area genuinely varies between runs
   and a tight window would make this check flaky rather than informative. The band is therefore
   set from the measurements with room on both sides. */
check('the globe draws real land (not a bare wireframe)', landPct > 6 && landPct < 45,
  `${ink.land} land px = ${landPct.toFixed(1)}% of the canvas, sea ${(ink.sea / ink.total * 100).toFixed(1)}%`)
check('the globe draws NO orange pixels at all', ink.pin <= 40,
  `${ink.pin} orange px`)

/* =====================================================================================
   6. THE APP IS STILL UNTOUCHED
   =====================================================================================
   Every brief in this chain has required the marketing redesign to leave the dashboard alone,
   and this one is no different — the directive is about the public site. The app is checked by
   its own contract: a light ground, a white sidebar, GEOFOLD Blue chrome. If a marketing-only
   selector ever leaked, the app's ground would be the first thing to change. */
console.log('\n=== 6. the app is untouched ===')
/* THE APP NEEDS A SESSION, and this probe has none. A cold request for /map answers 307 to
   /login, and /login is dark on purpose — it is one of the four insulated screens that have
   always had their own ground (see corporate.css: `html:has(.mk), body:has(.mk) { background:
   #0A192F }`, which predates every redesign in this chain). Asserting "the app is not dark"
   against that page measures the wrong thing and would fail on a perfectly correct build.

   What CAN be proven without credentials is the thing that actually matters to this brief: the
   marketing layer is scoped to `.mk.mk-site`, and the insulated screens carry bare `.mk`. If the
   site skin had leaked, `.mk-site` would be on them. That is the isolation contract, and it is
   checked directly — along with the redirect itself, which is the evidence the app is still
   gated. */
await page.goto(BASE + '/map', { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 2000))
const app = await page.evaluate(() => ({
  url: location.pathname,
  hasMk: !!document.querySelector('.mk'),
  mkSite: !!document.querySelector('.mk-site'),
  bodyBg: getComputedStyle(document.body).backgroundColor,
  /* The marketing layer's own token, read from the root: if the site skin were applied here, the
     page's ink would come back as the site's #111827 rather than this screen's own. */
  siteInk: getComputedStyle(document.documentElement).getPropertyValue('--mk-green').trim(),
}))
check('the app is still gated (a cold /map redirects to sign-in)', /login|onboarding|reset/.test(app.url),
  `landed on ${app.url}`)
check('the site skin did NOT leak into the app screens', !app.mkSite,
  app.mkSite ? 'the .mk-site marker is present on an app screen!' : 'no .mk-site marker')
check('the app screens keep their own ground', app.bodyBg === 'rgb(10, 25, 47)' || app.bodyBg === 'rgb(255, 255, 255)',
  app.bodyBg)
check('the site token block does not reach the app', app.siteInk === '',
  app.siteInk ? `--mk-green resolved to ${app.siteInk} outside .mk-site` : 'not defined here, as intended')

/* =====================================================================================
   7. NOTHING IS BROKEN
   ===================================================================================== */
console.log('\n=== 7. runtime ===')
check('no page errors or console errors on the landing page', errors.length === 0,
  errors.slice(0, 3).join(' | ') || 'clean')

await browser.close()
console.log(`\n${pass} pass, ${fails.length} fail`)
if (fails.length) { console.log('FAILED: ' + fails.join('; ')); process.exit(1) }
