'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * TECH TEXT — the decrypt reveal. Adapted from React Bits' "Decrypted Text".
 *
 * WHAT WAS TAKEN AND WHAT WAS REDRAWN. The original scrambles every character through a React
 * state update on an interval, which re-renders the component on every frame of the reveal. That
 * is fine for one headline and wasteful for a page that has several readouts on it. This one
 * keeps the same visual — characters resolving left to right out of a scramble — but drives it
 * from a single `requestAnimationFrame` loop that writes `textContent` on one span. React renders
 * this component exactly twice: once on mount, once when it finishes.
 *
 * WHY IT SUITS THIS PRODUCT RATHER THAN BEING A NOVELTY. The brief asks for it by name for the
 * coordinate readout: "Sangat cocok digunakan untuk menampilkan efek animasi angka koordinat GPS
 * atau saat memuat data (loading). Efek kriptografi/dekripsi ini sangat memperkuat nuansa
 * 'instrumen ukur teknikal'." A survey instrument resolving a fix is the one place on a marketing
 * page where a character scramble is literally what the hardware does.
 *
 * THE THREE RULES IT KEEPS, each of which the original does not:
 *
 * 1. THE TEXT IS IN THE HTML. The final string is what this component renders on the server and
 *    what it returns to on completion, so with no JavaScript, a failed chunk, or reduced motion,
 *    the visitor reads the coordinate. Nothing is hidden by CSS and nothing is built in an effect.
 *
 * 2. IT IS ANNOUNCED ONCE, AS THE FINAL STRING. The scramble runs inside a `aria-hidden` span and
 *    the real value sits beside it in a visually-hidden one. Without that split a screen reader
 *    would read a stream of garbage characters as the reveal played, which is worse than reading
 *    nothing — and it is exactly the failure the marketing site's SplitText handling also had to
 *    solve, for the same reason.
 *
 * 3. IT PLAYS ONCE, WHEN THE ELEMENT ARRIVES, AND STOPS. Not a loop. Motion here marks a moment
 *    (this readout is live) rather than running forever, which is the rule this codebase applies
 *    to every effect it ships. `prefers-reduced-motion` skips straight to the answer.
 */

/** The scramble alphabet: digits, the coordinate symbols, and a few technical glyphs. */
const GLYPHS = '0123456789°′″NSEW.-+'

type Props = {
  /** The final string. Rendered in the HTML and restored at the end of the reveal. */
  text: string
  /** How long the whole reveal takes, in ms. */
  duration?: number
  /** Delay before it starts, in ms. Used to stagger two readouts on one row. */
  delay?: number
  className?: string
}

export function TechText({ text, duration = 900, delay = 0, className }: Props) {
  const spanRef = useRef<HTMLSpanElement>(null)
  /* `done` starts false and flips true once the reveal finishes. It is not used to hide
     anything: the server renders the final text, and the effect below only ever replaces it
     with the scramble AFTER mount, so the pre-hydration paint is already correct. */
  const [, setDone] = useState(false)

  useEffect(() => {
    const el = spanRef.current
    if (!el) return

    /* Reduced motion: the answer, immediately, with no reveal. Read in JS rather than only in CSS
       because the scramble is scripted text, and a CSS media query cannot see it. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let start = 0
    const chars = text.split('')

    const step = (now: number) => {
      if (!start) start = now
      const elapsed = now - start

      /* Before the delay, hold the resolved string: the element is already showing it from the
         server render, and clearing it early would blank a line of text for no reason. */
      if (elapsed < delay) {
        raf = requestAnimationFrame(step)
        return
      }

      const t = Math.min((elapsed - delay) / duration, 1)
      /* Eased so the reveal decelerates into the answer rather than stopping dead: the last
         characters resolve slowly, which is what makes the effect read as a LOCK rather than as
         a wipe. */
      const eased = 1 - Math.pow(1 - t, 3)
      const resolved = Math.floor(eased * chars.length)

      let out = ''
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i]
        /* Spaces and the separator never scramble: a coordinate that loses its gap between
           latitude and longitude is unreadable at exactly the moment it is being read. */
        if (i < resolved || ch === ' ' || ch === ',') {
          out += ch
        } else if (i === resolved) {
          /* The character currently resolving shows a glyph from the alphabet, so there is a
             moving edge rather than a hard boundary between scrambled and resolved. */
          out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        } else {
          out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        }
      }

      el.textContent = out

      if (t < 1) {
        raf = requestAnimationFrame(step)
      } else {
        /* Land exactly on the source string. Rebuilding it from the per-character pass above
           would leave the resolving position holding a random glyph, which is how these effects
           usually end: one character wrong, permanently. */
        el.textContent = text
        setDone(true)
      }
    }

    raf = requestAnimationFrame(step)

    /* Stop when nobody is looking. A readout that has scrolled off screen has no reason to keep
       a rAF loop alive; the element keeps whatever it has rendered, and the reveal is short
       enough that this is a battery detail rather than a visible one. */
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && raf) {
          cancelAnimationFrame(raf)
          raf = 0
          el.textContent = text
        }
      },
      { threshold: 0 },
    )
    io.observe(el)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      el.textContent = text
    }
  }, [text, duration, delay])

  return (
    <span className={className ? `gf-tech ${className}` : 'gf-tech'}>
      {/* The scramble lives here and is hidden from assistive tech: a screen reader that read
          the intermediate frames would announce a stream of garbage. */}
      <span ref={spanRef} aria-hidden="true">
        {text}
      </span>
      {/* The real value, announced once. It is in the accessibility tree and out of the visual
          one, so it is not a duplicate for a sighted reader. */}
      <span className="mk-visually-hidden">{text}</span>
    </span>
  )
}
