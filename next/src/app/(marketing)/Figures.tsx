import type { Locale } from '@/lib/i18n'

/**
 * Line schematics for the capability rows.
 *
 * Drawn rather than screenshotted, for the reasons PhoneMock already sets out: real captures
 * show real coordinates of real field sites, which is not something to publish on a marketing
 * page, and they would need retaking every time the UI moved. These weigh nothing, stay sharp
 * at any size, and are honest about being diagrams.
 *
 * HOUSE STYLE. One viewBox (320x240, matching the 4:3 frame in paper.css), hairline strokes at
 * 1 user unit, no fills except the accent marks, and labels in the same 7px uppercase the rest
 * of the site uses for micro-type. Colour comes from the classes in paper.css, never from a
 * literal here — which is what let the whole palette change under these without touching them.
 *
 * The aerial figure is the only one allowed the terracotta secondary. That rule has survived
 * two re-skins; it is the reason the second accent still means something.
 *
 * EACH FIGURE TAKES A LOCALE, NOT AN ALT STRING. There are two kinds of language in here: the
 * description a screen reader announces, and the words drawn inside the picture — column heads,
 * a legend, a scale note. Those second ones are part of the illustration, so they live with the
 * illustration rather than being threaded in from the page; handing the component a locale gets
 * both, and means a new figure cannot be added with a translated alt and an untranslated legend.
 */

type FigProps = { locale: Locale }

const BOX = '0 0 320 240'

const text: Record<Locale, {
  altCapture: string
  altOffline: string
  altMap: string
  altExport: string
  altAerial: string
  queue: string
  quadrat: string
  colRef: string
  colCoord: string
  colPhoto: string
  flightPath: string
}> = {
  id: {
    altCapture: 'Foto dengan koordinat tercetak di gambarnya',
    altOffline: 'Titik tersimpan di perangkat dan terkirim saat ada sinyal',
    altMap: 'Semua titik survei di atas peta dengan grid kuadrat',
    altExport: 'Berkas Excel dengan foto tertanam di barisnya',
    altAerial: 'Foto udara dari pesawat masuk ke proyek yang sama',
    queue: 'Antrean lokal',
    quadrat: 'Kuadrat 1 ha',
    colRef: 'Ref',
    colCoord: 'Koordinat',
    colPhoto: 'Foto',
    flightPath: 'Jalur terbang',
  },
  en: {
    altCapture: 'A photo with its coordinates printed into the image',
    altOffline: 'Points held on the device and sent once there is a signal',
    altMap: 'Every survey point on a map with a quadrat grid',
    altExport: 'An Excel file with the photo embedded in its row',
    altAerial: 'Aerial photos from the aircraft filed into the same project',
    queue: 'Local queue',
    quadrat: '1 ha quadrat',
    colRef: 'Ref',
    colCoord: 'Coordinates',
    colPhoto: 'Photo',
    flightPath: 'Flight path',
  },
}

/** Capture: the frame, the reticle, and the stamp that ends up burned into the photograph. */
export function FigCapture({ locale }: FigProps) {
  return (
    <svg viewBox={BOX} className="pg-fig" role="img" aria-label={text[locale].altCapture}>
      <rect x="30" y="26" width="260" height="188" rx="4" className="pg-fig-line" />

      {/* corner reticle — four brackets, not a full box, so it reads as a viewfinder */}
      {['M108 78v-14h14', 'M212 78v-14h-14', 'M108 150v14h14', 'M212 150v14h-14'].map((d) => (
        <path key={d} d={d} className="pg-fig-accent" strokeWidth="1.4" />
      ))}
      <circle cx="160" cy="114" r="2.5" className="pg-fig-fill" />

      {/* the stamp: a solid bar across the foot of the frame, which is the point of the product.
          The coordinates themselves are numerals and a metre symbol — the same in both
          languages, so they are not in the table above. */}
      <rect x="30" y="176" width="260" height="38" className="pg-fig-soft" />
      <text x="44" y="193" className="pg-fig-label">-0.023405 · 109.342101</text>
      <text x="44" y="206" className="pg-fig-label">±4 M · 07/09 14:22</text>
      <path d="M30 176h260" className="pg-fig-line" />
    </svg>
  )
}

