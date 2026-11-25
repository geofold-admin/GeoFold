import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { storageDir } from './gis';

/**
 * A surveyor's own marker picture (spec 1.2): picked from the gallery, cropped square, shrunk to a
 * marker's size and kept in app storage — the gallery copy can be deleted without the map losing it.
 * PNG, so a logo with a transparent background stays transparent.
 */
export async function pickMarkerImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) return null;

  const rendered = await ImageManipulator.manipulate(result.assets[0].uri).resize({ width: 128, height: 128 }).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.PNG });
  const target = new File(storageDir('markers'), `${randomUUID()}.png`);
  await new File(saved.uri).move(target);
  return target.uri;
}

/** Removes a marker picture that nothing uses any more. Never throws. */
export function deleteMarkerImage(uri: string): void {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}
