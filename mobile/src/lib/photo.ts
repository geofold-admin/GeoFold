import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { PixelRatio } from 'react-native';

export const MAX_EDGE = 1600;

/**
 * Hard ceiling on what any one photo may weigh once it reaches the outbox.
 *
 * Storage is the binding cost in this app — a survey is a photo, and a team shooting a few hundred
 * points a day fills a bucket fast — and a phone on a village edge-of-signal connection uploads a
 * megabyte in seconds and eight megabytes in minutes. A 12 MP drone JPEG is 4–8 MB straight off
 * the aircraft, so this is not a theoretical cap.
 */
export const MAX_BYTES = 1_000_000;

/** Qualities tried in order when a photo is over MAX_BYTES. Below this, resize instead. */
const QUALITY_STEPS = [0.8, 0.65, 0.5, 0.4];

function byteSize(uri: string): number | null {
  try {
    const file = new File(uri);
    return file.exists ? (file.size ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Re-encodes until the file is at or under MAX_BYTES.
 *
 * Quality first, because dropping JPEG quality costs far less visible detail than throwing away
 * pixels — and these photos are evidence, so the coordinates burned into the frame have to stay
 * readable. Only when quality alone will not do it does this start halving the long edge.
 *
 * Returns the original untouched when it is already small enough, which is the common case for a
 * phone capture and means no re-encode and no second generation loss.
 */
export async function compressToLimit(photo: RawPhoto): Promise<RawPhoto> {
  let current = photo;
  let size = byteSize(current.uri);

  // No readable size (a content:// asset, say) — one pass at a sane quality is better than none.
  if (size === null) {
    return encode(current, 0.8);
  }
  if (size <= MAX_BYTES) return current;

  for (const quality of QUALITY_STEPS) {
    current = await encode(photo, quality);
    size = byteSize(current.uri);
    if (size === null || size <= MAX_BYTES) return current;
  }

  // Still too big at the lowest quality: shrink the frame, keeping the last quality. Bounded so a
  // pathological input cannot loop — three halvings takes 1600 px down to 200 px, past which the
  // photo has stopped being evidence and something else is wrong.
  for (let i = 0; i < 3; i += 1) {
    const longest = Math.max(current.width, current.height);
    const scale = Math.max(0.5, Math.sqrt(MAX_BYTES / (size ?? MAX_BYTES * 2)));
    current = await encode(
      current,
      QUALITY_STEPS[QUALITY_STEPS.length - 1],
      Math.round(longest * scale),
    );
    size = byteSize(current.uri);
    if (size === null || size <= MAX_BYTES) break;
  }

  return current;
}

/** One resize+encode pass. `targetEdge` omitted keeps the current dimensions. */
async function encode(photo: RawPhoto, quality: number, targetEdge?: number): Promise<RawPhoto> {
  const longest = Math.max(photo.width, photo.height);
  const edge = Math.min(targetEdge ?? longest, longest);
  const scale = edge / longest;

  const context = ImageManipulator.manipulate(photo.uri).resize({
    width: Math.max(1, Math.round(photo.width * scale)),
    height: Math.max(1, Math.round(photo.height * scale)),
  });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

export interface RawPhoto {
  uri: string;
  width: number;
  height: number;
}

/**
 * Opens the camera and returns a photo already downscaled to a 1600 px longest edge — the same cap
 * the web client applies. Doing it here keeps the outbox small and the upload short over a weak
 * connection. Returns null if the surveyor backed out.
 */
export async function takePhoto(): Promise<RawPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera permission is required to attach a photo.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    exif: false,
  });
  if (result.canceled || !result.assets.length) return null;

  return downscale(result.assets[0]);
}

/** Lets a surveyor attach a photo already taken with the system camera app. */
export async function pickPhoto(): Promise<RawPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required to attach a photo.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    exif: false,
  });
  if (result.canceled || !result.assets.length) return null;

  return downscale(result.assets[0]);
}

/**
 * Caps the longest edge at 1600 px, then caps the file at MAX_BYTES. Shared by the in-app
 * viewfinder, the system camera, the library picker and the drone download, so every route into
 * the outbox produces the same shape and nothing over a megabyte can reach storage.
 */
export async function downscale(asset: RawPhoto): Promise<RawPhoto> {
  const longest = Math.max(asset.width, asset.height);

  const resized =
    longest <= MAX_EDGE
      ? { uri: asset.uri, width: asset.width, height: asset.height }
      : await encode(asset, 0.85, MAX_EDGE);

  return compressToLimit(resized);
}

/**
 * Same caps as `downscale`, for a file whose dimensions are not known up front.
 *
 * The DJI modules hand back a `file://` URI and nothing else — the SDK reports no pixel size — so
 * this asks the image itself before deciding what to do with it. Rendering once to read
 * width/height is cheap next to the re-encode that follows.
 */
export async function compressFile(uri: string): Promise<RawPhoto> {
  const probe = await ImageManipulator.manipulate(uri).renderAsync();
  return downscale({ uri, width: probe.width, height: probe.height });
}

/**
 * Width in dp for the off-screen stage that gets snapshotted.
 *
 * `captureRef` renders at the view's real pixel size, so sizing the stage as
 * `target / devicePixelRatio` lands the output near MAX_EDGE without upscaling a smaller capture.
 */
export function stageWidth(): number {
  const ratio = PixelRatio.get() || 1;
  return Math.min(MAX_EDGE, Math.max(320, Math.round(MAX_EDGE / ratio)));
}
