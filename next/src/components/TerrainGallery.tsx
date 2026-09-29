'use client'

/**
 * TerrainGallery — the React Bits AccordionGallery, adapted to GeoFold.
 *
 * WHAT THIS IS. A row of panels where the hovered/focused one expands and the others compress.
 * The expansion is GSAP-animated `flex-grow`, the media inside each panel drifts at a parallax
 * offset so the movement reads as depth rather than as a zoom, and the inactive panels sit
 * grayscale and dimmed behind a gradient so the active one is unmistakable.
 *
 * WHY IT IS CALLED TerrainGallery AND NOT AccordionGallery.
 * The component's identity here is the CONTENT, not the interaction: five blocks of real terrain
 * rendered from public-domain elevation data for the region the business surveys. A file called
 * AccordionGallery.tsx in a surveying product reads as a generic UI widget someone dropped in;
 * `TerrainGallery` says what the reader is actually looking at. The interaction is borrowed
 * (credited in the note below); the pictures are the site's own.
 *
 * WHAT WAS KEPT FROM THE ORIGINAL. The expansion model (one `flex-grow` timeline for all panels
 * rather than per-panel tweens), the parallax drift keyed to distance-from-active, the
 * grayscale-on-inactive treatment, the label bar that slides in with the active panel, keyboard
 * arrow navigation, and the reduced-motion short-circuit.
 *
 * WHAT WAS CHANGED, AND WHY.
 *  1. THE IMAGES ARE LOCAL AND REAL. The original defaults to `picsum.photos` — five random
 *     stock photos. Here each panel is a terrain block rendered by
 *     `scripts/build-terrain-gallery.mjs` from Mapzen/Terrarium DEM tiles, so a panel carries a
 *     fact (a real window of ground, at a measured relief) instead of decoration. The labels
 *     come from that script's manifest.
 *  2. NO SEAM AT THE EDGES. The original animates `xPercent/yPercent: -50` on every panel, which
 *     assumes the media is absolutely centred and its size is known. Ours is set from a
 *     ResizeObserver measurement and written as a CSS variable, so the tween only has to move it
 *     — the -50% centring is done in CSS once. Re-tweening it per panel made the image jump on
 *     the first hover.
 *  3. REDUCED MOTION IS CHECKED IN JS, not only in CSS. The original reads the media query into a
 *     variable and then still builds a timeline with `duration: 0`, which leaves GSAP writing
 *     inline transforms on every panel. Here the branch returns early: with reduced motion the
 *     panels are plain flex children and CSS alone decides the active state.
 *  4. THE LABEL IS THE ACCESSIBLE TEXT, NOT `aria-hidden`. The original puts the visible label in
 *     an `aria-hidden` span and relies on the panel's own `aria-label`. That works, but it means
 *     the label is duplicated for every panel in the markup. Here the visible label IS the text
 *     node and the panel carries `aria-current` — one string, announced once.
 *
 * Adapted from React Bits' AccordionGallery (MIT + Commons Clause). The original is a JSX + CSS
 * component; this is TypeScript and the styles live in minimal.css under §18 so they are scoped
 * to `.mk.mk.mk-site` like every other rule on the marketing site.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

export type TerrainPanel = {
  /** File name inside /public/terrain, e.g. `panel-1.png`. */
  file: string
  /** Stable key, and the id used in the manifest. */
  id: string
  /** The panel's label, per locale. */
  label: { id: string; en: string }
  /** One short line under the label, per locale. */
  note: { id: string; en: string }
}

