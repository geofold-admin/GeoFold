/**
 * terrainDem.ts — decode the hero's real DEM payload and turn it into a 3D block mesh.
 *
 * WHY THIS IS SEPARATE FROM THE COMPONENT. Everything here is pure arithmetic over an
 * ArrayBuffer: no DOM, no WebGL, no React. That is deliberate, because it is the part that has
 * to be RIGHT — the geometry has to sit on the same numbers the static PNG was drawn from, and a
 * pure function can be checked against the generator's own output without a browser in the loop.
 * The component is the part that has to be ALIVE.
 *
 * THE DATA. `public/hero-terrain-dem.bin`, written by `scripts/build-terrain-3d.mjs` from the
 * cached Mapzen/Terrarium tiles under `.cache/terrain`. Little-endian, 38-byte header:
 *
 *   0  u32 magic "GFD3"   4  u16 N            6  f32 zLo        10 f32 zHi
 *   14 f32 cellX          18 f32 cellY        22 f32 spanDeg    26 f32 centreLat
 *   30 f32 centreLon      34 u32 count        38 i16 decimetres above zLo
 *
 * A NOTE ON GAMMA, AND WHY THE MESH IS NOT GAMMA-WARPED. The static PNG pushed elevation through
 * `clamp01((z - zLo) / span) ** 0.52` before it fed BOTH the geometry and the colour ramp — a
 * power curve that expands the low end so a basin occupying 2% of the metres occupies a third of
 * the colours. For a flat picture that is the right call. For a mesh that gets TURNED it is not:
 * it is a lie about the shape, and from a low camera angle you can see the lowland stretched and
 * the peaks squashed. So the geometry here is LINEAR in elevation and only the COLOUR is
 * gamma-expanded. The block is the true shape; the tint is the map tint. The two are passed to
 * the shader as separate values for exactly this reason.
 */

export type Dem = {
  /** Samples per side. */
  n: number
  /** Low clip, metres (p0.5). */
  zLo: number
  /** High clip, metres (p99.5). */
  zHi: number
  /** Metres per cell, east-west. */
  cellX: number
  /** Metres per cell, north-south. */
  cellY: number
  /** Degrees each way from the centre. */
  spanDeg: number
  centreLat: number
  centreLon: number
  /** Heights above zLo, in decimetres. Row-major, north-to-south then west-to-east. */
  dm: Int16Array
}

const MAGIC = 0x33464447 // "GFD3"
const HEADER = 38

/** The gamma the colour ramp uses. Mirrors TERRAIN_GAMMA in the generator. */
export const COLOUR_GAMMA = 0.52

export function parseDem(buf: ArrayBuffer): Dem {
  if (buf.byteLength < HEADER) throw new Error(`DEM too short: ${buf.byteLength} bytes`)
  const dv = new DataView(buf)
  const magic = dv.getUint32(0, true)
  if (magic !== MAGIC) throw new Error(`DEM bad magic: 0x${magic.toString(16)}`)
  const n = dv.getUint16(4, true)
  const count = dv.getUint32(34, true)
  if (count !== n * n) throw new Error(`DEM count ${count} != N*N (${n * n})`)
  if (buf.byteLength < HEADER + 2 * count) throw new Error(`DEM payload truncated`)
  return {
    n,
    zLo: dv.getFloat32(6, true),
    zHi: dv.getFloat32(10, true),
    cellX: dv.getFloat32(14, true),
    cellY: dv.getFloat32(18, true),
    spanDeg: dv.getFloat32(22, true),
    centreLat: dv.getFloat32(26, true),
    centreLon: dv.getFloat32(30, true),
    // Offset 38 is even, so this view is aligned and shares the buffer (no copy).
    dm: new Int16Array(buf, HEADER, count),
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Per-vertex normalised height in 0..1, LINEAR — `(z - zLo) / (zHi - zLo)`.
 *
 * This is both the geometry's height AND the value the shader feeds through the gamma curve for
 * its colour. One array, two uses, so the surface and its tint can never disagree about where a
 * metre sits.
 */
export function normalisedHeights(dem: Dem): Float32Array {
  const { n, dm, zLo, zHi } = dem
  const span = zHi - zLo || 1
  const u = new Float32Array(n * n)
  for (let k = 0; k < u.length; k++) u[k] = clamp01(dm[k] / 10 / span)
  return u
}

export type Mesh = {
  position: Float32Array
  normal: Float32Array
  /** Extra scalar attributes, by name. */
  scalar: Record<string, Float32Array>
  index: Uint32Array
  /** Number of indices to draw. */
  count: number
}

/**
 * The water surface for this payload, as a normalised 0..1 elevation.
 *
 * WHY IT IS DERIVED RATHER THAN A CONSTANT. A hard-coded threshold silently becomes wrong the
 * moment the DEM window, the zoom or the build changes — and the failure is invisible, because a
 * mistuned threshold still draws *some* water, just in the wrong place. Deriving it from the
 * payload means the water follows the data.
 *
 * The percentile itself is the caller's choice and is documented where it is used (see the water
 * block in HeroTerrain3D's fragment shader): a low percentile gives a physically smaller river but
 * draws it as disconnected ponds, a higher one gives a connected dendritic network at the cost of
 * including some floodplain. This function only does the arithmetic.
 */
export function waterU(dem: Dem, percentile: number): number {
  const { dm, zLo, zHi } = dem
  const span = zHi - zLo || 1
  const sorted = Int16Array.from(dm).sort()
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(percentile * (sorted.length - 1))))
  /* dm is decimetres above zLo, so the elevation is dm/10 and the normalised value is dm/10/span. */
  return clamp01(sorted[idx] / 10 / span)
}

