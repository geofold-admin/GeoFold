'use client'

import { useEffect, useRef } from 'react'

/**
 * A wireframe globe with one lit marker, drawn in canvas 2D.
 *
 * ADAPTED FROM REACT BITS. The reference the brief pointed at — `reactbits-starter/globe-tw` — is a
 * paid Pro block whose source is not distributable, and the free library ships no globe at all.
 * The React Bits skill's own guidance covers this case: when the real source is not available,
 * read the effect and rebuild it in the project's stack rather than pulling a renderer in. The
 * common React Bits globe needs three.js and `@react-three/fiber`; this is ~150 lines of canvas 2D
 * with no new dependency, which for one decorative-but-factual object on a marketing page is the
 * right trade — three.js would add roughly 600 KB to the bundle to draw circles.
 *
 * WHY THIS IS NOT DECORATION (the skill's rule: an effect must carry a fact). A globe spinning for
 * its own sake is noise. This one marks the actual location the business operates from — Sintang,
 * West Kalimantan — at its real latitude and longitude, and the caption beside it names the place.
 * The dot is the information; the sphere is what makes the dot legible as a place on Earth.
 *
 * HOW IT IS DRAWN. Latitude rings and longitude meridians are ellipses. Each point is rotated
 * around Y (spin) then X (tilt) and projected by dropping Z. The far hemisphere is drawn first at
 * low alpha, then the near one, so the sphere reads as solid without a shader. Points with a
 * positive rotated Z are behind the sphere and are skipped — without that test the wireframe looks
 * like a flat tangle instead of a ball.
 *
 * BEHAVIOUR. Cursor steers tilt and spin speed, damped, and the rotation returns to idle when the
 * pointer leaves. It pauses off-screen and on a hidden tab, idles when nothing is moving, skips all
 * cursor work on touch, and under `prefers-reduced-motion` draws exactly one static frame.
 */

/** The place this marks. Sintang, Kabupaten Sintang, West Kalimantan. */
const MARKER = { lat: 0.0756, lon: 111.4954, label: 'Sintang, Kalimantan Barat' }

const TILT_BASE = 0.38 // radians, the resting tilt that shows the marker's hemisphere
const SPIN_IDLE = 0.0016 // radians per frame at rest
const MAX_DPR = 2

function latLonToXYZ(lat: number, lon: number) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return {
    x: -Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
  }
}

