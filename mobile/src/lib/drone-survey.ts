import { randomUUID } from 'expo-crypto';

import { capturePhoto, fetchLatestPhoto, type DronePhoto } from '@dji';
import { saveToGallery, type GallerySaveResult } from '@/lib/gallery';
import { addItem, storePhoto } from '@/lib/outbox';
import { compressFile } from '@/lib/photo';

/**
 * Aerial capture, landing in the *same* outbox as a survey taken on foot.
 *
 * Present in both variants; only the drone build carries the native SDK behind `@dji`, so in the
 * standard build `capturePhoto` throws rather than this module being absent. Deliberately not a
 * parallel queue — `lib/outbox` and `lib/sync` already handle offline persistence, the three-step
 * photo handshake and idempotent retry, and an aerial survey is the same row on the wire as a
 * ground one. A second implementation would be a second thing to keep in step with the server.
 */

export interface DroneCaptureResult {
  surveyId: string;
  photoUri: string;
  latitude: number;
  longitude: number;
  /** Whether the copy in the phone's own gallery was written. The survey is queued regardless. */
  gallery: GallerySaveResult;
}

export class DroneCaptureError extends Error {}

/**
 * Take a photo from the aircraft and queue it as a survey.
 *
 * The position is the aircraft's, snapshotted at the shutter — not the phone's. That is the whole
 * point of the drone build: the phone is on the ground, sometimes a kilometre from the thing being
 * photographed.
 */
export async function captureDroneSurvey(options: {
  projectId: string;
  projectName: string;
  note?: string;
  /**
   * When the photo already exists — the pilot pressed the shutter on the remote controller — fetch
   * it instead of firing again, which would only produce a second, near-identical frame.
   */
  alreadyTaken?: boolean;
}): Promise<DroneCaptureResult> {
  const photo: DronePhoto = options.alreadyTaken ? await fetchLatestPhoto() : await capturePhoto();

  // The aircraft can shoot before it has a GPS fix — indoors, or in the first seconds after power
  // up. A survey with no position is not a survey, and it is far better to refuse here than to
  // queue a row the server will reject after the flight is over.
  if (photo.latitude == null || photo.longitude == null) {
    throw new DroneCaptureError(
      'The aircraft had no position fix when the photo was taken. Wait for GPS and try again.',
    );
  }

  const surveyId = randomUUID();
  const photoId = randomUUID();

  // Copy to the phone's gallery FIRST, from the freshly downloaded file, before the outbox move
  // takes it away. The aircraft shoots 12 MP — this copy is the full-resolution original, which is
  // the one worth keeping on the phone; what goes to the server is the compressed derivative.
  const gallery = await saveToGallery(photo.uri);

  // Then compress. A DJI JPEG is 4-8 MB straight off the card, and this is the same cap every
  // ground capture goes through, so aerial and ground surveys cost the same to store and to upload.
  const compressed = await compressFile(photo.uri);

  // Moves the JPEG out of the cache, which the OS may evict, into the outbox directory that
  // survives a cold start.
  const storedUri = await storePhoto(compressed.uri, photoId);

  const details: Record<string, unknown> = {
    // Distinguishes a shot the pilot triggered on the remote controller from one the app fired,
    // because their positions carry different guarantees: the app snapshots telemetry at the
    // shutter, whereas an RC shot is stamped a moment after the exposure.
    source: options.alreadyTaken ? 'drone-rc' : 'drone',
    altitudeAboveTakeoff: photo.altitude,
    heading: photo.heading,
    satellites: photo.satellites,
  };
  if (options.note?.trim()) details.catatan = options.note.trim();

  await addItem({
    id: surveyId,
    projectId: options.projectId,
    projectName: options.projectName,
    latitude: photo.latitude,
    longitude: photo.longitude,
    // The aircraft reports satellite count, not a horizontal accuracy estimate, so there is no
    // honest metre value to put here. The count goes in the details instead of being invented.
    accuracyMeters: null,
    capturedAtUtc: new Date(photo.timestamp).toISOString(),
    detailsJson: JSON.stringify(details),
    photoId,
    photoUri: storedUri,
    status: 'pending',
    createdAt: Date.now(),
  });

  return {
    surveyId,
    photoUri: storedUri,
    latitude: photo.latitude,
    longitude: photo.longitude,
    gallery,
  };
}