/**
 * The top surface: an N×N heightfield centred on the origin.
 *
 * PLAN = 1.0 across, so `x` and `z` run -0.5..0.5 and the vertical scale is a single number the
 * caller can reason about (see `height` below). `y` is elevation above the base plane.
 *
 * NORMALS ARE COMPUTED FROM THE DISPLAYED GEOMETRY, not from the DEM's metres. The block is
 * vertically exaggerated (it has to be — see the component), so the *visible* slope is what the
 * light must see, or a ridge would be lit as though it were a plain.
 */
export function buildSurface(dem: Dem, height: number): Mesh {
  const { n } = dem
  const u = normalisedHeights(dem)
  const position = new Float32Array(n * n * 3)
  const normal = new Float32Array(n * n * 3)
  const step = 1 / (n - 1)

  for (let j = 0; j < n; j++) {
    const z = j * step - 0.5
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      position[k * 3] = i * step - 0.5
      position[k * 3 + 1] = u[k] * height
      position[k * 3 + 2] = z
    }
  }

  const at = (i: number, j: number) => u[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))] * height
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      const dydx = (at(i + 1, j) - at(i - 1, j)) / (2 * step)
      const dydz = (at(i, j + 1) - at(i, j - 1)) / (2 * step)
      // n = normalize(-dydx, 1, -dydz)
      const inv = 1 / Math.hypot(dydx, 1, dydz)
      normal[k * 3] = -dydx * inv
      normal[k * 3 + 1] = inv
      normal[k * 3 + 2] = -dydz * inv
    }
  }

  const index = new Uint32Array((n - 1) * (n - 1) * 6)
  let p = 0
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i
      const b = j * n + i + 1
      const c = (j + 1) * n + i + 1
      const d = (j + 1) * n + i
      // Wound so the face normal is +y: (b-a)×(c-a) would point down.
      index[p++] = a
      index[p++] = c
      index[p++] = b
      index[p++] = a
      index[p++] = d
      index[p++] = c
    }
  }

  return { position, normal, scalar: { u }, index, count: index.length }
}

/**
 * The cut faces: the four sides extruded straight down from the surface to a flat base.
 *
 * WHY THE BLOCK IS CUT RATHER THAN A FLOATING SKIN. Both reference photos the client supplied are
 * terrain *blocks* — a slice of ground lifted out, with the exposed side walls visible. The block
 * is the form that was asked for, and the walls are what make it read as solid rather than as a
 * crumpled sheet. They are also the thing a 2D image cannot show, because a wall is only visible
 * once you can turn the object.
 *
 * `drop` runs 0 at the surface to 1 at the base, which is the parameter the wall gradient is
 * painted from. `side` selects the face so the light can treat each of the four differently.
 */
