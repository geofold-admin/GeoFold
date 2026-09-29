/**
 * verify-neo.mjs — does the Neo-Topography skin actually replace the Blueprint one?
 *
 * The client's instruction was "pastikan design benar benar berubah" — make sure the design
 * REALLY changed. That is a claim about the rendered page, not about the stylesheet existing,
 * so every check below reads the browser's computed values or samples composited pixels.
 *
 * The failure modes this is written to catch, all of which have happened on this project:
 *   * the layer loads but LOSES the cascade (blueprint.css was emitted before corporate.css,
 *     so a whole skin silently never applied)
 *   * a rule applies but the TOKEN it reads is undefined, so the declaration dies silently
 *   * the design changes but the APP changes with it, breaking the brief's isolation rule
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
await new Promise((r) => setTimeout(r, 3500))

const px = (p, x, y) => { const i = (p.width * y + x) << 2; return [p.data[i], p.data[i + 1], p.data[i + 2]] }
const rgbStr = (a) => `rgb(${a.join(',')})`

/* =====================================================================================
   1. THE GROUND — is the page actually Deep Space, measured from pixels?
   ===================================================================================== */
console.log('\n=== 1. the ground ===')
const ground = await page.evaluate(() => {
  const cs = getComputedStyle(document.body)
  return { body: cs.backgroundColor, html: getComputedStyle(document.documentElement).backgroundColor }
})
const shot = await page.screenshot({ encoding: 'base64' })
const png = PNG.sync.read(Buffer.from(shot, 'base64'))

/* Sample the far corners, where no card or text should be, and find the modal colour. */
const corners = []
for (const [x, y] of [[6, 880], [1434, 880], [6, 460], [1434, 460]]) corners.push(px(png, x, y))
const near = (c, t, tol = 10) => Math.abs(c[0] - t[0]) <= tol && Math.abs(c[1] - t[1]) <= tol && Math.abs(c[2] - t[2]) <= tol
const deepSpace = [2, 6, 23]
const groundHits = corners.filter((c) => near(c, deepSpace, 14)).length
check('document ground is Deep Space #020617', ground.body === 'rgb(2, 6, 23)', `body ${ground.body}, html ${ground.html}`)
check('rendered pixels agree (no light ground left)', groundHits >= 2, `${groundHits}/4 corners are #020617-ish: ${corners.map(rgbStr).join(' ')}`)
check('ground is NOT the Blueprint canvas #F3F4F6', !near(corners[0], [243, 244, 246], 20), rgbStr(corners[0]))

/* =====================================================================================
   2. THE GLASS — backdrop-filter actually applied, not just declared
   ===================================================================================== */
console.log('\n=== 2. the glass ===')
const glass = await page.evaluate(() => {
  const out = []
  for (const sel of ['.pg-cell', '.pg-price-card', '.mk-price-card', '.mk-nav']) {
    const el = document.querySelector(sel)
    if (!el) continue
    const cs = getComputedStyle(el)
    out.push({
      sel,
      bg: cs.backgroundColor,
      bd: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
      radius: cs.borderTopLeftRadius,
    })
  }
  return out
})
for (const g of glass) console.log(`   ${g.sel.padEnd(18)} bg=${g.bg.padEnd(26)} blur=${g.bd.slice(0, 34)} r=${g.radius}`)
const withBlur = glass.filter((g) => /blur/.test(g.bd))
check('frosted glass is applied to the cards', withBlur.length >= 2, `${withBlur.length} surfaces carry blur()`)
check('cards carry the brief\'s rgba(15,23,42,.4) fill', glass.some((g) => /rgba\(15, 23, 42, 0\.4\)/.test(g.bg)), glass.map((g) => g.bg).join(' '))

/* =====================================================================================
   3. THE SHAPES — the brief retires 0px
   ===================================================================================== */
