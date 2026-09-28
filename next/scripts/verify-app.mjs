/**
 * verify-app.mjs — the app chrome half of the brief, which verify-ui.mjs does not cover.
 *
 * The client's document is explicit about the portal (section B): white sidebar, stroke-1.5
 * icons, the active row in brand blue with a left ribbon, a WHITE mobile bottom bar, the offline
 * state in the header, and the survey marker in GEOFOLD Orange. The app is behind a login and the
 * project ships DEMO_MODE when Supabase is unconfigured, so this walks the demo path.
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const OUT = 'shots'
mkdirSync(OUT, { recursive: true })
const results = []
const fail = []
const check = (name, ok, detail) => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); if (!ok) fail.push(name) }

/* PREFLIGHT — see verify-ui.mjs. A missing server should say so in a second, not time out. */
try {
  const probe = await fetch(BASE + '/', { signal: AbortSignal.timeout(4000) })
  if (!probe.ok) throw new Error(`HTTP ${probe.status}`)
} catch (e) {
  console.error(`\n  Cannot reach ${BASE} — ${e.message}\n`)
  console.error(`  Start the server first, in another terminal:`)
  console.error(`    npm run build && npm run start -- -p 3100`)
  console.error(`  Or point the suite at a running instance:  BASE=http://localhost:3000 npm run verify:app\n`)
  process.exit(2)
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })

/* ---------------------------------------------------------------- enter the demo
   DEMO_MODE is on when Supabase is unconfigured, and the login screen says so in as many words:
   "Demo mode: enter anything to explore with sample data." So the form is filled with a throwaway
   address and submitted — the submit handler calls enterDemo() rather than any real auth. */
