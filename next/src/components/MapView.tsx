'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '@/lib/api-client'
import type { SurveyDetail, SurveyFeatureCollection, SurveyProperties } from '@/lib/types'

/* THE SURVEY MARKER IS THE CLIENT'S ORANGE, and this is the one place in the product where
   orange is not a choice. The brief is emphatic about it: "Marker atau Pin survei yang
   ditambahkan pengguna MUTLAK harus berwarna GEOFOLD Orange (#F35D19) untuk kontras instan di
   atas citra satelit yang berwarna hijau/coklat."
 *
 * That reasoning is sound and it is worth restating, because it is a different argument from the
 * one the marketing site uses. On a satellite basemap the background is green and brown — the
 * complement of orange — so an orange pin is the one hue that cannot be mistaken for terrain.
 * The old spruce dot (#2c4a3b) was chosen when the map tiles were a light street style, and on a
 * satellite layer it was a dark green dot on dark green ground.
 *
 * The ring is white, not navy: a pin is read against imagery whose brightness varies from a
 * white cloud to a black shadow, and a white collar is what keeps the dot's own edge visible on
 * both. Measured against the marker itself, white on #F35D19 is 3.29:1 — under AA for text, but
 * this is a 2px ring around a filled shape, which WCAG 1.4.11 measures at 3:1, and it clears it.
 */
const MARKER = '#F35D19'

/* The measuring and drawing strokes are GEOFOLD Blue. The design system assigns #014AB5 to
   "warna Polyline (garis batas ukur), dan warna alat gambar" — the measuring polyline AND the
   drawing tools, which is exactly the two things this component now does. */
const MEASURE = '#014AB5'

/* The polygon fill. The palette calls for "Warna Biru GEOFOLD yang dipudarkan hingga 15% opacity"
   so that "gambar peta/satelit di bawahnya tetap terlihat jelas tembus pandang". So the fill is
   the blue itself at 15%, not a pre-blended solid — over white it composites to #E0E7FF, the
   swatch the document prints, but over satellite imagery it stays translucent, which is the
   whole point of the rule. */
const SELECT_FILL = MEASURE
const SELECT_FILL_OPACITY = 0.15

type Feature = SurveyFeatureCollection['features'][number]

function parseDetails(json: string | null): [string, string][] {
  if (!json) return []
  try {
    const o = JSON.parse(json)
    if (o && typeof o === 'object' && !Array.isArray(o)) return Object.entries(o).map(([k, v]) => [k, v == null ? '' : String(v)])
  } catch { /* ignore */ }
  return []
}

// A plain HTML dot as the marker icon. A divIcon sidesteps Leaflet's default image-based marker
// (which breaks under bundlers) while keeping the design's spruce dot — and, unlike CircleMarker,
// a Marker can be dragged.
const dotIcon = L.divIcon({
  className: 'survey-dot',
  html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${MARKER};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.35)"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

function fmtDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`
}

/* Area is reported in hectares once it is large enough that square metres stop being readable —
   the palette document names the pair explicitly: "hasil kalkulasi luas (hektar/meter persegi)".
   10 000 m² = 1 ha is the metric convention the document assumes. */
function fmtArea(m2: number): string {
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2)} m²`
}

/* Geodesic area of a ring, by the spherical-excess formula Leaflet.draw and Turf both use. The
   Earth radius is Leaflet core's L.CRS.Earth.R (6371000 m) — the same sphere L.LatLng.distanceTo
   uses for the perimeter — so area and perimeter here share one Earth model instead of mixing
   the mean radius with WGS84's equatorial one. The formula is antisymmetric in (lng2 - lng1), so
   it is sign-correct for either winding and we take the magnitude at the end. */
const EARTH_R = 6371000

function geodesicArea(points: L.LatLng[]): number {
  const n = points.length
  if (n < 3) return 0
  const rad = Math.PI / 180
  let total = 0
  for (let i = 0; i < n; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    total += (p2.lng - p1.lng) * rad * (2 + Math.sin(p1.lat * rad) + Math.sin(p2.lat * rad))
  }
  return Math.abs((total * EARTH_R * EARTH_R) / 2)
}

/* Closed-ring perimeter: the sum of the great-circle legs INCLUDING the leg that joins the last
   vertex back to the first, because the shape the user is measuring is a polygon, not an open
   path. Below three vertices there is no ring yet, so it falls back to the open path length. */
function ringPerimeter(points: L.LatLng[]): number {
  const n = points.length
  if (n < 2) return 0
  let total = 0
  const legs = n >= 3 ? n : n - 1
  for (let i = 0; i < legs; i++) total += points[i].distanceTo(points[(i + 1) % n])
  return total
}

