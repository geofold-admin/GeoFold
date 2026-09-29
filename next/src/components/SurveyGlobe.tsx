'use client'

import { useEffect, useRef } from 'react'
import { SITE_LOCATION } from '@/lib/business'
import { LAND_RINGS } from './land'

/**
 * A globe with real coastlines, drawn in canvas 2D. No marker: see the note in draw().
 *
 * ADAPTED FROM REACT BITS. The reference the brief pointed at — `reactbits-starter/globe-tw` — is a
 * paid Pro block whose source is not distributable, and the free library ships no globe at all.
 * The React Bits skill's own guidance covers this case: when the real source is not available,
 * read the effect and rebuild it in the project's stack rather than pulling a renderer in. The
 * common React Bits globe needs three.js and `@react-three/fiber`; this is canvas 2D with no new
 * dependency, which for one decorative-but-factual object on a marketing page is the right trade —
 * three.js would add roughly 600 KB to the bundle to draw circles.
 *
 * WHAT CHANGED, AND WHY. The first version drew a bare graticule: latitude rings and longitude
 * meridians, with nothing on them. A sphere with no land on it is a diagram of a sphere — it tells
 * a reader "this is a globe" and nothing else, which is why it read as generic. The client asked
 * for it to be better, and the honest fix was not more glow: it was to draw the ACTUAL Earth, so
 * the one marked point sits on a recognisable continent. The coastlines come from Natural Earth's
 * 110m land polygons, simplified and inlined by `scripts/build-land.mjs` — about 1,450 points,
 * which is all a 380px globe can resolve.
 *
 * WHY THIS IS NOT DECORATION (the skill's rule: an effect must carry a fact). A globe spinning for
 * its own sake is noise. This one is ORIENTED to the actual location the business operates from —
 * Sintang, West Kalimantan — so the region it works in faces the viewer on load, and the caption
 * beside it names the place. The orientation is the information.
 *
 * THE DOT IS GONE. The client asked for it twice: "dot orange hilangkan saja". It used to be a
 * reticle in the conversion orange, which was right on a dark sphere and wrong on this one — the
 * band is now the brand's own blue, and an orange target on it read as an alarm. The fact the dot
 * carried (this is where we work) survives in the orientation and the caption.
 *
 * HOW IT IS DRAWN. Each point is rotated around Y (spin) then X (tilt) and projected by dropping
 * Z. Coastlines are filled as closed paths per ring, with the far hemisphere drawn first at low
 * alpha and the near one over it, so the sphere reads as solid without a shader. Points with a
 * positive rotated Z are behind the sphere and are skipped — without that test the far continents
 * would draw on top of the near ones and the ball would flatten.
 *
 * BEHAVIOUR. It rotates slowly on its own. Cursor steering, damping and the hover speed-up were
 * removed with the previous skin, because the current brief bans heavy interaction on decorative
 * objects and this is decoration around a caption. It still pauses off-screen and on a hidden tab,
 * and under `prefers-reduced-motion` it draws exactly one static frame.
 */

/** The place this marks. Read from the one source of truth in lib/business.ts, so the hero's
 *  coordinate readout and this globe can never disagree about where the business works. */
const MARKER = { lat: SITE_LOCATION.lat, lon: SITE_LOCATION.lon, label: SITE_LOCATION.place.id }

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

/* The land rings arrive as flat [lon, lat, lon, lat, ...] arrays. Converted once at module scope
   rather than per frame: this runs 60 times a second for as long as the globe is on screen. */
const LAND = LAND_RINGS.map((ring) => {
  const out: { x: number; y: number; z: number }[] = []
  for (let i = 0; i < ring.length; i += 2) out.push(latLonToXYZ(ring[i + 1], ring[i]))
  return out
})

