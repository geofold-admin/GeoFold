'use client'

import { useEffect, useRef } from 'react'

/**
 * THE ONE GROUND — the contour field that runs behind the whole site.
 *
 * WHY THERE IS ONE. The site used to carry four different background effects: a survey graticule
 * behind the hero, a contour field behind "how it works", a magnet-line field behind the argument
 * band and a shape grid behind the closing section — plus a tinted band and a midnight band, so
 * that consecutive sections each had their own ground. The brief that produced this file asked for
 * the opposite: ONE background for every section, identical everywhere, moving, and made of
 * contour lines. Sections stopped being coloured bands and became cards sitting on that ground.
 *
 * So this replaces all four. It is fixed to the viewport rather than sized to a section, which is
 * what makes it literally the same background at every scroll position: the ground does not change
 * when you cross a section boundary because there are no longer any boundaries to cross.
 *
 * WHAT IT DRAWS. A scalar field sampled per pixel, with a line wherever the field crosses a whole
 * number — how a real contour map is drawn, and the reason it reads as terrain. On top of that it
 * draws an INDEX CONTOUR: every fifth line is heavier, the way a printed topo sheet bolds the
 * hundred-metre lines and leaves the twenty-metre ones thin. That single detail is what separates
 * a contour map from a set of wavy rings, and it is the reason this file does not just reuse the
 * old section field unchanged.
 *
 * RESPONSIVE, IN THE WAY THAT MATTERS. Not "the canvas fills the screen" — a fixed canvas does
 * that by definition. The DENSITY is what has to respond: at 7 bands across a 390px phone the
 * lines would be 55px apart and read as large lazy curves, while the same 7 bands across a 2560px
 * monitor are 365px apart and the field stops reading as a map at all. The band count and the
 * field's scale are therefore re-set on every resize: fewer, wider bands on a narrow screen;
 * more, tighter ones on a wide one. The aspect ratio is corrected in the shader too, so the
 * contours stay roughly circular on a 21:9 monitor instead of being stretched into ellipses.
 *
 * WHAT IT COSTS, AND WHAT KEEPS IT HONEST. This is a full-viewport WebGL program that runs for as
 * long as the visitor is on the site, which is the most expensive thing a marketing page can leave
 * switched on — so: the loop stops when the tab is hidden, `prefers-reduced-motion` renders one
 * static frame and stops, the device pixel ratio is capped at 2, and a WebGL failure leaves the
 * page on its flat ground with nothing to report. The layer is `aria-hidden`, takes no pointer
 * events, and sits at z-index -1 inside the `.mk` stacking context, so it can never come between
 * a reader and a link.
 */

/* The fragment shader. Two points travel closed loops; the field is the distance between them. */
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
uniform float uIndexEvery;
uniform float uIndexWeight;
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

  /* Aspect correction: the field is measured in square units, so on a wide viewport the contours
     stay round instead of being pulled sideways into ellipses. */
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 suv = (uv - 0.5) * vec2(aspect, 1.0) / max(uScale, 0.001) + 0.5;

  /* The two travelling points. Slow, and offset in phase, so the pattern drifts without ever
     repeating visibly within a visit. */
  float t = iTime * 0.018;
  vec2 a = vec2(bez(suv.x + t, vec4(0.4, 0.6, 0.3, 0.5)),
                bez(suv.y - t, vec4(0.5, 0.4, 0.5, 0.3)));
  vec2 b = vec2(bez(suv.y + t * 0.8, vec4(0.3, 0.5, 0.4, 0.6)),
                bez(suv.x - t * 0.6, vec4(0.6, 0.3, 0.4, 0.5)));

  float fv = distance(a, b);
  float f = fv * uBands;
  float frac = fract(f);
  float lineDist = min(frac, 1.0 - frac);

  /* Screen-space derivative keeps a line one pixel wide at every resolution, which is what stops
     the field turning into moire on a phone. */
  float aa = fwidth(f) + 0.0001;

  /* Minor contour. */
  float mask = 1.0 - smoothstep(uThickness - aa, uThickness + aa, lineDist);

  /* Index contour: every uIndexEvery-th line is heavier. This is the detail that makes the result
     read as a surveyed sheet rather than as a pattern. */
  float idxPhase = fract(f / uIndexEvery);
  float idxDist = min(idxPhase, 1.0 - idxPhase) * uIndexEvery;
  float idxMask = 1.0 - smoothstep(uThickness * uIndexWeight - aa, uThickness * uIndexWeight + aa, idxDist);

  /* Higher ground reads slightly cooler and denser, so the field has a sense of elevation rather
     than being a flat grid. The accent is the brand blue, used only as a tint on the high ground. */
  float elev = clamp(fv / 1.4, 0.0, 1.0);
  vec3 col = mix(uLine, uAccent, elev * 0.45);

  float alpha = max(mask, idxMask * 0.85) * uOpacity;
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

