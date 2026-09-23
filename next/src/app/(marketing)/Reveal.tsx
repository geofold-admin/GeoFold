'use client'

import { useEffect } from 'react'

/**
 * Headless scroll-reveal for `[data-reveal]` elements on the landing page.
 *
 * NOT A WRAPPER COMPONENT, on purpose: wrapping each section in <Reveal> would push every one of
 * them into the client bundle. This mounts once, finds the marked elements, and leaves the
 * sections themselves as server components.
 *
 * FAILS VISIBLE, NOT HIDDEN. The hiding rule in overhaul.css is scoped to `.mk-reveal-ready`,
 * which only this effect adds. If the bundle never arrives, or JS is off, or the observer throws,
 * nothing is ever hidden — the page just renders without the effect. Hiding content in CSS and
 * relying on script to bring it back is how a marketing page ends up blank for the one visitor
 * who most needed to read it.
 */
export function Reveal() {
  useEffect(() => {
    const root = document.querySelector('.mk')
    if (!root) return

    /* Someone who asked for less motion gets the page, not the choreography. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return

    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (targets.length === 0) return

    root.classList.add('mk-reveal-ready')

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          io.unobserve(entry.target)
        }
      },
      /* Fires a little before the element's top edge arrives, so the movement finishes as it
         reaches comfortable reading height rather than starting there. */
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )

    for (const t of targets) io.observe(t)

    return () => {
      io.disconnect()
      root.classList.remove('mk-reveal-ready')
    }
  }, [])

  return null
}
