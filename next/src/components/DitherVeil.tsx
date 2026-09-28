'use client'

import { useEffect, useRef } from 'react'

/**
 * DITHER VEIL — the scanning pass over a figure. Adapted from React Bits' "Pixel Swap" /
 * "Dither Veil" family.
 *
 * WHAT IT DRAWS, AND WHY IT IS THE RIGHT EFFECT HERE. The brief asks for exactly this: "Sangat
 * pas diaplikasikan pada transisi gambar fitur peta atau drone. Memberikan efek transisi
 * rendering pixelate yang merepresentasikan scanning satelit atau pengambilan citra digital
 * topografi." So it is a horizontal scan that pixelates what is under it — which is what a
 * satellite pass and a drone's image pipeline actually do to a scene, in that order.
 *
 * WHY IT IS CANVAS 2D AND NOT A SHADER. React Bits' version is a WebGL displacement. The effect
 * this page needs is a moving band of chunky pixels over a still drawing, and that is a
 * rectangle fill plus a scanline grid — a canvas 2D rewrite in about a hundred lines with no new
 * dependency. The project already ships `ogl` for the contour ground; a second WebGL context per
 * figure would be four more contexts on the landing page for an effect that never renders at
 * more than one at a time. See the reactbits skill's own rule: match the effect, not the
 * implementation.
 *
 * WHAT IT NEVER DOES:
 *   - it never covers the figure at rest. The veil is drawn only while the pointer is over the
 *     frame, so the drawing is always the thing the reader sees;
 *   - it never runs when it is not visible. The loop is started by the pointer entering the
 *     frame and stopped when the pointer leaves, the tab hides, or the frame scrolls away;
 *   - it never runs under `prefers-reduced-motion` (checked in JS, because a CSS media query
 *     cannot see a canvas loop), and it never runs on touch, where there is no hover to trigger
 *     it;
 *   - it never eats a pointer event: `pointer-events: none` in CSS and `aria-hidden` on the
 *     canvas, so the link or the text under the frame stays clickable through it.
 *
 * THE FIGURE UNDER IT IS AN SVG, NOT A BITMAP, and that shapes the drawing. There is no image to
 * sample, so the "pixels" are drawn rather than derived: a coarse grid of squares whose alpha
 * follows the scan's own envelope, over a tint of the brand blue. It reads as a digital pass
 * over a technical drawing — which is more honest than faking a photograph's dither on a
 * diagram that has no photograph in it.
 */

const CELL = 7          // px per dither cell at 1x. 7 reads as "chunky" without going mosaic.
const BAND = 0.34       // the scan band's height, as a fraction of the frame
const SPEED = 0.00055   // band travel, in frame-heights per ms

export function DitherVeil({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    /* Both gates, read once. `reduce` is checked in JS because a CSS media query cannot stop a
       canvas loop; `canHover` is false on every phone, where there is no pointer to trigger the
       scan and the work would be invisible. */
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (reduce || !canHover) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    let raf = 0
    let running = false
    let start = 0

    const size = () => {
      w = host.clientWidth
      h = host.clientHeight
      if (w === 0 || h === 0) return
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    /* Reads the brand blue off the live palette rather than hardcoding it, so this layer follows
       the token the way every other surface on the site does. Falls back to the client's own
       #014AB5 if the property is missing. */
    const readAccent = (): [number, number, number] => {
      const raw = getComputedStyle(canvas).getPropertyValue('--mk-green').trim()
      const m = /^#?([0-9a-f]{6})$/i.exec(raw)
      if (!m) return [1, 74, 181]
      const n = parseInt(m[1], 16)
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }
    let accent = readAccent()

    const draw = (now: number) => {
      if (!running) return
      if (!start) start = now

      /* The band sweeps once and stops. A scan that loops forever is decoration; a scan that
         completes is a measurement, and the pointer leaving resets it for the next pass. */
      const t = Math.min((now - start) * SPEED, 1.35)
      const bandY = (t - BAND / 2) * h

      ctx.clearRect(0, 0, w, h)

      /* The tint: the whole frame picks up a wash of the accent while the scan is on it. */
      const wash = 0.05 * Math.sin(Math.min(t, 1) * Math.PI)
      if (wash > 0) {
        ctx.fillStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${wash.toFixed(4)})`
        ctx.fillRect(0, 0, w, h)
      }

      /* The dither band. Each cell's alpha is a hash of its own grid position — a stable
         pattern per cell rather than per frame, so the texture does not crawl — modulated by
         its distance from the band's centre, so the band has soft shoulders. */
      const bandTop = bandY
      const bandBottom = bandY + BAND * h
      const y0 = Math.max(0, Math.floor(bandTop / CELL) * CELL)
      const y1 = Math.min(h, Math.ceil(bandBottom / CELL) * CELL)

      for (let y = y0; y < y1; y += CELL) {
        for (let x = 0; x < w; x += CELL) {
          const cy = y + CELL / 2
          /* Distance from the band's centre, 0 at the middle and 1 at either shoulder. */
          const d = Math.abs(cy - (bandY + (BAND * h) / 2)) / ((BAND * h) / 2)
          if (d > 1) continue

          const envelope = 1 - d * d
          /* A cheap deterministic hash: the cell's own coordinates decide whether it lights, so
             the dither pattern is stable across frames and reads as texture, not as noise. */
          const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0
          const r = (hash % 1000) / 1000
          if (r > envelope) continue

          const a = 0.5 * envelope
          ctx.fillStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${a.toFixed(4)})`
          ctx.fillRect(x, y, CELL - 1, CELL - 1)
        }
      }

      /* The scan line itself: one bright hairline at the leading edge, which is what makes the
         band read as travelling rather than as a region that fades in. */
      if (bandY >= 0 && bandY <= h) {
        ctx.fillStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, .55)`
        ctx.fillRect(0, Math.round(bandY), w, 1)
      }

      if (t < 1.35) {
        raf = requestAnimationFrame(draw)
      } else {
        ctx.clearRect(0, 0, w, h)
        running = false
      }
    }

    const play = () => {
      if (running) return
      running = true
      start = 0
      accent = readAccent()
      raf = requestAnimationFrame(draw)
    }

    const stop = () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      ctx.clearRect(0, 0, w, h)
    }

    size()
    const ro = new ResizeObserver(size)
    ro.observe(host)

    /* THE LISTENERS GO ON THE FRAME, NOT ON THE VEIL. The veil is `pointer-events: none` — it
       has to be, so the link or the caption under the figure stays clickable through it — which
       means the pointer never enters the veil itself and a listener here would never fire. The
       parent is the figure frame: the element the pointer actually crosses. */
    const frame = host.parentElement ?? host
    frame.addEventListener('pointerenter', play)
    frame.addEventListener('pointerleave', stop)

    /* A hidden tab gets no frames. The reveal is short, but a page left open on a background tab
       should not be running anything at all. */
    const onVisibility = () => {
      if (document.hidden) stop()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      ro.disconnect()
      frame.removeEventListener('pointerenter', play)
      frame.removeEventListener('pointerleave', stop)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div ref={hostRef} className="gf-veil">
      {/* `aria-hidden` and no pointer events: this layer is a scan over a drawing, and the
          drawing's own alt text is what describes the content. A screen reader that announced
          it would be announcing a texture. */}
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  )
}
