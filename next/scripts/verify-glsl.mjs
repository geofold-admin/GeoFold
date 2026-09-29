#!/usr/bin/env node
/**
 * verify-glsl.mjs — catch the backtick trap in HeroTerrain3D before `next build` does.
 *
 * WHY THIS EXISTS. Four separate times in one session, a backtick or a `${` typed inside a
 * `/* ... *​/` comment that lives INSIDE a GLSL template literal terminated the string early. The
 * failure surfaces as `Expected a semicolon` on a line that looks perfectly fine, or as a cascade
 * of TS1005 errors pointing at ordinary prose, and the whole repo's build stops. Each time cost a
 * build cycle to find, and each time the fix was to delete one character.
 *
 * The check is deliberately dumb: between the opening backtick of VERT/FRAG and its closing
 * backtick there must be no other backtick, and no `${` either. It cannot produce a false positive
 * on valid GLSL, because valid GLSL has no reason to contain either.
 *
 * RUN: node scripts/verify-glsl.mjs        (exit 0 = clean, 1 = a stray delimiter was found)
 */
import { readFileSync } from 'node:fs'

const FILES = ['src/components/HeroTerrain3D.tsx']
let bad = 0

for (const file of FILES) {
  const src = readFileSync(file, 'utf8')
  /* Find each `const NAME = \`` and walk forward to the line that is exactly a closing backtick. */
  const re = /^const (\w+) = `(.*)$/gm
  let m
  while ((m = re.exec(src))) {
    const name = m[1]
    const startLine = src.slice(0, m.index).split('\n').length
    const body = m[2]
    /* The opening line is `const X = ` plus the first line of the shader; everything after the
       opening backtick on that line is content. A backtick there would be a stray. */
    if (body.includes('`')) {
      console.error(`FAIL  ${file}:${startLine}  ${name}: stray backtick on the opening line`)
      bad++
      continue
    }
    let i = m.index + m[0].length
    let line = startLine
    let closed = false
    while (i < src.length) {
      const nl = src.indexOf('\n', i)
      if (nl < 0) break
      const text = src.slice(i, nl)
      line++
      /* A line that is exactly a backtick closes the literal. */
      if (text.trim() === '`') {
        closed = true
        break
      }
      if (text.includes('`')) {
        console.error(`FAIL  ${file}:${line}  ${name}: stray backtick inside the shader literal`)
        bad++
      }
      if (text.includes('${')) {
        console.error(`FAIL  ${file}:${line}  ${name}: stray \${ inside the shader literal`)
        bad++
      }
      i = nl + 1
    }
    if (!closed) {
      console.error(`FAIL  ${file}  ${name}: no closing backtick line found`)
      bad++
    }
  }
  console.log(`checked ${file}`)
}

if (bad) {
  console.error(`\n${bad} problem(s). A backtick or \${ inside a GLSL template literal ends the string early.`)
  process.exit(1)
}
console.log('\nPASS  no stray delimiters inside the GLSL literals')
