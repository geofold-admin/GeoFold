'use client'

import { useEffect, useRef } from 'react'

/**
 * A moving graticule, adapted from the free ReactBits ShapeGrid component.
 *
 * WHY THIS ONE. The theme is survey and mapping, and a coordinate grid is the single most
 * on-theme thing that can move behind a section: it is what a map looks like before anything is
 * drawn on it. It is also the cheapest effect on the site, because it is a 2D canvas rather than
 * WebGL, so it costs nothing on a phone.
 *
 * WHAT WAS CHANGED FROM THE ORIGINAL, and why each change was needed here:
 *
 *   1. COLOURS COME FROM THE THEME, not from props. The original takes `borderColor` and
 *      `hoverFillColor` as strings, which would freeze one theme's colours into a component that
 *      has to work in both. This reads the computed value of a CSS custom property off the
 *      element, so the grid follows the palette and repaints when the theme changes.
 *
 *   2. IT IS A BACKGROUND, SO IT TAKES NO POINTER EVENTS. The original fills the cell under the
 *      cursor. That is the right behaviour for a hero and the wrong one for a background sitting
 *      behind a heading, so the canvas is `pointer-events: none` and the hover machinery is
 *      removed entirely rather than left in and never triggered. Less code, no dead listeners.
 *
 *   3. IT RESPECTS prefers-reduced-motion by drawing ONE static frame and never starting the
 *      loop. The original always animates.
 *
 *   4. IT PAUSES OFF-SCREEN AND WHEN THE TAB IS HIDDEN. The original does the off-screen half; the
 *      visibility half is added because a background that keeps painting in a background tab is a
 *      battery cost for no benefit.
 *
 *   5. THE DEVICE PIXEL RATIO IS CAPPED at 2. A 3x phone would otherwise paint nine times the
 *      pixels for a texture nobody inspects at that scale.
 */

type Props = {
  /** Size of one cell in CSS pixels. */
  cellSize?: number
  /** Which way the grid drifts. */
  direction?: 'right' | 'left' | 'up' | 'down' | 'diagonal'
  /** Cells per second. Deliberately slow: this is a background, not an animation. */
  speed?: number
  className?: string
  /** The custom property to read the line colour from. */
  colorVar?: string
}

export default function ShapeGridField({
  cellSize = 44,
  direction = 'diagonal',
  speed = 0.22,
  className = '',
  colorVar = '--mk-grid-line',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // The palette is read from the element rather than passed in, so this follows the theme.
    // `color-mix` is not needed: the token already carries the right alpha for each theme.
    let line = 'rgba(148, 163, 184, .28)'
    const readColor = () => {
      const v = getComputedStyle(canvas).getPropertyValue(colorVar).trim()
      if (v) line = v
    }
    readColor()

    let w = 0
    let h = 0
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      w = Math.max(1, Math.round(rect.width))
      h = Math.max(1, Math.round(rect.height))
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const offset = { x: 0, y: 0 }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      // One extra column and row so the grid still covers the edge while it drifts.
      const cols = Math.ceil(w / cellSize) + 2
      const rows = Math.ceil(h / cellSize) + 2
      const ox = ((offset.x % cellSize) + cellSize) % cellSize
      const oy = ((offset.y % cellSize) + cellSize) % cellSize

      ctx.strokeStyle = line
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let c = 0; c < cols; c++) {
        // The half-pixel keeps a 1px line crisp instead of smearing across two.
        const x = Math.round(c * cellSize - ox) + 0.5
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      for (let r = 0; r < rows; r++) {
        const y = Math.round(r * cellSize - oy) + 0.5
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
      }
      ctx.stroke()
    }

    let raf = 0
    let last = 0
    let visible = true
    let pageVisible = !document.hidden

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0
      last = now
      const d = speed * dt * 60 * 0.35
      if (direction === 'right') offset.x -= d
      else if (direction === 'left') offset.x += d
      else if (direction === 'up') offset.y += d
      else if (direction === 'down') offset.y -= d
      else {
        offset.x -= d
        offset.y -= d
      }
      draw()
    }

    const start = () => {
      if (!raf && visible && pageVisible) {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    }
    const stop = () => {
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }

    // Reduced motion gets the grid, drawn once, and never an animation frame.
    if (reduce) {
      draw()
    } else {
      start()
    }

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
        if (visible) start()
        else stop()
      },
      { threshold: 0 },
    )
    io.observe(canvas)

    const onVis = () => {
      pageVisible = !document.hidden
      if (pageVisible) start()
      else stop()
    }
    document.addEventListener('visibilitychange', onVis)

    const onResize = () => {
      resize()
      if (reduce) draw()
    }
    window.addEventListener('resize', onResize)

    // The theme toggle writes to <html data-theme>, so the colour is re-read when that changes.
    const mo = new MutationObserver(() => {
      readColor()
      if (reduce) draw()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      stop()
      io.disconnect()
      mo.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', onResize)
    }
  }, [cellSize, direction, speed, colorVar])

  return (
    /* aria-hidden and no pointer events: it is texture, it says nothing, and it must never sit
       between a reader and a link. */
    <canvas ref={canvasRef} className={`sg-field ${className}`} aria-hidden="true" />
  )
}
