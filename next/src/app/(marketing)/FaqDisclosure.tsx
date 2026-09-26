'use client'

import { useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

/**
 * The FAQ list: one question per row, answer behind a disclosure.
 *
 * WHY THIS EXISTS. The page used to render every answer permanently open — eleven screens of
 * undifferentiated text, measured at 5101px tall on a 1440px viewport. A reader looking for the
 * one question they actually have had to scroll past all of the others to find it, and there was
 * no way to see the shape of what was on offer without reading the whole thing.
 *
 * WHY NOT `<details>`. Native disclosure would have been the smaller change and it works without
 * JavaScript, which this audience needs. It is not used because it cannot animate open: the
 * content pops in at full height, which on a page of this length reads as a jump, and the marker
 * cannot be styled consistently across the browsers this site targets. The trade is accepted
 * knowingly — the answers are still in the HTML for a crawler and for a reader without scripts
 * (nothing is fetched on demand), they are simply collapsed. `<noscript>` below opens them all
 * again for anyone whose JavaScript never arrives, so no answer is ever unreachable.
 *
 * ACCESSIBILITY. Each row is a real button inside a heading, wired to its panel with
 * `aria-expanded` and `aria-controls`. The panel is `role="region"` with `aria-labelledby`, so a
 * screen reader can jump between them. Height animates via a grid row template rather than a
 * measured pixel height, so it cannot desync when the text reflows.
 *
 * THE CURSOR GLOW. Adapted from the free ReactBits BorderGlow component. Two things about that
 * adaptation are deliberate and worth stating, because the first version of this effect was wrong
 * in a way the reader could see:
 *
 *   1. IT IS A BORDER, NOT A FILL. The component's default draws a soft-light mesh gradient across
 *      the whole card. On a 760px-wide FAQ row that reads as the row changing colour under the
 *      cursor, which is exactly the "full" treatment the reader asked to be taken off. Here the
 *      gradient is masked into a ring, so only the edge lights up and the row's own ground never
 *      moves. The mask is the difference between a highlight and a repaint.
 *
 *   2. IT TRACKS THE CURSOR, AND THE ANGLE MATTERS. A flat `:hover` border would be simpler, but a
 *      border that lights up uniformly reads as a state change, while a border that lights up on
 *      the side the cursor is on reads as the cursor casting light. The angle is computed from the
 *      row's centre and written to a custom property, and the CSS conic-gradient reads it.
 *
 * The pointer maths runs on the element's own listener and writes straight to `style`, never to
 * React state, so a pointer moving across a row causes no re-render at all.
 */

/** The row's own glow maths, kept out of the render path. */
function useGlowTracking() {
  const ref = useRef<HTMLDivElement>(null)

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cx = rect.width / 2
    const cy = rect.height / 2

    // How close to the edge, 0 at the centre and 1 at the border. Taken from BorderGlow: the
    // smaller of the two axis ratios decides, so a wide row still reads as "near the edge" only
    // when the cursor is genuinely near one.
    const dx = x - cx
    const dy = y - cy
    let kx = Infinity
    let ky = Infinity
    if (dx !== 0) kx = cx / Math.abs(dx)
    if (dy !== 0) ky = cy / Math.abs(dy)
    const edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1)

    // The angle from the centre to the cursor, in degrees, 0 pointing up.
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90
    if (deg < 0) deg += 360

    el.style.setProperty('--faq-edge', edge.toFixed(3))
    el.style.setProperty('--faq-angle', `${deg.toFixed(1)}deg`)
  }

  /** Leaving drops the glow. */
  function onPointerLeave() {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--faq-edge', '0')
  }

  return { ref, onPointerMove, onPointerLeave }
}

export function FaqDisclosure({
  q,
  a,
  defaultOpen = false,
}: {
  q: string
  /** The answer. May contain markup — the FAQ has lists and links inside several answers. */
  a: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  const panelId = `${id}-panel`
  const buttonId = `${id}-button`
  const glow = useGlowTracking()

  return (
    <div
      className="mk-faq-item"
      data-open={open || undefined}
      ref={glow.ref}
      onPointerMove={glow.onPointerMove}
      onPointerLeave={glow.onPointerLeave}>
      <h3 className="mk-faq-h">
        <button
          type="button"
          id={buttonId}
          className="mk-faq-btn"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}>
          <span className="mk-faq-q">{q}</span>
          <span className="mk-faq-mark" aria-hidden="true" />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className="mk-faq-panel"
        /* The panel stays in the DOM so its text is always in the HTML; `hidden` would take it
           out of the accessibility tree entirely, which is the opposite of what is wanted. */
        inert={open ? undefined : true}>
        <div className="mk-faq-a">{a}</div>
      </div>
    </div>
  )
}
