import type { Position } from './geometry';
import type { Projection } from './projection';
import { toWgs84 } from './projection';

/**
 * Pixel-to-ground maths for raster overlays: world files and hand placement. Pure, so it is
 * checked directly — see NEXT-STEPS.md. The device I/O around it is in `georef.ts`.
 */

/** The six affine terms in file order: A, D, B, E, C, F. */
export type WorldFile = [number, number, number, number, number, number];

export function parseWorldFile(text: string): WorldFile | null {
  const nums = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((l) => Number(l.replace(',', '.')));
  return nums.length === 6 && nums.every(Number.isFinite) ? (nums as WorldFile) : null;
}

/**
 * Corners of a `width`×`height` image as `[lng, lat]`, top-left clockwise. A world file locates the
 * *centre* of the top-left pixel, so the outer corner is half a pixel further out — the difference
 * is invisible on a 0.5 m orthophoto and a whole cell on a coarse scan.
 */
export function worldFileCorners(
  wf: WorldFile,
  width: number,
  height: number,
  projection: Projection | null,
): [Position, Position, Position, Position] {
  const [a, d, b, e, c, f] = wf;
  const project = toWgs84(projection);
  if (!project) throw new Error('The coordinate system of this image is not supported.');
  const at = (col: number, row: number): Position => project(a * col + b * row + c, d * col + e * row + f);
  return [at(-0.5, -0.5), at(width - 0.5, -0.5), at(width - 0.5, height - 0.5), at(-0.5, height - 0.5)];
}

/** True when the world file's coordinates could be degrees at all — a cheap no-.prj guess. */
export function looksGeographic(corners: Position[]): boolean {
  return corners.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90);
}

/**
 * A first placement for an image with no coordinates: centred on the view, filling most of it,
 * at the image's own aspect ratio on the ground (a degree of longitude is shorter than one of
 * latitude by cos φ, so equal degree spans would stretch it).
 */
export function placeInView(
  bounds: [number, number, number, number],
  width: number,
  height: number,
): [Position, Position, Position, Position] {
  const [w, s, e, n] = bounds;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const cos = Math.max(0.05, Math.cos((cy * Math.PI) / 180));
  let halfH = ((n - s) / 2) * 0.8;
  let halfW = (halfH * (width / height)) / cos;
  const maxHalfW = ((e - w) / 2) * 0.8;
  if (halfW > maxHalfW) {
    halfH *= maxHalfW / halfW;
    halfW = maxHalfW;
  }
  return [
    [cx - halfW, cy + halfH],
    [cx + halfW, cy + halfH],
    [cx + halfW, cy - halfH],
    [cx - halfW, cy - halfH],
  ];
}