export function buildWalls(dem: Dem, height: number, depth: number): Mesh {
  const { n } = dem
  const u = normalisedHeights(dem)
  const step = 1 / (n - 1)
  const quads = n - 1
  const verts = quads * 4 * 6
  const position = new Float32Array(verts * 3)
  const normal = new Float32Array(verts * 3)
  const drop = new Float32Array(verts)
  const side = new Float32Array(verts)

  const xAt = (i: number) => i * step - 0.5
  const zAt = (j: number) => j * step - 0.5
  const yAt = (i: number, j: number) => u[j * n + i] * height

  let v = 0
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, dr: number, sd: number) => {
    position[v * 3] = x
    position[v * 3 + 1] = y
    position[v * 3 + 2] = z
    normal[v * 3] = nx
    normal[v * 3 + 1] = ny
    normal[v * 3 + 2] = nz
    drop[v] = dr
    side[v] = sd
    v++
  }
  /* Each side is a strip of quads. `a` and `b` are the two surface corners of one quad; the base
     corners are the same plan position at -depth. Two triangles, six vertices, no index buffer —
     six thousand vertices total does not need one.
     WINDING: counter-clockwise as seen from OUTSIDE the block, because ogl culls back faces by
     default (frontFace CCW). Emitted as (a, b_base, b) and (a, a_base, b_base); the naive
     (a, b, b_base) order comes out facing inward and the walls vanish. */
  const strip = (corner: (k: number) => [number, number, number], nx: number, nz: number, sd: number) => {
    for (let k = 0; k < quads; k++) {
      const [ax, ay, az] = corner(k)
      const [bx, by, bz] = corner(k + 1)
      const base = -depth
      push(ax, ay, az, nx, 0, nz, 0, sd)
      push(bx, base, bz, nx, 0, nz, 1, sd)
      push(bx, by, bz, nx, 0, nz, 0, sd)
      push(ax, ay, az, nx, 0, nz, 0, sd)
      push(ax, base, az, nx, 0, nz, 1, sd)
      push(bx, base, bz, nx, 0, nz, 1, sd)
    }
  }

  // North edge (j = 0), facing -z. Walk i from n-1 down so the outward winding is consistent.
  strip((k) => { const i = n - 1 - k; return [xAt(i), yAt(i, 0), zAt(0)] }, 0, -1, 0)
  // South edge (j = n-1), facing +z.
  strip((k) => { const i = k; return [xAt(i), yAt(i, n - 1), zAt(n - 1)] }, 0, 1, 1)
  // West edge (i = 0), facing -x.
  strip((k) => { const j = k; return [xAt(0), yAt(0, j), zAt(j)] }, -1, 0, 2)
  // East edge (i = n-1), facing +x.
  strip((k) => { const j = n - 1 - k; return [xAt(n - 1), yAt(n - 1, j), zAt(j)] }, 1, 0, 3)

  return { position, normal, scalar: { drop, side }, index: new Uint32Array(0), count: verts }
}

/**
 * A flat quad on the base plane carrying a soft alpha — the block's contact shadow.
 *
 * It sits just BELOW the base plane and is WIDER than the block (s = 0.75 against a 0.5 plan
 * half-width), so the part of the gradient outside the footprint shows as a soft halo around the
 * base rather than being hidden under the block. It is a child of the same rotating group as the
 * block, so it stays aligned as the block turns.
 */
export function buildShadowQuad(depth: number): Mesh {
  const y = -depth - 0.006
  const s = 0.75
  const position = new Float32Array([
    -s, y, -s, s, y, -s, s, y, s,
    -s, y, -s, s, y, s, -s, y, s,
  ])
  const normal = new Float32Array(18)
  for (let k = 0; k < 6; k++) normal[k * 3 + 1] = 1
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1])
  return { position, normal, scalar: { uv }, index: new Uint32Array(0), count: 6 }
}