console.log('\n=== 3. the shapes ===')
const shapes = await page.evaluate(() => {
  const grab = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).borderTopLeftRadius : null }
  const btn = document.querySelector('.pg-btn, .mk-btn')
  return {
    card: grab('.pg-cell'),
    priceCard: grab('.pg-price-card'),
    btn: btn ? getComputedStyle(btn).borderTopLeftRadius : null,
    anyZero: Array.from(document.querySelectorAll('.pg-cell, .pg-price-card, .pg-btn, .mk-btn'))
      .filter((e) => getComputedStyle(e).borderTopLeftRadius === '0px').length,
  }
})
console.log('   ', JSON.stringify(shapes))
check('cards are 20px (the brief)', shapes.card === '20px' || shapes.priceCard === '20px', `cell=${shapes.card} price=${shapes.priceCard}`)
check('CTAs are pill-shaped 50px (the brief)', shapes.btn === '50px', `btn=${shapes.btn}`)
check('no 0px corners remain on the marketing page', shapes.anyZero === 0, `${shapes.anyZero} elements still square`)

/* =====================================================================================
   4. THE NEON — present, and with the RIGHT ink on it
   =====================================================================================
   EMERALD IS CHECKED ON THREE CHANNELS, NOT ONE, and that is a correction to the first version
   of this script. It swept `getComputedStyle().color` and reported "zero emerald" on a page
   whose checklist ticks are plainly green — because those ticks are drawn as two BORDERS on a
   rotated box, and a border colour is not an ink. The globe dot is a BACKGROUND. Only the
   third channel is text. A colour audit that checks one channel reports a false negative, and
   the fix is to ask about the role rather than about the property. */