export function SiteGround() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let cleanup: (() => void) | undefined

    /* ogl is imported lazily so a WebGL failure cannot take the page down with it, and so the
       library is not in the critical path for the first paint of the text. */
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
          /* No WebGL. The page has a flat ground beneath this layer, so it degrades to that. */
          return
        }

        const gl = renderer.gl
        gl.clearColor(0, 0, 0, 0)
        const canvas = gl.canvas as HTMLCanvasElement
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        canvas.style.display = 'block'
        host.appendChild(canvas)

        /* Colours come from the live palette. --mk-line-field is the token this layer owns, so the
           ground can be tuned without moving every divider on the site with it. */
        const line = tokenRgb(host, '--mk-line-field', tokenRgb(host, '--mk-line', [0.85, 0.89, 0.94]))
        const accent = tokenRgb(host, '--mk-green', [0.0, 0.29, 0.71])

        const program = new Program(gl, {
          vertex: VERTEX,
          fragment: FRAGMENT,
          uniforms: {
            iTime: { value: 0 },
            iResolution: { value: new Float32Array([1, 1]) },
            uBands: { value: 7.5 },
            uThickness: { value: 0.010 },
            uScale: { value: 1.25 },
            /* The ground runs behind the entire site rather than behind one section, so it has to
               stay quiet enough that body text on a card above it never has to compete. Measured
               against the white ground, the strongest index line lands around 1.5:1: texture, never
               content. */
            uOpacity: { value: 0.42 },
            uIndexEvery: { value: 5.0 },
            uIndexWeight: { value: 1.9 },
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

          /* The density response. Below 720px the field drops to five bands and pulls in slightly,
             so a phone shows a few wide contours rather than a screenful of hairlines; on a wide
             desktop it tightens so the ground still reads as a map instead of as three big curves.
             Interpolated between the two rather than stepped, so there is no visible jump when a
             window is dragged across the threshold. */
          const t = Math.min(Math.max((w - 390) / (1440 - 390), 0), 1)
          program.uniforms.uBands.value = 5.0 + t * 2.5
          program.uniforms.uScale.value = 0.85 + t * 0.4

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
          const ro = new ResizeObserver(() => {
            resize()
            draw(0)
          })
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

        /* A hidden tab gets no frames. There is no IntersectionObserver here on purpose: this layer
           is fixed to the viewport, so it is on screen for the whole visit and there is nothing to
           observe. Visibility is the only thing that can turn it off. */
        const onVisibility = () => {
          if (document.hidden) pause()
          else play()
        }
        document.addEventListener('visibilitychange', onVisibility)

        const ro = new ResizeObserver(() => resize())
        ro.observe(host)

        play()

        cleanup = () => {
          pause()
          ro.disconnect()
          document.removeEventListener('visibilitychange', onVisibility)
          canvas.remove()
        }
      })
      .catch(() => {
        /* A failed import leaves the flat ground. Nothing to do and nothing to report. */
      })

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [])

  return (
    <div
      ref={hostRef}
      className="mk-ground"
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    />
  )
}
