// Dependency-free exporters: CSV and a minimal (STORED, uncompressed) .xlsx writer
// that can also embed photos. An .xlsx is a ZIP of XML parts — we assemble it by hand.

export type Cell = string | number | null
export type ExportRow = Record<string, Cell>
export interface XlsxImage {
  data: Uint8Array
  ext: 'png' | 'jpeg'
}

// ---------- CSV ----------

function csvEscape(value: Cell): string {
  const s = value == null ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvBlob(headers: string[], rows: ExportRow[]): Blob {
  const lines = [headers.map(csvEscape).join(',')]
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h] ?? '')).join(','))
  // Leading BOM so Excel reads UTF-8 correctly.
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
}

// ---------- XLSX ----------

const PX_TO_EMU = 9525
const IMG_W = 120
const IMG_H = 90

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function colLetter(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function cellXml(ref: string, value: Cell): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`
  const s = value == null ? '' : String(value)
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(s)}</t></is></c>`
}

interface ImageLayout {
  colIndex: number
  // survey/data-row index -> image index into the media array (only rows that have an image)
  rowToImage: Map<number, number>
}

function sheetXml(headers: string[], rows: ExportRow[], layout: ImageLayout | null): string {
  const rowsXml: string[] = []
  rowsXml.push(`<row r="1">`)
  headers.forEach((h, i) => rowsXml.push(cellXml(`${colLetter(i)}1`, h)))
  rowsXml.push(`</row>`)
  rows.forEach((row, r) => {
    const rowNum = r + 2
    const tall = layout && layout.rowToImage.has(r) ? ` ht="72" customHeight="1"` : ''
    rowsXml.push(`<row r="${rowNum}"${tall}>`)
    headers.forEach((h, i) => rowsXml.push(cellXml(`${colLetter(i)}${rowNum}`, row[h] ?? null)))
    rowsXml.push(`</row>`)
  })

  const rNs = layout ? ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"` : ''
  const cols = layout
    ? `<cols><col min="${layout.colIndex + 1}" max="${layout.colIndex + 1}" width="18" customWidth="1"/></cols>`
    : ''
  const drawing = layout ? `<drawing r:id="rId1"/>` : ''
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"${rNs}>` +
    cols +
    `<sheetData>${rowsXml.join('')}</sheetData>${drawing}</worksheet>`
  )
}

