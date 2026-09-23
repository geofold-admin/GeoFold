'use client'

import { useEffect, useState } from 'react'

/**
 * The hero's right-hand column: a schematic instrument panel showing a fix being taken.
 *
 * WHY THIS EXISTS. At >=1080px the hero was one left-aligned column of type with the entire right
 * half of the viewport empty — the largest piece of dead space on the site, directly above the
 * fold. The recommended pattern for this product category puts the product artefact beside or
 * under the headline rather than three sections down; ours was buried in the carousel.
 *
 * WHY IT IS DRAWN, NOT PHOTOGRAPHED. Same reasoning as PhoneMock: real captures show real
 * coordinates of real field sites, which is not something to publish, and they need retaking
 * every time the UI moves. This is schematic — it shows what a fix looks like without claiming
 * to be a photograph of one, stays sharp at any size, and weighs nothing on a field connection.
 *
 * WHAT IT IS ALLOWED TO CLAIM. Only what the app does: a coordinate pair, an accuracy in metres,
 * a queue that drains when a signal returns. No sub-metre figure, no basemap it does not have.
 * The accuracy never settles below ±3 m because a phone GPS does not.
 *
 * MOTION. Everything animated here is decorative — the panel reads correctly frozen. Under
 * `prefers-reduced-motion: reduce` the effects never start and the settled state renders
 * directly, so there is no first-paint jump for someone who asked for stillness.
 */

/* The fix the panel settles on. Deliberately the same site as the capture screen in PhoneMock,
   so the two mocks read as one project rather than two unrelated demos. */
const LAT = -0.0234
const LON = 109.3421

/* Survey points, in the SVG's own 320x200 space. Positions are hand-placed to sit between the
   contour rings rather than on them — a pin drawn on a contour line reads as a label for the
   line. The last one is the arrival in the queue cycle below, so it drops in last. */
const PINS = [
  { x: 96, y: 150 },
  { x: 152, y: 118 },
  { x: 206, y: 142 },
  { x: 246, y: 120 },
  { x: 128, y: 176 },
]

/* Nested irregular closed paths: a hill in contour. Four rings is enough to read as terrain;
   more turns into moiré at this size. */
const CONTOURS = [
  'M20 150C40 100 70 70 120 62C175 53 240 70 280 100C310 124 305 160 270 176C220 198 120 196 70 182C35 172 12 165 20 150Z',
  'M52 146C68 110 95 88 135 82C180 76 232 90 262 112C284 128 280 154 252 166C210 184 128 182 88 170C62 162 46 160 52 146Z',
  'M86 142C98 118 120 104 150 100C186 96 224 108 244 124C258 136 254 152 232 160C200 172 140 170 110 160C92 154 82 152 86 142Z',
  'M120 138C128 124 144 116 166 114C190 112 214 120 226 130C234 138 230 148 214 153C192 160 152 158 134 152C124 148 118 145 120 138Z',
]

/* The queue cycle, in order. This is the offline story told in four beats: everything is up to
   date, a new point is taken with no signal, the signal returns, the point goes up. It loops so
   that someone who lands mid-cycle still sees the whole thing. */
const QUEUE_STATES = [
  { synced: 4, pending: 0, label: 'Tersinkron', tone: 'ok' as const },
  { synced: 4, pending: 1, label: 'Tanpa sinyal', tone: 'wait' as const },
  { synced: 4, pending: 1, label: 'Mengirim', tone: 'busy' as const },
  { synced: 5, pending: 0, label: 'Tersinkron', tone: 'ok' as const },
]

/* Six decimals, which is what the app records — and exactly six on both rows. A pad-to-width here
   is tempting for column stability but gives -0.023405 a seventh decimal that 109.342104 does not
   have, and two coordinates at different precisions is the one thing an instrument may not do.
   `font-variant-numeric: tabular-nums` on the readout holds the column instead. */
function coord(base: number, drift: number) {
  return (base + drift).toFixed(6)
}

