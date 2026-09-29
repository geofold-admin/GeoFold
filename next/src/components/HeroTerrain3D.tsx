'use client'

import { useEffect, useRef } from 'react'
import { parseDem, buildSurface, buildWalls, buildShadowQuad, COLOUR_GAMMA } from '@/lib/terrainDem'

/**
 * HeroTerrain3D — the hero's terrain block, as a real, turnable WebGL mesh.
 *
 * WHAT IT REPLACES, AND WHY. The hero carried `public/hero-terrain.png`: a 1200x880 isometric
 * render of this same ground, generated at build time. It is an honest picture of a real place and
 * it is also a dead one — it cannot be turned, so the one property that makes a thing read as 3D
 * rather than as a drawing of 3D is exactly the one it lacks. The client asked for a 3D map; a
 * PNG is a picture OF a 3D map. This is the map.
 *
 * THE DATA IS THE SAME DATA. The mesh is built from `public/hero-terrain-dem.bin`, which
 * `scripts/build-terrain-3d.mjs` writes from the SAME cached Terrarium tiles and the SAME
 * conditioning chain the PNG was drawn from. So the turnable block and the static fallback show
 * the same hillside, and the caption under it can keep naming the place truthfully.
 *
 * THE GEOMETRY IS NOT WARPED BY THE COLOUR GAMMA. See the note in lib/terrainDem.ts: the PNG
 * pushed elevation through a `**0.52` curve before it drove BOTH shape and colour, which is fine
 * for a picture and wrong for an object you can turn, because from a low angle you can see the
 * lowland stretched and the peaks squashed. Here the shape is linear in metres; only the tint is
 * gamma-expanded.
 *
 * VERTICAL EXAGGERATION, STATED PLAINLY. The block is drawn about 10x taller than true scale.
 * That is not a fudge, it is arithmetic with a number attached: this window's whole relief is
 * 1057 m across 98 km — a true relief-to-width ratio of 0.0108 — so at honest scale the surface
 * is a flat plate with a hairline of colour on it and the cut faces are invisible. The static PNG
 * this replaces made the same choice: it drew the relief as 0.105 of the block's width. This mesh
 * keeps that look (`RELIEF_FRACTION` below), and the factor that gets there is
 * 0.105 / 0.0108 ≈ 9.7. It is stated here rather than hidden because a picture of terrain that
 * quietly reshapes the terrain is the one thing a survey company must not ship.
 *
 * LIGHT. A NW sun (azimuth 315, altitude 45) — the cartographic convention, and the reason every
 * relief map since the 19th century uses it: it leaves no slope ambiguous between a ridge and a
 * valley. Shading is done per fragment from the interpolated normal, which is the thing a
 * flat-shaded mesh cannot do and the main reason this reads as terrain and not as folded paper.
 *
 * CONTOURS. Drawn in the fragment shader from the same normalised height the ramp uses, at 1/26
 * of the range, with every fifth line heavier — the index-contour rule the static PNG follows.
 * A contour line is the one graphic convention that says *surveyed* rather than *rendered*, which
 * is what this company sells.
 *
 * BEHAVIOUR, AND ITS GATES. It is TURNED BY THE READER, not by a clock: drag it and it rotates,
 * release and it coasts to a stop. There is deliberately NO idle auto-rotation, because this site
 * has a client-mandated rule that the page is still while nothing is touched (the client asked
 * twice for no moving background, and `scripts/verify-site.mjs` measures it). An earlier version
 * did spin on its own and failed that check with 10495 changed samples against a limit of 200. The
 * block is still fully rotatable — it just does not move until you move it. Under
 * `prefers-reduced-motion` it draws exactly ONE static frame and does not even wire the drag, so
 * it cannot move at all. That path is a measurement target, not a footnote:
 * `scripts/verify-hero-3d.mjs` samples the canvas twice, 1.5 s apart, and fails if a byte differs.
 *
 * It is `aria-hidden` and the real <img> sits behind it in the DOM (see the hero in page.tsx), so
 * a screen reader and a WebGL-less browser both still get the fact this picture carries.
 */

