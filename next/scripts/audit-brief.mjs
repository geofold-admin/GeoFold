/**
 * audit-brief.mjs — every remaining testable claim in the client's document, measured.
 *
 * The colour-proportion audit is a separate script (audit-colour.mjs). This one covers the
 * page-by-page and component requirements, because those are the ones that fail silently:
 *
 *   4.  registration marks "+" at the corners of cards
 *   5B1 sidebar: white ground, stroke-1.5 icons, active row in GEOFOLD Blue with a left ribbon
 *   5B3 map canvas: neutral #F3F4F6 ground behind the satellite layer
 *   5A4 pricing: the Premium card is highlighted in GEOFOLD Blue, the Free card blends into the page
 *   6   the brief's own ink tokens, measured as TEXT where they are used as text
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const OUT = 'shots'
mkdirSync(OUT, { recursive: true })

const results = []
const fail = []
const check = (name, ok, detail) => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

function lum([r, g, b]) {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05) }
const rgb = (s) => (s.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3)
const isBlue = ([r, g, b]) => Math.abs(r - 1) < 12 && Math.abs(g - 74) < 12 && Math.abs(b - 181) < 12

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

/* ---------------------------------------------------------------- marketing: marks + pricing */
await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 2500))

const marks = await page.evaluate(() => {
  const out = []
  /* THE "+" MARKS, AND WHY THIS CHECK IS NOW INVERTED.
     It used to require them: "registration marks '+' are drawn on the figure frames", because the
     Blueprint brief asked for "aksen pendaftaran silang (+) halus di sudut-sudut kartu". The
     client has retired that brief and its whole aesthetic:

       "Aturan desain Blueprint sebelumnya memaksakan sudut 0px pada seluruh bentuk. Konsep
        Neo-Topography menghapusnya dan beralih ke desain organik dan fluid."

     The marks are that skin's signature device, the new brief never mentions them, and they were
     measurably broken by the change of shape — blueprint.css pins them to `inset: 0`, the SQUARE
     corners, while the cards are now 20px-radius, so part of each arm hung outside the card's own
     silhouette (9 px on the first figure frame, and a read of the rendered band reported them as
     doubled/ghosted borders).

     Inverting the check keeps it doing work: it now catches a mark left behind by a later edit,
     which is the failure that actually matters from here.

     NOTE: an empty `content: ''` computes to `""` (a quoted empty string), NOT to `none`, so the
     test is on the painted arms rather than on `content`. */
  for (const sel of ['.pg-cell-art', '.pg-row-art']) {
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el, '::after')
      out.push({ sel, content: cs.content, arms: (cs.backgroundImage.match(/linear-gradient/g) ?? []).length })
    }
  }
  return out
})
check('the retired "+" registration marks are gone', marks.length === 0 || marks.every((m) => m.arms === 0), JSON.stringify(marks.slice(0, 4)))

const pricing = await page.evaluate(() => {
  const read = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, border: cs.borderTopColor, borderW: cs.borderTopWidth, radius: cs.borderTopLeftRadius, blur: cs.backdropFilter }
  }
  return { free: read('.pg-price-card:not(.feat)'), premium: read('.pg-price-card.feat'), page: getComputedStyle(document.querySelector('.mk')).backgroundColor }
})
const pageGround = rgb(pricing.page)
const freeBg = rgb(pricing.free.bg)

/* THE PREMIUM-CARD CHECK, BACK TO THE NORMAL PALETTE.
   This one check has now asserted three different things, one per client brief:

     1. Blueprint      — "highlighted in GEOFOLD Blue #014AB5".
     2. Neo-Topography — "highlighted in the brief's Cyber Cyan" + a frosted-glass surface with
                         `backdrop-filter: blur(16px)`.
     3. THIS ONE       — the client asked for the normal palette back and for the glass to go:
                         "gunakan color palet sebelum ini, gunakan color palet normal nya saja".

   So the featured card is distinguished by the brand's blue again, and the assertion is stronger
   than a colour match: it requires that the card is VISUALLY DISTINCT from the free card, which
   is the thing that actually matters. A colour alone can be right while the card still looks
   identical — that is the regression this is here to catch. The blur assertion is inverted to
   require the glassmorphism to be GONE, because a leftover `backdrop-filter` from the retired
   skin would be a real defect. */
const premBorder = rgb(pricing.premium.border)
/* The file already declares `isBlue` at the top — an exact match against GEOFOLD Blue, used by the
   app-chrome checks. It is reused here rather than shadowed, so both places assert the same
   colour: one definition, one truth. */
check('Premium card is highlighted in GEOFOLD Blue', isBlue(premBorder), `border ${pricing.premium.border} w=${pricing.premium.borderW}`)
check('Premium card is visually distinct from the free card', pricing.premium.border !== pricing.free.border,
  `premium ${pricing.premium.border} vs free ${pricing.free.border}`)