/** Offline: a queue that keeps accepting rows with no signal, and drains when one returns. */
export function FigOffline({ locale }: FigProps) {
  const rows = [0, 1, 2, 3]
  return (
    <svg viewBox={BOX} className="pg-fig" role="img" aria-label={text[locale].altOffline}>
      {/* no-signal mark, top right */}
      <g transform="translate(248 44)">
        <path d="M0 14a12 12 0 0 1 20-9M2 8a18 18 0 0 1 26-2" className="pg-fig-line" strokeWidth="1.4" />
        <path d="M-4 20 24 -4" className="pg-fig-accent" strokeWidth="1.4" />
      </g>
      <text x="30" y="48" className="pg-fig-label">{text[locale].queue}</text>

      {rows.map((i) => {
        const y = 74 + i * 38
        /* The last row is the one still waiting: hollow, not coloured. An unsent point is not an
           error, so it is drawn as the absence of a signal rather than as a warning. */
        const pending = i === rows.length - 1
        return (
          <g key={i}>
            <rect x="30" y={y} width="260" height="28" rx="4" className="pg-fig-line" />
            <rect x="44" y={y + 9} width="52" height="4" rx="2" className="pg-fig-soft" />
            <rect x="106" y={y + 9} width="86" height="4" rx="2" className="pg-fig-soft" />
            {pending ? (
              <circle cx="270" cy={y + 14} r="4" className="pg-fig-line" strokeWidth="1.4" />
            ) : (
              <circle cx="270" cy={y + 14} r="4" className="pg-fig-fill" />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Map: the spread, and the quadrat used to measure how much of a block has been covered. */
export function FigMap({ locale }: FigProps) {
  const pins = [
    [82, 92],
    [128, 138],
    [176, 104],
    [214, 156],
    [110, 186],
    [246, 96],
  ]
  return (
    <svg viewBox={BOX} className="pg-fig" role="img" aria-label={text[locale].altMap}>
      <defs>
        <pattern id="pg-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M32 0V32M0 32H32" className="pg-fig-line" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="30" y="26" width="260" height="188" rx="4" fill="url(#pg-grid)" />
      <rect x="30" y="26" width="260" height="188" rx="4" className="pg-fig-line" />

      {/* the quadrat: one measured square, dashed because it is drawn over the ground, not on it */}
      <rect
        x="94"
        y="90"
        width="96"
        height="96"
        className="pg-fig-accent"
        strokeWidth="1.2"
        strokeDasharray="4 4"
      />
      <text x="94" y="82" className="pg-fig-label">{text[locale].quadrat}</text>

      {pins.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="9" className="pg-fig-fill" opacity=".12" />
          <circle cx={x} cy={y} r="3" className="pg-fig-fill" />
        </g>
      ))}
    </svg>
  )
}

/** Export: the spreadsheet, with the photograph sitting in the row rather than beside it. */
export function FigExport({ locale }: FigProps) {
  const rows = [0, 1, 2]
  const c = text[locale]
  return (
    <svg viewBox={BOX} className="pg-fig" role="img" aria-label={c.altExport}>
      <rect x="30" y="26" width="260" height="188" rx="4" className="pg-fig-line" />
      {/* header */}
      <path d="M30 58h260" className="pg-fig-line" />
      <text x="44" y="48" className="pg-fig-label">{c.colRef}</text>
      <text x="106" y="48" className="pg-fig-label">{c.colCoord}</text>
      <text x="212" y="48" className="pg-fig-label">{c.colPhoto}</text>
      <path d="M96 26v188M200 26v188" className="pg-fig-line" />

      {rows.map((i) => {
        const y = 58 + i * 52
        return (
          <g key={i}>
            {i > 0 && <path d={`M30 ${y}h260`} className="pg-fig-line" />}
            <rect x="44" y={y + 24} width="34" height="4" rx="2" className="pg-fig-soft" />
            <rect x="110" y={y + 24} width="72" height="4" rx="2" className="pg-fig-soft" />
            {/* the embedded image cell: a thumbnail, drawn as one */}
            <rect x="212" y={y + 12} width="44" height="30" rx="2" className="pg-fig-accent" strokeWidth="1.2" />
            <path
              d={`M212 ${y + 36} 224 ${y + 26} 233 ${y + 33} 243 ${y + 22} 256 ${y + 36}`}
              className="pg-fig-accent"
              strokeWidth="1.2"
            />
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Aerial: the flight lines, and the points taken along them.
 * The only figure that uses the terracotta secondary — see the file header.
 */
export function FigAerial({ locale }: FigProps) {
  const legs = [78, 116, 154, 192]
  return (
    <svg viewBox={BOX} className="pg-fig" role="img" aria-label={text[locale].altAerial}>
      <rect x="30" y="26" width="260" height="188" rx="4" className="pg-fig-line" />
      <text x="30" y="48" className="pg-fig-label">{text[locale].flightPath}</text>

      {/* boustrophedon: the pattern a mapping flight actually flies */}
      <path
        d={`M62 ${legs[0]}H258M258 ${legs[0]}V${legs[1]}M258 ${legs[1]}H62M62 ${legs[1]}V${legs[2]}M62 ${legs[2]}H258M258 ${legs[2]}V${legs[3]}M258 ${legs[3]}H62`}
        className="pg-fig-aerial"
        strokeWidth="1.3"
      />

      {legs.map((y, li) =>
        [92, 148, 204].map((x) => (
          <circle key={`${li}-${x}`} cx={x} cy={y} r="2.6" className="pg-fig-aerial-fill" />
        )),
      )}

      {/* the aircraft, at the head of the last leg */}
      <g transform="translate(62 192)">
        <path d="M-7 0h14M0 -7v14" className="pg-fig-aerial" strokeWidth="1.4" />
        <circle cx="0" cy="0" r="10" className="pg-fig-aerial" strokeWidth="1" opacity=".5" />
      </g>
    </svg>
  )
}
