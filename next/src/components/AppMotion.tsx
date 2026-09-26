'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { usePathname } from 'next/navigation'

gsap.registerPlugin(useGSAP)

/**
 * The signed-in app's motion layer: the dashboard, records, projects and subscription pages.
 *
 * WHY THIS IS A SEPARATE FILE FROM Motion.tsx, AND WHY IT IS SO MUCH SMALLER.
 * The marketing site's motion system is built to sell: headlines split into characters, scenes pin
 * and scrub, a survey field leans away from the cursor. None of that belongs here. This is a tool
 * somebody uses in the field, often on a phone, often in a hurry, sometimes one-handed in the sun.
 * Motion that entertains a visitor is noise to someone trying to read a coordinate. So the dials
 * are lower on purpose and every effect below is chosen for what it tells the user rather than for
 * how it looks:
 *
 *   1. ENTRANCE. The page settles rather than snapping in. This exists because these screens load
 *      their data asynchronously, and a panel that fades up reads as "this arrived" instead of
 *      "this was always here and is empty". It is deliberately short (0.4s) and it never delays
 *      the content: the elements are visible in the served HTML and GSAP animates FROM a state it
 *      writes itself.
 *   2. COUNT-UP. The three headline numbers in the dashboard hero count up to their value. This
 *      is the one effect here that carries information: it draws the eye to the numbers, which
 *      are the reason the screen exists, and it makes a value that changed since last visit
 *      perceptible. It runs once per number, over 0.6s, and only on digits.
 *   3. SPOTLIGHT. Cards and rows light up under the pointer. Same mechanism as the marketing
 *      site (one delegated listener writing --mx/--my, the glow is a CSS gradient), because the
 *      app and the site should feel like one product. It is the cheapest possible way to make a
 *      dense grid feel responsive to the hand.
 *   4. CONTOUR DRAW. The dashboard hero's contour lines draw themselves in. The survey motif,
 *      used once, on the one screen that greets the user.
 *
 * WHAT IT REFUSES TO DO.
 *
 * - No effect on the map, the camera, or any form control. Those are the working parts; anything
 *   that moves under a finger while someone is placing a survey point is a defect, not polish.
 * - No endless loops. Nothing here repeats.
 * - Nothing on a coarse pointer that assumes a cursor. The spotlight listener is only attached
 *   under `(pointer: fine)`.
 * - Nothing at all under `prefers-reduced-motion: reduce`. The whole thing is inside one
 *   `gsap.matchMedia` branch, so under that preference not one tween is built.
 *
 * THE LAYOUT DOES NOT REMOUNT ON NAVIGATION, so this takes `pathname` as a dependency for the same
 * reason the marketing Motion does: without it, the effect would initialise on whichever page the
 * user signed in to and never run again. See the header of Motion.tsx for the full argument.
 */

/** Content blocks that get the entrance. Ordered: the page settles top-down. */
const BLOCKS = '.hero, .stats, .panel, .filters, .exportbar, .card, .list-row, .subs'