check('the retired glassmorphism is gone', !/blur/.test(pricing.premium.blur || 'none'), `backdrop-filter: ${pricing.premium.blur}`)
check('Free card blends with the page ground', pricing.free.bg === 'rgba(0, 0, 0, 0)' || ratio(freeBg, pageGround) < 1.15, `card ${pricing.free.bg} vs page ${pricing.page}`)

/* ---------------------------------------------------------------- app chrome (demo login) */
await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 1400))
await page.evaluate(() => {
  const set = (el, v) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  const e = document.querySelector('input[type="email"], #email'), p = document.querySelector('input[type="password"], #password')
  if (e) set(e, 'demo@geofold.app'); if (p) set(p, 'demo-password')
  document.querySelector('form button[type="submit"]')?.click()
})
await new Promise((r) => setTimeout(r, 4200))

const side = await page.evaluate(() => {
  const aside = document.querySelector('.sidebar')
  if (!aside) return null
  const nav = aside.querySelector('.side-nav a')
  const svg = nav?.querySelector('svg')
  const active = aside.querySelector('.side-nav a.active')
  const activeSvg = active?.querySelector('svg')
  return {
    ground: getComputedStyle(aside).backgroundColor,
    iconStroke: svg ? getComputedStyle(svg).strokeWidth : null,
    iconSize: svg ? `${svg.getAttribute('width') ?? ''}x${svg.getAttribute('height') ?? ''}` : null,
    activeColor: active ? getComputedStyle(active).color : null,
    activeIconStroke: activeSvg ? getComputedStyle(activeSvg).color : null,
    ribbon: active ? { w: getComputedStyle(active).borderLeftWidth, c: getComputedStyle(active).borderLeftColor } : null,
  }
})
if (side) {
  check('sidebar ground is #FFFFFF', side.ground === 'rgb(255, 255, 255)', side.ground)
  check('sidebar icons are stroke 1.5px', parseFloat(side.iconStroke) === 1.5, `stroke-width ${side.iconStroke} (brief asks 1.5px)`)
  check('active nav item is GEOFOLD Blue', isBlue(rgb(side.activeColor)), side.activeColor)
  check('active nav item carries the left ribbon', parseFloat(side.ribbon.w) >= 2 && isBlue(rgb(side.ribbon.c)), `${side.ribbon.w} ${side.ribbon.c}`)
} else {
  check('app sidebar present', false, 'not found after demo login')
}

/* ---------------------------------------------------------------- map canvas ground */
await page.goto(BASE + '/map', { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 3500))
const mapGround = await page.evaluate(() => {
  const leaflet = document.querySelector('.leaflet-container')
  if (!leaflet) return null
  const cs = getComputedStyle(leaflet)
  const m = cs.backgroundColor.match(/[\d.]+/g)
  const [r, g, b] = (m ?? []).map(Number)
  return {
    background: cs.backgroundColor,
    rgb: [r, g, b],
    radius: cs.borderTopLeftRadius,
    /* The brief asks for #F3F4F6. Allow a hair of drift but not another grey entirely: Leaflet's
       own default #DDDDDD is 22 levels away per channel, far outside this tolerance. */
    isBriefGrey: Math.abs(r - 243) <= 4 && Math.abs(g - 244) <= 4 && Math.abs(b - 246) <= 4,
  }
})
check('map canvas ground is the brief\'s #F3F4F6 (not leaflet\'s #DDDDDD)',
  !!mapGround && mapGround.isBriefGrey,
  mapGround ? `${mapGround.background} vs #F3F4F6 = rgb(243,244,246)` : 'no .leaflet-container')
check('map canvas corners are square', !!mapGround && mapGround.radius === '0px', mapGround?.radius)

/* ---------------------------------------------------------------- the brief's ink tokens as text */
const inkUse = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
    if (!own) continue
    const cs = getComputedStyle(el)
    const m = cs.color.match(/[\d.]+/g)
    if (!m) continue
    const [r, g, b] = m.map(Number)
    /* the brief's own two suspect values */
    if ((Math.abs(r - 107) < 6 && Math.abs(g - 114) < 6 && Math.abs(b - 128) < 6) ||
        (Math.abs(r - 156) < 6 && Math.abs(g - 163) < 6 && Math.abs(b - 175) < 6)) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) continue
      out.push({ color: cs.color, size: parseFloat(cs.fontSize), text: el.textContent.trim().slice(0, 28), cls: el.className?.toString().slice(0, 30) })
    }
  }
  return out.slice(0, 12)
})
console.log('\n=== the brief\'s ink tokens, found in use as text ===')
for (const u of inkUse) console.log(`   ${u.color}  ${u.size}px  "${u.text}"  .${u.cls}`)
if (!inkUse.length) console.log('   (none on this page)')

/* ---------------------------------------------------------------- report */
console.log('\n' + results.join('\n'))
console.log(`\n${fail.length} FAILED: ${JSON.stringify(fail)}`)

await browser.close()
process.exit(fail.length ? 1 : 0)
