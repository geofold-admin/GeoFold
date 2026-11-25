import { latin1Decode } from './bytes';
import type { Position } from './geometry';
import { inflateZlib } from './inflate';

/**
 * Reads the georeferencing of a GeoPDF (spec 1.5) — the "Geospatial PDF" encoding of ISO 32000,
 * which is what QGIS, ArcGIS, GDAL and Avenza write: a page `/VP` (viewport) array whose entries
 * carry a `/BBox` on the page and a `/Measure` dictionary of subtype `/GEO` pairing points on the
 * page (`/LPTS`, in the viewport's unit square) with latitude/longitude (`/GPTS`).
 *
 * The PDF is not parsed in full. Maps run to tens of megabytes of image data, so the file is
 * scanned as bytes for the handful of small dictionaries that matter, and only those few kilobytes
 * are ever turned into text. Dictionaries packed into compressed object streams (`/ObjStm`, PDF
 * 1.5+) are found by inflating just those streams. The page itself is rasterised natively
 * (`pdf-render.ts`) and cropped to the viewport here.
 *
 * Not read: the older OGC/TerraGo `LGIDict` encoding. Files that only carry it are reported as
 * having no georeferencing — re-exporting them from QGIS with "Geospatial PDF" writes the ISO form.
 */

export interface GeoPdfInfo {
  /** The page's visible box (CropBox, else MediaBox) in PDF user space. */
  pageBox: [number, number, number, number];
  rotate: 0 | 90 | 180 | 270;
  /** The georeferenced viewport on the page, in user space. */
  bbox: [number, number, number, number];
  /** Control points: latitude/longitude, and the matching position in the viewport's unit square. */
  gpts: [number, number][];
  lpts: [number, number][];
  crs: string | null;
}

/* ── byte scanning ─────────────────────────────────────────────────────── */

function findAll(bytes: Uint8Array, needle: string, limit = 64): number[] {
  const first = needle.charCodeAt(0);
  const hits: number[] = [];
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    if (bytes[i] !== first) continue;
    for (let k = 1; k < needle.length; k++) if (bytes[i + k] !== needle.charCodeAt(k)) continue outer;
    hits.push(i);
    if (hits.length >= limit) break;
  }
  return hits;
}

/** A searchable piece of the document: a window of the raw file, or an inflated object stream. */
interface Chunk {
  text: string;
  /** For object-stream chunks: object number by offset, to name a dictionary found inside. */
  objectAt?: (index: number) => number | null;
}

const WINDOW = 8192;

function windowAt(bytes: Uint8Array, at: number): Chunk {
  const from = Math.max(0, at - WINDOW);
  return { text: latin1Decode(bytes.subarray(from, Math.min(bytes.length, at + WINDOW))) };
}

/** Every compressed object stream, inflated, with a map from text offset to object number. */
function objectStreams(bytes: Uint8Array): Chunk[] {
  const chunks: Chunk[] = [];
  for (const at of findAll(bytes, '/ObjStm', 512)) {
    const head = latin1Decode(bytes.subarray(Math.max(0, at - 1024), Math.min(bytes.length, at + 1024)));
    const local = Math.min(at, 1024);
    const dictStart = head.lastIndexOf('<<', local);
    const streamKw = head.indexOf('stream', local);
    if (dictStart < 0 || streamKw < 0) continue;
    const dict = head.slice(dictStart, streamKw);
    if (!/\/FlateDecode/.test(dict) && /\/Filter/.test(dict)) continue; // only Flate is supported
    let dataStart = at - local + streamKw + 'stream'.length;
    if (bytes[dataStart] === 0x0d) dataStart++;
    if (bytes[dataStart] === 0x0a) dataStart++;
    // \b stops a backtrack to a partial number: "/Length 12 0 R" must not read as a length of 1.
    const len = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dict);
    let dataEnd: number;
    if (len) dataEnd = dataStart + Number(len[1]);
    else {
      const endHits = findAll(bytes.subarray(dataStart, dataStart + 50_000_000), 'endstream', 1);
      if (!endHits.length) continue;
      dataEnd = dataStart + endHits[0];
    }
    try {
      const raw = bytes.subarray(dataStart, dataEnd);
      const text = latin1Decode(/\/FlateDecode/.test(dict) ? inflateZlib(raw) : raw);
      const first = Number(/\/First\s+(\d+)/.exec(dict)?.[1] ?? NaN);
      const count = Number(/\/N\s+(\d+)/.exec(dict)?.[1] ?? NaN);
      let objectAt: Chunk['objectAt'];
      if (Number.isFinite(first) && Number.isFinite(count)) {
        const nums = text.slice(0, first).trim().split(/\s+/).map(Number);
        const table: { num: number; offset: number }[] = [];
        for (let i = 0; i + 1 < nums.length && table.length < count; i += 2) table.push({ num: nums[i], offset: first + nums[i + 1] });
        objectAt = (index) => {
          let found: number | null = null;
          for (const entry of table) if (entry.offset <= index) found = entry.num;
          return found;
        };
      }
      chunks.push({ text, objectAt });
    } catch {
      // A stream we cannot inflate is skipped; the georeferencing may still be elsewhere.
    }
  }
  return chunks;
}

