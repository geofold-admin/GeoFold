// GIS exporters: GeoJSON, KML and a zipped point shapefile. Dependency-free, like export.ts.
//
// All three are written so ArcGIS takes them without cleanup, because ArcGIS is the strictest
// reader of the lot (QGIS, Google Earth and GDAL accept anything that passes here):
//  - field names are ASCII, start with a letter, carry no spaces, and avoid the names ArcGIS
//    reserves for itself (OBJECTID, FID, Shape…);
//  - every feature carries every field, because ArcGIS builds its table from the first feature;
//  - a column is numeric only if every value in it is a number, never a mix;
//  - coordinates are WGS 84 degrees, which is what the surveys table stores.

import { zip } from './export'

export type GeoValue = string | number | null

export interface GeoField {
  /** Unique key into `GeoPoint.values`. */
  key: string
  /** The field name to aim for; it is sanitised and made unique on the way out. */
  name: string
  /** Human-readable label, shown where the format has room for one (KML). */
  label: string
}

export interface GeoPoint {
  latitude: number
  longitude: number
  /** Placemark name in KML: the survey's reference. */
  name: string
  /** KML folder: the project name. */
  group: string
  values: Record<string, GeoValue>
}

export interface GeoTable {
  fields: GeoField[]
  points: GeoPoint[]
}

// ---------- shared: field names and column types ----------

// Names ArcGIS (and the geodatabase underneath it) keeps for its own columns.
const RESERVED = ['OBJECTID', 'OID', 'FID', 'SHAPE', 'SHAPE_LENGTH', 'SHAPE_LENG', 'SHAPE_AREA', 'GLOBALID']

interface Column {
  key: string
  name: string
  label: string
  numeric: boolean
}

/** ASCII, starts with a letter, at most `maxLen` characters, unique without regard to case. */
function safeNames(wanted: string[], maxLen: number): string[] {
  const used = new Set(RESERVED)
  return wanted.map((raw) => {
    let base = raw
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
    if (!/^[A-Za-z]/.test(base)) base = `f_${base}`
    base = base.slice(0, maxLen).replace(/_+$/, '') || 'field'
    let name = base
    for (let n = 1; used.has(name.toUpperCase()); n++) {
      const suffix = `_${n}`
      name = base.slice(0, maxLen - suffix.length) + suffix
    }
    used.add(name.toUpperCase())
    return name
  })
}

const isEmpty = (v: GeoValue | undefined): v is null | undefined | '' => v == null || v === ''

function columns(table: GeoTable, maxLen: number): Column[] {
  const names = safeNames(table.fields.map((f) => f.name), maxLen)
  return table.fields.map((f, i) => {
    const values = table.points.map((p) => p.values[f.key]).filter((v) => !isEmpty(v))
    const numeric = values.length > 0 && values.every((v) => typeof v === 'number' && Number.isFinite(v))
    return { key: f.key, name: names[i], label: f.label, numeric }
  })
}

/** A cell in the type its column settled on: a number, a string, or null when empty. */
function cell(col: Column, point: GeoPoint): GeoValue {
  const v = point.values[col.key]
  if (isEmpty(v)) return null
  return col.numeric ? (v as number) : String(v)
}

/** Points that can be drawn. A fix outside the world would make ArcGIS reject the whole file. */
function drawable(table: GeoTable): GeoTable {
  const points = table.points.filter(
    (p) =>
      Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
      Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180,
  )
  return { fields: table.fields, points }
}

// ---------- GeoJSON (RFC 7946) ----------

export function geojsonText(input: GeoTable, layerName: string): string {
  const table = drawable(input)
  // 31 characters is the field-name ceiling of an enterprise geodatabase, the tightest ArcGIS has.
  const cols = columns(table, 31)
  const features = table.points.map((p) => {
    const properties: Record<string, GeoValue> = {}
    for (const c of cols) properties[c.name] = cell(c, p)
    return JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      properties,
    })
  })
  // One feature per line: still plain JSON, but readable and diffable.
  return (
    `{"type":"FeatureCollection","name":${JSON.stringify(layerName)},"features":[\n` +
    features.join(',\n') +
    `\n]}\n`
  )
}

export function geojsonBlob(table: GeoTable, layerName: string): Blob {
  return new Blob([geojsonText(table, layerName)], { type: 'application/geo+json' })
}

// ---------- KML 2.2 ----------