console.log('\n=== 4. the neon and its ink ===')
const neon = await page.evaluate(() => {
  const out = { cyan: 0, emeraldInk: 0, emeraldBorder: 0, emeraldBg: 0, gradientText: 0, whiteOnNeon: [] }
  const EM = (s) => /rgb\(0, 255, 135\)/.test(s) || /rgba\(0, 255, 135/.test(s)
  const CY = (s) => /rgb\(0, 242, 254\)/.test(s) || /rgba\(0, 242, 254/.test(s)
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (CY(cs.color)) out.cyan++
    if (EM(cs.color)) out.emeraldInk++
    if (EM(cs.backgroundColor)) out.emeraldBg++
    if (EM(cs.borderLeftColor) || EM(cs.borderBottomColor)) out.emeraldBorder++
    /* gradient text: a background-image on the element with a transparent fill */
    if (cs.backgroundImage.includes('gradient') && (cs.webkitTextFillColor === 'transparent' || cs.color === 'rgba(0, 0, 0, 0)')) {
      out.gradientText++
    }
    /* THE TRAP: any neon FILL carrying white ink */
    const bg = cs.backgroundColor
    const isNeonFill = CY(bg) || EM(bg) || /rgb\(79, 172, 254\)/.test(bg)
    if (isNeonFill && /rgb\(255, 255, 255\)/.test(cs.color)) out.whiteOnNeon.push(el.className?.toString().slice(0, 40))
  }
  /* The pseudo-element channels, which querySelectorAll cannot reach. */
  const pseudoEmerald = []
  for (const sel of ['.pg-price-card.feat .pg-price-list li', '.mk-plan.featured .mk-plan-list li']) {
    const el = document.querySelector(sel)
    if (!el) continue
    const cs = getComputedStyle(el, '::before')
    if (EM(cs.borderLeftColor) || EM(cs.color)) pseudoEmerald.push(sel)
  }
  out.pseudoEmerald = pseudoEmerald
  return out
})
console.log('   ', JSON.stringify({ cyanInk: neon.cyan, emeraldInk: neon.emeraldInk, emeraldBorder: neon.emeraldBorder, emeraldBg: neon.emeraldBg, gradientText: neon.gradientText, pseudo: neon.pseudoEmerald }))
check('the brief\'s cyan #00F2FE is in use as ink', neon.cyan >= 5, `${neon.cyan} elements`)
check('the brief\'s emerald #00FF87 marks the conversion points', neon.emeraldInk + neon.emeraldBorder + neon.emeraldBg + neon.pseudoEmerald.length >= 3,
  `ink=${neon.emeraldInk} border=${neon.emeraldBorder} bg=${neon.emeraldBg} pseudo=${neon.pseudoEmerald.length}`)
check('gradient headings are live (background-clip: text)', neon.gradientText >= 2, `${neon.gradientText} elements`)
check('NO white text sits on a neon fill', neon.whiteOnNeon.length === 0, neon.whiteOnNeon.slice(0, 4).join(', ') || 'clean')

/* =====================================================================================
   THE CONTROL BOUNDARY — the one place this build deliberately departs from the brief's
   numbers, so it is asserted rather than left to a comment.
   =====================================================================================
   The brief gives borders as "garis putih sangat tipis (rgba(255, 255, 255, 0.1))". That value is
   fine for a decorative rule and wrong for the boundary of a control: composited over the
   #020617 ground it measures 1.23:1, and WCAG 1.4.11 asks 3:1 of the visual boundary of a user
   interface component. The raised token is rgba(255,255,255,.36) = 3.22:1.

   Both halves are checked, because a fix that raised EVERY line would trade one failure for
   another — the decorative rules are supposed to stay quiet, and the brief's value is what makes
   the page read as glass rather than as a wireframe. */
const lines = await page.evaluate(() => {
  const ground = [2, 6, 23]
  const over = (fg, a, bg) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)))
  const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const lum = (t) => 0.2126 * srgb(t[0]) + 0.7152 * srgb(t[1]) + 0.0722 * srgb(t[2])
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
  const parse = (s) => { const m = s.match(/[\d.]+/g); return m ? { c: m.slice(0, 3).map(Number), a: m[3] === undefined ? 1 : Number(m[3]) } : null }

  const out = { controls: [], weak: [], exempt: [] }
  for (const el of document.querySelectorAll('.mk-portal, .pg-btn, .mk-btn, .mk-lang button, .mk-menu-btn, input, select, textarea, .pg-price-card, .mk-price-card')) {
    const cs = getComputedStyle(el)
    const p = parse(cs.borderTopColor)
    const w = parseFloat(cs.borderTopWidth)
    if (!p || !w) continue

    /* TWO EXEMPTIONS, both of them the standard's own text rather than a convenience.
       WCAG 1.4.11 governs "the visual boundary of a USER INTERFACE COMPONENT", and it is the
       boundary that must reach 3:1 — not necessarily a border property.

       (a) A control whose border is fully transparent is not bounded by its border at all: the
           primary CTA is a bright cyan-to-sky gradient with a transparent 1px border, and its
           visible edge is that fill. Measuring the transparent border returns 1.00:1, which says
           nothing about what a user sees. Those are excluded from the border test and asserted
           separately by the "no white text on a neon fill" check above, which is what actually
           governs them.
       (b) A card is not a user interface component. The brief's own value is specified for
           decorative rules, and a 1.23:1 hairline around a glass panel is the intended look; the
           panel is identified by its fill and its blur, and nothing inside it is reached only
           through that line. Cards are reported but not failed. */
    const transparent = p.a === 0
    const isCard = /price-card/.test(el.className?.toString() ?? '')
    const solid = p.a >= 1 ? p.c : over(p.c, p.a, ground)
    const r = contrast(solid, ground)
    out.controls.push({ cls: el.className?.toString().slice(0, 28), w, r: +r.toFixed(2), transparent, isCard })
    if (transparent || isCard) { out.exempt.push(`${el.className?.toString().slice(0, 20)} ${r.toFixed(2)}:1 (${transparent ? 'fill-bounded' : 'card'})`); continue }
    if (w > 0 && r < 3) out.weak.push(`${el.className?.toString().slice(0, 24)} ${r.toFixed(2)}:1`)
  }
  return out
})
console.log('   ', JSON.stringify(lines.controls.slice(0, 6)))
console.log('    exempt:', lines.exempt.slice(0, 4).join(', ') || 'none')
check('every bordered control clears WCAG 1.4.11 (3:1)', lines.weak.length === 0, lines.weak.slice(0, 4).join(', ') || 'all clear')
check('at least one control uses the raised line (the deviation is real)', lines.controls.some((c) => c.r >= 3), JSON.stringify(lines.controls.slice(0, 3)))