const RELIEF = 0.11 // world height of the full p0.5..p99.5 range. The plan is 1.0 wide, and the
// true relief/width is 0.0108, so this is a 10.2x vertical exaggeration — see the note above.
const BASE_DROP = 0.16 // the cut face's depth below the base plane: what makes it a BLOCK rather
// than a floating skin. Deep enough that the lowest ground still has a visible wall.
const DRAG_SENSITIVITY = 0.008 // radians per pixel dragged
const INERTIA_TAU = 0.28 // seconds; the time constant of the coast after a drag is released
const MAX_DPR = 2

const VERT = `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;
in float u;      // normalised height 0..1, linear (surface only)
in float cutT;   // 0 at the surface, 1 at the base of a cut face (walls only)
in float side;   // which cut face, 0..3 (walls only)
in vec2 uv;      // base-plane quad only

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vNormal;
out vec3 vViewPos;
out float vU;
out float vDrop;
out float vSide;
out vec2 vUv;

void main() {
  vNormal = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vU = u;
  vDrop = cutT;
  vSide = side;
  vUv = uv;
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vViewPos;
in float vU;
in float vDrop;
in float vSide;
in vec2 vUv;

uniform float uGamma;
uniform float uLevels;
uniform float uIndexEvery;
uniform int uMode;        // 0 = surface, 1 = cut face, 2 = contact shadow
uniform vec3 uLightDir;

out vec4 fragColor;

/* THE HYPSOMETRIC RAMP — ten stops, baked in as a const array rather than passed as a uniform.
   Low is a cool blue, climbing through teal and sage to a pale ice-grey summit: a standard
   professional DEM tint, and the one colour decision that lets the block sit on a white page
   rather than on top of it. The top stop is deliberately NOT white — a snow-white summit on a
   white ground loses its outline exactly where it is most interesting.
   The values are the same ten stops the static PNG is drawn from (scripts/build-terrain.mjs),
   converted from 0-255 to 0-1. */
const int RAMP_N = 10;
const vec3 RAMP[10] = vec3[10](
  vec3(0.278431, 0.454902, 0.580392),  // 0x47 0x74 0x94
  vec3(0.313725, 0.494118, 0.603922),  // 0x50 0x7e 0x9a
  vec3(0.356863, 0.556863, 0.600000),  // 0x5b 0x8e 0x99
  vec3(0.419608, 0.619608, 0.580392),  // 0x6b 0x9e 0x94
  vec3(0.501961, 0.674510, 0.560784),  // 0x80 0xac 0x8f
  vec3(0.607843, 0.725490, 0.568627),  // 0x9b 0xb9 0x91
  vec3(0.713725, 0.772549, 0.607843),  // 0xb6 0xc5 0x9b
  vec3(0.800000, 0.819608, 0.690196),  // 0xcc 0xd1 0xb0
  vec3(0.866667, 0.874510, 0.796078),  // 0xdd 0xdf 0xcb
  vec3(0.925490, 0.933333, 0.941176)   // 0xec 0xee 0xf0
);

vec3 ramp(float t) {
  float v = clamp(t, 0.0, 1.0) * float(RAMP_N - 1);
  int i = int(floor(v));
  int j = min(i + 1, RAMP_N - 1);
  return mix(RAMP[i], RAMP[j], v - float(i));
}

void main() {
  if (uMode == 2) {
    /* The contact shadow: a soft patch on the base plane, drawn from the quad's own uv so it needs
       no texture. SQUARE, not radial, because the block's footprint is square and turns with it —
       a round blob under a square base would sit at the wrong angle as the block rotates.
       The falloff is tuned to be DARK AT THE BLOCK'S EDGE and fade outward: the block's half-width
       is 0.5 against this quad's 0.75, so the block edge sits at d = 0.5/0.75 = 0.67, and the
       curve is still at ~0.26 alpha there rather than the ~0.06 a plain pow() gave — measured, the
       first version rendered but was invisible on white. The centre (under the block) is hidden by
       the block itself, so the visible part is the halo from d ~0.67 out to ~0.95.
       Blended, hence a separate program with the transparent flag set. */
    vec2 q = abs(vUv - 0.5) * 2.0;
    float d = max(q.x, q.y);
    float a = 0.5 * pow(clamp((0.98 - d) / 0.48, 0.0, 1.0), 1.5);
    fragColor = vec4(vec3(0.043, 0.078, 0.133), a);
    return;
  }

  /* THE CUT FACES. A vertical gradient from a mid blue at the top edge to near-black at the base,
     so the block reads as a solid slab rather than as a sticker. The four faces are shaded
     differently — the light is NW, so the two faces turned away from it are darker than the two
     facing it — which is what stops the block collapsing into one dark cutout at a glance. */
  if (uMode == 1) {
    vec3 top = vec3(0.110, 0.188, 0.290);
    vec3 bot = vec3(0.047, 0.090, 0.157);
    vec3 col = mix(top, bot, clamp(vDrop, 0.0, 1.0));
    float faceShade = vSide < 0.5 ? 0.86 : vSide < 1.5 ? 1.14 : vSide < 2.5 ? 1.0 : 0.92;
    fragColor = vec4(col * faceShade, 1.0);
    return;
  }

  /* THE SURFACE. Colour is gamma-expanded; shape is not (see lib/terrainDem.ts). */
  float t = pow(clamp(vU, 0.0, 1.0), uGamma);
  vec3 base = ramp(t);

  /* Lambert against the NW sun, with the ambient floor and the capped gain the static render
     uses: SHADE_MIN 0.66 and SHADE_MAX 1.07. The gain stops short of clipping on purpose —
     nothing in a matte relief map should reach pure white except the snow line. */
  vec3 n = normalize(vNormal);
  float ndl = max(dot(n, uLightDir), 0.0);
  float shade = 0.66 + (1.07 - 0.66) * ndl;
  vec3 col = base * shade;

  /* CONTOURS. A fixed luminance step away from the ground it crosses, flipping direction with the
     ground — darker ink on light ground, lighter ink on dark — because a contour is a value
     contrast, not a shade. Same rule as the static render, and it is what gives the flat basin
     texture and scale where the relief is only a few metres. */
  float band = fract(vU * uLevels);
  float dist = min(band, 1.0 - band);
  float lw = fwidth(vU * uLevels) * 1.1;
  float line = 1.0 - smoothstep(0.0, lw, dist);
  float idxPhase = mod(vU * uLevels + 0.5, uIndexEvery);
  float idxDist = min(idxPhase, uIndexEvery - idxPhase);
  float heavy = 1.0 - smoothstep(0.0, lw * 1.9, idxDist);
  float ink = max(line * 0.60, heavy * 0.82);

  float gY = dot(col, vec3(0.2126, 0.7152, 0.0722));
  /* step() returns a FLOAT, and GLSL's ternary needs a BOOL, so a bare "wantDarker ? ..." is a
     compile error ("boolean expression expected") that fails the whole program and leaves the
     canvas blank. Compare it to 0.5 first. */
  float wantDarker = step(0.46, gY);
  vec3 inkCol = wantDarker > 0.5 ? vec3(0.0) : vec3(1.0);
  col = mix(col, inkCol, ink * 0.9);

  fragColor = vec4(col, 1.0);
}
`

