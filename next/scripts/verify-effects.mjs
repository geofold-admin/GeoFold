/**
 * verify-effects.mjs — prove the scroll reveal and the card spotlight actually run.
 *
 * A screenshot cannot show either: one is a state that only exists mid-scroll, the other only
 * while a pointer is over a card. Both are measured here instead.
 *
 * MEASUREMENT NOTE, because the first version of this script reported a false FAIL. It picked the
 * "furthest down" `[data-anim]` element and compared its COMPUTED style before and after scrolling
 * to it. That reported `opacity: 1 / transform: none` both times, which looked like a dead tween —
 * and was actually the script reading the element's style after the entrance had already run.
 * GSAP writes the FROM state as an INLINE style (`opacity: 0; transform: translate(0px, 26px)`)
 * and clears it as the tween plays, so the honest test is on the INLINE `style` attribute of an
 * element that is still below the fold — never on the computed value of one the reader has passed.
 */
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 60000 })
await page.waitForSelector('.pg-cell', { timeout: 20000 })
await new Promise((r) => setTimeout(r, 1500))

const results = []

/* ---- 1. THE SCROLL REVEAL, read from the inline style GSAP writes.
   THE TARGET MATTERS, and picking the wrong one produced a false FAIL here.
   `[data-anim="up"]` writes its FROM state on the ELEMENT; `[data-anim="stagger"]` writes it on
   the element's CHILDREN; `[data-anim="chars"|"lines"]` hand off to SplitText, which writes to
   generated spans. The last `[data-anim]` on the page is a stagger, so reading its own `style`
   attribute returns "" and looks like a dead tween. This walks the candidates from the bottom of
   the page and takes the first one that actually carries a FROM state on itself or a child. */
const reveal = await page.evaluate(async () => {
  const read = (el) => {
    const nodes = [el, ...el.children]
    for (const n of nodes) {
      const inline = n.getAttribute('style') || ''
      const op = parseFloat(getComputedStyle(n).opacity)
      /* A FROM STATE IS `opacity < 1`, OR A REAL TRANSLATE OFFSET — not merely the word
         "translate". GSAP leaves `translate: none; rotate: none; scale: none` as residue on a
         tween that has FINISHED, so matching /translate/ alone reports a revealed element as
         still hidden; combined with the comparison below that is a false FAIL waiting to
         happen. The negative lookahead keeps only a non-zero offset. */
      const isFrom = op < 0.99 || /translate\((?!0px,\s*0px)/.test(inline)
      if (isFrom) return { node: n === el ? 'self' : 'child', inline, opacity: op }
    }
    return null
  }
  const els = [...document.querySelectorAll('[data-anim]')].reverse()
  for (const el of els) {
    const before = read(el)
    if (!before) continue
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    await new Promise((r) => setTimeout(r, 1800))
    const after = read(el)
    return { cls: el.className.slice(0, 40), before, after }
  }
  return null
})

if (!reveal) results.push('scroll reveal: FAIL (no [data-anim] element carried a FROM state at all)')
else {
  /* `after` is null when the FROM state has been fully released — which IS the pass. */
  const released = !reveal.after || parseFloat(reveal.after.opacity) > parseFloat(reveal.before.opacity)
  results.push(
    `scroll reveal: ${reveal.cls} [${reveal.before.node}] before[${reveal.before.inline.slice(0, 40)}] ` +
    `after[${reveal.after?.inline?.slice(0, 40) ?? 'released'}] ` +
    `→ ${released ? 'PASS (GSAP wrote a FROM state and released it on scroll)' : 'FAIL (still in FROM state after scrolling to it)'}`,
  )
}

/* ---- 2. THE COUNTERS. The served text is the final value; a running tween means the number is
   written by script, so the check is that the element is wired at all and shows a number. ---- */
const counters = await page.evaluate(() =>
  [...document.querySelectorAll('[data-count]')].map((el) => el.textContent),
)
results.push(`counters wired: ${counters.length} → ${JSON.stringify(counters)} ${counters.length ? 'PASS' : 'FAIL'}`)

/* ---- 3. THE CARD SPOTLIGHT. Move the pointer across a card and check the custom properties are
   written and the pseudo-element's wash is painted. ---- */
const box = await page.evaluate(() => {
  const c = document.querySelector('.pg-cell')
  if (!c) return null
  c.scrollIntoView({ block: 'center', behavior: 'instant' })
  return true
})
if (!box) results.push('card spotlight: FAIL (no .pg-cell)')
else {
  await new Promise((r) => setTimeout(r, 500))
  const b2 = await page.evaluate(() => {
    const c = document.querySelector('.pg-cell')
    const r = c.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.move(b2.x, b2.y, { steps: 4 })
  await new Promise((r) => setTimeout(r, 200))
  await page.mouse.move(b2.x + 30, b2.y + 12, { steps: 4 })
  await new Promise((r) => setTimeout(r, 350))
  const live = await page.evaluate(() => {
    const card = document.querySelector('.pg-cell')
    const cs = getComputedStyle(card, '::before')
    return {
      varX: card.style.getPropertyValue('--spot-x'),
      varY: card.style.getPropertyValue('--spot-y'),
      opacity: cs.opacity,
      gradient: /gradient/.test(cs.backgroundImage || ''),
    }
  })
  const ok = live.varX !== '' && live.varY !== '' && parseFloat(live.opacity) > 0.9 && live.gradient
  results.push(`card spotlight: vars=${live.varX || '—'}/${live.varY || '—'} pseudo-opacity=${live.opacity} gradient=${live.gradient} → ${ok ? 'PASS' : 'FAIL'}`)
}

results.push(`console: ${errs.length === 0 ? 'PASS (clean)' : 'FAIL ' + JSON.stringify(errs.slice(0, 3))}`)
console.log(results.join('\n'))
await browser.close()