export function AppMotion() {
  const pathname = usePathname()

  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        /* ---------- 1. the entrance ----------
           Only the TOP-LEVEL blocks, not every descendant: animating a container and its children
           multiplies the opacity curves and the result reads as a stutter. `autoAlpha` is used
           rather than `opacity` so the element also gets `visibility: hidden` while it is at zero,
           which keeps it out of the accessibility tree for that fraction of a second and stops a
           screen reader announcing a block the user cannot see yet. */
        const blocks = Array.from(document.querySelectorAll<HTMLElement>(BLOCKS))
        if (blocks.length) {
          gsap.from(blocks, {
            y: 10,
            autoAlpha: 0,
            duration: 0.4,
            ease: 'power2.out',
            /* Capped: a page with twelve cards should not take a second and a half to arrive.
               Past the sixth element the stagger stops growing. */
            stagger: { each: 0.045, from: 'start', amount: Math.min(0.3, blocks.length * 0.045) },
            clearProps: 'transform,opacity,visibility',
          })
        }

        /* ---------- 2. count-up on the headline numbers ----------
           THE HARD PART IS THE TIMING, NOT THE TWEEN. These values arrive from API calls, so at
           mount the element holds a placeholder and the real number lands later. Tweening on mount
           would animate the placeholder and then get overwritten by React.

           So a MutationObserver waits for the element to hold a number and tweens THAT. A value
           that is not a number (a dash, an empty string) is left alone: there is nothing to count
           to.

           THE RACE, AND WHY `lastWritten` EXISTS. The dashboard fills these numbers from two
           separate requests, and they do not arrive together: `.val` can go `—` -> `2` (from the
           projects list) -> `5` (from the usage endpoint a moment later). If the second write
           lands while the first tween is still running, that tween would carry on and finish by
           writing `2` over React's `5`, leaving the user looking at a stale count. So the observer
           compares the current text against the last string THIS code wrote. A mismatch means
           something else owns the value now: the in-flight tween is killed and a fresh one starts
           from the new number. Without that check the bug is silent, intermittent, and shows a
           wrong figure, which is the worst kind of bug a dashboard can have. */
        const vals = Array.from(document.querySelectorAll<HTMLElement>('.stat .val'))
        if (vals.length) {
          const tweens = new Map<HTMLElement, gsap.core.Tween>()
          const lastWritten = new WeakMap<HTMLElement, string>()
          /* The value each element has already finished counting to, so a re-render of the same
             number does not replay the animation. */
          const counted = new WeakMap<HTMLElement, string>()

          const start = (el: HTMLElement) => {
            const raw = (el.textContent ?? '').trim()
            /* Only plain integers. Anything else (a dash, "1.2 GB", an empty placeholder) is left
               as it is: guessing at a suffix would be inventing content. */
            if (!/^\d+$/.test(raw)) return
            if (tweens.has(el)) return
            if (counted.get(el) === raw) return

            const target = Number(raw)
            if (target === 0) return

            const obj = { n: 0 }
            const tw = gsap.to(obj, {
              n: target,
              duration: 0.6,
              ease: 'power2.out',
              onUpdate: () => {
                const s = String(Math.round(obj.n))
                lastWritten.set(el, s)
                el.textContent = s
              },
              /* Written back exactly once at the end, from the original string, so the resting
                 DOM state is byte-identical to what React rendered. */
              onComplete: () => {
                lastWritten.set(el, raw)
                el.textContent = raw
                counted.set(el, raw)
                tweens.delete(el)
              },
            })
            tweens.set(el, tw)
          }

          const onMutate = (el: HTMLElement) => {
            const tw = tweens.get(el)
            if (!tw) {
              start(el)
              return
            }
            const cur = (el.textContent ?? '').trim()
            if (cur !== lastWritten.get(el)) {
              /* Something other than this tween wrote the value. Abandon it rather than let it
                 finish and stamp a stale number over the new one. */
              tw.kill()
              tweens.delete(el)
              start(el)
            }
          }

          vals.forEach((el) => {
            start(el)
            const mo = new MutationObserver(() => onMutate(el))
            /* childList + characterData: React replaces the text node. */
            mo.observe(el, { childList: true, characterData: true, subtree: true })
            /* Bounded: once the values have settled there is nothing left to watch, and an
               observer left running on a dashboard someone leaves open all day is a slow leak. */
            window.setTimeout(() => mo.disconnect(), 15000)
          })
        }

        /* ---------- 3. spotlight on cards and rows ----------
           One delegated listener for the whole page. The pointer's position within the element is
           written as two custom properties; the highlight itself is a radial-gradient in CSS, so
           the compositor does the work and React never re-renders. Pointer-fine only. */
        let spotCleanup: (() => void) | undefined
        if (window.matchMedia('(pointer: fine)').matches) {
          const host = document.querySelector<HTMLElement>('.content') ?? document.body

          const onMove = (e: MouseEvent) => {
            const card = (e.target as HTMLElement)?.closest?.('.pcard, .stat, .list-row, .sub-row') as HTMLElement | null
            if (!card) return
            const r = card.getBoundingClientRect()
            card.style.setProperty('--mx', `${e.clientX - r.left}px`)
            card.style.setProperty('--my', `${e.clientY - r.top}px`)
          }
          const onLeave = (e: MouseEvent) => {
            const card = (e.target as HTMLElement)?.closest?.('.pcard, .stat, .list-row, .sub-row') as HTMLElement | null
            if (card) {
              card.style.removeProperty('--mx')
              card.style.removeProperty('--my')
            }
          }

          host.addEventListener('mousemove', onMove, { passive: true })
          host.addEventListener('mouseout', onLeave, { passive: true })
          spotCleanup = () => {
            host.removeEventListener('mousemove', onMove)
            host.removeEventListener('mouseout', onLeave)
          }
        }

        /* ---------- 4. the hero contours draw themselves in ----------
           The dashboard hero carries contour paths as a background motif. Drawing them is the one
           place the product's own subject matter becomes the animation, which is why it is here
           and nowhere else. `strokeDasharray` is set from each path's real length rather than a
           guessed constant, so paths of different lengths all finish together. */
        const contours = Array.from(document.querySelectorAll<SVGPathElement>('.hero .contour path'))
        let contourTl: gsap.core.Timeline | undefined
        if (contours.length) {
          const tl = gsap.timeline()
          contours.forEach((p, i) => {
            let len = 0
            try {
              len = p.getTotalLength()
            } catch {
              /* getTotalLength throws on a path with no geometry, and on some browsers if the
                 element is not rendered. Fall back to a value long enough to cover the viewBox. */
              len = 900
            }
            gsap.set(p, { strokeDasharray: len, strokeDashoffset: len })
            tl.to(p, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut' }, i * 0.08)
          })
          contourTl = tl
        }

        return () => {
          contourTl?.kill()
          spotCleanup?.()
        }
      })

      /* No branch for reduced motion: the page is simply the page, fully visible, numbers already
         at their values. Nothing needs undoing because nothing was built. */

      return () => mm.revert()
    },
    { dependencies: [pathname], revertOnUpdate: true },
  )

  return null
}