function SurveyMarker({
  feature,
  draggable,
  onMove,
}: {
  feature: Feature
  draggable: boolean
  onMove: (id: string, lat: number, lng: number) => void
}) {
  const props: SurveyProperties = feature.properties
  const [lng, lat] = feature.geometry.coordinates
  const details = parseDetails(props.detailsJson)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'none'>('idle')
  const [editLat, setEditLat] = useState('')
  const [editLng, setEditLng] = useState('')
  const [editing, setEditing] = useState(false)

  const loadPhoto = async () => {
    if (state !== 'idle') return
    if (props.photoCount === 0) { setState('none'); return }
    setState('loading')
    try {
      const detail = await api<SurveyDetail>(`/api/surveys/${props.id}`)
      const photo = detail.photos.find((p) => p.uploadStatus === 'uploaded') ?? detail.photos[0]
      if (!photo) { setState('none'); return }
      const { url } = await api<{ url: string }>(`/api/surveys/${props.id}/photos/${photo.id}/url`)
      setPhotoUrl(url)
      setState('idle')
    } catch { setState('error') }
  }

  const beginEdit = () => {
    setEditLat(lat.toFixed(6))
    setEditLng(lng.toFixed(6))
    setEditing(true)
  }

  const parsedEdit = useMemo(() => {
    const a = Number(editLat.trim())
    const o = Number(editLng.trim())
    const ok =
      editLat.trim() !== '' && editLng.trim() !== '' &&
      Number.isFinite(a) && Number.isFinite(o) &&
      a >= -90 && a <= 90 && o >= -180 && o <= 180
    return ok ? { lat: a, lng: o } : null
  }, [editLat, editLng])

  return (
    <Marker
      position={[lat, lng]}
      icon={dotIcon}
      draggable={draggable}
      // Popups (and stray drags) get in the way while measuring; hand clicks to the map instead.
      interactive={draggable}
      eventHandlers={{
        popupopen: loadPhoto,
        dragend: (e) => {
          const p = (e.target as L.Marker).getLatLng()
          onMove(props.id, p.lat, p.lng)
        },
      }}
    >
      <Popup maxWidth={260}>
        <div style={{ minWidth: 200 }}>
          {photoUrl ? (
            <img src={photoUrl} alt="Survey" style={{ width: '100%', borderRadius: 6, marginBottom: 6 }} />
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ink-2)', padding: '18px 0', textAlign: 'center', background: 'var(--paper)', borderRadius: 0, marginBottom: 6 }}>
              {state === 'loading' && 'Loading photo…'}{state === 'error' && 'Photo unavailable'}{state === 'none' && 'No photo'}{state === 'idle' && !photoUrl && 'Open to load photo'}
            </div>
          )}
          <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{props.status}</div>
          {/* The coordinate readout takes the monospaced face and the brand blue: it is the one
              line in this popup that is a measurement rather than a description, and the brief
              assigns both the face and the colour to exactly that role. */}
          <div style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono), ui-monospace, monospace' }}>{lat.toFixed(5)}, {lng.toFixed(5)}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{new Date(props.capturedAtUtc).toLocaleString()}</div>
          {details.length > 0 && (
            <table style={{ marginTop: 6, fontSize: 12, borderCollapse: 'collapse' }}>
              <tbody>{details.map(([k, v]) => <tr key={k}><td style={{ color: 'var(--ink-3)', paddingRight: 8, verticalAlign: 'top' }}>{k}</td><td>{v}</td></tr>)}</tbody>
            </table>
          )}

          {editing ? (
            <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input inputMode="decimal" value={editLat} onChange={(e) => setEditLat(e.target.value)} placeholder="lat"
                  style={{ width: '50%', fontSize: 12, padding: '4px 6px', fontFamily: 'var(--font-mono), ui-monospace, monospace' }} />
                <input inputMode="decimal" value={editLng} onChange={(e) => setEditLng(e.target.value)} placeholder="lng"
                  style={{ width: '50%', fontSize: 12, padding: '4px 6px', fontFamily: 'var(--font-mono), ui-monospace, monospace' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button
                  type="button"
                  disabled={!parsedEdit}
                  onClick={() => { if (parsedEdit) { onMove(props.id, parsedEdit.lat, parsedEdit.lng); setEditing(false) } }}
                  style={{ flex: 1, fontSize: 12, padding: '5px 8px', background: 'var(--accent)', color: '#fff', border: 0, cursor: parsedEdit ? 'pointer' : 'not-allowed', opacity: parsedEdit ? 1 : 0.5 }}
                >Save</button>
                <button type="button" onClick={() => setEditing(false)}
                  style={{ fontSize: 12, padding: '5px 8px', background: 'var(--surface-2)', border: '1px solid var(--line)', cursor: 'pointer' }}>Cancel</button>
              </div>
              {!parsedEdit && (editLat || editLng) && (
                <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>lat -90..90, lng -180..180</div>
              )}
            </div>
          ) : (
            <button type="button" onClick={beginEdit}
              style={{ marginTop: 8, fontSize: 12, padding: '5px 8px', background: 'transparent', border: '1px solid var(--line-strong)', cursor: 'pointer' }}>
              Edit coordinates
            </button>
          )}
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>Tip: drag the pin to move it.</div>
        </div>
      </Popup>
    </Marker>
  )
}

