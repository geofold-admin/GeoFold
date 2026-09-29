#!/usr/bin/env node
/**
 * verify-subscription.mjs — guard the iPaymu resume affordance on /subscription.
 *
 * WHY THIS EXISTS. The resume feature had no permanent test. `verify-app.mjs` never touches
 * /subscription (grep for "subscription" in it: zero hits), so the only evidence it worked was a
 * throwaway probe and a subagent's self-report — and that report arrived as a "corrected response"
 * envelope with no numbers in it, while its own verification runs exited 1 on "stdin is not a tty".
 * Nothing would have caught it silently breaking.
 *
 * WHAT IT ASSERTS, and why each one matters:
 *   1. With an unpaid attempt still live, the CTA offers to RESUME it and names the amount. The bug
 *      this feature fixes was a buyer pressing "Upgrade" and being asked to choose a channel again,
 *      so the button's wording is the whole point.
 *   2. The reason is shown ABOVE the button. Measured: the callout used to sit 38.8px BELOW it, so
 *      the screen asked "continue payment?" before saying why. Order is asserted geometrically.
 *   3. The deadline is present. Without it the buyer cannot tell a live order from a stale one.
 *   4. The screen is clean: no page errors, nothing overflowing its card.
 *
 * The demo session lives in memory rather than in a cookie, so this signs in through /login and
 * reads the rendered DOM. It does NOT verify against the live iPaymu gateway — no credentials are
 * available to it, and it says so rather than implying coverage it does not have.
 */
import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.BASE || 'http://localhost:3100'

let fails = 0
const check = (label, ok, detail) => {
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 1000 })

const pageErrors = []
p.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)))

try {
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 1200))
  await p.evaluate(() => {
    const email = document.querySelector('input[type="email"], input[name="email"], #email')
    const pass = document.querySelector('input[type="password"], input[name="password"], #password')
    if (!email || !pass) return
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set(email, 'demo@geofold.app')
    set(pass, 'demo-password')
  })
  await new Promise((r) => setTimeout(r, 400))
  await p.evaluate(() => document.querySelector('form')?.querySelector('button[type="submit"]')?.click())
  await new Promise((r) => setTimeout(r, 3000))

  await p.goto(`${BASE}/subscription`, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 2500))

  const m = await p.evaluate(() => {
    const r = (el) => el.getBoundingClientRect()
    const text = (document.body.innerText || '').replace(/\s+/g, ' ')
    const buttons = [...document.querySelectorAll('button')]
    const btn = buttons.find((x) => /Lanjutkan pembayaran/i.test(x.textContent || ''))
    const upgrade = buttons.find((x) => /^Upgrade ke Premium/i.test((x.textContent || '').trim()))
    const callout = [...document.querySelectorAll('div,section')].find((d) => {
      const t = d.textContent || ''
      return /belum dibayar/i.test(t) && t.length < 300
    })
    const card = btn?.closest('section') || btn?.parentElement
    const overflowing = []
    if (card) {
      const cb = r(card)
      for (const el of card.querySelectorAll('*')) {
        const eb = r(el)
        if (eb.width === 0 && eb.height === 0) continue
        if (eb.right - cb.right > 1 || eb.bottom - cb.bottom > 1) {
          overflowing.push((el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30))
        }
      }
    }
    return {
      url: location.pathname,
      resumeLabel: btn ? (btn.textContent || '').trim() : null,
      upgradeLabel: upgrade ? (upgrade.textContent || '').trim() : null,
      hasCallout: !!callout,
      calloutText: callout ? (callout.textContent || '').replace(/\s+/g, ' ').trim() : null,
      calloutAboveButton: btn && callout ? r(callout).top < r(btn).top : null,
      gap: btn && callout ? +(r(btn).top - r(callout).bottom).toFixed(1) : null,
      hasDeadline: /berlaku sampai/i.test(text),
      hasAmount: /Rp\s?[\d.]+/.test(text),
      overflowing: overflowing.slice(0, 4),
    }
  })

  console.log('=== /subscription ===')
  for (const [k, v] of Object.entries(m)) console.log(`  ${k}: ${JSON.stringify(v)}`)
  console.log()

  check('reached the subscription screen', m.url === '/subscription', m.url)
  check('the CTA offers to RESUME, not to upgrade', !!m.resumeLabel, m.resumeLabel ?? 'no resume button found')
  check('the upgrade CTA is not shown at the same time', !m.upgradeLabel, m.upgradeLabel ?? 'not present')
  check('the resume CTA names the amount', /Rp\s?[\d.]+/.test(m.resumeLabel || ''), m.resumeLabel ?? '')
  check('the unpaid-bill callout is present', m.hasCallout, m.calloutText ?? 'missing')
  check('the callout shows a deadline', m.hasDeadline)
  check('the reason comes BEFORE the action', m.calloutAboveButton === true,
    m.gap === null ? 'no gap measured' : `callout sits ${m.gap}px above the button`)
  check('nothing overflows its card', m.overflowing.length === 0, m.overflowing.join(' | ') || 'clean')
  check('no page errors', pageErrors.length === 0, pageErrors.join(' | ') || 'clean')

  console.log(`\nNOTE: verified against the demo path only. The live iPaymu gateway is NOT covered — no credentials are available to this suite.`)
} finally {
  await b.close()
}

console.log(`\n${fails === 0 ? 'ALL PASS' : `${fails} FAILED`}`)
process.exit(fails === 0 ? 0 : 1)