export function HeroConsole() {
  /* Settled values are the initial state, so the server HTML and the first client paint agree and
     a reduced-motion visitor never sees anything else. */
  const [drift, setDrift] = useState({ lat: 0, lon: 0 })
  const [accuracy, setAccuracy] = useState(4)
  const [queue, setQueue] = useState(0)
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setLive(true)

    /* A real fix wanders in the last decimals rather than sitting still. Amplitude is ~1e-5 deg,
       about a metre — matching the ±m the panel reports, instead of the digits scrambling. */
    const wander = window.setInterval(() => {
      setDrift({
        lat: (Math.random() - 0.5) * 2e-5,
        lon: (Math.random() - 0.5) * 2e-5,
      })
      setAccuracy(3 + Math.round(Math.random() * 2))
    }, 1400)

    const cycle = window.setInterval(() => setQueue((q) => (q + 1) % QUEUE_STATES.length), 2600)

    return () => {
      window.clearInterval(wander)
      window.clearInterval(cycle)
    }
  }, [])

  const q = QUEUE_STATES[queue]

  return (
    <div className={live ? 'mk-con is-live' : 'mk-con'} aria-hidden="true">
      {/* ---- header: the panel is powered on and pointed at a project ---- */}
      <div className="mk-con-top">
        <span className="mk-con-rec" />
        <span className="mk-con-proj">Kampung Durian</span>
        <span className="mk-con-time">14:22</span>
      </div>

      {/* ---- the terrain plate ---- */}
      <div className="mk-con-plate">
        <svg viewBox="0 0 320 200" className="mk-con-svg" role="presentation" focusable="false">
          <defs>
            {/* The graticule. Drawn in the pattern rather than as 20 lines so it stays crisp and
                cheap at any render size. */}
            <pattern id="mk-grat" width="26.6" height="25" patternUnits="userSpaceOnUse">
              <path d="M26.6 0V25M0 25H26.6" fill="none" stroke="currentColor" strokeWidth=".5" />
            </pattern>
          </defs>

          <rect width="320" height="200" fill="url(#mk-grat)" className="mk-con-grat" />

          {/* Contours thin as they climb, the way a printed map indexes its rings. */}
          {CONTOURS.map((d, i) => (
            <path
              key={d}
              d={d}
              fill="none"
              className="mk-con-line"
              strokeWidth={i === 0 ? 1.4 : 0.9}
              opacity={0.85 - i * 0.13}
            />
          ))}

          {/* The walked route between points: what a survey actually leaves behind. */}
          <path
            d={`M${PINS.map((p) => `${p.x} ${p.y}`).join('L')}`}
            fill="none"
            className="mk-con-route"
          />

          {PINS.map((p, i) => (
            <g key={`${p.x}-${p.y}`} className="mk-con-pin" style={{ '--i': i } as React.CSSProperties}>
              {/* Accuracy halo: the point is a circle of confidence, not a dot. */}
              <circle cx={p.x} cy={p.y} r="11" className="mk-con-halo" />
              <circle cx={p.x} cy={p.y} r="3.6" className="mk-con-dot" />
            </g>
          ))}
        </svg>

        {/* Sweep: one thin accent line crossing the plate, the way a receiver refreshes. Purely
            decorative, so it lives outside the SVG and disappears with the motion query. */}
        <span className="mk-con-sweep" />
      </div>

      {/* ---- readout ---- */}
      <dl className="mk-con-read">
        <div>
          <dt>Lat</dt>
          <dd>{coord(LAT, drift.lat)}</dd>
        </div>
        <div>
          <dt>Lon</dt>
          <dd>{coord(LON, drift.lon)}</dd>
        </div>
        <div>
          <dt>Akurasi</dt>
          <dd>
            ±{accuracy} m
            {/* Five ticks; the fix lights the ones it has earned. Tighter fix, more ticks. */}
            <span className="mk-con-bars">
              {[0, 1, 2, 3, 4].map((n) => (
                <i key={n} className={n < 8 - accuracy ? 'on' : undefined} />
              ))}
            </span>
          </dd>
        </div>
      </dl>

      {/* ---- the queue: the whole offline argument in one strip ---- */}
      <div className={`mk-con-q tone-${q.tone}`}>
        <span className="mk-con-q-led" />
        <span className="mk-con-q-label">{q.label}</span>
        <span className="mk-con-q-count">
          {q.synced} terkirim{q.pending > 0 ? ` · ${q.pending} antre` : ''}
        </span>
      </div>
    </div>
  )
}