export function SurveyGlobe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)')
    const line = getComputedStyle(canvas).getPropertyValue('--globe-line').trim() || '#9DB4D4'
    /* The two pigments that used to be literals. They were `rgba(127,168,232,…)` and
       `rgba(10,25,47,.55)` — an atmosphere and a body disc tuned for a midnight band. On the
       light ground this globe now sits on, the body disc would be a near-black ball under a grey
       wireframe, so both are tokens with the old dark values kept as their defaults: the
       component renders identically on the previous skin and correctly on this one. */
    const body = getComputedStyle(canvas).getPropertyValue('--globe-body').trim() || 'rgba(10, 25, 47, .55)'
    const haloInk = getComputedStyle(canvas).getPropertyValue('--globe-halo').trim() || 'rgba(127, 168, 232, .085)'
    /* THE LAND. Two more tokens, and they are what turned this from a diagram of a sphere into a
       diagram of the Earth. Defaults keep the old dark-ground values so the component is still
       self-consistent if it is ever dropped back onto a dark band. */
    const landFill = getComputedStyle(canvas).getPropertyValue('--globe-land').trim() || 'rgba(127, 168, 232, .16)'
    const landLine = getComputedStyle(canvas).getPropertyValue('--globe-land-line').trim() || 'rgba(157, 180, 212, .55)'

    let w = 0
    let h = 0
    let radius = 0
    /* START WITH THE MARKER FACING THE VIEWER — and it did not, until 2026-09-28.
       The old line was `spin = -MARKER.lon * (Math.PI / 180)`, which reads as "rotate to the
       marker's longitude" but is not what the projection wants: measured on the canvas, the
       marker's rotated z came out +0.64, and `draw()` skips any point with z > 0 because that
       is the far hemisphere. The one lit thing on the sphere — the entire reason the globe
       exists — was on the back of it at load, and at the idle spin of 0.0016 rad/frame a
       visitor would have had to watch for about half a minute to see it turn round.

       The projection is `z(s) = x·sin(s) + z·cos(s)`, which is minimised (most negative =
       nearest the viewer) at `s = atan2(-x, -z)`. That is the rest angle, computed from the
       marker itself, so it stays correct if the marker ever moves. */
    const markerXYZ = latLonToXYZ(MARKER.lat, MARKER.lon)
    let spin = Math.atan2(-markerXYZ.x, -markerXYZ.z)
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

      /* ATMOSPHERE. A soft halo outside the limb, so the sphere reads as a body with air
         rather than as a circle of wire. One radial gradient, drawn first, and it is the
         cheapest thing here — a single fill. It also gives the wireframe something to sit
         against on the dark band, where thin blue lines on navy otherwise dissolve. */
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.86, cx, cy, radius * 1.34)
      halo.addColorStop(0, 'rgba(127, 168, 232, 0)')
      halo.addColorStop(0.62, haloInk)
      halo.addColorStop(1, 'rgba(127, 168, 232, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 1.34, 0, Math.PI * 2)
      ctx.fillStyle = halo
      ctx.fill()

      /* THE OCEAN. A wash rather than a solid disc, so the sphere reads as a body without becoming
         a hole in the page. The colour comes from `--globe-body`, which site.css sets per ground:
         the globe sits on the dark argument band, where it is a faint white lift, and the token
         block also carries a light-ground set in case it is ever moved onto paper. */
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fillStyle = body
      ctx.fill()

      // Sphere silhouette, so the ball reads as a body even where no coastline falls.
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = line
      ctx.globalAlpha = 0.42
      ctx.lineWidth = 1
      ctx.stroke()

      /* THE GRATICULE, and it is now the QUIET layer rather than the subject. It used to be the
         entire drawing; with coastlines on top it becomes the surveyor's reference under them, so
         it is drawn at low alpha and never competes. Every 30 degrees, which is the interval a
         real sheet uses, not the 12 meridians the old version drew for symmetry. */
      const GRAT_STEP = 30
      const SEGMENTS = 90
      const gratPoints = (
        points: { x: number; y: number; z: number }[],
        near: boolean,
        strength = 1,
      ) => {
        ctx.beginPath()
        let started = false
        for (const p of points) {
          const r = project(p, cosT, sinT)
          // z > 0 is the far side; skip it so the far lines do not draw over the near ones.
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
        ctx.globalAlpha = (near ? 0.26 : 0.10) * strength
        ctx.lineWidth = 0.75
        ctx.stroke()
      }
      for (const near of [false, true]) {
        for (let lat = -60; lat <= 60; lat += GRAT_STEP) {
          if (lat === 0) continue // drawn below, heavier
          const pts = []
          for (let s = 0; s <= SEGMENTS; s++) pts.push(latLonToXYZ(lat, -180 + (360 * s) / SEGMENTS))
          gratPoints(pts, near)
        }
        for (let lon = -180; lon < 180; lon += GRAT_STEP) {
          const pts = []
          for (let s = 0; s <= SEGMENTS; s++) pts.push(latLonToXYZ(-90 + (180 * s) / SEGMENTS, lon))
          gratPoints(pts, near)
        }
      }

      /* THE EQUATOR, picked out heavier. It is the one line on the sphere that is a fact rather
         than a reference, and drawing it stronger is how a printed sheet signals the same thing.
         `strength` rather than a second code path, so the two passes cannot drift apart. */
      for (const near of [false, true]) {
        const pts = []
        for (let s = 0; s <= SEGMENTS; s++) pts.push(latLonToXYZ(0, -180 + (360 * s) / SEGMENTS))
        gratPoints(pts, near, 3)
      }

      /* ==================================================================================
         THE CONTINENTS.
         ==================================================================================
         Each ring is projected, clipped to the visible hemisphere, and filled. The far side is
         drawn first at low alpha so it reads as being behind the sphere, then the near side over
         it — the same two-pass trick the graticule uses, and the reason the ball reads as solid
         without a depth buffer.

         THE CLIPPING IS THE WHOLE PROBLEM. A coastline ring crosses the limb of the sphere, so
         part of it is on the far side and part on the near. Skipping the far points (as the
         graticule does) would cut a continent in half at the horizon with a hard straight edge.
         Instead each point is projected and then PUSHED ONTO THE LIMB: a point on the far side
         has its x/y normalised out to the sphere's edge, which is exactly where a sphere's
         silhouette sits. The result is a continent that wraps around the horizon and disappears
         over it, which is what a real globe does.

         Rings that end up entirely behind the sphere are skipped outright — otherwise Antarctica
         would draw as a band across the front of the ball. */
      const drawLand = (near: boolean) => {
        for (const ring of LAND) {
          /* Pass one: the FILL. A point on the hidden hemisphere is pulled out to the limb, so the
             silhouette wraps around the sphere's edge instead of ending on a straight chord through
             the middle. This is what makes a filled continent look like it goes over the horizon. */
          const fillPts: { x: number; y: number; z: number }[] = []
          let anyVisible = false
          for (const p of ring) {
            const r = project(p, cosT, sinT)
            const visible = near ? r.z <= 0 : r.z > 0
            if (visible) {
              anyVisible = true
              fillPts.push(r)
            } else {
              const d = Math.hypot(r.x, r.y) || 1
              fillPts.push({ x: r.x / d, y: r.y / d, z: r.z })
            }
          }
          if (!anyVisible || fillPts.length < 3) continue

          ctx.beginPath()
          for (let i = 0; i < fillPts.length; i++) {
            const sx = cx + fillPts[i].x * radius
            const sy = cy + fillPts[i].y * radius
            if (i === 0) ctx.moveTo(sx, sy)
            else ctx.lineTo(sx, sy)
          }
          ctx.closePath()
          ctx.globalAlpha = near ? 1 : 0.30
          ctx.fillStyle = landFill
          ctx.fill()

          /* Pass two: the STROKE, and it CANNOT use the collapsed path above.
             This was a real bug, caught by counting bright pixels on the canvas rather than by
             looking at it: the collapsed path is right for a fill but wrong for a stroke, because
             the segment from a hidden point's real position out to the limb is a straight line
             across the face of the sphere. Stroking it drew chords from every coastline to the
             edge — measured at 22% of the canvas in bright pixels, where real coastlines are a
             few percent. The stroke therefore walks the ring again and only ever draws contiguous
             runs of VISIBLE points, breaking the path wherever the ring goes over the horizon. */
          ctx.beginPath()
          let started = false
          for (const p of ring) {
            const r = project(p, cosT, sinT)
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
          ctx.globalAlpha = near ? 0.9 : 0.24
          ctx.strokeStyle = landLine
          ctx.lineWidth = near ? 0.9 : 0.6
          ctx.stroke()
        }
      }
      drawLand(false)
      drawLand(true)

      /* ==================================================================================
         THE MARKER IS GONE, AND THE CLIENT ASKED FOR IT TWICE OVER.

         "pada globe sepertinya belum benar benar sempurna dan dot orange hilangkan saja" —
         remove the orange dot. It was a reticle: a ring, four ticks, a breathing fill and a
         white pip, drawn in the conversion orange. On the previous skin it was the one lit
         thing on a dark sphere and it earned its place. On this skin the band is the brand's
         own blue and the globe is a light instrument, so an orange target reticle reads as an
         alarm rather than as a location, and it was the only orange anywhere near the section.

         WHAT STILL SAYS "HERE" WITHOUT A DOT. The globe is still ORIENTED to the operating
         region — `spin` is seeded from the site's own coordinates above, so the part of the
         world the business works in faces the viewer on load. The caption beside it names the
         place. So the fact survives the mark, which is the part that mattered; what is gone is
         the pin, and the pin was the thing the client pointed at.
         ================================================================================== */

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

    /* THE FIRST FRAME IS DRAWN SYNCHRONOUSLY, AND THAT IS A BUG FIX.
       The client reported the globe as "kadang putih kadang transparant" — sometimes white,
       sometimes transparent. Measured on the live page: the canvas element was 300x150 (the
       HTML default for a <canvas> with no width/height attribute) with a FULLY TRANSPARENT
       backing store, and `layout()` had not run yet. The component only ever drew from inside
       `requestAnimationFrame`, so between first paint and the first rAF callback the box was
       the wrong size and empty, and the band's blue showed straight through it.
       Whether that is visible depends on when the browser schedules the callback relative to
       the paint, which is exactly why it looked intermittent rather than reliably broken.

       Drawing here means the very first painted frame is the real sphere. The rAF loop still
       takes over for the animation; this only removes the empty window before it starts.
       `draw()` needs no valid `w`/`h` guard of its own — it returns early if layout() failed. */
    draw()

    // Reduced motion: one honest static frame, no loop and no listeners.
    if (reduce.matches) {
      const staticDraw = () => {
        layout()
        draw()
      }
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