type Mode = 'none' | 'measure' | 'polygon'

/* One click handler drives both drawing modes: every click on the map appends a vertex to the
   active shape. Measure draws an open polyline with a running distance; polygon draws a closed
   ring with live area and perimeter. The mode is the only thing that differs, so it is the prop. */
function DrawLayer({
  mode,
  points,
  setPoints,
}: {
  mode: 'measure' | 'polygon'
  points: L.LatLng[]
  setPoints: (p: L.LatLng[]) => void
}) {
  useMapEvents({
    click: (e) => setPoints([...points, e.latlng]),
  })

  if (points.length === 0) return null

  if (mode === 'measure') {
    let cumulative = 0
    const labels = points.map((p, i) => {
      if (i > 0) cumulative += points[i - 1].distanceTo(p)
      return { p, cumulative }
    })
    return (
      <>
        <Polyline positions={points} pathOptions={{ color: MEASURE, weight: 3, dashArray: '6 8' }} />
        {labels.map(({ p, cumulative: c }, i) => (
          <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: MEASURE, fillColor: '#fff', fillOpacity: 1, weight: 2 }}>
            {i > 0 && (
              <Tooltip permanent direction="top" offset={[0, -6]}>
                <span style={{ fontSize: 11 }}>{fmtDistance(c)}</span>
              </Tooltip>
            )}
          </CircleMarker>
        ))}
      </>
    )
  }

  // Polygon: the closed ring, a handle on every vertex, and a floating area label at the centroid
  // once there are enough vertices to enclose anything.
  const closed = points.length >= 3
  const centroid = points.reduce(
    (a, p) => [a[0] + p.lat / points.length, a[1] + p.lng / points.length],
    [0, 0],
  ) as [number, number]

  return (
    <>
      <Polygon
        positions={points}
        pathOptions={{ color: MEASURE, weight: 3, fillColor: SELECT_FILL, fillOpacity: SELECT_FILL_OPACITY }}
      />
      {points.map((p, i) => (
        <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: MEASURE, fillColor: '#fff', fillOpacity: 1, weight: 2 }} />
      ))}
      {closed && (
        <CircleMarker center={centroid} radius={0} pathOptions={{ opacity: 0, fillOpacity: 0 }}>
          <Tooltip permanent direction="center">
            <span style={{ fontSize: 11, fontWeight: 600 }}>{fmtArea(geodesicArea(points))}</span>
          </Tooltip>
        </CircleMarker>
      )}
    </>
  )
}