/* ── dictionary text ───────────────────────────────────────────────────── */

/** The `<< … >>` dictionary enclosing position `at`, as [start, end). */
function enclosingDict(s: string, at: number): [number, number] | null {
  let depth = 0;
  let start = -1;
  for (let i = at; i >= 1; i--) {
    if (s[i] === '>' && s[i - 1] === '>') {
      depth++;
      i--;
    } else if (s[i] === '<' && s[i - 1] === '<') {
      if (depth === 0) {
        start = i - 1;
        break;
      }
      depth--;
      i--;
    }
  }
  if (start < 0) return null;
  depth = 0;
  for (let i = start; i < s.length - 1; i++) {
    if (s[i] === '<' && s[i + 1] === '<') {
      depth++;
      i++;
    } else if (s[i] === '>' && s[i + 1] === '>') {
      depth--;
      i++;
      if (depth === 0) return [start, i + 1];
    }
  }
  return null;
}

function numbersOf(s: string, key: string): number[] | null {
  const m = new RegExp(`/${key}\\s*\\[([^\\]]*)\\]`).exec(s);
  if (!m) return null;
  const nums = m[1].trim().split(/\s+/).filter(Boolean).map(Number);
  return nums.every(Number.isFinite) ? nums : null;
}

function pairs(nums: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

function box(nums: number[] | null): [number, number, number, number] | null {
  if (!nums || nums.length < 4) return null;
  const [a, b, c, d] = nums;
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
}

/** The object number of a top-level dictionary in a raw window (`N 0 obj << … >>`). */
function rawObjectNumber(s: string, dictStart: number): number | null {
  const m = /(\d+)\s+\d+\s+obj\s*$/.exec(s.slice(Math.max(0, dictStart - 40), dictStart));
  return m ? Number(m[1]) : null;
}

/* ── the reader ────────────────────────────────────────────────────────── */

interface Viewport {
  bbox: [number, number, number, number];
  gpts: [number, number][];
  lpts: [number, number][];
  crs: string | null;
}

function measureIn(chunk: Chunk, gptsAt: number): { measure: [number, number]; text: string } | null {
  const measure = enclosingDict(chunk.text, gptsAt);
  return measure ? { measure, text: chunk.text.slice(measure[0], measure[1]) } : null;
}

function crsOf(text: string): string | null {
  const epsg = /\/EPSG\s+(\d+)/.exec(text);
  if (epsg) return `EPSG:${epsg[1]}`;
  const wkt = /\/WKT\s*\(\s*(?:PROJCS|GEOGCS)\[\s*"([^"]+)"/.exec(text);
  return wkt ? wkt[1] : null;
}

export function readGeoPdf(bytes: Uint8Array): GeoPdfInfo {
  if (latin1Decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('This is not a PDF file.');

  const rawGpts = findAll(bytes, '/GPTS');
  const streams = rawGpts.length ? [] : objectStreams(bytes);
  const viewports: Viewport[] = [];

  const consider = (chunk: Chunk, gptsAt: number, allChunks: Chunk[]) => {
    const found = measureIn(chunk, gptsAt);
    if (!found) return;
    const gpts = pairs(numbersOf(found.text, 'GPTS') ?? []);
    if (gpts.length < 3) return;
    let lpts = pairs(numbersOf(found.text, 'LPTS') ?? []);
    if (lpts.length !== gpts.length) {
      // No /LPTS: the points are the unit square's corners, anticlockwise from the lower left.
      lpts = gpts.length === 4 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [];
    }
    if (lpts.length !== gpts.length) return;
    const crs = crsOf(found.text);

    // The viewport is the dictionary holding the measure inline…
    const parent = enclosingDict(chunk.text, found.measure[0] - 1);
    let bbox =
      parent && parent[1] >= found.measure[1]
        ? box(numbersOf(chunk.text.slice(parent[0], parent[1]), 'BBox'))
        : null;

    // …or one that points at it as an indirect object.
    if (!bbox) {
      const num = chunk.objectAt ? chunk.objectAt(found.measure[0]) : rawObjectNumber(chunk.text, found.measure[0]);
      if (num != null) {
        const ref = `/Measure ${num} 0 R`;
        const holders: Chunk[] = [...findAll(bytes, ref, 8).map((at) => windowAt(bytes, at)), ...allChunks];
        for (const holder of holders) {
          const at = holder.text.indexOf(ref);
          if (at < 0) continue;
          const vp = enclosingDict(holder.text, at);
          bbox = vp ? box(numbersOf(holder.text.slice(vp[0], vp[1]), 'BBox')) : null;
          if (bbox) break;
        }
      }
    }
    if (bbox) viewports.push({ bbox, gpts, lpts, crs });
  };

  for (const at of rawGpts) {
    const chunk = windowAt(bytes, at);
    consider(chunk, Math.min(at, WINDOW), streams);
  }
  for (const chunk of streams) {
    for (let at = chunk.text.indexOf('/GPTS'); at >= 0; at = chunk.text.indexOf('/GPTS', at + 1)) {
      consider(chunk, at, streams);
    }
  }

  if (!viewports.length) {
    throw new Error(
      findAll(bytes, '/LGIDict', 1).length
        ? 'This PDF uses the older OGC (TerraGo) georeferencing, which is not supported. Re-export it as a Geospatial PDF (ISO 32000) from QGIS or ArcGIS.'
        : 'No georeferencing found in this PDF. Export the map as a GeoPDF / Geospatial PDF, or add it as an image and place it by hand.',
    );
  }

  // Several viewports (a main map plus an inset): the biggest is the map.
  const area = (b: [number, number, number, number]) => (b[2] - b[0]) * (b[3] - b[1]);
  const vp = viewports.sort((a, b) => area(b.bbox) - area(a.bbox))[0];

  // The page box and rotation, from the page that carries the viewport array.
  let pageBox: [number, number, number, number] | null = null;
  let rotate = 0;
  const pageChunks: Chunk[] = [...findAll(bytes, '/VP', 16).map((at) => windowAt(bytes, at)), ...streams];
  for (const chunk of pageChunks) {
    const at = chunk.text.search(/\/VP\s*[[\d]/);
    if (at < 0) continue;
    const page = enclosingDict(chunk.text, at);
    if (!page) continue;
    const text = chunk.text.slice(page[0], page[1]);
    pageBox = box(numbersOf(text, 'CropBox')) ?? box(numbersOf(text, 'MediaBox'));
    rotate = Number(/\/Rotate\s+(-?\d+)/.exec(text)?.[1] ?? 0);
    if (pageBox) break;
  }
  if (!pageBox) {
    // Inherited from the page tree: the first MediaBox in the file is the usual one.
    const at = findAll(bytes, '/MediaBox', 1)[0];
    if (at != null) pageBox = box(numbersOf(windowAt(bytes, at).text.slice(Math.min(at, WINDOW)), 'MediaBox'));
  }
  if (!pageBox) throw new Error('Could not find the page size in this PDF.');

  const r = ((rotate % 360) + 360) % 360;
  return {
    pageBox,
    rotate: (r === 90 || r === 180 || r === 270 ? r : 0) as GeoPdfInfo['rotate'],
    bbox: vp.bbox,
    gpts: vp.gpts,
    lpts: vp.lpts,
    crs: vp.crs,
  };
}

/* ── placement ─────────────────────────────────────────────────────────── */

/** Least-squares affine map from the unit square to (lon, lat) through the control points. */
function fitAffine(lpts: [number, number][], gpts: [number, number][]): (s: number, t: number) => Position {
  // Normal equations for [1 s t] · coefficients ≈ value, solved for lon and lat separately.
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const vlon = [0, 0, 0];
  const vlat = [0, 0, 0];
  lpts.forEach(([s, t], i) => {
    const row = [1, s, t];
    const [lat, lon] = gpts[i];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) m[a][b] += row[a] * row[b];
      vlon[a] += row[a] * lon;
      vlat[a] += row[a] * lat;
    }
  });
  const solve = (v: number[]) => {
    const a = m.map((row, i) => [...row, v[i]]);
    for (let col = 0; col < 3; col++) {
      let pivot = col;
      for (let r = col + 1; r < 3; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
      [a[col], a[pivot]] = [a[pivot], a[col]];
      if (Math.abs(a[col][col]) < 1e-15) throw new Error('The GeoPDF control points are degenerate.');
      for (let r = 0; r < 3; r++) {
        if (r === col) continue;
        const f = a[r][col] / a[col][col];
        for (let c = col; c < 4; c++) a[r][c] -= f * a[col][c];
      }
    }
    return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
  };
  const cl = solve(vlon);
  const ct = solve(vlat);
  return (s, t) => [cl[0] + cl[1] * s + cl[2] * t, ct[0] + ct[1] * s + ct[2] * t];
}

export interface Placement {
  /** Pixel rectangle of the rendered page to keep. */
  crop: { originX: number; originY: number; width: number; height: number };
  /** Top-left, top-right, bottom-right, bottom-left of the cropped image, as `[lng, lat]`. */
  corners: [Position, Position, Position, Position];
}

/**
 * Where the rendered page goes on the map: crop it to the georeferenced viewport, and the corners
 * of that crop in longitude/latitude. Works in the page's *displayed* orientation, so a page with
 * `/Rotate 90` comes out right.
 */
export function geoPdfPlacement(info: GeoPdfInfo, image: { width: number; height: number }): Placement {
  const [px0, py0, px1, py1] = info.pageBox;
  const W = image.width;
  const H = image.height;

  // User space → pixel in the rendered (rotated) page.
  const toPixel = (x: number, y: number): [number, number] => {
    const u = (x - px0) / (px1 - px0);
    const v = (y - py0) / (py1 - py0);
    switch (info.rotate) {
      case 90:
        return [v * W, u * H];
      case 180:
        return [(1 - u) * W, v * H];
      case 270:
        return [(1 - v) * W, (1 - u) * H];
      default:
        return [u * W, (1 - v) * H];
    }
  };

  const [bx0, by0, bx1, by1] = info.bbox;
  const unitCorners: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const projected = unitCorners.map(([s, t]) => ({
    s,
    t,
    px: toPixel(bx0 + s * (bx1 - bx0), by0 + t * (by1 - by0)),
  }));
  const xs = projected.map((p) => p.px[0]);
  const ys = projected.map((p) => p.px[1]);
  const minX = Math.max(0, Math.min(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxX = Math.min(W, Math.max(...xs));
  const maxY = Math.min(H, Math.max(...ys));

  const fit = fitAffine(info.lpts, info.gpts);
  // An exact control point wins over the fitted surface — usually all four corners are given.
  const geo = (s: number, t: number): Position => {
    const i = info.lpts.findIndex(([ls, lt]) => Math.abs(ls - s) < 1e-6 && Math.abs(lt - t) < 1e-6);
    return i >= 0 ? [info.gpts[i][1], info.gpts[i][0]] : fit(s, t);
  };

  // Name each unit-square corner by where it lands in the displayed crop.
  const cornerAt = (wantLeft: boolean, wantTop: boolean): Position => {
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const hit = projected.find((p) => p.px[0] < midX === wantLeft && p.px[1] < midY === wantTop)!;
    return geo(hit.s, hit.t);
  };

  return {
    crop: {
      originX: Math.floor(minX),
      originY: Math.floor(minY),
      width: Math.max(1, Math.round(maxX - Math.floor(minX))),
      height: Math.max(1, Math.round(maxY - Math.floor(minY))),
    },
    corners: [cornerAt(true, true), cornerAt(false, true), cornerAt(false, false), cornerAt(true, false)],
  };
}
