import { decodeText, isValidUtf8, latin1Decode, utf8Encode } from './bytes';
import { isPosition, type Position } from './geometry';
import { datumWarning, describeProjection, parsePrj, toWgs84, WGS84_PRJ } from './projection';

/**
 * ESRI shapefile reading and writing (spec 1.4): `.shp` geometry, `.shx` index, `.dbf`
 * attributes, `.prj` coordinate system and `.cpg` text encoding — points, polylines and polygons.
 *
 * Written from the ESRI Shapefile Technical Description (1998) and the dBase III layout. Like the
 * rest of the app's format code it carries no dependency; it is checked against independent
 * readers, see NEXT-STEPS.md.
 *
 * Output is always WGS 84 degrees with a UTF-8 `.cpg`, which QGIS, ArcGIS and GDAL all honour.
 * Input may be in any CRS `projection.ts` understands and is reprojected on the way in.
 */

export type ShapeKind = 'point' | 'line' | 'polygon';
export type AttributeValue = string | number | boolean | null;

/* ── writing ──────────────────────────────────────────────────────────── */

export interface ShapeRecord {
  /** One part for a point (a single position), one or more parts for lines and polygon rings. */
  parts: Position[][];
  attributes: Record<string, AttributeValue>;
}

export interface WrittenShapefile {
  shp: Uint8Array;
  shx: Uint8Array;
  dbf: Uint8Array;
  prj: Uint8Array;
  cpg: Uint8Array;
}

const SHAPE_TYPE: Record<ShapeKind, number> = { point: 1, line: 3, polygon: 5 };

/** Twice the signed planar area of a ring; negative is clockwise in x-right/y-up axes. */
function signedArea2(ring: Position[]): number {
  let sum = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return sum;
}

/** A polygon ring as the format wants it: closed, and clockwise for an outer ring. */
function shapefileRing(ring: Position[]): Position[] {
  const open =
    ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring.slice();
  if (signedArea2(open) > 0) open.reverse();
  return [...open, open[0]];
}

interface DbfField {
  name: string;
  key: string;
  type: 'C' | 'N' | 'L';
  length: number;
  decimals: number;
}

/** DBF column names: ASCII, at most 10 characters, unique, starting with a letter. */
function columnNames(keys: string[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const key of keys) {
    let base = key
      .normalize('NFD')
      .replace(/[^A-Za-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!/^[A-Za-z]/.test(base)) base = `f_${base}`;
    base = base.slice(0, 10) || 'field';
    let name = base;
    for (let n = 1; used.has(name.toUpperCase()); n++) {
      const suffix = `_${n}`;
      name = base.slice(0, 10 - suffix.length) + suffix;
    }
    used.add(name.toUpperCase());
    out.set(key, name);
  }
  return out;
}

function decimalsOf(n: number): number {
  if (Number.isInteger(n)) return 0;
  const text = String(n);
  const e = text.indexOf('e');
  if (e >= 0) return 8;
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : Math.min(8, text.length - dot - 1);
}

/** Column types chosen from the values: all numbers → N, all booleans → L, anything else → C. */
function dbfFields(records: ShapeRecord[]): DbfField[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const k of Object.keys(r.attributes)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  const names = columnNames(keys);
  return keys.map((key) => {
    const values = records.map((r) => r.attributes[key]).filter((v) => v !== null && v !== undefined && v !== '');
    if (values.length && values.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      const nums = values as number[];
      let decimals = nums.reduce((d, v) => Math.max(d, decimalsOf(v)), 0);
      const widthAt = (dec: number) => nums.reduce((w, v) => Math.max(w, v.toFixed(dec).length), 0);
      // 19 characters is the column ceiling; give up decimals before ever cutting digits off.
      while (decimals > 0 && widthAt(decimals) > 19) decimals--;
      const width = widthAt(decimals);
      return { name: names.get(key)!, key, type: 'N', length: Math.min(19, Math.max(width, decimals ? decimals + 2 : 1)), decimals };
    }
    if (values.length && values.every((v) => typeof v === 'boolean')) {
      return { name: names.get(key)!, key, type: 'L', length: 1, decimals: 0 };
    }
    const width = values.reduce<number>((w, v) => Math.max(w, utf8Encode(String(v)).length), 1);
    return { name: names.get(key)!, key, type: 'C', length: Math.min(254, width), decimals: 0 };
  });
}

/** UTF-8 bytes of `text` cut to at most `max` bytes without splitting a character. */
function fitBytes(text: string, max: number): Uint8Array {
  const bytes = utf8Encode(text);
  if (bytes.length <= max) return bytes;
  let end = max;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end);
}