export default function HeroTerrain3D({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let cleanup: (() => void) | undefined

    /* ogl is imported lazily, the same way SiteGround does it: a WebGL failure must not take the
       page down with it, and the library is not in the critical path for the first paint. */
    void (async () => {
      let mod: typeof import('ogl')
      let buf: ArrayBuffer
      try {
        ;[mod, buf] = await Promise.all([
          import('ogl'),
          fetch('/hero-terrain-dem.bin').then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            return r.arrayBuffer()
          }),
        ])
      } catch {
        return // the <img> behind this canvas is still there
      }
      if (disposed) return

      const { Renderer, Program, Mesh, Camera, Transform, Geometry, Vec3 } = mod

      let dem
      try {
        dem = parseDem(buf)
      } catch {
        return
      }

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches

      let renderer: InstanceType<typeof Renderer>
      try {
        renderer = new Renderer({
          webgl: 2,
          alpha: true,
          premultipliedAlpha: true,
          antialias: true,
          dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR),
        })
      } catch {
        return // no WebGL — the flat PNG shows through
      }

      const gl = renderer.gl
      gl.clearColor(0, 0, 0, 0)
      const canvas = gl.canvas as HTMLCanvasElement
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.display = 'block'
      host.appendChild(canvas)

      const { position, normal, scalar, index } = buildSurface(dem, RELIEF)
      const walls = buildWalls(dem, RELIEF, BASE_DROP)
      const shadow = buildShadowQuad(BASE_DROP)

      const light = new Vec3(
        Math.cos((45 * Math.PI) / 180) * Math.cos((315 * Math.PI) / 180),
        Math.sin((45 * Math.PI) / 180),
        Math.cos((45 * Math.PI) / 180) * Math.sin((315 * Math.PI) / 180),
      )

      /* Three programs, one shader: uMode picks the branch. The shadow is the only one that
         blends, so it alone is flagged transparent, which is also what puts it last in the
         render list, after the opaque surface and walls, as it must be. Its cullFace is turned
         OFF: the quad lies in the XZ plane and its winding faces down, so with the default
         back-face culling it is invisible from the camera above — measured, the shadow did not
         appear at all until this was set. */
      const makeProgram = (mode: 0 | 1 | 2) =>
        new Program(gl, {
          vertex: VERT,
          fragment: FRAG,
          transparent: mode === 2,
          depthWrite: mode !== 2,
          cullFace: mode === 2 ? false : gl.BACK,
          uniforms: {
            uGamma: { value: COLOUR_GAMMA },
            uLevels: { value: 26 },
            uIndexEvery: { value: 5 },
            uMode: { value: mode },
            uLightDir: { value: light },
          },
        })

      /* The surface carries `u`; the walls carry `cutT`/`side`; the base quad carries `uv`. Every
         geometry supplies ALL four attributes (zero-filled where unused) so the one shader links
         against every mesh without an attribute going unbound — an unbound attribute reads as
         (0,0,0,1), which would silently send a wall to the surface branch.
         The attribute is `cutT`, not `drop`: `drop` is a reserved keyword in GLSL ES 3.00 (the
         derivative builtin), and a shader that uses it as an identifier fails to LINK, which in
         ogl leaves `uniformLocations` undefined and throws on the next frame. */
      const zeros = (n: number) => new Float32Array(n)
      const surfaceGeo = new Geometry(gl, {
        position: { size: 3, data: position },
        normal: { size: 3, data: normal },
        u: { size: 1, data: scalar.u },
        cutT: { size: 1, data: zeros(dem.n * dem.n) },
        side: { size: 1, data: zeros(dem.n * dem.n) },
        uv: { size: 2, data: zeros(dem.n * dem.n * 2) },
        index: { data: index },
      })
      const wallGeo = new Geometry(gl, {
        position: { size: 3, data: walls.position },
        normal: { size: 3, data: walls.normal },
        u: { size: 1, data: zeros(walls.count) },
        cutT: { size: 1, data: walls.scalar.drop },
        side: { size: 1, data: walls.scalar.side },
        uv: { size: 2, data: zeros(walls.count * 2) },
      })
      const shadowGeo = new Geometry(gl, {
        position: { size: 3, data: shadow.position },
        normal: { size: 3, data: shadow.normal },
        u: { size: 1, data: zeros(6) },
        cutT: { size: 1, data: zeros(6) },
        side: { size: 1, data: zeros(6) },
        uv: { size: 2, data: shadow.scalar.uv },
      })

      /* ---- the rig ---------------------------------------------------------------------------
         `scene` holds the block. `spin` is its yaw about Y; the camera orbits at a fixed pitch
         and looks at the block's centre. Only ONE of the two may carry the yaw — the camera
         orbits, the block spins, and the two together would turn it twice as fast and in the
         same direction, so the camera holds a FIXED azimuth (the resting `-0.62` corner-on view)
         and all turning happens on the block. */
      const scene = new Transform()
      const surface = new Mesh(gl, { geometry: surfaceGeo, program: makeProgram(0) })
      const wallMesh = new Mesh(gl, { geometry: wallGeo, program: makeProgram(1) })
      const shadowMesh = new Mesh(gl, { geometry: shadowGeo, program: makeProgram(2) })
      scene.addChild(surface)
      scene.addChild(wallMesh)
      scene.addChild(shadowMesh)

      const camera = new Camera(gl, { fov: 34, near: 0.01, far: 20 })
      const root = new Transform()
      root.addChild(scene)

      const REST_AZIMUTH = -0.62 // the corner-on resting view, as both references are
      const RADIUS = 1.95
      const LOOK_AT_Y = (RELIEF - BASE_DROP) * 0.45 // centre the eye between base and summit
      let spin = 0 // block yaw, radians — the ONLY thing that turns
      let pitch = 0.62 // camera elevation, radians above the horizon
      let targetPitch = pitch
      let spinVel = 0

      const resize = () => {
        const w = host.clientWidth
        const h = host.clientHeight
        if (w === 0 || h === 0) return
        renderer.setSize(w, h)
        camera.perspective({ aspect: w / h })
      }

      const render = () => {
        scene.rotation.y = spin
        camera.position.set(
          RADIUS * Math.cos(targetPitch) * Math.sin(REST_AZIMUTH),
          RADIUS * Math.sin(targetPitch),
          RADIUS * Math.cos(targetPitch) * Math.cos(REST_AZIMUTH),
        )
        camera.lookAt(new Vec3(0, LOOK_AT_Y, 0))
        renderer.render({ scene: root, camera })
      }

      resize()

      /* Reduced motion: ONE frame, then stop. No loop, no listeners except a resize that redraws
         the same single frame. This is a hard requirement and a measurement target. */
      if (reduce) {
        render()
        const ro = new ResizeObserver(() => {
          resize()
          render()
        })
        ro.observe(host)
        cleanup = () => {
          ro.disconnect()
          canvas.remove()
        }
        return
      }

      /* ---- RENDER ON DEMAND, NOT ON A CLOCK --------------------------------------------------
         THE PAGE IS STILL WHILE NOTHING IS TOUCHED, and on this site that is a requirement
         rather than a preference: the client asked twice for no moving background ("tidak ada
         latar belakang bergerak"), and `scripts/verify-site.mjs` enforces it by diffing two frames
         of an idle page at the same scroll position. An earlier version of this component turned
         slowly on its own and FAILED that check with 10495 changed samples against a limit of 200.

         So there is no idle loop. One frame is drawn on load; after that the only things that
         schedule a frame are a drag and the inertia it leaves behind, and the loop STOPS the
         moment the block is at rest. The block is still fully turnable — that is the entire reason
         it is WebGL rather than a PNG — it just does not turn by itself. "Rotatable" and
         "self-animating" are not the same thing, and this page only wants the first. */
      let raf = 0
      let visible = true
      let last = performance.now()

      const step = (now: number) => {
        const dt = Math.min((now - last) / 1000, 0.05)
        last = now

        if (!dragging) {
          /* Inertia after a drag. Exponential decay by TIME, not per frame, so the coast lasts
             the same half-second at 30 fps and at 144 fps. */
          spin += spinVel * dt
          spinVel *= Math.exp(-dt / INERTIA_TAU)
          if (Math.abs(spinVel) < 0.02) spinVel = 0
        }
        targetPitch += (pitch - targetPitch) * 0.18

        render()

        // Stop the loop as soon as nothing is moving. This is the line that keeps the page still.
        if (dragging || spinVel !== 0) raf = requestAnimationFrame(step)
        else raf = 0
      }

      const kick = () => {
        if (raf || !visible || document.hidden) return
        last = performance.now()
        raf = requestAnimationFrame(step)
      }

      /* ---- pointer steering ----------------------------------------------------------------
         Drag turns the block; release leaves it coasting, and the coast ends by itself. Only wired
         where there is a real hover-capable pointer, so a touch device does not get a half-working
         drag it cannot cancel; on touch, the block simply stays as drawn. */
      let dragging = false
      let lastX = 0
      let lastY = 0
      let lastMoveT = 0
      const onDown = (e: PointerEvent) => {
        dragging = true
        lastX = e.clientX
        lastY = e.clientY
        lastMoveT = e.timeStamp
        spinVel = 0
        canvas.setPointerCapture(e.pointerId)
        canvas.style.cursor = 'grabbing'
        kick()
      }
      const onMove = (e: PointerEvent) => {
        if (!dragging) return
        const dx = e.clientX - lastX
        const dy = e.clientY - lastY
        lastX = e.clientX
        lastY = e.clientY
        spin += dx * DRAG_SENSITIVITY
        /* Velocity in radians/second from the event timestamps, clamped so a jittery event with a
           near-zero dt cannot fling the block. This is what the release coasts on. */
        const dtms = Math.max(4, e.timeStamp - lastMoveT)
        lastMoveT = e.timeStamp
        spinVel = Math.max(-8, Math.min(8, (dx * DRAG_SENSITIVITY) / (dtms / 1000)))
        pitch = Math.max(0.18, Math.min(1.15, pitch + dy * DRAG_SENSITIVITY * 0.5))
      }
      const onUp = (e: PointerEvent) => {
        dragging = false
        canvas.style.cursor = 'grab'
        try {
          canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* the capture may already be gone; nothing to do */
        }
      }

      /* ONE frame on load, so the hero paints the real block immediately rather than an empty box.
         Nothing else runs until the pointer touches it. */
      render()

      const io = new IntersectionObserver(
        (entries) => {
          visible = entries[0]?.isIntersecting ?? true
          if (!visible && raf) {
            cancelAnimationFrame(raf)
            raf = 0
            spinVel = 0
          }
        },
        { threshold: 0.01 },
      )
      io.observe(canvas)

      const onVisibility = () => {
        if (document.hidden && raf) {
          cancelAnimationFrame(raf)
          raf = 0
          spinVel = 0
        }
      }
      document.addEventListener('visibilitychange', onVisibility)

      const ro = new ResizeObserver(() => {
        resize()
        render()
      })
      ro.observe(host)

      if (canHover) {
        canvas.style.cursor = 'grab'
        canvas.addEventListener('pointerdown', onDown)
        canvas.addEventListener('pointermove', onMove)
        canvas.addEventListener('pointerup', onUp)
        canvas.addEventListener('pointercancel', onUp)
      }

      cleanup = () => {
        if (raf) cancelAnimationFrame(raf)
        io.disconnect()
        ro.disconnect()
        document.removeEventListener('visibilitychange', onVisibility)
        canvas.removeEventListener('pointerdown', onDown)
        canvas.removeEventListener('pointermove', onMove)
        canvas.removeEventListener('pointerup', onUp)
        canvas.removeEventListener('pointercancel', onUp)
        canvas.remove()
      }
    })()

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [])

  return (
    <div
      ref={hostRef}
      className={className}
      aria-hidden="true"
      role="presentation"
      data-hero-terrain-3d
    />
  )
}
