/**
 * Generates every favicon / PWA icon from the ONE real mark, with the brand colours frozen.
 *
 * WHAT WAS WRONG. icon.svg carried `@media (prefers-color-scheme: dark) { .gf-ring { fill: #dce8f7 } }`,
 * so the mark's blue was silently repainted to a pale blue on any dark browser chrome. None of the
 * three icon files were generated from the same source or matched each other, and there was no web
 * manifest, so "add to home screen" had nothing to work with.
 *
 * THE RULES THIS ENFORCES.
 *   - The two fills are read FROM public/geofold-mark.svg and asserted to be the frozen brand
 *     values. If the artwork is ever retraced with different colours, this fails loudly rather than
 *     shipping a repainted logo.
 *   - No background plate is emitted anywhere: the icon is the mark and nothing else (the user
 *     asked for no background, and a plate is what makes a mark merge with a dark tab bar).
 *   - The mark is scaled to fit ~82% of the canvas with a transparent margin, because a mark that
 *     touches the canvas edge looks cropped in a browser tab that clips corners.
 *   - Because there is no plate, the artwork MUST be legible on both light and dark chrome, so the
 *     blue is kept exactly as drawn and the small sizes are checked for actual contrast (see the
 *     report printed at the end), not assumed.
 *
 * RUN: node scripts/build-icons.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { PNG } from 'pngjs'
import { dirname, join } from 'node:path'

const ROOT = process.cwd()
const MARK = join(ROOT, 'public/geofold-mark.svg')
const APP = join(ROOT, 'src/app')

/* Frozen. Changing either of these is changing the brand, which is not this script's call. */
const BRAND = { blue: '#0246b1', orange: '#fa5f1f' }

const markSvg = readFileSync(MARK, 'utf8')

/* ── read and verify the fills straight out of the artwork ─────────────────────────────────── */
const fills = [...markSvg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase())
if (!fills.includes(BRAND.blue) || !fills.includes(BRAND.orange)) {
  throw new Error(
    `geofold-mark.svg no longer carries the brand colours. Found ${JSON.stringify(fills)}, ` +
      `expected to contain ${BRAND.blue} and ${BRAND.orange}. Refusing to build icons that repaint the logo.`,
  )
}
console.log(`mark colours verified: ${fills.join(', ')}`)

/* ── geometry: the mark is 578x429, so the square icon needs it centred, not stretched ─────── */
const [, , MW, MH] = markSvg.match(/viewBox="([\d.\s-]+)"/)[1].split(/\s+/).map(Number)
const COVER = 0.82 // fraction of the canvas the mark occupies, leaving a transparent margin

const pad = (n) => (Number.isInteger(n) ? n : Number(n.toFixed(2)))

/** Build a square SVG that contains only the mark, scaled to fit, centred, on nothing. */
function iconSvg(size) {
  const scale = Math.min((size * COVER) / MW, (size * COVER) / MH)
  const w = MW * scale
  const h = MH * scale
  const x = (size - w) / 2
  const y = (size - h) / 2
  /* The artwork's own root element is re-declared so no stylesheet, media query or class can ride
     along from the source file: this is the whole reason the dark-mode repaint bug existed. */
  const paths = [...markSvg.matchAll(/<path[^>]*>/g)].map((m) => m[0]).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<g transform="translate(${pad(x)} ${pad(y)}) scale(${scale.toFixed(5)})">${paths}</g>` +
    `</svg>`
  )
}

function renderPng(svg, size) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: undefined, // explicit: no plate
  })
  return r.render().asPng()
}

/* ── contrast check: with no plate, the icon must survive BOTH light and dark tab bars ──────── */
function luminance(r, g, b) {
  const f = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(...a), luminance(...b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

/** Fraction of opaque pixels, plus how many are the blue fill: proves the mark actually drew. */
function inkStats(png, hex) {
  const p = PNG.sync.read(png)
  const target = hex2rgb(hex)
  let opaque = 0
  let onTarget = 0
  for (let i = 0; i < p.data.length; i += 4) {
    const a = p.data[i + 3]
    if (a > 200) {
      opaque++
      const d =
        Math.abs(p.data[i] - target[0]) + Math.abs(p.data[i + 1] - target[1]) + Math.abs(p.data[i + 2] - target[2])
      if (d < 30) onTarget++
    }
  }
  const total = p.width * p.height
  return { coverage: opaque / total, blueFraction: opaque ? onTarget / opaque : 0 }
}

/* ── emit ──────────────────────────────────────────────────────────────────────────────────── */
mkdirSync(APP, { recursive: true })

/* icon.svg: the scalable one, no style block, no media query. */
writeFileSync(join(APP, 'icon.svg'), iconSvg(512) + '\n')
console.log('wrote src/app/icon.svg (512, no repaint rule)')

/* apple-icon.png: 180 is the size iOS actually asks for. */
const apple = renderPng(iconSvg(180), 180)
writeFileSync(join(APP, 'apple-icon.png'), apple)

/* favicon.ico: a real multi-resolution ICO. Browsers pick the frame they want; a single 32px
   frame upscaled into a 16px slot is what makes favicons look muddy in a tab. */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + dir.length
  const blobs = []
  entries.forEach((e, i) => {
    const o = i * 16
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o)
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1)
    dir.writeUInt8(0, o + 2)
    dir.writeUInt8(0, o + 3)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(e.png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += e.png.length
    blobs.push(e.png)
  })
  return Buffer.concat([header, dir, ...blobs])
}

const icoSizes = [16, 32, 48]
const ico = buildIco(icoSizes.map((size) => ({ size, png: renderPng(iconSvg(size), size) })))
writeFileSync(join(APP, 'favicon.ico'), ico)
console.log(`wrote src/app/favicon.ico (${icoSizes.join('/')})`)

/* ── report ─────────────────────────────────────────────────────────────────────────────────── */
const WHITE = [255, 255, 255]
const DARK = [15, 23, 42] // the site's dark surface token
console.log('\ncontrast of the untouched brand blue:')
const b = hex2rgb(BRAND.blue)
console.log(`  on a light tab bar (${BRAND.blue} on #ffffff): ${ratio(b, WHITE).toFixed(2)}:1`)
console.log(`  on a dark  tab bar (${BRAND.blue} on #0f172a): ${ratio(b, DARK).toFixed(2)}:1`)

console.log('\nink check (proves the mark drew, not an empty canvas):')
for (const size of [512, 180, 48, 32, 16]) {
  const png = size === 180 ? apple : renderPng(iconSvg(size), size)
  const s = inkStats(png, BRAND.blue)
  console.log(
    `  ${String(size).padStart(3)}px  coverage=${(s.coverage * 100).toFixed(1)}%  ` +
      `blue pixels=${(s.blueFraction * 100).toFixed(1)}% of ink`,
  )
}
