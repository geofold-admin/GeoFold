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

      /* Fonts change line breaking, which changes every ScrollTrigger start position measured
         before they landed. autoSplit handles the splits; this handles everything else. */
      document.fonts?.ready.then(() => ScrollTrigger.refresh())

      return () => {
        for (const off of magnets) off()
        for (const s of splits) s.revert()
        if (nav) nav.classList.remove('is-stuck')
      }
    })

    /* Reduced motion: no branch is added for it at all, so nothing is built and nothing needs
       undoing. The page is simply the page. */

    return () => mm.revert()
  })

  return null
}
