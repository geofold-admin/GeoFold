/**
 * Saves a copy of a photo into the phone's own gallery, under a GeoFold album.
 *
 * Drone photos in particular need this. The aircraft writes the original to its SD card and the
 * app downloads a copy into its private storage, which is invisible to the gallery, to any file
 * manager, and to the pilot — so a photo that was in fact captured correctly looks lost. A copy in
 * the camera roll is the thing a pilot can actually see, share, and check on the spot.
 *
 * Never throws. Failing to save a gallery *copy* must not lose the survey — the outbox copy is the
 * one that matters, and it has already been written by the time this runs.
 */

const ALBUM = 'GeoFold';

type MediaLibrary = typeof import('expo-media-library');
let mediaLibrary: MediaLibrary | null | undefined;

/**
 * Loaded on first use, like the modules in `native.ts`: this API resolves its native module at
 * import and throws where there is none (web, Expo Go). A top-level import took the whole route
 * tree down there, because Expo Router requires every route — the drone screen included — at start.
 */
function getMediaLibrary(): MediaLibrary | null {
  if (mediaLibrary === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- deferring the load is the point
      mediaLibrary = require('expo-media-library') as MediaLibrary;
    } catch {
      mediaLibrary = null;
    }
  }
  return mediaLibrary;
}

export type GallerySaveResult = 'saved' | 'denied' | 'failed';

export async function saveToGallery(uri: string): Promise<GallerySaveResult> {
  const lib = getMediaLibrary();
  if (!lib) return 'failed';
  const { Album, Asset, requestPermissionsAsync } = lib;
  try {
    // writeOnly: adding our own photo needs no permission to read the user's existing library, and
    // asking for less is the difference between a one-tap grant and a scary full-access prompt.
    const permission = await requestPermissionsAsync(true, ['photo']);
    if (!permission.granted) return 'denied';

    // `Asset.create` takes a file path. The DJI modules hand back a `file://` URI and the image
    // manipulator returns one too, so try as given and fall back to the bare path — which of the
    // two the native side accepts is not worth guessing at, and this is the difference between a
    // photo in the pilot's gallery and the silent failure this whole file exists to prevent.
    let asset;
    try {
      asset = await Asset.create(uri);
    } catch {
      asset = await Asset.create(uri.replace(/^file:\/\//, ''));
    }

    // Group them so a pilot can find a flight's photos without scrolling the whole camera roll.
    // Album handling is best-effort: on Android an album may already exist under another app's
    // ownership, and a photo in the camera roll but not in the album is still a photo saved.
    try {
      const existing = await Album.get(ALBUM);
      if (existing) await existing.add(asset);
      else await Album.create(ALBUM, [asset], false);
    } catch {
      // Saved, just not filed.
    }

    return 'saved';
  } catch {
    return 'failed';
  }
}