/** Escaped for XML text or an attribute, with the control characters XML 1.0 forbids removed. */
function xml(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function kmlText(input: GeoTable, documentName: string): string {
  const table = drawable(input)
  const cols = columns(table, 31)
  const SCHEMA = 'GeofoldSurvey'

  const isInt = (c: Column) =>
    c.numeric && table.points.every((p) => { const v = cell(c, p); return v === null || Number.isInteger(v) })
  const schema =
    `<Schema name="${SCHEMA}" id="${SCHEMA}">` +
    cols
      .map((c) => {
        const type = c.numeric ? (isInt(c) ? 'int' : 'double') : 'string'
        return `<SimpleField type="${type}" name="${c.name}"><displayName>${xml(c.label)}</displayName></SimpleField>`
      })
      .join('') +
    `</Schema>`

  const placemark = (p: GeoPoint): string => {
    const filled = cols.map((c) => ({ c, v: cell(c, p) })).filter((x) => x.v !== null)
    // The same values twice, on purpose. ExtendedData becomes real attribute columns in ArcGIS
    // and QGIS; the description is what a popup shows (ArcGIS keeps it as PopupInfo).
    const data = filled.map(({ c, v }) => `<SimpleData name="${c.name}">${xml(String(v))}</SimpleData>`).join('')
    const rows = filled.map(({ c, v }) => `<tr><th align="left">${xml(c.label)}</th><td>${xml(String(v))}</td></tr>`).join('')
    return (
      `<Placemark><name>${xml(p.name)}</name>` +
      // The table is escaped as text rather than wrapped in CDATA, so a note containing "]]>"
      // cannot end the block early.
      `<description>${xml(`<table>${rows}</table>`)}</description>` +
      `<ExtendedData><SchemaData schemaUrl="#${SCHEMA}">${data}</SchemaData></ExtendedData>` +
      `<Point><coordinates>${p.longitude},${p.latitude},0</coordinates></Point>` +
      `</Placemark>`
    )
  }

  // One folder per project, in the order the projects first appear.
  const groups = new Map<string, GeoPoint[]>()
  for (const p of table.points) {
    const list = groups.get(p.group)
    if (list) list.push(p)
    else groups.set(p.group, [p])
  }
  const folders = [...groups]
    .map(([name, points]) => `<Folder><name>${xml(name)}</name>\n${points.map(placemark).join('\n')}\n</Folder>`)
    .join('\n')

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(documentName)}</name>\n` +
    `${schema}\n${folders}\n</Document></kml>\n`
  )
}

export function kmlBlob(table: GeoTable, documentName: string): Blob {
  return new Blob([kmlText(table, documentName)], { type: 'application/vnd.google-earth.kml+xml' })
}

// ---------- Shapefile (points), zipped ----------
//
// Written from the ESRI Shapefile Technical Description (1998) and the dBase III layout. This is
// the point-only half of the writer in mobile/src/lib/shapefile.ts; the two packages share no
// code, so the conventions are repeated here: WGS 84 .prj in ESRI's own spelling, UTF-8 .cpg.

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'

interface DbfField {
  col: Column
  type: 'C' | 'N'
  length: number
  decimals: number
}

function decimalsOf(n: number): number {
  if (Number.isInteger(n)) return 0
  const text = String(n)
  if (text.includes('e')) return 8
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : Math.min(8, text.length - dot - 1)
}

/** UTF-8 bytes of `text`, cut to at most `max` bytes without splitting a character. */
function fitBytes(enc: TextEncoder, text: string, max: number): Uint8Array {
  const bytes = enc.encode(text)
  if (bytes.length <= max) return bytes
  let end = max
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--
  return bytes.subarray(0, end)
}

function dbfFields(table: GeoTable, enc: TextEncoder): DbfField[] {
  // dBase column names stop at 10 characters.
  return columns(table, 10).map((col) => {
    const values = table.points.map((p) => cell(col, p)).filter((v) => v !== null)
    if (col.numeric) {
      const nums = values as number[]
      let decimals = nums.reduce((d, v) => Math.max(d, decimalsOf(v)), 0)
      const widthAt = (dec: number) => nums.reduce((w, v) => Math.max(w, v.toFixed(dec).length), 0)
      // 19 characters is the column ceiling; give up decimals before ever cutting digits off.
      while (decimals > 0 && widthAt(decimals) > 19) decimals--
      return { col, type: 'N', length: Math.min(19, Math.max(widthAt(decimals), decimals ? decimals + 2 : 1)), decimals }
    }
    const width = values.reduce<number>((w, v) => Math.max(w, enc.encode(String(v)).length), 1)
    // 254 bytes is all a dBase text column holds; longer notes are cut there (CSV keeps them whole).
    return { col, type: 'C', length: Math.min(254, width), decimals: 0 }
  })
}

function writeDbf(table: GeoTable, when: Date): Uint8Array {
  const enc = new TextEncoder()
  const fields = dbfFields(table, enc)
  const headerSize = 32 + 32 * fields.length + 1
  const recordSize = 1 + fields.reduce((s, f) => s + f.length, 0)
  const out = new Uint8Array(headerSize + recordSize * table.points.length + 1)
  const view = new DataView(out.buffer)

  out[0] = 0x03 // dBase III, no memo
  out[1] = when.getFullYear() - 1900
  out[2] = when.getMonth() + 1
  out[3] = when.getDate()
  view.setUint32(4, table.points.length, true)
  view.setUint16(8, headerSize, true)
  view.setUint16(10, recordSize, true)

  fields.forEach((f, i) => {
    const base = 32 + i * 32
    for (let c = 0; c < f.col.name.length; c++) out[base + c] = f.col.name.charCodeAt(c)
    out[base + 11] = f.type.charCodeAt(0)
    out[base + 16] = f.length
    out[base + 17] = f.decimals
  })
  out[headerSize - 1] = 0x0d

  let p = headerSize
  for (const point of table.points) {
    out[p++] = 0x20 // not deleted
    for (const f of fields) {
      out.fill(0x20, p, p + f.length)
      const v = cell(f.col, point)
      if (v !== null) {
        if (f.type === 'N') {
          // Numbers are right-aligned in their column.
          const text = (v as number).toFixed(f.decimals).slice(0, f.length)
          for (let c = 0; c < text.length; c++) out[p + f.length - text.length + c] = text.charCodeAt(c)
        } else {
          out.set(fitBytes(enc, String(v), f.length), p)
        }
      }
      p += f.length
    }
  }
  out[p] = 0x1a
  return out
}

function writeShpShx(points: GeoPoint[]): { shp: Uint8Array; shx: Uint8Array } {
  const POINT = 1
  const RECORD = 8 + 20 // record header + point content
  const shp = new Uint8Array(100 + RECORD * points.length)
  const shx = new Uint8Array(100 + 8 * points.length)
  const sv = new DataView(shp.buffer)
  const xv = new DataView(shx.buffer)

  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity
  for (const p of points) {
    if (p.longitude < xmin) xmin = p.longitude
    if (p.longitude > xmax) xmax = p.longitude
    if (p.latitude < ymin) ymin = p.latitude
    if (p.latitude > ymax) ymax = p.latitude
  }
  if (!Number.isFinite(xmin)) xmin = ymin = xmax = ymax = 0

  // File lengths and record offsets are counted in 16-bit words, big-endian; the rest is little-endian.
  const header = (view: DataView, lengthBytes: number) => {
    view.setInt32(0, 9994, false)
    view.setInt32(24, lengthBytes / 2, false)
    view.setInt32(28, 1000, true)
    view.setInt32(32, POINT, true)
    view.setFloat64(36, xmin, true)
    view.setFloat64(44, ymin, true)
    view.setFloat64(52, xmax, true)
    view.setFloat64(60, ymax, true)
  }
  header(sv, shp.length)
  header(xv, shx.length)

  points.forEach((p, i) => {
    const at = 100 + i * RECORD
    xv.setInt32(100 + i * 8, at / 2, false)
    xv.setInt32(104 + i * 8, 10, false)
    sv.setInt32(at, i + 1, false)
    sv.setInt32(at + 4, 10, false)
    sv.setInt32(at + 8, POINT, true)
    sv.setFloat64(at + 12, p.longitude, true)
    sv.setFloat64(at + 20, p.latitude, true)
  })
  return { shp, shx }
}

/** The five shapefile parts, named `<baseName>.shp` and so on. */
export function shapefileParts(input: GeoTable, baseName: string, when = new Date()): { name: string; data: Uint8Array }[] {
  const table = drawable(input)
  const enc = new TextEncoder()
  const { shp, shx } = writeShpShx(table.points)
  return [
    { name: `${baseName}.shp`, data: shp },
    { name: `${baseName}.shx`, data: shx },
    { name: `${baseName}.dbf`, data: writeDbf(table, when) },
    { name: `${baseName}.prj`, data: enc.encode(WGS84_PRJ) },
    { name: `${baseName}.cpg`, data: enc.encode('UTF-8') },
  ]
}

/**
 * A .zip with the parts at its root, which is the one layout ArcGIS Online accepts as an upload;
 * ArcGIS Pro, ArcMap and QGIS open the same file directly.
 */
export function shapefileZipBlob(table: GeoTable, baseName: string): Blob {
  return new Blob([zip(shapefileParts(table, baseName)) as unknown as BlobPart], { type: 'application/zip' })
}
