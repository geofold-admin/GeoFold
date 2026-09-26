'use client'

import { useEffect, useRef } from 'react'

/**
 * The survey grid, drawn as a live elevation model.
 *
 * ADAPTED FROM REACT BITS' "GridRise", not copied. That component is Pro-tier: it is not in the
 * public repo (which carries only its poster frame) and the registry endpoint wants a license key,
 * so there is no source to copy even if copying were the right approach. What its preview shows is
 * an isometric field of blocks at different heights, rising and falling in a wave, driven by a
 * smooth function. That IDEA is what is built here, against this product's own material.
 *
 * WHY IT BELONGS ON THIS SITE, which is the part that matters. A grid of blocks rising in waves is
 * a decoration on most sites. Here it is a picture of the actual product: an elevation model, the
 * thing a survey team produces and the thing GeoFold's exports are built from. The height function
 * is not random noise, it is a sum of two sine waves, which is what a smooth terrain surface looks
 * like when you sample it on a regular grid. The high points get a contour ring, because that is
 * how a surveyor reads a surface. So the effect carries information rather than merely moving.
 *
 * HOUSE RULES, the same ones SurveyField documents at length:
 *   - no endless loop: it runs only while the element is on screen AND the tab is visible, and it
 *     stops entirely under `prefers-reduced-motion` after drawing one static frame
 *   - DPR capped at 2, because a 3x canvas on a phone costs 2.25x the fill for no visible gain
 *   - aria-hidden and pointer-events:none, so it can never eat a tap
 *   - it reads the container's size rather than assuming one, and re-reads it on resize
 *
 * WHY CANVAS AND NOT DOM NODES. GridRise renders a block per cell as elements. At the cell counts
 * that look right on a wide screen that is several hundred nodes, each with its own transform, all
 * animating: a layout and compositing cost the effect does not need. This draws the same picture in
 * one canvas with no layout at all, and it is the only way the thing stays smooth on the mid-range
 * Android phones this product's users actually carry into the field.
 */

/** Cell size in CSS pixels at the base density. Smaller = denser grid. */
const CELL = 46
/** How far a cell can rise, as a fraction of CELL. */
const RISE = 0.42
/** Horizontal drift of the wave, radians per second. */
const SPEED = 0.55