function writeDbf(records: ShapeRecord[], when: Date): Uint8Array {
  const fields = dbfFields(records);
  const headerSize = 32 + 32 * fields.length + 1;
  const recordSize = 1 + fields.reduce((s, f) => s + f.length, 0);
  const out = new Uint8Array(headerSize + recordSize * records.length + 1);
  const view = new DataView(out.buffer);

  out[0] = 0x03; // dBase III, no memo
  out[1] = when.getFullYear() - 1900;
  out[2] = when.getMonth() + 1;
  out[3] = when.getDate();
  view.setUint32(4, records.length, true);
  view.setUint16(8, headerSize, true);
  view.setUint16(10, recordSize, true);

  fields.forEach((f, i) => {
    const base = 32 + i * 32;
    for (let c = 0; c < f.name.length; c++) out[base + c] = f.name.charCodeAt(c);
    out[base + 11] = f.type.charCodeAt(0);
    out[base + 16] = f.length;
    out[base + 17] = f.decimals;
  });
  out[headerSize - 1] = 0x0d;

  let p = headerSize;
  for (const r of records) {
    out[p++] = 0x20; // not deleted
    for (const f of fields) {
      out.fill(0x20, p, p + f.length);
      const v = r.attributes[f.key];
      if (v !== null && v !== undefined && v !== '') {
        if (f.type === 'N' && typeof v === 'number') {
          const text = v.toFixed(f.decimals).slice(0, f.length);
          for (let c = 0; c < text.length; c++) out[p + f.length - text.length + c] = text.charCodeAt(c);
        } else if (f.type === 'L') {
          out[p] = (v ? 'T' : 'F').charCodeAt(0);
        } else {
          out.set(fitBytes(String(v), f.length), p);
        }
      } else if (f.type === 'L') {
        out[p] = 0x3f; // '?' — unknown
      }
      p += f.length;
    }
  }
  out[p] = 0x1a;
  return out;
}

