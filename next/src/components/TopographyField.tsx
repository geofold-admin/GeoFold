'use client'

import { useEffect, useRef } from 'react'

/**
 * A topographic contour field, adapted from ReactBits' free `Topography` background.
 *
 * WHAT WAS KEPT AND WHAT WAS NOT.
 *
 * Kept, because it is the whole point: the contour idea. The original marches a scalar field and
 * draws a line wherever the field crosses an integer multiple, which is exactly how a real contour
 * map is drawn. Nothing else on the free tier is this directly about the product, so it is the one
 * background worth having.
 *
 * Not kept: the original's animation model. It runs a continuous rAF loop from mount, morphs its
 * control points on a timer, and tracks the pointer with a bump that follows the cursor. Three
 * things in this project's house standard are missing from that, and each was measured rather than
 * assumed when the hero field was written:
 *
 *   - `prefers-reduced-motion` has to be checked in JS before any loop starts. A CSS media query
 *     cannot stop a rAF loop, so a reduced-motion visitor would still pay for every frame.
 *   - the loop has to stop when the canvas is off-screen. This sits in a hero that the reader
 *     scrolls past immediately, and a permanently running GPU program is the most expensive thing
 *     a marketing page can leave switched on.
 *   - device pixel ratio has to be capped. The original caps at 2, which is right, so that is kept.
 *
 * WHAT IS NEW HERE. The palette is read from the CSS custom properties rather than passed as
 * literals, so the field follows the theme instead of being pinned to one. The pointer bump is
 * dropped entirely: the hero already has MagnetField responding to the cursor, and two effects
 * chasing the same pointer reads as noise rather than as depth.
 *
 * This is a decorative layer. It is `aria-hidden`, `pointer-events: none`, and it draws nothing at
 * all under reduced motion: it renders a single static frame instead, so the section still has its
 * ground rather than going flat.
 */

/* The fragment shader. The field is a distance between two points that each travel a closed loop,
   sampled per pixel, and the line is drawn where that distance crosses a whole number. That is a
   contour line, and it is why the result reads as terrain rather than as generic interference. */
const VERTEX = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform float uBands;
uniform float uThickness;
uniform float uScale;
uniform float uOpacity;
uniform float uContrast;
uniform float uMorphAmount;
uniform vec3 uLine;
uniform vec3 uAccent;

out vec4 fragColor;

