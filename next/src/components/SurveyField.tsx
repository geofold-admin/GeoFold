'use client'

import { useEffect, useRef } from 'react'

/**
 * The survey field, drawn as a live map.
 *
 * ADAPTED FROM REACT BITS' "Dot Grid" — and rewritten, not copied. The original is a GSAP
 * timeline over ~300 lines that pulls `gsap` plus its InertiaPlugin into the bundle. The motion
 * that is actually wanted here is narrow: points that lean away from the cursor and spring back.
 * Canvas 2D does that in about a hundred lines with no dependency at all, and the project already
 * ships GSAP for the entrance work — this effect must not be the reason a second engine loads.
 *
 * WHAT WAS KEPT: the repulsion feel and the spring-back damping.
 * WHAT WAS REDRAWN: the primitive. A grid of anonymous dots is decoration. The brief for this
 * site is surveying, so the grid is a graticule (thin survey lines), the dots are survey
 * waypoints, and a handful of them are "recorded" — filled, with a tick of the accuracy radius
 * the product actually stores. That turns a generic effect into a picture of the product.
 *
 * THE FACT IT CARRIES: the recorded points are plotted along a transect, and one of them is
 * labelled with the same style of coordinate the app burns into a photo. A visitor who reads
 * nothing else still learns what a GeoFold capture is.
 *
 * HOUSE RULES IT OBEYS (see the reactbits skill, "Hard requirements"):
 *   - no endless loop: the rAF only runs while something is still moving, then stops
 *   - pauses when off-screen (IntersectionObserver) and when the tab is hidden
 *   - `prefers-reduced-motion` checked in JS before any loop starts — it draws one static frame
 *   - device pixel ratio capped at 2
 *   - cursor effects skipped on touch (`hover: hover` and `pointer: fine`)
 *   - the canvas is aria-hidden and pointer-events-none, so it never eats a click
 */

type Point = {
  /** Resting position, in CSS pixels. */
  x: number
  y: number
  /** Current offset from rest. */
  ox: number
  oy: number
  /** Current velocity. */
  vx: number
  vy: number
  /** Recorded waypoints are drawn filled with an accuracy ring. */
  recorded: boolean
}

const REPEL_RADIUS = 132
const REPEL_FORCE = 2600
const SPRING = 0.075
const DAMPING = 0.86
const REST_EPSILON = 0.03

