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
 */

export function Carousel({
  children,
  label,
}: {
  children: ReactNode[]
  /** Accessible name for the region — say what is being paged through. */
  label: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  // Which slide is nearest the centre. Derived from scroll position rather than tracked on click,
  // so a swipe, a dot and a keyboard scroll all agree.
  const onScroll = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const centre = track.scrollLeft + track.clientWidth / 2
    let nearest = 0
    let best = Infinity
    Array.from(track.children).forEach((child, i) => {
      const el = child as HTMLElement
      const mid = el.offsetLeft + el.offsetWidth / 2
      const distance = Math.abs(mid - centre)
      if (distance < best) {
        best = distance
        nearest = i
      }
    })
    setActive(nearest)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    // passive: this listener never calls preventDefault, and saying so keeps scrolling smooth.
    track.addEventListener('scroll', onScroll, { passive: true })
    return () => track.removeEventListener('scroll', onScroll)
  }, [onScroll])

  const goTo = useCallback((index: number) => {
    const track = trackRef.current
    if (!track) return
    const target = track.children[index] as HTMLElement | undefined
    if (!target) return

    // An explicit `behavior` in scrollTo wins over the `scroll-behavior` CSS property, so the
    // reduced-motion preference has to be read here too — the stylesheet alone cannot honour it.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    track.scrollTo({
      left: target.offsetLeft - (track.clientWidth - target.offsetWidth) / 2,
      behavior: reduced ? 'auto' : 'smooth',
    })
  }, [])

  const count = children.length

  return (
    <section className="mk-car" aria-roledescription="carousel" aria-label={label}>
      <div className="mk-car-track" ref={trackRef}>
        {children.map((child, i) => (
          <div
            className="mk-car-slide"
            key={i}
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${count}`}>
            {child}
          </div>
        ))}
      </div>

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
          {children.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`${i + 1}`}
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
    </section>
  )
}