/* Two harmonics per axis: enough to look organic, few enough to stay smooth and cheap. */
float bez(float t, vec4 c) {
  float w = 6.2831853 * t;
  return 0.5 * (c.x * sin(w) + c.y * cos(w) + c.z * sin(2.0 * w) + c.w * cos(2.0 * w));
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 suv = (uv - 0.5) / max(uScale, 0.001) + 0.5;

  /* The two travelling points. Slow, and offset in phase, so the pattern drifts without ever
     repeating visibly within a visit. */
  float t = iTime * 0.02;
  vec2 a = vec2(bez(suv.x + t, vec4(0.0, 0.0, 0.0, 0.0) + vec4(0.4, 0.6, 0.3, 0.5)),
                bez(suv.y - t, vec4(0.5, 0.4, 0.5, 0.3)));
  vec2 b = vec2(bez(suv.y + t * 0.8, vec4(0.3, 0.5, 0.4, 0.6)),
                bez(suv.x - t * 0.6, vec4(0.6, 0.3, 0.4, 0.5)));

  float fv = distance(a, b);
  float f = fv * uBands;
  float frac = fract(f);
  float lineDist = min(frac, 1.0 - frac);

  /* Screen-space derivative keeps the line one pixel wide at every resolution and zoom, which is
     what stops the field turning into moire on a phone. */
  float aa = fwidth(f) + 0.0001;
  float mask = 1.0 - smoothstep(uThickness - aa, uThickness + aa, lineDist);
  mask = pow(clamp(mask, 0.0, 1.0), max(uContrast, 0.001));

  /* Higher ground reads slightly cooler and denser, so the field has a sense of elevation rather
     than being a flat grid. The accent is the brand blue, used only as a tint on the high ground. */
  float elev = clamp(fv / (uMorphAmount * 2.5 + 0.001), 0.0, 1.0);
  vec3 col = mix(uLine, uAccent, elev * 0.5);

  float alpha = mask * uOpacity;
  fragColor = vec4(col * alpha, alpha);
}
`

/** Reads a CSS custom property off an element and returns it as 0..1 RGB. */
function tokenRgb(el: Element, name: string, fallback: [number, number, number]): [number, number, number] {
  const raw = getComputedStyle(el).getPropertyValue(name).trim()
  const m = /^#?([0-9a-f]{6})$/i.exec(raw)
  if (!m) return fallback
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function TopographyField({ className = '' }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let cleanup: (() => void) | undefined

    /* ogl is imported lazily so it is not in the first-load bundle for visitors who never see the
       section, and so a WebGL failure cannot take the page down with it. */
    void import('ogl')
      .then(({ Renderer, Program, Mesh, Triangle }) => {
        if (disposed) return

        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        let renderer: InstanceType<typeof Renderer>
        try {
          renderer = new Renderer({
            webgl: 2,
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            dpr: Math.min(window.devicePixelRatio || 1, 2),
          })
        } catch {
          /* No WebGL. The section has a CSS ground beneath this layer, so it degrades to that. */
          return
        }

        const gl = renderer.gl
        gl.clearColor(0, 0, 0, 0)
        const canvas = gl.canvas as HTMLCanvasElement
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        canvas.style.display = 'block'
        host.appendChild(canvas)

        /* Colours come from the live theme, read AFTER the canvas is attached, so a theme switch
           is picked up on the next mount rather than being frozen at import time. */
        const line = tokenRgb(host, '--mk-line-field', tokenRgb(host, '--mk-line', [0.6, 0.66, 0.74]))
        const accent = tokenRgb(host, '--mk-green', [0.95, 0.37, 0.1])

        const program = new Program(gl, {
          vertex: VERTEX,
          fragment: FRAGMENT,
          uniforms: {
            iTime: { value: 0 },
            iResolution: { value: new Float32Array([1, 1]) },
            uBands: { value: 7.0 },
            uThickness: { value: 0.012 },
            uScale: { value: 1.35 },
            uOpacity: { value: 0.5 },
            uContrast: { value: 1.6 },
            uMorphAmount: { value: 1.0 },
            uLine: { value: new Float32Array(line) },
            uAccent: { value: new Float32Array(accent) },
          },
        })

        const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

        const resize = () => {
          const w = host.clientWidth
          const h = host.clientHeight
          if (w === 0 || h === 0) return
          renderer.setSize(w, h)
          const res = program.uniforms.iResolution.value as Float32Array
          res[0] = gl.drawingBufferWidth
          res[1] = gl.drawingBufferHeight
        }

        const draw = (time: number) => {
          program.uniforms.iTime.value = time
          renderer.render({ scene: mesh })
        }

        resize()

        /* Reduced motion: one static frame, then stop. The visitor still gets the contour ground,
           they just are not shown it moving. */
        if (reduce) {
          draw(0)
          const ro = new ResizeObserver(resize)
          ro.observe(host)
          cleanup = () => {
            ro.disconnect()
            canvas.remove()
          }
          return
        }

        let raf = 0
        let running = false
        const start = performance.now()

        const loop = (now: number) => {
          raf = requestAnimationFrame(loop)
          draw((now - start) / 1000)
        }

        const play = () => {
          if (running || disposed) return
          running = true
          raf = requestAnimationFrame(loop)
        }
        const pause = () => {
          running = false
          cancelAnimationFrame(raf)
        }

        /* Off-screen stops the GPU work. The hero is scrolled past within a second on most visits,
           so without this the page would render contours for the whole session. */
        const io = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) play()
            else pause()
          },
          { threshold: 0 },
        )
        io.observe(host)

        /* A hidden tab gets no frames either. */
        const onVisibility = () => {
          if (document.hidden) pause()
        }
        document.addEventListener('visibilitychange', onVisibility)

        const ro = new ResizeObserver(resize)
        ro.observe(host)

        cleanup = () => {
          pause()
          io.disconnect()
          ro.disconnect()
          document.removeEventListener('visibilitychange', onVisibility)
          canvas.remove()
        }
      })
      .catch(() => {
        /* A failed import leaves the CSS ground. Nothing to do and nothing to report. */
      })

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [])

  return (
    <div
      ref={hostRef}
      className={`pg-topo${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      /* The layer must never take a click. The canvas is decorative, and a full-section canvas that
         accepts pointer events swallows every click on the section's own controls: measured, the
         field was reporting `pointer-events: auto` and was sitting over the "how it works" copy. */
      style={{ pointerEvents: 'none' }}
    />
  )
}