export function ElevationGrid({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const host = canvas.parentElement
    if (!host) return

    /* Bind to non-nullable locals. The guards above narrow the types, but the narrowing does not
       survive into the closures below (resize, draw, loop), which TypeScript correctly refuses to
       assume: the values are captured by reference and it cannot prove they stay non-null. Rebinding
       to consts after the checks is the honest fix and costs nothing at runtime. */
    const el = canvas
    const c = ctx
    const box = host

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0
    let h = 0
    let cols = 0
    let rows = 0
    let dpr = 1
    let raf = 0
    let running = false
    let t = 0
    let visible = false
    let onScreen = false

    /** Read the palette from CSS so the effect follows the theme instead of hard-coding colours.
     *
     *  READ FROM THE SECTION, NOT FROM THE FIELD. The `--mk-deep-*` tokens are declared on
     *  `.mk-sec-dark`; custom properties inherit DOWN the tree, so reading them off the field div
     *  would work only because it is a descendant. Reading from the section is explicit about where
     *  the values come from, and it keeps working if the field is ever moved out of the band.
     *
     *  THE DEEP-BAND TOKENS, NOT THE PAGE ONES. This field is mounted inside `.mk-sec-dark`, which
     *  is a dark band in BOTH themes, so it needs the values that are correct on that band. Reading
     *  `--mk-line` / `--mk-faint` would have drawn the light theme's near-black hairlines on a
     *  near-black background: an invisible field, in light mode only, which is exactly the kind of
     *  bug that ships because the page was reviewed in the theme the reviewer prefers. The
     *  `--mk-deep-*` tokens are the band's own, with the accent already adjusted for readability
     *  against it. The fallbacks match those literals.
     */
    function palette() {
      const source = box.closest('.mk-sec-dark, .pg-sec-dark') ?? box
      const cs = getComputedStyle(source)
      const line = cs.getPropertyValue('--mk-deep-line').trim() || '#1E293B'
      const ink = cs.getPropertyValue('--mk-deep-prose').trim() || '#C3CEDC'
      const accent = cs.getPropertyValue('--mk-deep-accent').trim() || '#7FA8E8'
      return { line, ink, accent }
    }

    /**
     * The surface. Two sine waves at different frequencies, summed: one long swell and one shorter
     * ripple. This is the standard way to fake a plausible terrain, and unlike random noise it is
     * continuous, so neighbouring cells agree about their height and the result reads as ground
     * rather than as static.
     */
    function heightAt(cx: number, cy: number, time: number) {
      const a = Math.sin((cx * 0.55 + time) * 0.9)
      const b = Math.sin((cy * 0.42 - time * 0.7) * 1.4)
      const c = Math.sin((cx * 0.18 + cy * 0.22 + time * 0.35) * 0.6)
      return (a * 0.45 + b * 0.33 + c * 0.22) // roughly -1..1
    }

    function resize() {
      const rect = box.getBoundingClientRect()
      w = Math.max(1, Math.round(rect.width))
      h = Math.max(1, Math.round(rect.height))
      /* Cap at 2. Above that the extra pixels cost real fill rate and show nothing. */
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      el.style.width = `${w}px`
      el.style.height = `${h}px`
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(w / CELL) + 1
      rows = Math.ceil(h / CELL) + 1
    }

    function draw(time: number) {
      const { line, ink, accent } = palette()
      c.clearRect(0, 0, w, h)

      /* The graticule: the fixed reference lines the cells sit on. Drawn first and always, so the
         surface reads as being measured rather than floating. */
      c.strokeStyle = line
      c.lineWidth = 1
      c.beginPath()
      for (let i = 0; i <= cols; i++) {
        const x = Math.round(i * CELL) + 0.5
        c.moveTo(x, 0)
        c.lineTo(x, h)
      }
      for (let j = 0; j <= rows; j++) {
        const y = Math.round(j * CELL) + 0.5
        c.moveTo(0, y)
        c.lineTo(w, y)
      }
      c.stroke()

      /* The surface. One pass, so cells cannot overlap each other's outlines. */
      const pad = CELL * 0.26
      const size = CELL - pad * 2

      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const hv = heightAt(i, j, time) // -1..1
          const lift = hv * RISE * CELL
          const x = i * CELL + pad
          const y = j * CELL + pad - lift

          /* Height becomes alpha, which is what makes this read as a surface: the high ground is
             solid, the low ground recedes, and no colour is invented to carry the information. */
          const a = 0.06 + (hv + 1) * 0.12

          if (hv > 0.72) {
            /* A summit gets a ring: the same mark a surveyor draws on a contour map. */
            c.strokeStyle = accent
            c.globalAlpha = 0.5
            c.lineWidth = 1.4
            c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, size, size)
          } else {
            c.strokeStyle = ink
            c.globalAlpha = a
            c.lineWidth = 1
            c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, size, size)
          }
        }
      }
      c.globalAlpha = 1
    }

    function loop() {
      if (!running) return
      t += 0.016 * SPEED * 3
      draw(t)
      raf = requestAnimationFrame(loop)
    }

    function start() {
      if (running || reduce) return
      running = true
      raf = requestAnimationFrame(loop)
    }

    function stop() {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    /** Runs only when both conditions hold. Either one alone is not enough. */
    function sync() {
      if (visible && onScreen) start()
      else stop()
    }

    const onVisibility = () => {
      visible = !document.hidden
      sync()
    }

    resize()
    /* One frame immediately, so the section is never empty even under reduced motion or before the
       observer has fired. */
    draw(0)

    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0]?.isIntersecting ?? false
        sync()
      },
      { rootMargin: '120px' },
    )
    io.observe(box)

    let resizeTimer = 0
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        resize()
        draw(t)
      }, 140)
    }

    visible = !document.hidden
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resize', onResize, { passive: true })

    return () => {
      stop()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
      window.clearTimeout(resizeTimer)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