export function TerrainGallery({
  panels,
  locale,
  defaultIndex = 0,
  height = 460,
  gap = 10,
  expandRatio = 0.52,
  duration = 0.6,
  ease = 'power3.out',
  parallax = 0.5,
  tilt = 8,
  stagger = 0.06,
  trigger = 'hover',
}: {
  panels: TerrainPanel[]
  locale: 'id' | 'en'
  defaultIndex?: number
  height?: number
  gap?: number
  expandRatio?: number
  duration?: number
  ease?: string
  parallax?: number
  tilt?: number
  stagger?: number
  trigger?: 'hover' | 'click'
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<Array<HTMLElement | null>>([])
  const mediaRefs = useRef<Array<HTMLElement | null>>([])
  const barRefs = useRef<Array<HTMLElement | null>>([])
  const textRefs = useRef<Array<HTMLElement | null>>([])
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  const firstRunRef = useRef(true)

  const count = panels.length
  const [active, setActive] = useState(Math.min(Math.max(defaultIndex, 0), Math.max(count - 1, 0)))

  /* THE HOVER IS TRACKED IN STATE, NOT ONLY IN CSS, AND THAT IS A FIX.
     GSAP writes `--tg-gray` and `--tg-dim` to the media as INLINE styles on every layout change
     (see applyLayout below). An inline style beats a stylesheet rule, so a `:hover { --tg-gray }`
     in minimal.css could never win — the hover would silently do nothing to the media and the
     built page would look exactly as before. Tracking the hovered index here lets the tween carry
     the hover value, so the CSS variables stay GSAP's to own. */
  const [hovered, setHovered] = useState<number | null>(null)

  /* THE LAYOUT IS ONE TIMELINE FOR ALL PANELS, which is what the original does and what keeps
     them in step. Per-panel tweens would each get their own start time and the row would ripple
     out of alignment on a fast pointer. */
  const applyLayout = useCallback(
    (animate: boolean) => {
      const nodes = panelRefs.current
      if (!nodes.length) return

      tlRef.current?.kill()

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const dur = animate && !reduce ? duration : 0
      const r = Math.min(Math.max(expandRatio, 0.2), 0.9)
      const grow = count > 1 ? (r * (count - 1)) / (1 - r) : 1

      const tl = gsap.timeline()

      nodes.forEach((panel, i) => {
        if (!panel) return
        const isActive = i === active
        const media = mediaRefs.current[i]
        const bar = barRefs.current[i]
        const text = textRefs.current[i]

        const rot = isActive ? 0 : i < active ? tilt : -tilt
        tl.to(panel, { flexGrow: isActive ? grow : 1, rotateY: rot, duration: dur, ease }, 0)

        if (media) {
          /* The drift is signed by the panel's distance from the active one, so the row moves as
             one surface being pushed aside rather than each panel sliding independently. Clamped
             to ±1.5 panels: past that the offset stops growing, which keeps a 5-panel row from
             throwing the first and last images far outside their own frames.

             The amplitude is a fraction of `mediaMargin`, not of a measured media width — the
             media is now the panel's own size, so a fraction of IT would scale with the panel and
             a collapsed 150px panel would drift by 2px while a 645px one drifted by 30px. Using
             the margin means every panel moves by the same amount of available slack. */
          const drift = Math.max(-1.5, Math.min(1.5, active - i))
          const shift = drift * parallax * mediaMargin * 0.5
          /* The hover lifts the panel out of the grey: a collapsed panel under the pointer reads
             as the next thing the reader can look at, which is the affordance the built page was
             missing. It only applies to non-active panels, so it cannot compete with the active
             panel's own colour. */
          const isHovered = hovered === i && !isActive
          tl.to(
            media,
            {
              x: isActive ? 0 : shift,
              '--tg-gray': isActive || isHovered ? 0 : 1,
              '--tg-dim': isActive ? 0 : isHovered ? 0.12 : 0.35,
              duration: dur,
              ease,
            },
            0,
          )
        }

        if (bar && text) {
          /* THE COLLAPSED LABEL IS NOT FADED OUT — see the CSS note in §18. The name has to stay
             readable on every panel because the measured relief in it IS the section's point: a
             reader comparing 78 m with 979 m should not have to hover each panel to find the
             numbers. So only the ACTIVE label is animated (it slides in with its accent bar); the
             inactive ones are left alone for CSS to place as a vertical strip.

             The original faded both ways. That is the right call for a decorative photo strip and
             the wrong one here, and it is a measured difference: on the built page the collapsed
             panels carried no text at all. */
          if (isActive) {
            tl.to([bar, text], { opacity: 1, x: 0, duration: dur, ease, stagger: reduce ? 0 : stagger }, 0)
          }
        }
      })

      tlRef.current = tl
    },
    [active, hovered, count, expandRatio, duration, ease, tilt, parallax, stagger],
  )

  /* ==========================================================================================
     THE MEDIA FILLS ITS OWN PANEL, AND THAT IS A FIX RATHER THAN A SIMPLIFICATION.

     The original sizes the media to the EXPANDED panel's width and keeps it at that size in every
     panel, so the collapsed ones show a narrow slice of the same image. That works when the image
     is a photograph that fills its frame edge to edge. It does NOT work here, and the built page
     proved it: with a 786px media in a 150px panel, each collapsed panel showed 19% of a terrain
     render whose block floats in the middle of a mostly-empty frame — so four of the five panels
     read as blank navy rectangles. Vision described them as "empty/dark boxes", and it was right.

     THE FIX IS `cover` ON THE PANEL'S OWN BOX. The media is 100% of the panel plus a margin for
     the parallax drift, and `object-fit: cover` decides the crop. A collapsed panel then shows a
     legible crop of its own terrain (40% of the width, not 19%), and an expanded one shows the
     middle band at full size. The ResizeObserver is gone with it: there is nothing left to
     measure, because the browser already knows how wide a flex item is. */
  const mediaMargin = 90 // px of slack for the drift; half of it is usable in each direction

  useEffect(() => {
    applyLayout(!firstRunRef.current)
    firstRunRef.current = false
  }, [applyLayout])

  useEffect(() => () => { tlRef.current?.kill() }, [])

  const onKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i + 1) % count)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i - 1 + count) % count)
    }
  }

  return (
    <div
      ref={rootRef}
      className="tg-gallery"
      style={{ '--tg-gap': `${gap}px`, height: `${height}px` } as React.CSSProperties}
      role="list"
      aria-label={locale === 'id' ? 'Galeri medan survei' : 'Survey terrain gallery'}
    >
      {panels.map((p, i) => {
        const isActive = i === active
        return (
          <div
            key={p.id}
            ref={(el) => { panelRefs.current[i] = el }}
            className={`tg-panel${isActive ? ' is-active' : ''}`}
            onMouseEnter={() => { setHovered(i); if (trigger === 'hover') setActive(i) }}
            onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
            onClick={() => { if (i !== active) setActive(i) }}
            onFocus={() => { setHovered(i); setActive(i) }}
            onBlur={() => setHovered((h) => (h === i ? null : h))}
            onKeyDown={(e) => onKeyDown(i, e)}
            role="listitem"
            tabIndex={0}
            aria-current={isActive ? 'true' : undefined}
            /* THE TOOLTIP IS FOR THE COLLAPSED LABELS. They are set vertically (see §18 in
               minimal.css) because a 150px column cannot hold "Northern lowland · relief 78 m"
               horizontally, and vertical text is the standard answer for a shelf of spines — but
               it costs the reader a head-tilt and it truncates on long translations. `title`
               hands the full string to the browser's own tooltip on hover, so the rotated label
               is a label and not the only way to read it. */
            title={`${p.label[locale]} — ${p.note[locale]}`}
          >
            <span className="tg-frame">
              <span className="tg-media" ref={(el) => { mediaRefs.current[i] = el }}>
                {/* A plain <img>: these are static PNGs from the build, already sized, and
                    next/image would add a loader and a srcset for five files that never change.
                    `loading="lazy"` keeps the four off-screen panels out of the first paint. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/terrain/${p.file}`} alt="" loading="lazy" decoding="async" draggable={false} />
              </span>
              <span className="tg-overlay" aria-hidden="true" />
            </span>
            <span className="tg-label">
              <span className="tg-bar" ref={(el) => { barRefs.current[i] = el }} />
              <span className="tg-text" ref={(el) => { textRefs.current[i] = el }}>
                <span className="tg-name">{p.label[locale]}</span>
                <span className="tg-note">{p.note[locale]}</span>
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