/* =====================================================================================
   5. THE MOTION — the brief's two keyframes are really running
   ===================================================================================== */
console.log('\n=== 5. the motion ===')
const motion = await page.evaluate(() => {
  const grab = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const cs = getComputedStyle(el)
    return { name: cs.animationName, dur: cs.animationDuration, iter: cs.animationIterationCount, delay: cs.animationDelay }
  }
  /* `.pg-hero` specifically, NOT a `.pg-hero, .mk-hero` list: the two are different elements
     (the landing page's hero section and a small heading band on the other marketing pages),
     and a comma-separated querySelector returns whichever appears first in the DOM — which on
     this page is the 328x48 heading band. That made an earlier version of this audit report
     "hero animation: none" for an aurora that was running perfectly at 1358x849. */
  const hero = document.querySelector('.pg-hero')
  const heroBefore = hero ? getComputedStyle(hero, '::before') : null
  return {
    card: grab('.pg-cell'),
    price: grab('.pg-price-card'),
    hero: heroBefore ? { name: heroBefore.animationName, dur: heroBefore.animationDuration } : null,
    h1: grab('.pg-d1'),
  }
})
console.log('   ', JSON.stringify(motion))
check('cyberBreathe runs on the cards', /cyberBreathe/.test(motion.card?.name ?? ''), motion.card?.name)
check('cyberFloat runs on the cards', /cyberFloat/.test(motion.card?.name ?? ''), motion.card?.name)
check('cyberBreathe runs on the hero aurora (the brief names Hero Section)', /cyberBreathe/.test(motion.hero?.name ?? ''), motion.hero?.name)
check('gradientShift runs on the display headings', /gradientShift/.test(motion.h1?.name ?? ''), motion.h1?.name)
check('the animation period is the brief\'s 6s', (motion.card?.dur ?? '').startsWith('6s'), motion.card?.dur)

/* The float must actually move the element, and MEASURING IT IS NOT OBVIOUS.
   `getComputedStyle(el).translate` reads the INDEPENDENT `translate` property, which is `none`
   here — because the keyframes are authored on `translate` but the browser composites a
   keyframe effect through the `transform` channel, so the travel lands in the resolved matrix
   and the independent property keeps reporting its base value. Reading `translate` therefore
   reports "no movement" for an animation that is running perfectly.

   The honest measurement is the matrix's translation component: `matrix(a,b,c,d,e,f)` carries
   the offset in `e`/`f`. That is read below, and it is the same lesson as the skew-parse trap
   recorded in references/ui-rules.md — measure the channel the value actually arrives on. */
const translateOf = () => page.evaluate(() => {
  const el = document.querySelector('.pg-cell')
  if (!el) return null
  const t = getComputedStyle(el).transform
  const m3 = t.match(/matrix3d\(([^)]+)\)/)
  if (m3) { const p = m3[1].split(',').map(Number); return Math.round(p[13] * 100) / 100 }
  const m2 = t.match(/matrix\(([^)]+)\)/)
  if (m2) { const p = m2[1].split(',').map(Number); return Math.round(p[5] * 100) / 100 }
  return t === 'none' ? 0 : null
})

