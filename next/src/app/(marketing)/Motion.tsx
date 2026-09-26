'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

/**
 * The landing page's motion system. One client component; the sections themselves stay on the
 * server and are driven from here by `data-anim` attributes.
 *
 * TWO RULES THIS FILE KEEPS.
 *
 * 1. NOTHING IS HIDDEN BY CSS. Every entrance below is a `.from()`, so the start state is
 *    written by script and the served HTML is the finished page. With no JS, a failed chunk or
 *    a thrown plugin, the visitor gets the whole site unanimated instead of a blank column.
 *    paper.css has the long version of this argument at the bottom of the file.
 * 2. EVERYTHING IS INSIDE gsap.matchMedia(). Under `prefers-reduced-motion: reduce` not one
 *    timeline is built — the branch simply never runs — so there is no "animate to the same
 *    place instantly" approximation to get subtly wrong. matchMedia also reverts the whole
 *    branch if the preference changes mid-session.
 *
 * ON SPLITTING HEADINGS. SplitText rewrites a heading into per-character spans, which would
 * normally destroy it for a screen reader; GSAP 3.13+ sets `aria-label` to the original string
 * on the split element, so it is still announced as one sentence. `autoSplit: true` re-splits
 * when the web font finishes loading or the box is resized — without it, a headline split
 * against the fallback face keeps the fallback's line breaks forever.
 */

/* One easing and one duration scale for the whole page. Individual tweens vary the numbers, but
   they vary them from here rather than each inventing their own feel. */
const EASE = 'power3.out'
const EASE_SOFT = 'power2.out'

