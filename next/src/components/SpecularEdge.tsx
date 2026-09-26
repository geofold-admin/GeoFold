'use client'

import { useEffect, useRef } from 'react'
import { Renderer, Program, Mesh, Triangle, Color } from 'ogl'

/**
 * A specular highlight that travels along a button's edge, adapted from the free ReactBits
 * SpecularButton component. It is used on ONE element: the primary call to action in the hero.
 *
 * WHY ONLY ONE. It is a WebGL context, and a browser caps how many of those it will keep alive.
 * Eight primary buttons on the site would mean eight contexts, and past the cap the oldest are
 * dropped without warning, which on some drivers shows up as a flash. One hero CTA is the right
 * amount: it is the single element the page most wants looked at.
 *
 * WHAT WAS CHANGED FROM THE ORIGINAL:
 *
 *   1. IT WRAPS A LINK, NOT A BUTTON. The original renders a <button>. Every CTA on this site is a
 *      Next.js <Link> to /login, and turning that into a button would break client-side routing,
 *      middle-click and "open in new tab". This draws the highlight in an absolutely-positioned
 *      canvas INSIDE the existing link, so the element, its href and its semantics are untouched.
 *
 *   2. THE COLOURS COME FROM THE THEME. The original takes lineColor and baseColor as props, which
 *      would freeze one theme's colours into an element that has to work in both. They are read
 *      from CSS custom properties on the element.
 *
 *   3. IT FADES IN WITH PROXIMITY AND STOPS OFF-SCREEN, both kept from the original, plus a
 *      visibility check the original does not have. The render loop is cancelled when the button
 *      scrolls out of view or the tab is hidden, because a WebGL loop is the most expensive thing
 *      on the page and it must not run for a hero nobody is looking at.
 *
 *   4. prefers-reduced-motion removes it entirely rather than freezing it. A static specular
 *      highlight is just a border; the border is already there in CSS, so the canvas is not drawn.
 *
 * The shader, the signed-distance field and the proximity maths are the original's. They were
 * verified rather than assumed: the highlight is confirmed to render, to brighten as the pointer
 * approaches, and to leave the button's own hit area and text completely alone.
 */

const PAD = 20

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;

uniform vec2 uCenter;
uniform vec2 uHalfSize;
uniform float uRadius;
uniform float uAngle;
uniform float uPx;
uniform vec3 uLineColor;
uniform vec3 uBaseColor;
uniform float uIntensity;
uniform float uShineSize;
uniform float uShineFade;
uniform float uThickness;
uniform float uBaseWidth;

out vec4 fragColor;

float sdRoundedRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float shapeSDF(vec2 p) { return sdRoundedRect(p, uHalfSize, uRadius); }

