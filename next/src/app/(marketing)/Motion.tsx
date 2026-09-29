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

  /* ==================================================================================
     THE CARD SPOTLIGHT — adapted from React Bits' SpotlightCard.

     WHAT THE ORIGINAL DOES. It attaches `onMouseMove` to the card, reads the element's rect,
     and writes `--mouse-x` / `--mouse-y` on every event so a radial gradient can follow the
     pointer. That is the right idea with one expensive detail: it re-reads
     `getBoundingClientRect()` per event, and a `mousemove` fires up to ~120 times a second, so
     the layout read is the cost, not the gradient.

     WHAT THIS DOES INSTEAD. The rect is cached on `pointerenter` and the writes are batched into
     one `requestAnimationFrame`. So per frame there is ONE style write and ZERO layout reads —
     and the listener is removed entirely on `pointerleave`, so a card the reader has moved away
     from costs nothing at all. The gradient itself is CSS (§17l).

     IT IS NOT WIRED ON TOUCH. `pointerenter` fires on touch too, but a spotlight that follows a
     finger the reader is not hovering is meaningless, and on a phone the hover state sticks
     after the tap. The `hover: hover` media query is the gate, checked once here.

     IT IS NOT WIRED UNDER REDUCED MOTION either — the wash still appears (it is a state, and
     §17l keeps it), but it does not track, because a light that follows the pointer IS motion. */
  useGSAP(
    () => {
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      const cards = Array.from(document.querySelectorAll<HTMLElement>('.pg-cell'))
      const teardown: Array<() => void> = []

      for (const card of cards) {
        let rect: DOMRect | null = null
        let raf = 0
        let nx = 0
        let ny = 0

        const apply = () => {
          raf = 0
          card.style.setProperty('--spot-x', `${nx}px`)
          card.style.setProperty('--spot-y', `${ny}px`)
        }
        const onEnter = () => {
          /* One layout read per entry, not per move. */
          rect = card.getBoundingClientRect()
        }
        const onMove = (e: PointerEvent) => {
          if (!rect) rect = card.getBoundingClientRect()
          nx = e.clientX - rect.left
          ny = e.clientY - rect.top
          if (!raf) raf = requestAnimationFrame(apply)
        }
        const onLeave = () => {
          if (raf) cancelAnimationFrame(raf)
          raf = 0
          /* The cached rect goes with the pointer: the card may be resized or scrolled while
             the reader is elsewhere on the page. */
          rect = null
        }

        card.addEventListener('pointerenter', onEnter)
        card.addEventListener('pointermove', onMove)
        card.addEventListener('pointerleave', onLeave)
        teardown.push(() => {
          if (raf) cancelAnimationFrame(raf)
          card.removeEventListener('pointerenter', onEnter)
          card.removeEventListener('pointermove', onMove)
          card.removeEventListener('pointerleave', onLeave)
        })
      }

      return () => teardown.forEach((fn) => fn())
    },
    { dependencies: [pathname], revertOnUpdate: true },
  )

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
              /* `fromTo`, NOT `from` — see the note above section 3 for the measured reason. */
              return gsap.fromTo(self.chars,
                { yPercent: 110, opacity: 0 },
                {
                  yPercent: 0,
                  opacity: 1,
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
              /* `fromTo`, NOT `from` — see the note above section 3 for the measured reason. */
              return gsap.fromTo(self.lines,
                { yPercent: 105 },
                {
                  yPercent: 0,
                  duration: 0.75,
                  ease: EASE,
                  stagger: 0.08,
                  scrollTrigger: { trigger: el, start: 'top 88%', end: 'bottom top', toggleActions: 'play none none none' },
                })
            },
          }),
        )
      })

      /* ---------- 3. the general-purpose fade-up ----------
         `fromTo`, NOT `from`, AND THAT IS THE FIX FOR A MEASURED BUG.

         `gsap.from()` DOES NOT STORE AN END VALUE. It records the element's CURRENT value when
         the tween is first rendered and treats that as the destination — which is what makes
         `.from()` so convenient, and what made it silently wrong here.

         MEASURED. The two `.pg-price-card` elements sat at `opacity: 0` through the entire page,
         at every scroll offset. Instrumented on the built page:
           · the ScrollTrigger fired correctly (progress 0.009 → 0.676, `isActive: true`)
           · the tween existed and completed (`duration 0.74`, `paused: false` → gone)
           · and the element still computed `opacity: 0`, because forcing the tween to its END
             (`t.progress(1)`) ALSO produced `opacity: 0` — the tween's recorded destination was
             zero, not one.
         A decisive experiment confirms the mechanism: a manual `gsap.fromTo(card, {opacity: 0},
         {opacity: 1})` on the same element resolves to `opacity: 0.999`. Same element, same
         stylesheet, same instant — only the tween form differs.

         WHY THE DESTINATION BECAME ZERO. Something calls `ScrollTrigger.refresh()` after the
         from-tweens have already applied their start state — there are three candidates and all
         three are legitimate: `document.fonts.ready`, the guard at the end of this effect, and
         any resize. On refresh, GSAP re-reads the element to re-derive the destination, and the
         element is BY THEN wearing the start state (`opacity: 0` written as an inline style). So
         the tween is rebuilt as `0 → 0` and the content is gone for good. It affects whichever
         elements happen to be mid-reveal at refresh time, which is why it looked arbitrary:
         `.pg-stats` was fine and `.pg-price` was not, on the same page, with identical markup
         patterns.

         THE FIX STATES BOTH ENDS, so there is nothing left to re-derive. `fromTo` is also the
         more honest description of what a reveal IS — a named start and a named end — and it is
         immune to the refresh order because neither value is read from the DOM.

         THE SAME CHANGE IS APPLIED TO EVERY REVEAL IN THIS FILE (sections 1–5). They share the
         failure mode exactly; fixing only the two cards that happened to be measured would leave
         the rest to fail on a different page height, a different font-load timing, or a slower
         device. */
      document.querySelectorAll<HTMLElement>('[data-anim="up"]').forEach((el) => {
        gsap.fromTo(el,
          { y: 26, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            ease: EASE_SOFT,
            delay: Number(el.dataset.animDelay ?? 0),
            scrollTrigger: { trigger: el, start: 'top 90%', end: 'bottom top', toggleActions: 'play none none none' },
            onComplete: () => el.classList.add('anim-done'),
          })
      })

      /* ---------- 4. staggered children ---------- */
      document.querySelectorAll<HTMLElement>('[data-anim="stagger"]').forEach((el) => {
        gsap.fromTo(Array.from(el.children),
          { y: 22, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.6,
            ease: EASE_SOFT,
            /* `grid: 'auto'` lets GSAP infer rows and columns from the CSS grid, so a 2x2 of
               cards ripples diagonally rather than firing as one flat list. */
            stagger: { each: 0.07, from: 'start', grid: 'auto' },
            scrollTrigger: { trigger: el, start: 'top 88%', end: 'bottom top', toggleActions: 'play none none none' },
            onComplete: () => el.classList.add('anim-done'),
          })
      })

      /* ---------- 5. capability rows: copy and figure arrive apart ---------- */
      document.querySelectorAll<HTMLElement>('[data-anim="row"]').forEach((el) => {
        const copy = el.querySelector('.pg-row-copy')
        const art = el.querySelector('.pg-row-art')
        gsap
          .timeline({ scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom top', toggleActions: 'play none none none' } })
          .fromTo(copy, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: EASE })
          .fromTo(art, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: EASE }, '<0.08')
      })

      /* ---------- 6. the steps rail ----------
         THE PIN WAS REMOVED, AND THAT IS A FIX RATHER THAN A SIMPLIFICATION.

         This block used to create a `pin` on `[data-scene-fixed]` with `pinSpacing: false`.
         Two measured facts say it should not exist in this skin:

         1. THE CURRENT DESIGN IS NOT A PINNED SCENE. `minimal.css` §6 states it outright:
            `.pg-scene { display: block; position: static; min-height: 0 }` and
            `.pg-scene-fixed { position: static; top: auto }`. The pinned layout belonged to the
            retired skin; the Corporate Minimalist brief is a plain stacked section. So the pin was
            moving an element the design had already declared static.

         2. THE PIN'S RANGE WAS INVERTED, so it was a no-op that still cost something. Measured:
            scene box 369px tall in a 900px viewport, `start: 'top 20%'` resolved to scroll 2892
            and `end: 'bottom 80%'` to scroll 2721 — the end BEFORE the start. ScrollTrigger does
            not report that; it simply never activates. But creating a pin inserts a `.pin-spacer`
            and re-measures the document, and with `pinSpacing: false` the document does not even
            grow back — so every trigger created BEFORE it kept a start position measured against
            geometry that no longer existed.

         MEASURED CONSEQUENCE OF (2), which is what turned this from untidy into a bug: after a
         full scroll of the built page, the two `.pg-price-card` elements inside
         `[data-anim="stagger"]` were still at `opacity: 0` — invisible — at every scroll offset,
         through a resize, through a forced `ScrollTrigger.refresh()`. The pricing section was
         simply not on the page for a reader who scrolled to it.

         WHAT IS KEPT: the step highlighting. `is-active` on the step under the reading line and
         the `NN / NN` readout are real information about where the reader is in the sequence, and
         neither needs a pin — they only need a trigger per step, which is what remains below. The
         rail's progress fill is written the same way it was. */
      const scene = document.querySelector<HTMLElement>('[data-scene]')
      if (scene && window.matchMedia('(min-width: 1000px)').matches) {
        const steps = Array.from(scene.querySelectorAll<HTMLElement>('[data-scene-step]'))
        const readout = scene.querySelector<HTMLElement>('[data-scene-readout]')
        const rail = scene.querySelector<HTMLElement>('[data-scene-steps]')

        if (steps.length > 0) {
          steps.forEach((step, i) => {
            ScrollTrigger.create({
              trigger: step,
              start: 'top 62%',
              end: 'bottom 62%',
              onToggle: (self) => {
                step.classList.toggle('is-active', self.isActive)
                /* The rail carries a position readout rather than a progress bar, the same
                   instrument idiom the rest of the site uses. */
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


      /* ==================================================================================
         THE INVISIBLE-CONTENT GUARD. This is a BUG FIX, not a safety net, and here is the
         measurement that makes it one.

         Every reveal above is a `gsap.from()` driven by a ScrollTrigger with
         `toggleActions: 'play none none none'`. That is the right default — it plays once and
         never reverses — but it has one failure mode that is silent and total: if the trigger's
         start position is never crossed, the FROM state stays applied and the element remains at
         `opacity: 0` FOREVER. It does not look broken; it looks like the content is not there.

         MEASURED on the built page after the reveal system was un-pinned from CSS (§14): after a
         full scroll to the bottom, **2 elements were still at opacity 0** — both `.pg-price-card`
         inside `[data-anim="stagger"]` on the landing page. Everything else resolved. The cause is
         the PINNED SCENE above: `[data-scene]` pins its fixed column with `pinSpacing: false`, and
         a pin changes the document's layout under ScrollTrigger's feet, so a trigger created
         before that pin measures a start position that no longer exists once the pin engages.
         ScrollTrigger normally refreshes on its own; when the pin's own start and the dependent
         trigger's start are close together, the refresh can leave the dependent one behind its
         position and it never fires.

         THE GUARD IS NOT "ANIMATE EVERYTHING IMMEDIATELY". It is a deferred check that only acts
         on elements which are BOTH past their trigger point AND still hidden — so it cannot
         fire early, and it cannot un-hide something the reader has not reached. It runs once,
         1.2s after the fonts settle (the same point the refresh above happens), and it is
         idempotent: an element already revealed has no inline opacity:0 to clear.

         WHY NOT `once: true` ON THE TRIGGER, OR A LONGER `end`? Both were considered. `once`
         does not change WHEN the trigger fires, only that it does not re-fire. A longer `end`
         extends the range AFTER the start, and the start is what is being missed. The guard
         addresses the actual condition — "this element is on screen and still invisible" —
         rather than moving the goalposts around it. */
      const revealGuard = window.setTimeout(() => {
        ScrollTrigger.refresh()
        const stuck: HTMLElement[] = []
        for (const el of document.querySelectorAll<HTMLElement>('[data-anim]')) {
          const targets =
            el.getAttribute('data-anim') === 'stagger'
              ? Array.from(el.children) as HTMLElement[]
              : [el]
          for (const t of targets) {
            if (parseFloat(getComputedStyle(t).opacity) >= 0.99) continue
            const r = t.getBoundingClientRect()
            /* Past its start point (the trigger uses 'top 88%'/'top 90%') and inside the
               document — i.e. the reader has already scrolled to where it should have played. */
            const past = r.top < window.innerHeight * 0.88
            const onPage = r.bottom > 0 && r.height > 0
            if (past && onPage) stuck.push(t)
          }
        }
        if (stuck.length) {
          gsap.set(stuck, { opacity: 1, y: 0, clearProps: 'transform' })
          for (const t of stuck) t.classList.add('anim-done')
          /* Named in the console so a future regression is findable rather than mysterious. */
          console.warn(
            `[Motion] ${stuck.length} reveal(s) never fired and were released by the guard:`,
            stuck.map((t) => t.className),
          )
        }
      }, 1200)

      /* Fonts change line breaking, which changes every ScrollTrigger start position measured
         before they landed. autoSplit handles the splits; this handles everything else. */
      document.fonts?.ready.then(() => ScrollTrigger.refresh())

      return () => {
        window.clearTimeout(revealGuard)
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