function drawingXml(layout: ImageLayout): string {
  const anchors: string[] = []
  let n = 0
  for (const [rowIdx, imgIdx] of layout.rowToImage) {
    const picId = imgIdx + 2
    const rId = imgIdx + 1
    anchors.push(
      `<xdr:oneCellAnchor>` +
        `<xdr:from><xdr:col>${layout.colIndex}</xdr:col><xdr:colOff>19050</xdr:colOff>` +
        `<xdr:row>${rowIdx + 1}</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from>` +
        `<xdr:ext cx="${IMG_W * PX_TO_EMU}" cy="${IMG_H * PX_TO_EMU}"/>` +
        `<xdr:pic>` +
        `<xdr:nvPicPr><xdr:cNvPr id="${picId}" name="Photo ${picId}"/><xdr:cNvPicPr/></xdr:nvPicPr>` +
        `<xdr:blipFill>` +
        `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId${rId}"/>` +
        `<a:stretch><a:fillRect/></a:stretch>` +
        `</xdr:blipFill>` +
        `<xdr:spPr>` +
        `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${IMG_W * PX_TO_EMU}" cy="${IMG_H * PX_TO_EMU}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
        `</xdr:spPr>` +
        `</xdr:pic>` +
        `<xdr:clientData/>` +
        `</xdr:oneCellAnchor>`,
    )
    n++
  }
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join('')}</xdr:wsDr>`
  )
}

/** A picture for a sheet of its own: the map of the exported points. */
export interface XlsxPicture {
  image: XlsxImage
  /** Size in pixels, as drawn. */
  width: number
  height: number
  title: string
  note?: string
}

function pictureSheetXml(picture: XlsxPicture): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetData>` +
    `<row r="1">${cellXml('A1', picture.title)}</row>` +
    (picture.note ? `<row r="2">${cellXml('A2', picture.note)}</row>` : '') +
    `</sheetData><drawing r:id="rId1"/></worksheet>`
  )
}

function pictureDrawingXml(picture: XlsxPicture): string {
  const cx = Math.round(picture.width * PX_TO_EMU)
  const cy = Math.round(picture.height * PX_TO_EMU)
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<xdr:oneCellAnchor>` +
    // Below the title and the note, with a row of air.
    `<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${cx}" cy="${cy}"/>` +
    `<xdr:pic>` +
    `<xdr:nvPicPr><xdr:cNvPr id="2" name="Survey map"/><xdr:cNvPicPr/></xdr:nvPicPr>` +
    `<xdr:blipFill>` +
    `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</xdr:blipFill>` +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>` +
    `</xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`
  )
}

// --- minimal ZIP (store method) ---

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff]
const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0
  for (const p of parts) len += p.length
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const crc = crc32(f.data)
    const size = f.data.length
    const header = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0),
    ])
    local.push(header, nameBytes, f.data)
    central.push(Uint8Array.from([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]), nameBytes)
    offset += header.length + nameBytes.length + size
  }
  let cdSize = 0
  for (const c of central) cdSize += c.length
  const end = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(offset), ...u16(0),
  ])
  return concat([...local, ...central, end])
}

export function xlsxBlob(
  headers: string[],
  rows: ExportRow[],
  opts?: {
    imageColumn?: string
    images?: (XlsxImage | null)[]
    /** Adds a second sheet, "Map", holding this picture. */
    map?: XlsxPicture | null
  },
): Blob {
  const enc = new TextEncoder()

  // Resolve which rows carry a photo, mapped to a compact media index.
  let layout: ImageLayout | null = null
  const media: { name: string; data: Uint8Array }[] = []
  if (opts?.imageColumn && opts.images) {
    const colIndex = headers.indexOf(opts.imageColumn)
    if (colIndex >= 0) {
      const rowToImage = new Map<number, number>()
      opts.images.forEach((img, rowIdx) => {
        if (!img) return
        const imgIdx = media.length
        media.push({ name: `xl/media/image${imgIdx + 1}.${img.ext}`, data: img.data })
        rowToImage.set(rowIdx, imgIdx)
      })
      if (rowToImage.size > 0) layout = { colIndex, rowToImage }
    }
  }

  const map = opts?.map ?? null
  const mapMedia = map ? `xl/media/map1.${map.image.ext}` : null
  const hasPng = media.some((m) => m.name.endsWith('.png')) || map?.image.ext === 'png'
  const hasJpeg = media.some((m) => m.name.endsWith('.jpeg')) || map?.image.ext === 'jpeg'

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    (hasPng ? `<Default Extension="png" ContentType="image/png"/>` : '') +
    (hasJpeg ? `<Default Extension="jpeg" ContentType="image/jpeg"/>` : '') +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    (layout ? `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : '') +
    (map
      ? `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/drawings/drawing2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
      : '') +
    `</Types>`

  const files: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    {
      name: '_rels/.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="Survey Data" sheetId="1" r:id="rId1"/>` +
        (map ? `<sheet name="Map" sheetId="2" r:id="rId2"/>` : '') +
        `</sheets></workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        (map ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>` : '') +
        `</Relationships>`,
      ),
    },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheetXml(headers, rows, layout)) },
  ]

  if (layout) {
    files.push({
      name: 'xl/worksheets/_rels/sheet1.xml.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>` +
        `</Relationships>`,
      ),
    })
    files.push({ name: 'xl/drawings/drawing1.xml', data: enc.encode(drawingXml(layout)) })
    const rels = media
      .map((m, i) => {
        const target = m.name.replace('xl/', '../')
        return `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`
      })
      .join('')
    files.push({
      name: 'xl/drawings/_rels/drawing1.xml.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
      ),
    })
    files.push(...media)
  }

  if (map && mapMedia) {
    const rel = (type: string, target: string) =>
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>` +
      `</Relationships>`
    files.push(
      { name: 'xl/worksheets/sheet2.xml', data: enc.encode(pictureSheetXml(map)) },
      { name: 'xl/worksheets/_rels/sheet2.xml.rels', data: enc.encode(rel('drawing', '../drawings/drawing2.xml')) },
      { name: 'xl/drawings/drawing2.xml', data: enc.encode(pictureDrawingXml(map)) },
      { name: 'xl/drawings/_rels/drawing2.xml.rels', data: enc.encode(rel('image', mapMedia.replace('xl/', '../'))) },
      { name: mapMedia, data: map.image.data },
    )
  }

  return new Blob([zip(files) as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ---------- trigger a browser download ----------

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
