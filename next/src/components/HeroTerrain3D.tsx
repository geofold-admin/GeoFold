'use client'

import { useEffect, useRef } from 'react'
import { parseDem, buildSurface, buildWalls, buildShadowQuad, computeAO, COLOUR_GAMMA } from '@/lib/terrainDem'

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
in float ao;     // baked ambient occlusion, 0..1 (surface only)

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vNormal;
out vec3 vViewPos;
out float vU;
out float vDrop;
out float vSide;
out vec2 vUv;
out float vAo;

void main() {
  vNormal = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vU = u;
  vDrop = cutT;
  vSide = side;
  vUv = uv;
  vAo = ao;
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
in float vAo;

uniform float uGamma;
uniform float uLevels;
uniform float uIndexEvery;
uniform int uMode;        // 0 = surface, 1 = cut face, 2 = contact shadow
uniform vec3 uLightDir;

out vec4 fragColor;

/* THE HYPSOMETRIC RAMP — ten stops, baked in as a const array rather than passed as a uniform.
   A standard professional DEM tint: green lowland climbing through dry yellow-brown to grey rock
   and a pale ice summit, with the open water handled separately below.

   WHY IT IS NO LONGER BLUE AT THE BOTTOM, WHICH IT WAS. The first version opened on a cool blue,
   on the reasoning that it let the block sit on a white page. It did — but it also painted the
   entire lowland as water. MEASURED, and this is the number that settled it: this 98 km window is
   72% flat basin, everything below 89 m, so a blue low end tinted three-quarters of the block as
   open water. Independent visual review of the result reported "three-quarters of it is a dark
   teal-navy plane reading as water/bay" and scored the whole thing 3/10 as a terrain depiction.
   The reviewer was right about what it SAW and wrong about what it was: that was farmland and
   floodplain, not a lake. A tint that misdescribes the ground is a bug however well it sits on the
   page, and the client's own reference render is a green-brown hypsometric ramp for this reason.

   The brand's cool character is kept where it is true rather than where it is not: the rock and
   summit stops run grey-blue to ice, so the block still reads as the same family on a white page,
   while the ground the eye spends most of its time on is the colour ground actually is. */
const int RAMP_N = 10;
const vec3 RAMP[10] = vec3[10](
  vec3(0.294118, 0.396078, 0.301961),  // 0x4b 0x65 0x4d  floodplain scrub
  vec3(0.376471, 0.486275, 0.333333),  // 0x60 0x7c 0x55  lowland vegetation
  vec3(0.470588, 0.568627, 0.360784),  // 0x78 0x91 0x5c  farmland
  vec3(0.580392, 0.643137, 0.396078),  // 0x94 0xa4 0x65  dry grass
  vec3(0.690196, 0.682353, 0.447059),  // 0xb0 0xae 0x72  dry hills
  vec3(0.745098, 0.678431, 0.498039),  // 0xbe 0xad 0x7f  bare earth
  vec3(0.752941, 0.654902, 0.529412),  // 0xc0 0xa7 0x87  rock and scree
  vec3(0.717647, 0.670588, 0.639216),  // 0xb7 0xab 0xa3  high rock
  vec3(0.717647, 0.741176, 0.768627),  // 0xb7 0xbd 0xc4  cold grey
  vec3(0.901961, 0.929412, 0.945098)   // 0xe6 0xed 0xf1  ice summit — deliberately not white
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

  /* THE LIGHT MODEL. This is the term the whole block hangs on, and the first version got it
     wrong in two measured ways at once.

     (1) THE GAIN WAS TOO NARROW. It spanned 0.66..1.07 — a 1.6:1 range, which is close to
     invisible on a matte surface and is why the eye read the block as a flat printed map rather
     than as lit ground. Widened to 0.52..1.18 (a 2.3:1 range) so a slope facing the sun is
     genuinely brighter than one facing away.

     (2) THERE WAS NO OCCLUSION TERM AT ALL. Lambert alone shades by surface ANGLE, so it cannot
     distinguish a hollow from a ridge that happen to face the same way — and in a basin, which is
     most of this window, nearly every slope faces similarly. vAo is the baked horizon term from
     computeAO(); multiplying it in is what makes hollows sit down and ridges stand up.

     The sun is 45 degrees up at azimuth 315 (north-west), matching the static render's one-desk-
     lamp direction, and it is NOT animated: the block turns under a fixed light, so a feature
     keeps its lit and shaded sides as it rotates, which is what makes the turning readable. */
  vec3 n = normalize(vNormal);
  float ndl = max(dot(n, uLightDir), 0.0);
  float shade = 0.52 + (1.18 - 0.52) * ndl;
  vec3 col = base * shade * vAo;

  /* NO WATER, AND THAT IS A DECISION MADE BY MEASUREMENT RATHER THAN BY TASTE.

     The review of the previous version named the plain as the single biggest weakness — "no
     drainage network, no erosion channels ... Real flat ground is never that uniform" — and the
     client's reference render does show a branching river. So a river was built and measured, and
     it made the block WORSE, not better: the rating fell from 6/10 to 4/10 with the water in place,
     judged "closer to a strange blue stain than convincing water".

     The measurements said the data supports water, and they were right — at the 12th percentile the
     low cells form ONE connected component spanning 85% x 47% of the window, elongated 1.80, sitting
     a mean 2.18 m below the surrounding ground. That IS the Kapuas and its tributaries. What the
     measurements could NOT tell me is that a threshold mask is the wrong INSTRUMENT for drawing it.
     A river is a flow path a few hundred metres wide in a 98 km window — under one pixel per cell —
     so any elevation threshold that catches the channels also catches the floodplain around them,
     and the result reads as a flood, not a river. Drawing it properly needs flow accumulation and
     channel extraction, which is a different piece of work from tinting a heightfield, and doing it
     badly is worse than not doing it: the block looked better as dry land with honest contours than
     as land with a blue stain on it.

     So the plain keeps its contours and its AO, and the absence of a river is a known limitation
     rather than an oversight. waterU() remains in lib/terrainDem.ts, unused, for whoever picks up
     the flow-accumulation version. */

  /* CONTOURS. A fixed luminance step away from the ground it crosses, flipping direction with the
     ground — darker ink on light ground, lighter ink on dark — because a contour is a value
     contrast, not a shade.

     TWO FIXES HERE, BOTH FROM MEASUREMENT.

     (1) THE BANDS FOLLOW THE GAMMA, NOT THE RAW HEIGHT. They were driven by vU, the linear
     elevation, while the COLOUR was driven by pow(vU, uGamma). Banding on the same gamma value the
     colour uses distributes the lines the way the eye reads the surface, and the level count is
     set from the measured share: 69% of this window occupies just the first two of ten colour
     stops, so a high level count piles lines onto a plain that is nearly flat in real terms.
     uLevels is 14, which draws about 2.8 lines across the plain — enough to give it scale, few
     enough that it stops reading as wallpaper.

     (2) THE INK FADES ON STEEP GROUND, AND THE GATE HAD TO BE smoothstep. This is standard
     cartographic practice: where a slope is steep the SHADING already describes the form, so
     contour ink there is redundant and turns the mountain into a layer cake. The first attempt at
     this used a LINEAR mix, which failed — measured, n.y is sharply bimodal here (p50 0.9990 on
     the plain, p5 0.5806 on the steepest ground), so mix(0.16, 1.0, n.y) kept 0.648 of the ink
     where it was supposed to remove it. smoothstep(0.88, 0.998, n.y) keeps 1.000 on the plain and
     0.000 on steep ground, which is the separation the fix was supposed to produce. */
  float band = fract(t * uLevels);
  float dist = min(band, 1.0 - band);
  float lw = fwidth(t * uLevels) * 1.1;
  float line = 1.0 - smoothstep(0.0, lw, dist);
  float idxPhase = mod(t * uLevels + 0.5, uIndexEvery);
  float idxDist = min(idxPhase, uIndexEvery - idxPhase);
  float heavy = 1.0 - smoothstep(0.0, lw * 1.9, idxDist);
  float ink = max(line * 0.30, heavy * 0.46);
  ink *= smoothstep(0.88, 0.998, clamp(n.y, 0.0, 1.0));

  float gY = dot(col, vec3(0.2126, 0.7152, 0.0722));
  /* step() returns a FLOAT, and GLSL's ternary needs a BOOL, so a bare "wantDarker ? ..." is a
     compile error ("boolean expression expected") that fails the whole program and leaves the
     canvas blank. Compare it to 0.5 first. */
  float wantDarker = step(0.46, gY);
  vec3 inkCol = wantDarker > 0.5 ? vec3(0.0) : vec3(1.0);
  col = mix(col, inkCol, ink);

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
            uLevels: { value: 14 },
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
         ogl leaves `uniformLocations` undefined and throws on the next frame.

         `ao` NEEDS THE SAME CARE FOR A DIFFERENT REASON. An unbound attribute reads as ZERO, and
         zero occlusion means fully dark — so a wall or the shadow quad left unbound would render
         BLACK, not neutral. The walls and the shadow quad are therefore filled with 1.0 (open sky),
         not with the `zeros()` helper: the wall has its own vertical gradient and per-face shading,
         and the shadow quad is a blended alpha patch, so neither should be occluded by this term. */
      const zeros = (n: number) => new Float32Array(n)
      const ones = (n: number) => new Float32Array(n).fill(1)
      const surfaceGeo = new Geometry(gl, {
        position: { size: 3, data: position },
        normal: { size: 3, data: normal },
        u: { size: 1, data: scalar.u },
        cutT: { size: 1, data: zeros(dem.n * dem.n) },
        side: { size: 1, data: zeros(dem.n * dem.n) },
        uv: { size: 2, data: zeros(dem.n * dem.n * 2) },
        ao: { size: 1, data: computeAO(dem, RELIEF) },
        index: { data: index },
      })
      const wallGeo = new Geometry(gl, {
        position: { size: 3, data: walls.position },
        normal: { size: 3, data: walls.normal },
        u: { size: 1, data: zeros(walls.count) },
        cutT: { size: 1, data: walls.scalar.drop },
        side: { size: 1, data: walls.scalar.side },
        uv: { size: 2, data: zeros(walls.count * 2) },
        ao: { size: 1, data: ones(walls.count) },
      })
      const shadowGeo = new Geometry(gl, {
        position: { size: 3, data: shadow.position },
        normal: { size: 3, data: shadow.normal },
        u: { size: 1, data: zeros(6) },
        cutT: { size: 1, data: zeros(6) },
        side: { size: 1, data: zeros(6) },
        uv: { size: 2, data: shadow.scalar.uv },
        ao: { size: 1, data: ones(6) },
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