/* SAMPLE A WHOLE CYCLE, NOT TWO POINTS.
   Two samples 1.2s apart are enough to prove motion *usually* and to fail spuriously sometimes:
   `cyberFloat` is a 6s sine, and two instants can land symmetrically around the midpoint and
   read as equal. That produced a 1-in-4 flake, which is worse than no test at all — a check that
   fails on correct code trains people to ignore it.

   Sampling across a full period and taking the range cannot be fooled that way: a sine that is
   running always spans a measurable range within one cycle, whatever phase it starts at. */
const samples = []
for (let i = 0; i < 14; i++) { samples.push(await translateOf()); await new Promise((r) => setTimeout(r, 500)) }
const seen = samples.filter((s) => s !== null)
const lo = Math.min(...seen), hi = Math.max(...seen)
const range = Math.round((hi - lo) * 100) / 100
console.log(`   card translateY over ~7s (one full cycle): ${samples.join(' -> ')}`)
console.log(`   travel range: ${range}px  (the brief asks for millimetres)`)
check('the cards visibly travel (translateY spans a range)', seen.length === samples.length && range > 0.05, `range ${range}px over ${seen.length} samples`)

/* =====================================================================================
   6. ISOLATION — the app must be untouched (the brief's hard requirement)
   ===================================================================================== */
console.log('\n=== 6. isolation from the app ===')
await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 1500))
const login = await page.evaluate(() => {
  const shell = document.querySelector('.mk')
  const btn = document.querySelector('.mk-submit, .mk-btn')
  return {
    hasMkSite: !!document.querySelector('.mk-site'),
    radius: btn ? getComputedStyle(btn).borderTopLeftRadius : null,
    ground: getComputedStyle(document.body).backgroundColor,
    navBlur: shell ? getComputedStyle(shell).backdropFilter : null,
  }
})
console.log('   ', JSON.stringify(login))
check('/login is NOT under .mk-site (isolation holds)', login.hasMkSite === false, `hasMkSite=${login.hasMkSite}`)
check('/login keeps its own square corners (not 50px pills)', login.radius !== '50px', `radius=${login.radius}`)

/* And the signed-in app shell. */
await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 1200))
await page.evaluate(() => {
  const set = (el, v) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  const e = document.querySelector('input[type="email"], #email'), p = document.querySelector('input[type="password"], #password')
  if (e) set(e, 'demo@geofold.app'); if (p) set(p, 'demo-password')
  document.querySelector('form button[type="submit"]')?.click()
})
await new Promise((r) => setTimeout(r, 3500))
const app = await page.evaluate(() => {
  const side = document.querySelector('.side, aside, nav')
  return {
    url: location.pathname,
    hasMkSite: !!document.querySelector('.mk-site'),
    sidebarBg: side ? getComputedStyle(side).backgroundColor : null,
    body: getComputedStyle(document.body).backgroundColor,
  }
})
console.log('   ', JSON.stringify(app))
check('the signed-in app is NOT under .mk-site', app.hasMkSite === false, `url=${app.url}`)
check('the app ground is still the light Kanvas #F3F4F6', app.body === 'rgb(243, 244, 246)', app.body)

/* =====================================================================================
   7. A SECOND MARKETING PAGE — the layer is not landing page only
   ===================================================================================== */
console.log('\n=== 7. the layer reaches the whole subtree ===')
for (const path of ['/pricing', '/product']) {
  await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 90_000 })
  await new Promise((r) => setTimeout(r, 1800))
  const r = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    mkSite: !!document.querySelector('.mk-site'),
  }))
  check(`${path} is on Deep Space too`, r.body === 'rgb(2, 6, 23)' && r.mkSite, `body=${r.body} mkSite=${r.mkSite}`)
}

console.log(`\n=== js errors: ${errors.length ? errors.slice(0, 4).join(' | ') : 'none'} ===`)
if (errors.length) check('no javascript errors', false, errors[0])

console.log(`\n${pass} passed, ${fails.length} failed${fails.length ? ': ' + fails.join('; ') : ''}`)
await browser.close()
process.exit(fails.length ? 1 : 0)