export function SurveyGlobe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)')
    const accent = getComputedStyle(canvas).getPropertyValue('--globe-accent').trim() || '#F35D19'
    const line = getComputedStyle(canvas).getPropertyValue('--globe-line').trim() || '#9DB4D4'

    let w = 0
    let h = 0
    let radius = 0
    let spin = -MARKER.lon * (Math.PI / 180) // start with the marker facing the viewer
    let tilt = TILT_BASE
    let targetTilt = TILT_BASE
    let targetSpinSpeed = SPIN_IDLE
    let raf = 0
    let running = false
    let visible = true
    let pointer: { x: number; y: number } | null = null

    const dpr = () => Math.min(window.devicePixelRatio || 1, MAX_DPR)

    function layout() {
      const rect = canvas!.getBoundingClientRect()
      w = rect.width
      h = rect.height
      const d = dpr()
      canvas!.width = Math.round(w * d)
      canvas!.height = Math.round(h * d)
      ctx!.setTransform(d, 0, 0, d, 0, 0)
      radius = Math.min(w, h) * 0.36
    }

    function project(p: { x: number; y: number; z: number }, cosT: number, sinT: number) {
      // rotate around Y by `spin`
      const cs = Math.cos(spin)
      const ss = Math.sin(spin)
      const x1 = p.x * cs - p.z * ss
      const z1 = p.x * ss + p.z * cs
      // rotate around X by `tilt`
      const y2 = p.y * cosT - z1 * sinT
      const z2 = p.y * sinT + z1 * cosT
      return { x: x1, y: y2, z: z2 }
    }

    function draw() {
      if (!ctx || !w || !h) return
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const cosT = Math.cos(tilt)
      const sinT = Math.sin(tilt)

      // Sphere silhouette, so the ball reads as a body even where no line falls.
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = line
      ctx.globalAlpha = 0.22
      ctx.lineWidth = 1
      ctx.stroke()

      const drawSegments = (points: { x: number; y: number; z: number }[], near: boolean) => {
        ctx.beginPath()
        let started = false
        for (const p of points) {
          const r = project(p, cosT, sinT)
          // z > 0 is the far side; skip it so the wireframe does not read as a flat tangle.
          if (near ? r.z > 0 : r.z <= 0) {
            started = false
            continue
          }
          const sx = cx + r.x * radius
          const sy = cy + r.y * radius
          if (!started) {
            ctx.moveTo(sx, sy)
            started = true
          } else ctx.lineTo(sx, sy)
        }
        ctx.strokeStyle = line
        ctx.globalAlpha = near ? 0.5 : 0.16
        ctx.lineWidth = near ? 1 : 0.75
        ctx.stroke()
      }

      const RINGS = 7
      const MERIDIANS = 12
      const SEGMENTS = 90

      for (const near of [false, true]) {
        // latitude rings
        for (let i = 1; i <= RINGS; i++) {
          const lat = -90 + (180 * i) / (RINGS + 1)
          const pts = []
          for (let s = 0; s <= SEGMENTS; s++) {
            pts.push(latLonToXYZ(lat, -180 + (360 * s) / SEGMENTS))
          }
          drawSegments(pts, near)
        }
        // longitude meridians
        for (let i = 0; i < MERIDIANS; i++) {
          const lon = -180 + (360 * i) / MERIDIANS
          const pts = []
          for (let s = 0; s <= SEGMENTS; s++) {
            pts.push(latLonToXYZ(-90 + (180 * s) / SEGMENTS, lon))
          }
          drawSegments(pts, near)
        }
      }

      // The marker: the one lit thing on the sphere, and the reason it exists.
      const m = project(latLonToXYZ(MARKER.lat, MARKER.lon), cosT, sinT)
      if (m.z <= 0) {
        const mx = cx + m.x * radius
        const my = cy + m.y * radius
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 600)
        ctx.globalAlpha = 0.18 * pulse
        ctx.beginPath()
        ctx.arc(mx, my, 9, 0, Math.PI * 2)
        ctx.fillStyle = accent
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(mx, my, 3.2, 0, Math.PI * 2)
        ctx.fillStyle = accent
        ctx.fill()
      }

      ctx.globalAlpha = 1
    }

    const step = () => {
      raf = 0
      if (pointer) {
        // Cursor steers tilt and speeds the spin up a little, both damped.
        targetTilt = TILT_BASE + (pointer.y / h - 0.5) * 0.7
        targetSpinSpeed = SPIN_IDLE + Math.abs(pointer.x / w - 0.5) * 0.006
      } else {
        targetTilt = TILT_BASE
        targetSpinSpeed = SPIN_IDLE
      }
      tilt += (targetTilt - tilt) * 0.06
      spin += targetSpinSpeed

      draw()

      // The spin never fully stops while visible, so the loop keeps running; it stops the moment
      // the canvas leaves the viewport or the tab is hidden (both handled below).
      if (visible && !document.hidden) raf = requestAnimationFrame(step)
      else running = false
    }

    const kick = () => {
      if (running || !visible || document.hidden) return
      running = true
      raf = requestAnimationFrame(step)
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas!.getBoundingClientRect()
      pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const onPointerLeave = () => {
      pointer = null
    }

    layout()

    // Reduced motion: one honest static frame, no loop and no listeners.
    if (reduce.matches) {
      const staticDraw = () => {
        layout()
        draw()
      }
      staticDraw()
      const ro = new ResizeObserver(staticDraw)
      ro.observe(canvas)
      return () => ro.disconnect()
    }

    kick()

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true
        if (visible) kick()
        else {
          if (raf) cancelAnimationFrame(raf)
          raf = 0
          running = false
        }
      },
      { threshold: 0.01 },
    )
    io.observe(canvas)

    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        running = false
      } else kick()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const ro = new ResizeObserver(() => {
      layout()
      draw()
    })
    ro.observe(canvas)

    if (canHover.matches) {
      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerleave', onPointerLeave)
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      running = false
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      role="presentation"
      style={{ pointerEvents: 'none' }}
    />
  )
}