/**
 * Baked ambient occlusion for the surface — the term that makes the block read as LIT RELIEF.
 *
 * WHY IT IS NEEDED. Measured against the client's own reference render, the first WebGL version
 * scored 3/10 judged as terrain, and the critique named the cause exactly: "the absence of a
 * coherent light model — the terrain is *drawn* rather than *lit*, and the eye reads it as a flat
 * printed map glued to the top of a solid block". Lambert lighting was already present and could
 * not fix it on its own, for two measured reasons: the light gain spanned only 0.66..1.07 (a 1.6:1
 * range, close to invisible) and the contour ink was drawn at 90% strength, so nested contour rings
 * carried more signal than the shading did. Occlusion is the missing term — it is what tells the
 * eye which ground sits in a hollow and which sits on a ridge.
 *
 * WHY IT IS BAKED, NOT ANIMATED. The brief bans looping animation outright, and `verify-site.mjs`
 * measures the canvas for self-movement — an earlier version that spun on its own failed with 10495
 * changed samples against a limit of 200. So occlusion must be a static vertex attribute computed
 * once, never a per-frame pass.
 *
 * METHOD — horizon mapping. From each vertex, march outward along N compass directions and keep the
 * steepest upward angle seen. A vertex in a basin has high horizon angles all around it and goes
 * dark; one on a ridge sees open sky and stays lit. TWO radii are combined because a single one
 * cannot serve both jobs: a short march never reaches the valley walls, a long march steps over the
 * gullies. Computed on the DISPLAYED geometry — vertically exaggerated, exactly like the normals —
 * so the occlusion agrees with the shape the eye is actually shown rather than with the true metres.
 *
 * The result is rescaled against its own p2..p98 before return. Without that the term is at the
 * mercy of how much relief happens to fall inside the window, and this window is mostly a flat
 * basin: an absolute threshold would leave almost the whole block at one value and change nothing.
 */
export function computeAO(dem: Dem, height: number): Float32Array {
  const { n } = dem
  const u = normalisedHeights(dem)
  const step = 1 / (n - 1)
  const DIRS = 8
  const STEPS = 16
  /* Near radius catches gullies and river banks; far radius catches the basin walls. The weights
     favour the near term because the fine relief is what the resting camera angle shows most of. */
  const RADII: [number, number][] = [
    [6, 0.62],
    [20, 0.38],
  ]

  const dirX = new Float32Array(DIRS)
  const dirZ = new Float32Array(DIRS)
  for (let d = 0; d < DIRS; d++) {
    const a = (d / DIRS) * Math.PI * 2
    dirX[d] = Math.cos(a)
    dirZ[d] = Math.sin(a)
  }

  const at = (i: number, j: number) => {
    const ci = i < 0 ? 0 : i > n - 1 ? n - 1 : i
    const cj = j < 0 ? 0 : j > n - 1 ? n - 1 : j
    return u[cj * n + ci] * height
  }

  const raw = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      const yc = u[k] * height
      let occ = 0
      for (let ri = 0; ri < RADII.length; ri++) {
        const [r, w] = RADII[ri]
        let sum = 0
        for (let d = 0; d < DIRS; d++) {
          let maxSin = 0
          for (let s = 1; s <= STEPS; s++) {
            const dist = (s / STEPS) * r
            const si = Math.round(i + dirX[d] * dist)
            const sj = Math.round(j + dirZ[d] * dist)
            if (si < 0 || si > n - 1 || sj < 0 || sj > n - 1) continue
            const dh = at(si, sj) - yc
            if (dh <= 0) continue
            const slope = dh / (dist * step)
            const sin = slope / Math.sqrt(1 + slope * slope)
            if (sin > maxSin) maxSin = sin
          }
          sum += maxSin
        }
        occ += (sum / DIRS) * w
      }
      raw[k] = 1 - occ
    }
  }

  /* Rescale p2..p98 onto 0.28..1. A closed basin has no cell with a fully open horizon, so without
     this the term would compress into a narrow band near 1 and be invisible — the same failure the
     light gain had. The floor is 0.28 rather than 0 so the deepest hollow stays readable instead of
     turning into a black hole in the terrain. */
  const sorted = Float32Array.from(raw).sort()
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))]
  const lo = pct(0.02)
  const hi = pct(0.98)
  const span = hi - lo || 1
  const ao = new Float32Array(n * n)
  for (let k = 0; k < raw.length; k++) {
    const t = (raw[k] - lo) / span
    ao[k] = 0.28 + 0.72 * (t < 0 ? 0 : t > 1 ? 1 : t)
  }
  return ao
}