export function SurveyField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)')

    let width = 0
    let height = 0
    let spacing = 0
    let points: Point[] = []
    let pointer: { x: number; y: number } | null = null
    let raf = 0
    let visible = true
    let running = false

    /* Colours are read from the live theme rather than hard-coded, so the field follows the
       light/dark tokens and the accent without a second palette to keep in sync. */
    const readTheme = () => {
      const cs = getComputedStyle(canvas)
      return {
        line: cs.getPropertyValue('--mk-line').trim() || '#e7e7ea',
        accent: cs.getPropertyValue('--mk-green').trim() || '#1b4dff',
        ink: cs.getPropertyValue('--mk-ink').trim() || '#0b0b0c',
      }
    }

    const layout = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      /* Spacing is a fraction of the box so the field reads the same on a phone and on a wide
         hero. A fixed pixel gap turns into either three dots or three hundred. */
      spacing = Math.max(26, Math.min(width, height) / 11)

      const cols = Math.ceil(width / spacing) + 1
      const rows = Math.ceil(height / spacing) + 1

      /* The transect: recorded waypoints are laid on a shallow diagonal, which is how a walked
         survey line actually looks on a map. Deterministic, not random — the same page renders
         the same field every time, and a screenshot of it is stable. */
      const recordedAt = new Set<number>()
      const transect = rows > 2 ? Math.floor(rows * 0.62) : 1
      for (let c = 1; c < cols - 1; c += 2) {
        recordedAt.add(transect * cols + c)
      }

      points = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          points.push({
            x: c * spacing,
            y: r * spacing,
            ox: 0,
            oy: 0,
            vx: 0,
            vy: 0,
            recorded: recordedAt.has(r * cols + c),
          })
        }
      }
    }

    const draw = () => {
      const { line, accent, ink } = readTheme()
      ctx.clearRect(0, 0, width, height)

      /* The graticule first, as hairlines. It is the ground the waypoints sit on. */
      ctx.lineWidth = 1
      ctx.strokeStyle = line
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      for (let x = 0; x <= width; x += spacing) {
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, height)
      }
      for (let y = 0; y <= height; y += spacing) {
        ctx.moveTo(0, Math.round(y) + 0.5)
        ctx.lineTo(width, Math.round(y) + 0.5)
      }
      ctx.stroke()

      /* Then the waypoints. */
      for (const p of points) {
        const x = p.x + p.ox
        const y = p.y + p.oy

        if (!p.recorded) {
          ctx.globalAlpha = 0.5
          ctx.fillStyle = line
          ctx.beginPath()
          ctx.arc(x, y, 1.4, 0, Math.PI * 2)
          ctx.fill()
          continue
        }

        /* A recorded point: the accuracy ring the app stores, then the point itself. The ring
           is the honest detail — it is the same ±m figure the capture screen writes down. */
        ctx.globalAlpha = 0.32
        ctx.strokeStyle = accent
        ctx.beginPath()
        ctx.arc(x, y, 6.5, 0, Math.PI * 2)
        ctx.stroke()

        ctx.globalAlpha = 1
        ctx.fillStyle = accent
        ctx.beginPath()
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fill()

        /* One label, on the third recorded point, in the app's own coordinate idiom. */
        if (p === points.find((q) => q.recorded && q.x > width * 0.42)) {
          ctx.globalAlpha = 0.72
          ctx.fillStyle = ink
          ctx.font = '500 9px ui-monospace, SFMono-Regular, Menlo, monospace'
          ctx.fillText('-0.0234, 109.3421', x + 12, y + 3)
          ctx.globalAlpha = 0.4
          ctx.strokeStyle = accent
          ctx.beginPath()
          ctx.moveTo(x + 5, y)
          ctx.lineTo(x + 10, y)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
    }

    const step = () => {
      raf = 0
      let moving = false

      for (const p of points) {
        if (pointer) {
          const dx = p.x + p.ox - pointer.x
          const dy = p.y + p.oy - pointer.y
          const dist2 = dx * dx + dy * dy
          if (dist2 < REPEL_RADIUS * REPEL_RADIUS && dist2 > 0.01) {
            const dist = Math.sqrt(dist2)
            const push = (1 - dist / REPEL_RADIUS) * REPEL_FORCE
            p.vx += (dx / dist) * push * 0.001
            p.vy += (dy / dist) * push * 0.001
          }
        }

        /* Spring back to rest, with damping. */
        p.vx += -p.ox * SPRING
        p.vy += -p.oy * SPRING
        p.vx *= DAMPING
        p.vy *= DAMPING
        p.ox += p.vx
        p.oy += p.vy

        if (Math.abs(p.ox) < REST_EPSILON && Math.abs(p.oy) < REST_EPSILON && Math.abs(p.vx) < REST_EPSILON && Math.abs(p.vy) < REST_EPSILON) {
          p.ox = 0
          p.oy = 0
          p.vx = 0
          p.vy = 0
        } else {
          moving = true
        }
      }

      draw()

      /* Draw only while something is moving. A pointer sitting still costs nothing, which is the
         whole reason this is not a permanent 60fps loop. */
      if (moving) {
        raf = requestAnimationFrame(step)
      } else {
        running = false
      }
    }

    const kick = () => {
      if (running || !visible || document.hidden) return
      running = true
      raf = requestAnimationFrame(step)
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      kick()
    }
    const onPointerLeave = () => {
      pointer = null
      kick()
    }

    layout()
    draw()

    /* Reduced motion: one honest static frame, no loop, no listeners. */
    if (reduce.matches) {
      const onResizeStatic = () => {
        layout()
        draw()
      }
      window.addEventListener('resize', onResizeStatic)
      return () => window.removeEventListener('resize', onResizeStatic)
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        if (visible) kick()
        else if (raf) {
          cancelAnimationFrame(raf)
          raf = 0
          running = false
        }
      },
      { threshold: 0 },
    )
    io.observe(canvas)

    const onVisibility = () => {
      if (document.hidden) {
        if (raf) {
          cancelAnimationFrame(raf)
          raf = 0
          running = false
        }
      } else {
        kick()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    const onResize = () => {
      layout()
      draw()
      kick()
    }
    window.addEventListener('resize', onResize)

    /* Touch devices have no cursor to repel from, so the work would be invisible. */
    if (canHover.matches) {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      canvas.addEventListener('pointerleave', onPointerLeave)
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}