// Esri World Imagery: global satellite with no API key and no billing account, which is the
// same reason the mobile map avoids the Google SDK. Note the {z}/{y}/{x} order — Esri differs
// from the OSM {z}/{x}/{y} convention, and swapping them silently yields blank tiles.
const BASEMAPS = {
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
  street: {
    label: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
} as const

// Satellite imagery carries no place names; this transparent overlay puts them back, which
// matters when you are trying to locate a point against a village or road by eye.
const LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

type BasemapKey = keyof typeof BASEMAPS

const btnStyle = (active: boolean): CSSProperties => ({
  padding: '5px 11px',
  fontSize: 12,
  border: 0,
  cursor: 'pointer',
  background: active ? 'var(--accent)' : 'var(--paper)',
  color: active ? '#f2f2f3' : 'var(--ink)',
})

/* THE MODE BUTTON WEARS TWO HATS, AND THEY MUST NOT LOOK ALIKE.
   `btnStyle(true)` is the SELECTED-state treatment: a solid `--accent` fill. That is right for
   a basemap ("Satellite is the one you are looking at") and right for an idle mode button
   ("Measure is armed"). But once a mode is ARMED the same button becomes the way OUT of it —
   its label changes to "Done" — and a solid-accent "Done" sitting next to a solid-accent
   "Satellite" reads as two selected things at once. A review of the built page flagged exactly
   that: "Satellite and Done are both solid blue, so it is ambiguous which one represents the
   active state."
   The fix separates the two meanings by role: selection keeps the fill, an ACTION gets the
   outline treatment, which is the same distinction the site already draws between a primary
   and a secondary button. The armed mode is still visible — its readout card is open and the
   button keeps an accent border and accent ink. */
const doneStyle: CSSProperties = {
  padding: '5px 11px',
  fontSize: 12,
  cursor: 'pointer',
  background: 'var(--paper)',
  color: 'var(--accent)',
  border: '1px solid var(--accent)',
  fontWeight: 600,
}

const mono: CSSProperties = { fontFamily: 'var(--font-mono), ui-monospace, monospace' }

/* THE STACKING LAYER IS NOT A DETAIL. Leaflet builds its own z-index ladder inside the map:
   panes 200–700, `.leaflet-control` at 800, and the `.leaflet-top`/`.leaflet-bottom` corners at
   1000. This wrapper's app chrome is a SIBLING of `.leaflet-container`, which is `position:
   relative` with `z-index: auto` and therefore does not create a stacking context — so our
   z-index competes directly with Leaflet's. At the old value of 400 we TIED `.leaflet-pane` and,
   being earlier in the DOM, lost: the whole rail painted under the tiles and was invisible
   (verified: painting it magenta changed zero pixels). 1000 is Leaflet's own top-level control
   layer, so the app chrome sits level with the zoom/attribution corners and above every map pane.
   The rail is right-aligned and the corners are left/bottom-right, so level-equal never means
   physically overlapping. */
const MAP_CHROME_Z = 1000

export default function MapView({ features: initial, height = '72vh' }: { features: Feature[]; height?: string }) {
  const [basemap, setBasemap] = useState<BasemapKey>('satellite')
  const [features, setFeatures] = useState<Feature[]>(initial)
  const [mode, setMode] = useState<Mode>('none')
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([])
  const [polyPoints, setPolyPoints] = useState<L.LatLng[]>([])
  const [note, setNote] = useState<string | null>(null)

  const first = features[0]
  const center: [number, number] = first ? [first.geometry.coordinates[1], first.geometry.coordinates[0]] : [-2.5, 118]
  const active = BASEMAPS[basemap]
  const drawing = mode !== 'none'

  const totalMeters = useMemo(() => {
    let t = 0
    for (let i = 1; i < measurePoints.length; i++) t += measurePoints[i - 1].distanceTo(measurePoints[i])
    return t
  }, [measurePoints])

  const area = useMemo(() => geodesicArea(polyPoints), [polyPoints])
  const perimeter = useMemo(() => ringPerimeter(polyPoints), [polyPoints])

  // Move a point: update the map immediately, then persist. If the save fails, snap it back so the
  // map never shows a location the server didn't accept.
  const onMove = async (id: string, lat: number, lng: number) => {
    const prev = features
    setFeatures((fs) => fs.map((f) => (f.properties.id === id
      ? { ...f, geometry: { ...f.geometry, coordinates: [lng, lat] as [number, number] } }
      : f)))
    setNote(null)
    try {
      await api(`/api/surveys/${id}`, { method: 'PATCH', body: JSON.stringify({ latitude: lat, longitude: lng }) })
      setNote('Location updated.')
    } catch (e) {
      setFeatures(prev)
      setNote(e instanceof Error ? e.message : 'Could not move the point.')
    }
  }

  const toggleMode = (m: Exclude<Mode, 'none'>) => {
    setMode((cur) => (cur === m ? 'none' : m))
    setMeasurePoints([])
    setPolyPoints([])
    setNote(null)
  }

  const clearActive = () => (mode === 'measure' ? setMeasurePoints([]) : setPolyPoints([]))

  return (
    <div style={{ height, overflow: 'hidden', border: '1px solid var(--line)', position: 'relative' }}>
      {/* ONE RAIL, TOP-RIGHT. Every surface this app owns lives in a single right-aligned column:
          the mode buttons on the first row and the live readout stacked beneath them. Leaflet's
          own chrome keeps the corners it draws itself into — zoom top-left, attribution
          bottom-right — and nothing here is allowed to reach into the zoom corner. That is the
          whole fix for the overlap: the old readout sat at top:10/left:10, which is precisely the
          zoom control's box, and the two collided by 1870 px² at every width. `maxWidth` reserves
          the zoom column (~44px) plus both 10px gutters, so when the row runs out of room it wraps
          downward instead of growing left into the zoom buttons. */}
      <div
        data-map-rail
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: MAP_CHROME_Z,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
          maxWidth: 'calc(100% - 64px)',
        }}
      >
        <div data-map-buttons style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', border: '1px solid var(--line)' }}>
            {(Object.keys(BASEMAPS) as BasemapKey[]).map((key) => (
              <button key={key} type="button" onClick={() => setBasemap(key)} aria-pressed={basemap === key} style={btnStyle(basemap === key)}>
                {BASEMAPS[key].label}
              </button>
            ))}
          </div>
          <button type="button" data-mode-button="measure" onClick={() => toggleMode('measure')} aria-pressed={mode === 'measure'}
            style={mode === 'measure' ? doneStyle : { ...btnStyle(false), border: '1px solid var(--line)' }}>
            {mode === 'measure' ? 'Done' : 'Measure'}
          </button>
          <button type="button" data-mode-button="polygon" onClick={() => toggleMode('polygon')} aria-pressed={mode === 'polygon'}
            style={mode === 'polygon' ? doneStyle : { ...btnStyle(false), border: '1px solid var(--line)' }}>
            {mode === 'polygon' ? 'Done' : 'Polygon'}
          </button>
        </div>

        {mode === 'measure' && (
          <div data-map-readout style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '8px 12px', fontSize: 12, maxWidth: 240 }}>
            <div style={{ fontWeight: 600, ...mono }}>Distance: {fmtDistance(totalMeters)}</div>
            <div style={{ color: 'var(--ink-2)', marginTop: 2 }}>
              {measurePoints.length === 0 ? 'Click the map to start measuring.' : `${measurePoints.length} point${measurePoints.length > 1 ? 's' : ''}`}
            </div>
            {measurePoints.length > 0 && (
              <button type="button" onClick={clearActive} style={{ marginTop: 6, fontSize: 12, padding: '4px 8px', border: '1px solid var(--line)', background: 'transparent', cursor: 'pointer' }}>Clear</button>
            )}
          </div>
        )}

        {mode === 'polygon' && (
          <div data-map-readout style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '8px 12px', fontSize: 12, maxWidth: 240 }}>
            {/* The two measurements take the monospaced face and the charcoal ink the palette
                reserves for "hasil kalkulasi luas" — precision text, readable in the field. */}
            <div style={{ fontWeight: 600, ...mono }}>Area: {fmtArea(area)}</div>
            <div style={{ fontWeight: 600, ...mono, marginTop: 2 }}>Perimeter: {fmtDistance(perimeter)}</div>
            <div style={{ color: 'var(--ink-2)', marginTop: 4 }}>
              {polyPoints.length === 0
                ? 'Click the map to draw a polygon.'
                : `${polyPoints.length} corner${polyPoints.length > 1 ? 's' : ''}`}
            </div>
            {polyPoints.length > 0 && (
              <button type="button" onClick={clearActive} style={{ marginTop: 6, fontSize: 12, padding: '4px 8px', border: '1px solid var(--line)', background: 'transparent', cursor: 'pointer' }}>Clear</button>
            )}
          </div>
        )}

        {/* The save-feedback note lives in the SAME rail rather than a bottom-left box. As a
            separate bottom-left surface it collided with the attribution strip by 2574 px² at
            390px (both anchor to the bottom edge and, at that width, the attribution grows tall
            enough to reach the left gutter). Stacking it in the right column means the app owns
            exactly one floating region and the corners are untouchable by construction. */}
        {note && !drawing && (
          <div data-map-note style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '6px 10px', fontSize: 12, maxWidth: 240 }}>{note}</div>
        )}
      </div>

      <MapContainer center={center} zoom={first ? 12 : 5} style={{ height: '100%', width: '100%', cursor: drawing ? 'crosshair' : '' }}>
        {/* keyed so switching swaps the layer instead of mutating the existing one */}
        <TileLayer key={basemap} attribution={active.attribution} url={active.url} maxZoom={19} />
        {basemap === 'satellite' && <TileLayer key="labels" url={LABELS_URL} maxZoom={19} />}
        {features.map((f) => <SurveyMarker key={f.properties.id} feature={f} draggable={!drawing} onMove={onMove} />)}
        {mode === 'measure' && <DrawLayer mode="measure" points={measurePoints} setPoints={setMeasurePoints} />}
        {mode === 'polygon' && <DrawLayer mode="polygon" points={polyPoints} setPoints={setPolyPoints} />}
      </MapContainer>
    </div>
  )
}
