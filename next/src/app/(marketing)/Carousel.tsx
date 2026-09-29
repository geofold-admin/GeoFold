'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED IN THE MIDNIGHT PASS, and why.
 *
 * 1. THE SLIDES SNAP TO THE CONTENT EDGE, NOT TO THE CENTRE. The track spans a card, and the
 *    slides inside it start at the same left edge as the section's heading. Centring meant the
 *    first slide sat half a gutter to the RIGHT of the heading above it, and at the end of the
 *    track the last slide was pushed past the card's right padding — the one alignment this site
 *    has been careful about everywhere else. `scroll-snap-align: start` with a matching
 *    `scroll-padding-inline-start` is what fixes it, and `positionsFor` now measures the same
 *    thing the browser snaps to instead of measuring the centre.
 *
 * 2. THE TRACK FADES AT BOTH EDGES. A hard edge on a horizontal scroller reads as a clipped
 *    element rather than as content that continues; the mask is what turns "chopped off" into
 *    "there is more". It is drawn by the track's own `mask-image` (see the stylesheet) so a slide
 *    can never paint over it.
 *
 * 3. THE CONTROLS ARE ONE ROW UNDER THE TRACK: an arrow at each end, and the dots with a printed
 *    count between them. The count answers the question a row of dots only implies — "2 / 5" —
 *    and it is `aria-hidden`, because the dots already announce each stop as a tab and a live
 *    readout on every swipe would be noise.
 *
 * 4. THE ARROWS ARE ICONS on a 36px target (44px on a touch pointer), which is the floor every
 *    other control on this site holds itself to.
 */

/** Distance in px within which two computed positions are treated as the same stop. */
const SAME_POSITION = 8

/** How long each slide holds before the carousel advances itself. The client asked for four
 *  seconds in as many words: "auto swap setiap 4 detik sekali". */
const AUTO_ADVANCE_MS = 4000

/**
 * The distinct scroll offsets this track can actually reach, in order.
 *
 * Measured from the slides' own offsets rather than assumed from their count: at any width where
 * more than one slide is visible, several slides collapse onto the same stop, and a control that
 * navigates to a stop the track is already at does nothing when pressed.
 */
function positionsFor(track: HTMLElement): number[] {
  const max = Math.max(0, track.scrollWidth - track.clientWidth)
  const padStart = Number.parseFloat(getComputedStyle(track).paddingInlineStart || '0') || 0
  const seen: number[] = []
  for (const child of Array.from(track.children)) {
    const el = child as HTMLElement
    /* `offsetLeft` is measured against the nearest positioned ancestor — the same element for the
       track and for its children — so subtracting the track's own offset gives the slide's
       position inside the track. The padding is then removed because that is where the browser
       puts a start-aligned snap. */
    const target = Math.round(Math.max(0, Math.min(max, el.offsetLeft - track.offsetLeft - padStart)))
    if (!seen.some((p) => Math.abs(p - target) < SAME_POSITION)) seen.push(target)
  }
  /* Clamp can collapse trailing slides onto the end stop; keep the order, it is already ascending. */
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

  /* ==================================================================================
     AUTO-ADVANCE, 4 SECONDS — the client's number: "auto swap setiap 4 detik sekali".

     THE FOUR RULES IT FOLLOWS, and each one is a reason not to do the obvious thing.

     1. IT STOPS FOR GOOD ON THE FIRST USER INTERACTION. An auto-advancing carousel that
        fights the reader is the classic failure: they swipe back to a slide, and four
        seconds later it takes it away again. WCAG 2.2.2 asks for a mechanism to pause, and
        "stop when they touch it" is the one mechanism that needs no extra button in a
        control strip that is already three elements wide.

     2. IT PAUSES WHILE HOVERED OR FOCUSED. A pointer resting on the card, or a keyboard
        user tabbed into the arrows, means the reader is engaged with it. Advancing under
        them at that moment is the same bug as (1), just slower to notice.

     3. IT DOES NOT RUN AT ALL UNDER `prefers-reduced-motion`. Auto-advancing content is
        motion the reader did not ask for; the preference exists precisely for this.

     4. IT DOES NOT RUN WHEN THERE IS ONLY ONE STOP. Nothing to advance to.

     WHY IT LIVES HERE AND NOT IN CSS. There is no CSS animation that can move a
     scroll-snap track to a position the component had to MEASURE. The stops are derived
     from the real slide offsets (see `positionsFor`), so the advance has to call the same
     `goTo` the arrows do — which also means the auto-advance can never land somewhere a
     dot cannot reach.
     ================================================================================== */
  const [paused, setPaused] = useState(false)
  const [stopped, setStopped] = useState(false)

  /** Any deliberate interaction ends the rotation permanently. */
  const stopForever = useCallback(() => setStopped(true), [])

  useEffect(() => {
    if (stopped || paused) return
    if (stops.length < 2) return
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const id = window.setInterval(() => {
      setStops((current) => {
        if (current.length < 2) return current
        setActive((a) => {
          const next = (a + 1) % current.length
          const track = trackRef.current
          if (track) {
            const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            track.scrollTo({ left: current[next], behavior: reduced ? 'auto' : 'smooth' })
          }
          return next
        })
        return current
      })
    }, AUTO_ADVANCE_MS)

    return () => window.clearInterval(id)
  }, [stopped, paused, stops.length])

  /* The track is focusable so a keyboard user can page it without a pointer at all; the handler
     is only for the arrows that would otherwise scroll the PAGE sideways. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stopForever()
        goTo(Math.max(0, active - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stopForever()
        goTo(Math.min(stops.length - 1, active + 1))
      }
    },
    [active, stops.length, goTo, stopForever],
  )

  const count = stops.length

  return (
    <section
      className="mk-car"
      aria-roledescription="carousel"
      aria-label={label}
      /* A pointer resting on the carousel means the reader is engaged with it, so the
         rotation waits. `onFocus`/`onBlur` cover the keyboard case: a reader who has tabbed
         into the arrows is just as engaged as one who is hovering, and `onFocus` on the
         section catches the track's own tabIndex and every control inside it. */
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}>
      <div
        className="mk-car-track"
        ref={trackRef}
        tabIndex={0}
        role="group"
        aria-label={label}
        onKeyDown={onKeyDown}
        /* A swipe or a drag of the track is the clearest possible "I am driving now". */
        onPointerDown={stopForever}
        onTouchStart={stopForever}
      >
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
            onClick={() => { stopForever(); goTo(Math.max(0, active - 1)) }}
            disabled={active === 0}
            aria-label="Sebelumnya / Previous">
            <ChevronLeft size={17} aria-hidden="true" />
          </button>

          <div className="mk-car-mid">
            <div className="mk-car-dots" role="tablist" aria-label={label}>
              {stops.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  aria-label={`${i + 1} / ${count}`}
                  className={i === active ? 'on' : undefined}
                  onClick={() => { stopForever(); goTo(i) }}
                />
              ))}
            </div>
            <span className="mk-car-count" aria-hidden="true">
              <strong>{active + 1}</strong>
              <span aria-hidden="true">/</span>
              {count}
            </span>
          </div>

          <button
            type="button"
            className="mk-car-arrow"
            onClick={() => { stopForever(); goTo(Math.min(count - 1, active + 1)) }}
            disabled={active === count - 1}
            aria-label="Berikutnya / Next">
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  )
}
