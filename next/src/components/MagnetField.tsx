'use client'

import { useEffect, useRef } from 'react'

/**
 * A field of survey ticks that swing to face the pointer, like compass needles finding north.
 *
 * ADAPTED FROM REACT BITS' "MagnetLines" — rewritten, not copied. The original mounts one <span>
 * per cell, keeps a permanent `pointermove` listener on `window`, and calls `getBoundingClientRect`
 * on EVERY cell on EVERY move: at 9x9 that is 81 layout reads per event, and the listener never
 * comes off. It also rotates each needle toward the cursor with a hard set, so the field snaps.
 *
 * WHAT WAS KEPT: the idea — a grid of marks that orient toward the pointer.
 * WHAT WAS REDRAWN: the primitive and the physics. A generic grid of bars is decoration; the brief
 * is surveying, so each mark is a ranging rod / survey tick on a graticule, and they are placed on
 * the same module as the rest of the page. The swing is critically damped toward the target angle
 * rather than set, so the field settles instead of snapping.
 *
 * WHY IT IS CHEAP. The rects are measured ONCE per layout (and on resize), not per move. The
 * pointer handler only stores x/y and wakes the loop. The loop runs while anything is still
 * moving and then STOPS — it does not idle at 60fps. Transforms are written straight to the
 * element; React never re-renders.
 *
 * HOUSE RULES IT OBEYS (see the reactbits skill, "Hard requirements"):
 *   - no endless loop: settles and stops
 *   - pauses off-screen (IntersectionObserver) and when the tab is hidden
 *   - `prefers-reduced-motion` checked in JS — draws one static frame and never starts the loop
 *   - cursor effects skipped on touch (`hover: hover` and `pointer: fine`)
 *   - aria-hidden and pointer-events-none, so it never eats a click
 */

const ROWS = 9
const COLS = 15
/** Degrees the needles sit at when nothing is near them — a slight survey-lean, not a grid. */
const BASE_ANGLE = -14
/** How fast a needle swings toward its target, per frame. Critically damped feel. */
const EASE = 0.14
/** Below this many degrees of change across the field, the loop stops. */
const SETTLED = 0.04

export function MagnetField({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const cells = Array.from(wrap.children) as HTMLElement[]
    if (!cells.length) return

    // The listener goes on the SECTION, not on the field. The field is `pointer-events: none` so
    // it can never intercept a click meant for the text or a link behind it — which also means it
    // would never see a pointermove. The section receives every move anyway, so it is the correct
    // place to listen, and the coordinates are converted into the field's own space.
    const host = wrap.closest('section') ?? wrap.parentElement ?? wrap

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)')

    // Per-cell state. `rect` is measured once per layout; `angle` is what is drawn.
    const state = cells.map(() => ({ cx: 0, cy: 0, angle: BASE_ANGLE, target: BASE_ANGLE }))
    const pointer = { x: -9999, y: -9999, active: false }
    let raf = 0
    let visible = false

    const measure = () => {
      // One pass of layout reads, reused by every subsequent move.
      const wrapRect = wrap.getBoundingClientRect()
      for (let i = 0; i < cells.length; i++) {
        const r = cells[i].getBoundingClientRect()
        state[i].cx = r.left + r.width / 2 - wrapRect.left
        state[i].cy = r.top + r.height / 2 - wrapRect.top
      }
    }

    const applyTargets = () => {
      for (let i = 0; i < cells.length; i++) {
        const s = state[i]
        if (!pointer.active) {
          s.target = BASE_ANGLE
          continue
        }
        // atan2 gives the bearing from the cell to the pointer; +90 turns the rod's
        // vertical axis to point along that bearing.
        const dx = pointer.x - s.cx
        const dy = pointer.y - s.cy
        s.target = (Math.atan2(dy, dx) * 180) / Math.PI + 90
      }
    }

    const draw = () => {
      let moving = false
      for (let i = 0; i < cells.length; i++) {
        const s = state[i]
        // Shortest-path easing: without this a needle crossing ±180 spins the long way round.
        let d = s.target - s.angle
        while (d > 180) d -= 360
        while (d < -180) d += 360
        s.angle += d * EASE
        if (Math.abs(d) > SETTLED) moving = true
        cells[i].style.transform = `rotate(${s.angle.toFixed(2)}deg)`
      }
      return moving
    }

    const tick = () => {
      applyTargets()
      const moving = draw()
      // Stop as soon as the field has settled — this is the rule the original breaks.
      if (!moving && !pointer.active) {
        raf = 0
        return
      }
      raf = requestAnimationFrame(tick)
    }

    const wake = () => {
      if (raf || !visible || document.hidden) return
      raf = requestAnimationFrame(tick)
    }

    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect()
      pointer.x = e.clientX - r.left
      pointer.y = e.clientY - r.top
      pointer.active = true
      wake()
    }
    const onLeave = () => {
      pointer.active = false
      pointer.x = -9999
      pointer.y = -9999
      wake()
    }
    const start = () => {
      measure()
      applyTargets()
      draw()
    }

    start()

    // A static frame is all reduced-motion or a touch device gets.
    if (reduce.matches || !canHover.matches) {
      const ro = new ResizeObserver(() => {
        measure()
        applyTargets()
        draw()
      })
      ro.observe(wrap)
      return () => ro.disconnect()
    }

    // Only run while the section is on screen.
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting)
        if (visible) wake()
      },
      { rootMargin: '120px' }
    )
    io.observe(wrap)

    const onVis = () => {
      if (!document.hidden) wake()
    }
    const onResize = () => {
      measure()
      wake()
    }

    host.addEventListener('pointermove', onMove, { passive: true })
    host.addEventListener('pointerleave', onLeave, { passive: true })
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('resize', onResize)

    const ro = new ResizeObserver(onResize)
    ro.observe(wrap)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', onResize)
      io.disconnect()
      ro.disconnect()
    }
  }, [])

  const total = ROWS * COLS

  return (
    <div className={`pg-magnet${className ? ` ${className}` : ''}`} aria-hidden="true">
      <div className="pg-magnet-field" ref={wrapRef}>
        {Array.from({ length: total }, (_, i) => (
          <span className="pg-magnet-rod" key={i} />
        ))}
      </div>
    </div>
  )
}