await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 90_000 })
await new Promise((r) => setTimeout(r, 1200))
const filled = await page.evaluate(() => {
  const email = document.querySelector('input[type="email"], input[name="email"], #email')
  const pass = document.querySelector('input[type="password"], input[name="password"], #password')
  if (!email || !pass) return null
  const set = (el, v) => {
    const proto = Object.getPrototypeOf(el)
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  set(email, 'demo@geofold.app')
  set(pass, 'demo-password')
  return { email: email.value, hasPass: pass.value.length > 0 }
})
await new Promise((r) => setTimeout(r, 400))
await page.evaluate(() => {
  const form = document.querySelector('form')
  const btn = form?.querySelector('button[type="submit"]') ?? [...document.querySelectorAll('button')].find((b) => /sign in|continue|masuk|log in/i.test(b.textContent ?? ''))
  btn?.click()
})
await new Promise((r) => setTimeout(r, 3000))
let url = page.url()
check('can enter the demo portal', /\/home|\/capture|\/map/.test(url), `filled=${JSON.stringify(filled)} url=${url}`)

/* If a login form appeared instead, fill the demo credentials. */
if (!/\/home/.test(page.url())) {
  await page.goto(BASE + '/home', { waitUntil: 'networkidle2', timeout: 60_000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, 1500))
  url = page.url()
}

/* ---------------------------------------------------------------- the sidebar */
const side = await page.evaluate(() => {
  const el = document.querySelector('.sidebar')
  if (!el) return null
  const cs = getComputedStyle(el)
  const active = document.querySelector('.side-nav a.active')
  const icon = document.querySelector('.side-nav a svg')
  const brand = document.querySelector('.brand')
  return {
    bg: cs.backgroundColor,
    borderRight: cs.borderRightWidth + ' ' + cs.borderRightColor,
    activeColor: active ? getComputedStyle(active).color : null,
    activeBg: active ? getComputedStyle(active).backgroundColor : null,
    activeBorderLeftColor: active ? getComputedStyle(active).borderLeftColor : null,
    activeBorderLeftWidth: active ? getComputedStyle(active).borderLeftWidth : null,
    activeLabel: active?.textContent?.trim(),
    iconStroke: icon ? getComputedStyle(icon).strokeWidth : null,
    brandTransform: brand ? getComputedStyle(brand).textTransform : null,
    items: [...document.querySelectorAll('.side-nav a')].map((a) => a.textContent.trim().split('\n')[0]),
  }
})
if (!side) check('sidebar renders', false, 'not found — portal may not be reachable in demo')
else {
  check('sidebar is white (Panel Utama #FFFFFF)', side.bg === 'rgb(255, 255, 255)', side.bg)
  check('active row uses the brand blue', side.activeColor === 'rgb(1, 74, 181)', `${side.activeLabel}: ${side.activeColor}`)
  check('active row has the left indicator ribbon', parseFloat(side.activeBorderLeftWidth) >= 2 && side.activeBorderLeftColor === 'rgb(1, 74, 181)', `${side.activeBorderLeftWidth} ${side.activeBorderLeftColor}`)
  check('active row has the soft blue wash', side.activeBg === 'rgb(239, 245, 255)', side.activeBg)
  check('icons are 1.5px stroke', side.iconStroke === '1.5px', side.iconStroke)
  check('all six destinations present', side.items.length >= 6, JSON.stringify(side.items))
}

/* ---------------------------------------------------------------- the sync readout */
const sync = await page.evaluate(() => {
  const el = document.querySelector('.sync-status')
  if (!el) return null
  const cs = getComputedStyle(el)
  return { state: el.getAttribute('data-state'), text: el.textContent.trim(), color: cs.color, where: el.closest('.side-foot') ? 'sidebar' : el.closest('.mobile-top') ? 'mobile header' : 'elsewhere' }
})
check('sync status is present in the app chrome', !!sync, JSON.stringify(sync))

/* ---------------------------------------------------------------- the canvas ground */
const ground = await page.evaluate(() => ({
  body: getComputedStyle(document.body).backgroundColor,
  container: getComputedStyle(document.querySelector('.container') ?? document.body).backgroundColor,
}))
check('app ground is Kanvas Netral #F3F4F6', ground.body === 'rgb(243, 244, 246)', JSON.stringify(ground))

await page.screenshot({ path: `${OUT}/app-home.png` })

/* ---------------------------------------------------------------- the map + marker */
await page.goto(BASE + '/map', { waitUntil: 'networkidle2', timeout: 90_000 }).catch(() => {})
await new Promise((r) => setTimeout(r, 4000))
const marker = await page.evaluate(() => {
  /* The survey pin is a Leaflet divIcon; its colour is inline on the span it builds. */
  const dot = document.querySelector('.survey-dot span')
  const host = document.querySelector('.survey-dot')
  const map = document.querySelector('.leaflet-container')
  return {
    found: !!dot,
    bg: dot ? getComputedStyle(dot).backgroundColor : null,
    ring: dot ? getComputedStyle(dot).borderColor + ' ' + getComputedStyle(dot).borderWidth : null,
    mapPresent: !!map,
    mapRadius: map ? getComputedStyle(map).borderTopLeftRadius : null,
    html: host ? host.innerHTML.slice(0, 180) : null,
  }
})
check('the map canvas renders', marker.mapPresent, JSON.stringify(marker).slice(0, 120))
if (marker.found) {
  check('survey marker is GEOFOLD Orange #F35D19', marker.bg === 'rgb(243, 93, 25)', `${marker.bg} ring=${marker.ring}`)
  check('marker carries the white collar', /rgb\(255, 255, 255\)/.test(marker.ring ?? ''), marker.ring)
} else {
  check('survey marker is GEOFOLD Orange #F35D19', false, `no .survey-dot on /map — ${marker.html ?? 'no marker'}`)
}
await page.screenshot({ path: `${OUT}/app-map.png` })

/* ---------------------------------------------------------------- the mobile bar */
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await page.goto(BASE + '/home', { waitUntil: 'networkidle2', timeout: 60_000 }).catch(() => {})
await new Promise((r) => setTimeout(r, 1500))
const mobile = await page.evaluate(() => {
  const top = document.querySelector('.mobile-top')
  const bottom = document.querySelector('.mobile-bottom')
  const link = bottom?.querySelector('a')
  const active = bottom?.querySelector('a.active')
  return {
    topBg: top ? getComputedStyle(top).backgroundColor : null,
    bottomBg: bottom ? getComputedStyle(bottom).backgroundColor : null,
    linkH: link ? Math.round(link.getBoundingClientRect().height) : null,
    linkCount: bottom ? bottom.querySelectorAll('a').length : 0,
    activeColor: active ? getComputedStyle(active).color : null,
    syncInHeader: !!top?.querySelector('.sync-status'),
  }
})
check('mobile bottom bar is white #FFFFFF', mobile.bottomBg === 'rgb(255, 255, 255)', mobile.bottomBg)
check('mobile header is white', mobile.topBg === 'rgb(255, 255, 255)', mobile.topBg)
check('bottom-bar links are >= 44px tall', (mobile.linkH ?? 0) >= 44, `h=${mobile.linkH}`)
check('bottom bar carries five destinations', mobile.linkCount === 5, `n=${mobile.linkCount}`)
check('active tab is the brand blue', mobile.activeColor === 'rgb(1, 74, 181)', mobile.activeColor)
check('offline/connection status sits in the header', mobile.syncInHeader, `inHeader=${mobile.syncInHeader}`)
await page.screenshot({ path: `${OUT}/app-mobile.png` })

await browser.close()
writeFileSync(`${OUT}/app-report.txt`, results.join('\n') + `\n\n${fail.length} FAILED: ${JSON.stringify(fail)}\n`)
console.log(results.join('\n'))
console.log(`\n${fail.length} FAILED: ${JSON.stringify(fail)}`)
