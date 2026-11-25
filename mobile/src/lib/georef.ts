import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';

import { storageDir } from './gis';

export { looksGeographic, parseWorldFile, placeInView, worldFileCorners, type WorldFile } from './worldfile';

/**
 * Placing raster maps on the map (spec 1.5) — the Avenza idea: a scanned or exported map image
 * that carries its own coordinates is laid exactly where it belongs and used offline.
 *
 * Three sources of placement:
 *  - a **world file** (`.pgw`, `.jgw`, `.wld`…) next to a PNG/JPEG — six numbers mapping pixels to
 *    map coordinates, in whatever CRS the companion `.prj` names;
 *  - a **GeoPDF**'s own georeferencing (`geopdf.ts`);
 *  - **by hand**, dropped onto the current view and then pinned corner by corner.
 */

/** Longest edge MapLibre gets as one texture — the safe ceiling across Android GPUs. */
export const MAX_OVERLAY_EDGE = 4096;

/**
 * Copies an image into app storage as an overlay file, optionally cropped, and downscaled to fit
 * one GPU texture. Returns the stored file and its pixel size.
 */
export async function storeOverlayImage(
  sourceUri: string,
  crop?: { originX: number; originY: number; width: number; height: number },
): Promise<{ uri: string; width: number; height: number }> {
  let context = ImageManipulator.manipulate(sourceUri);
  if (crop) context = context.crop(crop);
  let rendered = await context.renderAsync();
  const longest = Math.max(rendered.width, rendered.height);
  if (longest > MAX_OVERLAY_EDGE) {
    const scale = MAX_OVERLAY_EDGE / longest;
    context = ImageManipulator.manipulate(sourceUri);
    if (crop) context = context.crop(crop);
    rendered = await context
      .resize({ width: Math.round(rendered.width * scale), height: Math.round(rendered.height * scale) })
      .renderAsync();
  }
  // JPEG keeps a scanned map small; PNG would be lossless and several times the size.
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  const target = new File(storageDir('overlays'), `${randomUUID()}.jpg`);
  await new File(saved.uri).move(target);
  return { uri: target.uri, width: saved.width, height: saved.height };
}

/** Pixel size of an image without keeping a decoded copy around. */
export async function imageSize(uri: string): Promise<{ width: number; height: number }> {
  const probe = await ImageManipulator.manipulate(uri).renderAsync();
  return { width: probe.width, height: probe.height };
}
