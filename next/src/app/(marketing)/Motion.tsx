'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { usePathname } from 'next/navigation'

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

/**
 * The marketing site's motion system. One client component; the sections themselves stay on the
 * server and are driven from here by `data-anim` attributes.
 *
 * MOUNTED IN THE LAYOUT, NOT ON THE PAGE, and that needed one non-obvious thing to work.
 * It used to live inside the landing page, so every effect below existed on `/` and nowhere else:
 * the other ten marketing pages had a scroll-progress bar that never filled, a nav that never
 * condensed, and no click mark. Moving it to the layout fixes that for all of them at once.
 *
 * BUT A LAYOUT DOES NOT REMOUNT ON NAVIGATION. In the App Router the layout persists across
 * routes and only its children are replaced, so an effect with no dependencies runs exactly once,
 * on the first page the visitor lands on. Every `data-anim` element on every page they navigate
 * to afterwards would be looked for before it existed, found nothing, and never animate. The
 * `pathname` dependency below is what makes the effect re-run per route; `revertOnUpdate` makes
 * GSAP revert the previous route's timelines and listeners first, so the two do not stack.
 *
 * TWO RULES THIS FILE KEEPS.
 *
 * 1. NOTHING IS HIDDEN BY CSS. Every entrance below is a `.from()`, so the start state is
 *    written by script and the served HTML is the finished page. With no JS, a failed chunk or
 *    a thrown plugin, the visitor gets the whole site unanimated instead of a blank column.
 *    paper.css has the long version of this argument at the bottom of the file.
 * 2. EVERYTHING IS INSIDE gsap.matchMedia(). Under `prefers-reduced-motion: reduce` not one
 *    timeline is built, the branch simply never runs, so there is no "animate to the same
 *    place instantly" approximation to get subtly wrong. matchMedia also reverts the whole
 *    branch if the preference changes mid-session.
 *
 * ON SPLITTING HEADINGS. SplitText rewrites a heading into per-character spans, which would
 * normally destroy it for a screen reader; GSAP 3.13+ sets `aria-label` to the original string
 * on the split element, so it is still announced as one sentence. `autoSplit: true` re-splits
 * when the web font finishes loading or the box is resized, without it, a headline split
 * against the fallback face keeps the fallback's line breaks forever.
 */

/* One easing and one duration scale for the whole site. Individual tweens vary the numbers, but
   they vary them from here rather than each inventing their own feel. */
const EASE = 'power3.out'
const EASE_SOFT = 'power2.out'

