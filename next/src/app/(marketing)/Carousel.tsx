'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Swipeable carousel, built on CSS scroll-snap rather than a library.
 *
 * The scrolling is entirely native: the track is a horizontally scrollable flex row with
 * `scroll-snap-type`, so a thumb-drag on a phone feels exactly like every other scroller on the
 * device, works before JavaScript loads, and keeps working if it never does. The JavaScript only
 * adds what CSS cannot — knowing which slide is showing, so the dots can reflect it, and moving the
 * track when someone uses the dots or the arrows.
 *
 * That ordering matters on the audience this site is for: field teams on cheap Android phones and
 * patchy connections. A carousel that needs 40 KB of JavaScript to render at all is a carousel that
 * shows nothing on a 3G connection in Kalimantan.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE CONTROLS ARE POSITIONS, NOT SLIDES. This shipped once as "one dot per slide, and the
 * arrows step the active index", and on a desktop it was visibly broken: at 1440px three slides
 * are visible at once, five slides occupy 2293px, and the track only has 853px of travel to give.
 * So slide 0 and slide 1 both resolved to scrollLeft 0, and slides 3 and 4 both resolved to the
 * end stop. Clicking "next" from the first slide asked to scroll to a position it was already at,
 * nothing moved, and the active dot snapped back to where it started — the button looked dead.
 *
 * The fix is to stop pretending each slide gets its own position when it does not. The component
 * now measures the track and derives the set of DISTINCT scroll positions, in order, and the dots
 * and arrows navigate that set. On a phone, where one slide fills the viewport, that is one
 * position per slide and behaves exactly as before. On a desktop it is however many stops the
 * track actually has, which is the honest number: the arrows move, every dot goes somewhere, and
 * no control is ever a no-op. `resize` re-measures, so crossing the breakpoint re-derives it.
 */

/** Distance in px within which two computed positions are treated as the same stop. */
const SAME_POSITION = 8

function positionsFor(track: HTMLElement): number[] {
  const max = Math.max(0, track.scrollWidth - track.clientWidth)
  const seen: number[] = []
  for (const child of Array.from(track.children)) {
    const el = child as HTMLElement
    const centred = el.offsetLeft - (track.clientWidth - el.offsetWidth) / 2
    const target = Math.round(Math.max(0, Math.min(max, centred)))
    if (!seen.some((p) => Math.abs(p - target) < SAME_POSITION)) seen.push(target)
  }
  // Clamp can collapse trailing slides onto the end stop; keep the order, it is already ascending.
  return seen
}

export function Carousel({
  children,
  label,
}: {
  children: ReactNode[]
  /** Accessible name for the region — say what is being paged through. */
  label: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [stops, setStops] = useState<number[]>([])
  const [active, setActive] = useState(0)

  const measure = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    setStops(positionsFor(track))
  }, [])

  // Which stop is nearest the current scroll offset. Derived from scroll position rather than
  // tracked on click, so a swipe, a dot and a keyboard scroll all agree.
  const onScroll = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    setStops((current) => {
      if (current.length === 0) return current
      let nearest = 0
      let best = Infinity
      current.forEach((p, i) => {
        const d = Math.abs(p - track.scrollLeft)
        if (d < best) {
          best = d
          nearest = i
        }
      })
      setActive(nearest)
      return current
    })
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    measure()
    // passive: this listener never calls preventDefault, and saying so keeps scrolling smooth.
    track.addEventListener('scroll', onScroll, { passive: true })
    // Fonts and images settle after first paint and change slide widths, which changes the stops.
    const ro = new ResizeObserver(measure)
    ro.observe(track)
    for (const child of Array.from(track.children)) ro.observe(child)
    return () => {
      track.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [measure, onScroll])

  const goTo = useCallback((index: number) => {
    const track = trackRef.current
    if (!track) return
    setStops((current) => {
      const target = current[index]
      if (target === undefined) return current

      // An explicit `behavior` in scrollTo wins over the `scroll-behavior` CSS property, so the
      // reduced-motion preference has to be read here too — the stylesheet alone cannot honour it.
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

      track.scrollTo({ left: target, behavior: reduced ? 'auto' : 'smooth' })
      return current
    })
  }, [])

  const count = stops.length

  return (
    <section className="mk-car" aria-roledescription="carousel" aria-label={label}>
      <div className="mk-car-track" ref={trackRef}>
        {children.map((child, i) => (
          <div
            className="mk-car-slide"
            key={i}
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${children.length}`}>
            {child}
          </div>
        ))}
      </div>

      {/* One stop means nothing to page through — everything already fits. Rendering arrows that
          can only ever be disabled is worse than rendering none. */}
      {count > 1 && (
        <div className="mk-car-controls">
          <button
            type="button"
            className="mk-car-arrow"
            onClick={() => goTo(Math.max(0, active - 1))}
            disabled={active === 0}
            aria-label="Sebelumnya / Previous">
            ←
          </button>

          <div className="mk-car-dots" role="tablist" aria-label={label}>
            {stops.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`${i + 1} / ${count}`}
                className={i === active ? 'on' : undefined}
                onClick={() => goTo(i)}
              />
            ))}
          </div>

          <button
            type="button"
            className="mk-car-arrow"
            onClick={() => goTo(Math.min(count - 1, active + 1))}
            disabled={active === count - 1}
            aria-label="Berikutnya / Next">
            →
          </button>
        </div>
      )}
    </section>
  )
}
