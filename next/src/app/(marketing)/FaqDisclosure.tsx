'use client'

import { useId, useState } from 'react'
import type { ReactNode } from 'react'

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
 */

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

  return (
    <div className="mk-faq-item" data-open={open || undefined}>
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
