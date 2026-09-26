'use client'

import { useEffect, useRef } from 'react'

/**
 * A pill that glides behind the navigation, adapted from the free ReactBits PillNav component.
 *
 * WHAT IT DOES. One element, absolutely positioned behind the links, that moves to whichever item
 * the cursor is on and returns to the current page when the cursor leaves. It replaces a static
 * underline, which told the reader where they were but gave no feedback on where they were about
 * to go.
 *
 * WHAT WAS CHANGED FROM THE ORIGINAL, and why:
 *
 *   1. IT DOES NOT BUILD THE NAV. The original PillNav renders its own <nav>, its own logo, its
 *      own items and its own mobile popover, and it pulls in GSAP to do it. This site already has a
 *      nav with working mobile behaviour, a language control, a theme control, a portal button and
 *      an aria-current that the accessibility tests check. Replacing it would mean rebuilding all
 *      of that and re-verifying it, to gain a hover effect. So only the EFFECT is taken: this is a
 *      sibling element that measures the existing links and slides behind them. The nav's markup,
 *      semantics and behaviour are untouched.
 *
 *   2. NO GSAP. The original animates a circle that scales up into the pill, which needs GSAP. Here
 *      the pill is a plain rounded rectangle moved with a CSS transform transition, so it runs on
 *      the compositor, needs no library, and honours prefers-reduced-motion by simply not
 *      transitioning.
 *
 *   3. IT MEASURES RATHER THAN ASSUMES. Positions come from `getBoundingClientRect` on the real
 *      links, so the pill is correct after a font swap, a resize, or a language change that
 *      changes the labels' widths. A ResizeObserver on the list re-measures all three.
 *
 *   4. IT IS DECORATION. `aria-hidden`, no pointer events, and the underline for the current page
 *      is kept in CSS, so nothing about the nav's meaning depends on this element existing. If the
 *      script never runs, the nav is exactly what it was.
 */

export default function NavPill({ selector = '.mk-nav-links' }: { selector?: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const pill = ref.current
    const list = document.querySelector<HTMLElement>(selector)
    if (!pill || !list) return

    const links = [...list.querySelectorAll<HTMLAnchorElement>('a')]
    if (links.length === 0) return

    // No cursor on a touch device, so the pill would only ever show the current page. It would
    // still be a second highlight on top of the underline, so it is left off entirely.
    if (window.matchMedia('(hover: none)').matches) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const listRect = () => list.getBoundingClientRect()

    /** Move the pill to a link, in the list's own coordinate space. */
    const place = (a: HTMLAnchorElement, show: boolean) => {
      const lr = listRect()
      const ar = a.getBoundingClientRect()
      pill.style.width = `${ar.width + 20}px`
      pill.style.height = `${ar.height + 12}px`
      pill.style.transform = `translate3d(${ar.left - lr.left - 10}px, ${ar.top - lr.top - 6}px, 0)`
      pill.style.opacity = show ? '1' : '0'
    }

    const active = () => links.find((a) => a.getAttribute('aria-current') === 'page') ?? null

    // Start on the current page.
    const start = active()
    if (start) place(start, true)

    const onEnter = (a: HTMLAnchorElement) => () => place(a, true)
    const handlers: Array<[HTMLAnchorElement, () => void]> = []

    for (const a of links) {
      const h = onEnter(a)
      a.addEventListener('pointerenter', h)
      handlers.push([a, h])
    }

    const onLeaveList = () => {
      const a = active()
      if (a) place(a, true)
      else pill.style.opacity = '0'
    }
    list.addEventListener('pointerleave', onLeaveList)

    // Re-measure on resize and on any change to the list's own size (a font swap, a label change).
    const re = () => {
      const a = active()
      if (a) place(a, true)
    }
    const ro = new ResizeObserver(re)
    ro.observe(list)
    window.addEventListener('resize', re)

    // The theme toggle and the language control both re-render the nav; a short settle covers the
    // frame between the DOM changing and the browser having laid it out.
    const mo = new MutationObserver(() => requestAnimationFrame(re))
    mo.observe(list, { childList: true, subtree: true, characterData: true })

    if (reduce) pill.style.transition = 'none'

    return () => {
      for (const [a, h] of handlers) a.removeEventListener('pointerenter', h)
      list.removeEventListener('pointerleave', onLeaveList)
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', re)
    }
  }, [selector])

  return <span ref={ref} className="mk-nav-pill" aria-hidden="true" />
}