export function Motion() {
  useGSAP(() => {
    const mm = gsap.matchMedia()

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      /* Set only when the spotlight listener is attached; the cleanup below calls it if present. */
      let spotCleanup: (() => void) | undefined
      /* Same for the tilt listeners. */
      let tiltCleanup: (() => void) | undefined

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
                scrollTrigger: { trigger: el, start: 'top 88%', once: true },
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
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
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
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        })
      })

      /* ---------- 5. capability rows: copy and figure arrive apart ---------- */
      document.querySelectorAll<HTMLElement>('[data-anim="row"]').forEach((el) => {
        const copy = el.querySelector('.pg-row-copy')
        const art = el.querySelector('.pg-row-art')
        gsap
          .timeline({ scrollTrigger: { trigger: el, start: 'top 82%', once: true } })
          .from(copy, { y: 30, opacity: 0, duration: 0.7, ease: EASE })
          .from(art, { y: 40, opacity: 0, duration: 0.8, ease: EASE }, '<0.08')
      })

      /* ---------- 6. parallax, on decorative layers only ----------
         Never on body copy or on a control: it hurts reading and it moves click targets away
         from where the pointer expects them. */
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
        gsap.to(el, {
          yPercent: Number(el.dataset.parallax ?? -8),
          ease: 'none',
          scrollTrigger: { trigger: el.parentElement ?? el, scrub: 0.6 },
        })
      })

      /* ---------- 7. the pinned scene ---------- */
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
                /* The pinned column carries a position readout rather than a progress bar —
                   the same instrument idiom the rest of the site uses. */
                if (self.isActive && readout) {
                  readout.textContent = `${String(i + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}`
                }
                /* The rail's fill. Written as a custom property rather than by setting a height
                   directly, so the transition lives in CSS where the reduced-motion query can
                   turn it off — a JS-driven height would animate regardless of that preference. */
                if (self.isActive && rail) {
                  rail.style.setProperty('--scene-progress', String((i + 1) / steps.length))
                }
              },
            })
          })
        }
      }

      /* ---------- 8. counters ----------
         Grouping separators differ between the two languages this site is served in (1.000 in
         Indonesian, 1,000 in English), so the format follows the `lang` the layout stamped on
         the marketing wrapper rather than a hard-coded 'id-ID'. Falls back to the document's own
         language if the wrapper is ever missing. */
      const numberLocale =
        document.querySelector<HTMLElement>('.mk')?.lang || document.documentElement.lang || 'en'
      /* ---------- 8. counters ---------- */
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
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          onUpdate() {
            el.textContent = `${prefix}${Math.round(proxy.v).toLocaleString(numberLocale)}${suffix}`
          },
        })
      })

      /* ---------- 9. the marquee ----------
         Both rows are in the markup (the second is aria-hidden) rather than cloned here: adding
         a node React does not know about inside a component's subtree is how a hydration
         mismatch or a lost node on re-render happens. */
      const marquee = document.querySelector<HTMLElement>('[data-marquee]')
      if (marquee) {
        const rows = marquee.querySelectorAll('.pg-marquee-row')
        const loop = gsap.to(rows, {
          xPercent: -100,
          duration: 34,
          ease: 'none',
          repeat: -1,
        })
        /* Pausing while offscreen keeps a continuous animation off the compositor for most of
           the page's life. */
        ScrollTrigger.create({
          trigger: marquee,
          start: 'top bottom',
          end: 'bottom top',
          onToggle: (self) => (self.isActive ? loop.play() : loop.pause()),
        })
      }

      /* ---------- 10. magnetic buttons ---------- */
      const magnets: Array<() => void> = []
      document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
        const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: EASE_SOFT })
        const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: EASE_SOFT })

        const move = (e: MouseEvent) => {
          const r = el.getBoundingClientRect()
          /* Capped at a third of the offset so the control never leaves its own hit area — a
             button that outruns the cursor is a button you cannot click. */
          xTo((e.clientX - (r.left + r.width / 2)) * 0.33)
          yTo((e.clientY - (r.top + r.height / 2)) * 0.33)
        }
        const reset = () => {
          xTo(0)
          yTo(0)
        }

        el.addEventListener('mousemove', move)
        el.addEventListener('mouseleave', reset)
        magnets.push(() => {
          el.removeEventListener('mousemove', move)
          el.removeEventListener('mouseleave', reset)
        })
      })

      /* ---------- 11. the nav condenses once the page has been scrolled ---------- */
      const nav = document.querySelector<HTMLElement>('.mk-nav')
      if (nav) {
        ScrollTrigger.create({
          start: 'top -40',
          end: 99999,
          onToggle: (self) => nav.classList.toggle('is-stuck', self.isActive),
        })
      }

      /* ---------- 12. scroll progress ----------
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

      /* ---------- 13. spotlight cards ----------
         A soft highlight that follows the pointer across a card's surface. Adapted from React Bits'
         SpotlightCard: there the position is React state, which re-renders the card on every mouse
         move — fine for one card, wasteful for a grid of them. This is one delegated listener for
         the whole page that writes --mx/--my onto whichever card the pointer is over; the glow is a
         radial-gradient in CSS, so the compositor does the work and React never sees the event.
         Pointer-fine only: on touch there is no hover to follow. */
      if (window.matchMedia('(pointer: fine)').matches) {
        const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-spotlight]'))

        const onMove = (e: MouseEvent) => {
          const card = (e.target as HTMLElement)?.closest?.('[data-spotlight]') as HTMLElement | null
          if (!card) return
          const r = card.getBoundingClientRect()
          card.style.setProperty('--mx', `${e.clientX - r.left}px`)
          card.style.setProperty('--my', `${e.clientY - r.top}px`)
        }
        const onLeave = (e: MouseEvent) => {
          const card = (e.target as HTMLElement)?.closest?.('[data-spotlight]') as HTMLElement | null
          if (!card) return
          // Drop the highlight when the pointer leaves, so it does not stay lit under the last
          // position the cursor happened to be in.
          card.style.removeProperty('--mx')
          card.style.removeProperty('--my')
        }

        document.addEventListener('mousemove', onMove, { passive: true })
        document.addEventListener('mouseout', onLeave, { passive: true })
        spotCleanup = () => {
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseout', onLeave)
          for (const c of cards) {
            c.style.removeProperty('--mx')
            c.style.removeProperty('--my')
          }
        }
      }

      /* ---------- 14. card tilt ----------
         A few degrees of perspective tilt as the pointer crosses a card. Adapted from React Bits'
         TiltedCard: the original maps pointer position to rotateX/rotateY in React state, which
         re-renders per mousemove. This uses GSAP's quickTo, which writes the transform straight to
         the element on the compositor.

         CAPPED AT 4 DEGREES, and no scale. More than that reads as a toy and makes text on the
         card harder to read at the exact moment the visitor is reading it — the tilt is there to
         say "this surface is live", not to be the attraction. Pointer-fine only. */
      if (window.matchMedia('(pointer: fine)').matches) {
        const tilts: Array<() => void> = []
        document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
          const rxTo = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: EASE_SOFT })
          const ryTo = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: EASE_SOFT })

          const move = (e: MouseEvent) => {
            const r = el.getBoundingClientRect()
            const px = (e.clientX - r.left) / r.width - 0.5
            const py = (e.clientY - r.top) / r.height - 0.5
            ryTo(px * 8)   // ±4deg
            rxTo(-py * 8)
          }
          const reset = () => { rxTo(0); ryTo(0) }

          el.addEventListener('mousemove', move)
          el.addEventListener('mouseleave', reset)
          tilts.push(() => {
            el.removeEventListener('mousemove', move)
            el.removeEventListener('mouseleave', reset)
            gsap.set(el, { rotationX: 0, rotationY: 0 })
          })
        })
        tiltCleanup = () => { for (const off of tilts) off() }
      }

      /* Fonts change line breaking, which changes every ScrollTrigger start position measured
         before they landed. autoSplit handles the splits; this handles everything else. */
      document.fonts?.ready.then(() => ScrollTrigger.refresh())

      return () => {
        for (const off of magnets) off()
        for (const s of splits) s.revert()
        if (nav) nav.classList.remove('is-stuck')
        spotCleanup?.()
        tiltCleanup?.()
      }
    })

    /* Reduced motion: no branch is added for it at all, so nothing is built and nothing needs
       undoing. The page is simply the page. */

    return () => mm.revert()
  })

  return null
}