float gaussianLine(float d, float sigma) {
  float x = d / (sigma + 1e-6);
  float k = mix(1.0, 1.6, smoothstep(0.0, 1.5, x));
  return exp(-k * x * x);
}

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float d = shapeSDF(p);
  vec2 L = vec2(cos(uAngle), sin(uAngle));

  float base = (1.0 - smoothstep(0.0, uBaseWidth, abs(d))) * 0.45;

  vec2 nEll = normalize(p / (uHalfSize * uHalfSize) + 1e-6);
  float phi = acos(clamp(abs(dot(nEll, L)), 0.0, 1.0));
  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);
  float line = gaussianLine(d, uThickness);
  float edgeClamp = 1.0 - smoothstep(0.5 * uPx, 3.0 * uPx, abs(d));
  float hi = line * rim * edgeClamp * uIntensity;

  vec3 col = uBaseColor * base + uLineColor * hi;
  float a = clamp(base + hi, 0.0, 1.0);
  fragColor = vec4(col, a);
}
`

export default function SpecularEdge({
  children,
  className = '',
  radius = 4,
  speed = 0.35,
  proximity = 320,
}: {
  children: React.ReactNode
  className?: string
  radius?: number
  speed?: number
  proximity?: number
}) {
  const hostRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let renderer: Renderer
    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true, dpr })
    } catch {
      // No WebGL: the CSS border is already there, so nothing is lost.
      return
    }
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const geometry = new Triangle(gl)
    if (geometry.attributes.uv) delete geometry.attributes.uv

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uCenter: { value: [0, 0] },
        uHalfSize: { value: [1, 1] },
        uRadius: { value: 0 },
        uAngle: { value: 2.4 },
        uPx: { value: dpr },
        uLineColor: { value: [1, 1, 1] },
        uBaseColor: { value: [0.32, 0.32, 0.32] },
        uIntensity: { value: 1 },
        uShineSize: { value: (10 * Math.PI) / 180 },
        uShineFade: { value: (40 * Math.PI) / 180 },
        uThickness: { value: 1 },
        uBaseWidth: { value: dpr },
      },
    })

    const mesh = new Mesh(gl, { geometry, program })
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.className = 'spec-edge__canvas'
    canvas.setAttribute('aria-hidden', 'true')
    host.appendChild(canvas)

    /* THE BOX THE HIGHLIGHT TRACES.
     *
     * The host span is only the label, not the button: the button's padding lives on the anchor,
     * so the span measured 67x19 inside a 113x47 button. Tracing the span would draw the highlight
     * around the text instead of around the button, which is not the effect and looks like a
     * mis-drawn focus ring. So the geometry comes from the nearest anchor, falling back to the host
     * if there is not one.
     *
     * The offset between the two boxes is what lets the canvas be positioned in the host's
     * coordinate space while tracing the anchor's rectangle. */
    const target: HTMLElement = (host.closest('a, button') as HTMLElement) ?? host
    let targetOffset = { x: 0, y: 0 }
    const measure = () => {
      const t = target.getBoundingClientRect()
      const h = host.getBoundingClientRect()
      targetOffset = { x: t.left - h.left, y: t.top - h.top }
      return t
    }

    // The colours are read off the target, so they follow the theme and the button's own tokens.
    const readColors = () => {
      const cs = getComputedStyle(target)
      const lineC = new Color(cs.getPropertyValue('--spec-line').trim() || '#ffffff')
      const baseC = new Color(cs.getPropertyValue('--spec-base').trim() || '#525252')
      program.uniforms.uLineColor.value = [lineC.r, lineC.g, lineC.b]
      program.uniforms.uBaseColor.value = [baseC.r, baseC.g, baseC.b]
    }
    readColors()

    const size = { w: 1, h: 1 }
    const resize = () => {
      const rect = measure()
      if (rect.width === 0 || rect.height === 0) return
      size.w = rect.width
      size.h = rect.height
      renderer.setSize(rect.width + PAD * 2, rect.height + PAD * 2)
      program.uniforms.uCenter.value = [(PAD + rect.width / 2) * dpr, (PAD + rect.height / 2) * dpr]
      program.uniforms.uHalfSize.value = [(rect.width / 2) * dpr, (rect.height / 2) * dpr]
      /* The canvas is positioned in the HOST's coordinate space but traces the ANCHOR's box, so it
         has to be moved by the difference between them and then grown by the shader's PAD. Both
         numbers are written here rather than in CSS because they depend on the live layout: the
         anchor's padding is not a value the stylesheet can know. */
      canvas.style.left = `${targetOffset.x - PAD}px`
      canvas.style.top = `${targetOffset.y - PAD}px`
      canvas.style.width = `${rect.width + PAD * 2}px`
      canvas.style.height = `${rect.height + PAD * 2}px`
    }
    const ro = new ResizeObserver(resize)
    ro.observe(target)
    resize()

    let pointerAngle: number | null = null
    let proximityT = 0
    const onPointerMove = (e: PointerEvent) => {
      const rect = target.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right)
      const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom)
      const dist = Math.hypot(dx, dy)
      if (dist === 0) {
        const nx = (e.clientX - cx) / (rect.width / 2)
        const ny = (cy - e.clientY) / (rect.height / 2)
        pointerAngle = Math.atan2(2 / rect.height, -2 / rect.width) + nx * 0.3 + ny * 0.15
      } else {
        pointerAngle = Math.atan2(cy - e.clientY, e.clientX - cx)
      }
      const t = Math.max(0, 1 - dist / Math.max(proximity, 1))
      proximityT = t * t * (3 - 2 * t)
    }
    window.addEventListener('pointermove', onPointerMove)

    let angle = 2.4
    let idleAngle = 2.4
    let bright = 0
    let last = 0
    let raf = 0
    let visible = true
    let pageVisible = !document.hidden

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0
      last = now

      idleAngle += speed * dt
      const steer = pointerAngle != null
      const target = steer ? pointerAngle! : idleAngle
      const diff = ((target - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      angle += diff * (1 - Math.exp(-dt * 7))

      bright += (proximityT - bright) * (1 - Math.exp(-dt * 8))

      program.uniforms.uAngle.value = angle
      program.uniforms.uRadius.value = Math.min(radius, Math.min(size.w, size.h) / 2) * dpr
      program.uniforms.uIntensity.value = bright
      program.uniforms.uThickness.value = 1 * dpr
      renderer.render({ scene: mesh })
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
    start()

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
        if (visible) start()
        else stop()
      },
      { threshold: 0 },
    )
    io.observe(host)

    const onVis = () => {
      pageVisible = !document.hidden
      if (pageVisible) start()
      else stop()
    }
    document.addEventListener('visibilitychange', onVis)

    const mo = new MutationObserver(readColors)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      stop()
      io.disconnect()
      mo.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pointermove', onPointerMove)
      if (canvas.parentNode === host) host.removeChild(canvas)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [radius, speed, proximity])

  return (
    /* A span, not a div: this sits INSIDE the link, and a div inside an anchor is invalid HTML
       that some parsers will re-parent, taking the button's hit area with it. */
    <span ref={hostRef} className={`spec-edge ${className}`}>
      {children}
    </span>
  )
}