/** The shape file and its index for one geometry kind. */
function writeShpShx(kind: ShapeKind, records: ShapeRecord[]): { shp: Uint8Array; shx: Uint8Array } {
  const type = SHAPE_TYPE[kind];
  const prepared = records.map((r) =>
    kind === 'polygon' ? r.parts.filter((ring) => ring.length >= 3).map(shapefileRing) : r.parts,
  );
  const contentLengths = prepared.map((parts) => {
    if (kind === 'point') return 20;
    const points = parts.reduce((s, part) => s + part.length, 0);
    return 44 + 4 * parts.length + 16 * points;
  });

  const shpLength = 100 + contentLengths.reduce((s, n) => s + 8 + n, 0);
  const shp = new Uint8Array(shpLength);
  const shx = new Uint8Array(100 + 8 * records.length);
  const sv = new DataView(shp.buffer);
  const xv = new DataView(shx.buffer);

  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;
  for (const parts of prepared) {
    for (const part of parts) {
      for (const [x, y] of part) {
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
      }
    }
  }
  if (!Number.isFinite(xmin)) xmin = ymin = xmax = ymax = 0;

  const header = (view: DataView, lengthBytes: number) => {
    view.setInt32(0, 9994, false);
    view.setInt32(24, lengthBytes / 2, false);
    view.setInt32(28, 1000, true);
    view.setInt32(32, type, true);
    view.setFloat64(36, xmin, true);
    view.setFloat64(44, ymin, true);
    view.setFloat64(52, xmax, true);
    view.setFloat64(60, ymax, true);
  };
  header(sv, shpLength);
  header(xv, shx.length);

  let p = 100;
  prepared.forEach((parts, i) => {
    const content = contentLengths[i];
    xv.setInt32(100 + i * 8, p / 2, false);
    xv.setInt32(104 + i * 8, content / 2, false);
    sv.setInt32(p, i + 1, false);
    sv.setInt32(p + 4, content / 2, false);
    p += 8;
    sv.setInt32(p, type, true);
    if (kind === 'point') {
      const [x, y] = parts[0][0];
      sv.setFloat64(p + 4, x, true);
      sv.setFloat64(p + 12, y, true);
      p += 20;
      return;
    }
    const all = parts.flat();
    // A loop, not Math.min(...xs): spreading a long road's vertices overflows the call stack.
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (const [x, y] of all) {
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
    sv.setFloat64(p + 4, bx0, true);
    sv.setFloat64(p + 12, by0, true);
    sv.setFloat64(p + 20, bx1, true);
    sv.setFloat64(p + 28, by1, true);
    sv.setInt32(p + 36, parts.length, true);
    sv.setInt32(p + 40, all.length, true);
    let q = p + 44;
    let start = 0;
    for (const part of parts) {
      sv.setInt32(q, start, true);
      q += 4;
      start += part.length;
    }
    for (const [x, y] of all) {
      sv.setFloat64(q, x, true);
      sv.setFloat64(q + 8, y, true);
      q += 16;
    }
    p += content;
  });

  return { shp, shx };
}

/**
 * One shapefile (all five files) for records of a single geometry kind. Records whose geometry is
 * empty or degenerate are dropped rather than written as unreadable shapes.
 */
export function writeShapefile(kind: ShapeKind, input: ShapeRecord[], when = new Date()): WrittenShapefile {
  const minPoints = kind === 'point' ? 1 : kind === 'line' ? 2 : 3;
  const records = input
    .map((r) => ({ ...r, parts: r.parts.map((part) => part.filter(isPosition)).filter((part) => part.length >= minPoints) }))
    .filter((r) => r.parts.length > 0);
  const { shp, shx } = writeShpShx(kind, records);
  return {
    shp,
    shx,
    dbf: writeDbf(records, when),
    prj: utf8Encode(WGS84_PRJ),
    cpg: utf8Encode('UTF-8'),
  };
}

/* ── reading ──────────────────────────────────────────────────────────── */

export interface ShapefileSet {
  /** Base name without extension. */
  name: string;
  shp: Uint8Array;
  dbf?: Uint8Array;
  prj?: string;
  cpg?: string;
}

export interface ImportedFeature {
  kind: ShapeKind;
  coordinates: Position[];
  attributes: Record<string, AttributeValue>;
}

export interface ImportResult {
  name: string;
  features: ImportedFeature[];
  /** One line describing the source coordinate system. */
  crs: string;
  warnings: string[];
}

/** Pair up `.shp` files with their `.dbf` / `.prj` / `.cpg` sidecars by base name. */
export function groupShapefiles(files: { name: string; data: Uint8Array }[]): ShapefileSet[] {
  const byBase = new Map<string, Partial<Record<'shp' | 'dbf' | 'prj' | 'cpg', Uint8Array>> & { name: string }>();
  for (const file of files) {
    const leaf = file.name.split(/[\\/]/).pop() ?? file.name;
    if (leaf.startsWith('._') || file.name.includes('__MACOSX')) continue; // macOS resource forks
    const m = /^(.*)\.(shp|dbf|prj|cpg)$/i.exec(leaf);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const entry = byBase.get(key) ?? { name: m[1] };
    entry[m[2].toLowerCase() as 'shp' | 'dbf' | 'prj' | 'cpg'] = file.data;
    byBase.set(key, entry);
  }
  return [...byBase.values()]
    .filter((e) => e.shp)
    .map((e) => ({
      name: e.name,
      shp: e.shp!,
      dbf: e.dbf,
      prj: e.prj ? latin1Decode(e.prj) : undefined,
      cpg: e.cpg ? latin1Decode(e.cpg) : undefined,
    }));
}

interface RawShape {
  kind: ShapeKind;
  parts: Position[][];
}

function readShp(bytes: Uint8Array): { shapes: (RawShape | null)[]; type: number } {
  if (bytes.length < 100) throw new Error('The .shp file is too short to be a shapefile.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getInt32(0, false) !== 9994) throw new Error('Not a shapefile (bad .shp file code).');
  const type = view.getInt32(32, true);
  const shapes: (RawShape | null)[] = [];
  let p = 100;

  while (p + 8 <= bytes.length) {
    const contentBytes = view.getInt32(p + 4, false) * 2;
    const start = p + 8;
    p = start + contentBytes;
    if (contentBytes < 4 || p > bytes.length) break;
    const shapeType = view.getInt32(start, true);
    const base = shapeType % 10; // Z (+10) and M (+20) variants share the 2-D layout up front

    if (shapeType === 0) {
      shapes.push(null);
    } else if (base === 1 && shapeType !== 31) {
      shapes.push({ kind: 'point', parts: [[[view.getFloat64(start + 4, true), view.getFloat64(start + 12, true)]]] });
    } else if (base === 8) {
      const n = view.getInt32(start + 36, true);
      const pts: Position[] = [];
      for (let i = 0; i < n; i++) pts.push([view.getFloat64(start + 40 + i * 16, true), view.getFloat64(start + 48 + i * 16, true)]);
      // A multipoint becomes one point per position.
      shapes.push({ kind: 'point', parts: pts.map((q) => [q]) });
    } else if (base === 3 || base === 5) {
      const numParts = view.getInt32(start + 36, true);
      const numPoints = view.getInt32(start + 40, true);
      const partStart: number[] = [];
      for (let i = 0; i < numParts; i++) partStart.push(view.getInt32(start + 44 + i * 4, true));
      const pointsAt = start + 44 + numParts * 4;
      const parts: Position[][] = [];
      for (let i = 0; i < numParts; i++) {
        const from = partStart[i];
        const to = i + 1 < numParts ? partStart[i + 1] : numPoints;
        const part: Position[] = [];
        for (let k = from; k < to; k++) {
          part.push([view.getFloat64(pointsAt + k * 16, true), view.getFloat64(pointsAt + k * 16 + 8, true)]);
        }
        parts.push(part);
      }
      shapes.push({ kind: base === 3 ? 'line' : 'polygon', parts });
    } else {
      shapes.push(null); // MultiPatch and anything else unsupported
    }
  }
  return { shapes, type };
}

function readDbf(bytes: Uint8Array, encoding?: string): Record<string, AttributeValue>[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  const headerSize = view.getUint16(8, true);
  const recordSize = view.getUint16(10, true);
  const fields: { name: string; type: string; length: number }[] = [];
  for (let p = 32; p + 32 <= headerSize && bytes[p] !== 0x0d; p += 32) {
    let end = p;
    while (end < p + 11 && bytes[end] !== 0) end++;
    fields.push({ name: latin1Decode(bytes.subarray(p, end)).trim(), type: String.fromCharCode(bytes[p + 11]), length: bytes[p + 16] });
  }

  // Encoding: the .cpg if there is one, else a strict UTF-8 check over the whole record area.
  const body = bytes.subarray(headerSize, Math.min(bytes.length, headerSize + recordSize * count));
  const hint = encoding ?? (isValidUtf8(body) ? 'utf-8' : 'latin1');
  const decode = (b: Uint8Array) => decodeText(b, hint);

  const rows: Record<string, AttributeValue>[] = [];
  for (let r = 0; r < count; r++) {
    const start = headerSize + r * recordSize;
    if (start + recordSize > bytes.length) break;
    if (bytes[start] === 0x2a) {
      rows.push({}); // deleted — kept as an empty row so rows still line up with shapes
      continue;
    }
    const row: Record<string, AttributeValue> = {};
    let p = start + 1;
    for (const f of fields) {
      const raw = bytes.subarray(p, p + f.length);
      p += f.length;
      const text = decode(raw).trim();
      switch (f.type) {
        case 'N':
        case 'F': {
          const n = text === '' ? NaN : Number(text);
          row[f.name] = Number.isFinite(n) ? n : null;
          break;
        }
        case 'L':
          row[f.name] = /^[TtYy]$/.test(text) ? true : /^[FfNn]$/.test(text) ? false : null;
          break;
        case 'D':
          row[f.name] = /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : null;
          break;
        default:
          row[f.name] = text === '' ? null : text;
      }
    }
    rows.push(row);
  }
  return rows;
}

/** Outer rings of a polygon record — clockwise ones — each with the holes that follow it dropped. */
function outerRings(rings: Position[][]): { outers: Position[][]; holes: number } {
  const outers: Position[][] = [];
  let holes = 0;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    // Clockwise (negative signed area in x-right/y-up) is an outer ring in the shapefile convention.
    if (signedArea2(ring) <= 0 || outers.length === 0) outers.push(ring);
    else holes++;
  }
  return { outers, holes };
}

export function readShapefileSet(set: ShapefileSet): ImportResult {
  const warnings: string[] = [];
  const projection = parsePrj(set.prj);
  const project = toWgs84(projection);
  if (!project) {
    throw new Error(
      `${set.name}: the coordinate system "${projection?.name}" is not supported. Re-export it as WGS 84 or UTM and import again.`,
    );
  }
  const datum = projection ? datumWarning(projection) : null;
  if (datum) warnings.push(datum);

  const { shapes } = readShp(set.shp);
  const rows = set.dbf ? readDbf(set.dbf, set.cpg) : [];
  if (!set.dbf) warnings.push(`${set.name}: no .dbf file, so the features come in without attributes.`);

  const features: ImportedFeature[] = [];
  let skipped = 0;
  let droppedHoles = 0;

  shapes.forEach((shape, i) => {
    if (!shape) return;
    const attributes = rows[i] ?? {};
    const parts = shape.parts.map((part) => part.map(([x, y]) => project(x, y)));
    if (shape.kind === 'polygon') {
      const { outers, holes } = outerRings(shape.parts);
      droppedHoles += holes;
      for (const ring of outers) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        const closed = first[0] === last[0] && first[1] === last[1];
        const coords = (closed ? ring.slice(0, -1) : ring).map(([x, y]) => project(x, y));
        if (coords.length >= 3 && coords.every(isPosition)) features.push({ kind: 'polygon', coordinates: coords, attributes });
        else skipped++;
      }
      return;
    }
    for (const part of parts) {
      const min = shape.kind === 'line' ? 2 : 1;
      if (part.length >= min && part.every(isPosition)) {
        features.push({ kind: shape.kind, coordinates: shape.kind === 'point' ? [part[0]] : part, attributes });
      } else {
        skipped++;
      }
    }
  });

  if (!projection && features.length === 0 && shapes.some(Boolean)) {
    throw new Error(`${set.name}: there is no .prj file and the coordinates are not degrees. Include the .prj and import again.`);
  }
  if (skipped) warnings.push(`${set.name}: ${skipped} shape(s) had coordinates outside the world and were skipped.`);
  if (droppedHoles) warnings.push(`${set.name}: ${droppedHoles} polygon hole(s) were not imported — only outer boundaries are kept.`);

  return { name: set.name, features, crs: describeProjection(projection), warnings };
}