export function Motion() {
  /* The route, as the effect's dependency. A layout persists across navigations, so without this
     the whole system would initialise once and every later page would come up unanimated. See the
     header comment. */
  const pathname = usePathname()

  useGSAP(
    () => {
      const mm = gsap.matchMedia()

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      /* ---------- 1. hero headline: per-character reveal ---------- */
      const splits: SplitText[] = []

      document.querySelectorAll<HTMLElement>('[data-anim="chars"]').forEach((el) => {
        splits.push(
          SplitText.create(el, {
            type: 'lines,chars',
            mask: 'lines',
            autoSplit: true,
            linesClass: 'pg-split-line',
            onSplit(self) {
              return gsap.from(self.chars, {
                yPercent: 110,
                opacity: 0,
                duration: 0.8,
                ease: EASE,
                stagger: { each: 0.012, from: 'start' },
              })
            },
          }),
        )
      })

      /* ---------- 2. section headings: line-by-line under a mask ---------- */
      document.querySelectorAll<HTMLElement>('[data-anim="lines"]').forEach((el) => {
        splits.push(
          SplitText.create(el, {
            type: 'lines',
            mask: 'lines',
            autoSplit: true,
            linesClass: 'pg-split-line',
            onSplit(self) {
              return gsap.from(self.lines, {
                yPercent: 105,
                duration: 0.75,
                ease: EASE,
                stagger: 0.08,
                scrollTrigger: { trigger: el, start: 'top 88%', end: 'bottom top', toggleActions: 'play none none none' },
              })
            },
          }),
        )
      })

      /* ---------- 3. the general-purpose fade-up ---------- */
      document.querySelectorAll<HTMLElement>('[data-anim="up"]').forEach((el) => {
        gsap.from(el, {
          y: 26,
          opacity: 0,
          duration: 0.7,
          ease: EASE_SOFT,
          delay: Number(el.dataset.animDelay ?? 0),
          scrollTrigger: { trigger: el, start: 'top 90%', end: 'bottom top', toggleActions: 'play none none none' },
          onComplete: () => el.classList.add('anim-done'),
        })
      })

      /* ---------- 4. staggered children ---------- */
      document.querySelectorAll<HTMLElement>('[data-anim="stagger"]').forEach((el) => {
        gsap.from(Array.from(el.children), {
          y: 22,
          opacity: 0,
          duration: 0.6,
          ease: EASE_SOFT,
          /* `grid: 'auto'` lets GSAP infer rows and columns from the CSS grid, so a 2x2 of
             cards ripples diagonally rather than firing as one flat list. */
          stagger: { each: 0.07, from: 'start', grid: 'auto' },
          scrollTrigger: { trigger: el, start: 'top 88%', end: 'bottom top', toggleActions: 'play none none none' },
        })
      })

      /* ---------- 5. capability rows: copy and figure arrive apart ---------- */
      document.querySelectorAll<HTMLElement>('[data-anim="row"]').forEach((el) => {
        const copy = el.querySelector('.pg-row-copy')
        const art = el.querySelector('.pg-row-art')
        gsap
          .timeline({ scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom top', toggleActions: 'play none none none' } })
          .from(copy, { y: 30, opacity: 0, duration: 0.7, ease: EASE })
          .from(art, { y: 40, opacity: 0, duration: 0.8, ease: EASE }, '<0.08')
      })

      /* ---------- 6. the pinned scene ---------- */
      const scene = document.querySelector<HTMLElement>('[data-scene]')
      if (scene && window.matchMedia('(min-width: 1000px)').matches) {
        const fixed = scene.querySelector<HTMLElement>('[data-scene-fixed]')
        const steps = Array.from(scene.querySelectorAll<HTMLElement>('[data-scene-step]'))
        const readout = scene.querySelector<HTMLElement>('[data-scene-readout]')
        const rail = scene.querySelector<HTMLElement>('[data-scene-steps]')

        if (fixed && steps.length > 0) {
          ScrollTrigger.create({
            trigger: scene,
            start: 'top 20%',
            end: 'bottom 80%',
            pin: fixed,
            pinSpacing: false,
          })

          steps.forEach((step, i) => {
            ScrollTrigger.create({
              trigger: step,
              start: 'top 62%',
              end: 'bottom 62%',
              onToggle: (self) => {
                step.classList.toggle('is-active', self.isActive)
                /* The pinned column carries a position readout rather than a progress bar, the
                   same instrument idiom the rest of the site uses. */
                if (self.isActive && readout) {
                  readout.textContent = `${String(i + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}`
                }
                /* The rail's fill. Written as a custom property rather than by setting a height
                   directly, so the transition lives in CSS where the reduced-motion query can
                   turn it off: a JS-driven height would animate regardless of that preference. */
                if (self.isActive && rail) {
                  rail.style.setProperty('--scene-progress', String((i + 1) / steps.length))
                }
              },
            })
          })
        }
      }

      /* ---------- 7. counters ----------
         Grouping separators differ between the two languages this site is served in (1.000 in
         Indonesian, 1,000 in English), so the format follows the `lang` the layout stamped on
         the marketing wrapper rather than a hard-coded 'id-ID'. Falls back to the document's own
         language if the wrapper is ever missing. */
      const numberLocale =
        document.querySelector<HTMLElement>('.mk')?.lang || document.documentElement.lang || 'en'
      document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
        const target = Number(el.dataset.count)
        if (!Number.isFinite(target)) return
        const prefix = el.dataset.countPrefix ?? ''
        const suffix = el.dataset.countSuffix ?? ''
        const proxy = { v: 0 }

        gsap.to(proxy, {
          v: target,
          duration: 1.3,
          ease: EASE_SOFT,
          scrollTrigger: { trigger: el, start: 'top 90%', end: 'bottom top', toggleActions: 'play none none none' },
          onUpdate() {
            el.textContent = `${prefix}${Math.round(proxy.v).toLocaleString(numberLocale)}${suffix}`
          },
        })
      })

      /* ---------- 8. the nav condenses once the page has been scrolled ----------
         `end: 'max'`, not `end: 99999`. A numeric end is not one of the forms GSAP documents for
         this value, and the string keyword is the one that means "the end of the scroller". The
         number happened to work for the toggle, but it is the kind of value that turns into a
         silent no-op the moment the maths around it changes, so it is stated properly. */
      const nav = document.querySelector<HTMLElement>('.mk-nav')
      if (nav) {
        ScrollTrigger.create({
          start: 'top -40',
          end: 'max',
          onToggle: (self) => nav.classList.toggle('is-stuck', self.isActive),
        })
      }

      /* ---------- 9. scroll progress ----------
         A hairline readout of how far down the page you are. Adapted from React Bits' scroll
         progress: the original drives a motion value from a React scroll listener, which re-renders
         on every frame. This writes one CSS custom property from GSAP's own ScrollTrigger instead,
         so nothing re-renders and the bar is driven by the same scroll maths as everything else on
         the page. The element is a <div> in the layout, not a wrapper, so no section moves into the
         client bundle to get it. */
      const bar = document.querySelector<HTMLElement>('[data-scroll-progress]')
      if (bar) {
        const fill = bar.firstElementChild as HTMLElement | null
        if (fill) {
          gsap.to(fill, {
            scaleX: 1,
            ease: 'none',
            scrollTrigger: { start: 0, end: 'max', scrub: 0.25 },
          })
        }
      }


      /* Fonts change line breaking, which changes every ScrollTrigger start position measured
         before they landed. autoSplit handles the splits; this handles everything else. */
      document.fonts?.ready.then(() => ScrollTrigger.refresh())

      return () => {
        for (const s of splits) s.revert()
        if (nav) nav.classList.remove('is-stuck')
      }
    })

    /* Reduced motion: no branch is added for it at all, so nothing is built and nothing needs
       undoing. The page is simply the page. */

      return () => mm.revert()
    },
    /* `revertOnUpdate` makes GSAP revert the previous route's timelines and listeners before the
       new route's effect runs. Without it the old ScrollTriggers stay alive, measuring elements
       that no longer exist and, on some routes, pinning a scene that is gone. */
    { dependencies: [pathname], revertOnUpdate: true },
  )

  return null
}
