import { File, UploadType } from 'expo-file-system';

import { api, errorMessage } from './api';
import { DEMO_MODE } from './config';
import { allItems, itemPhotos, removeItem, updateItem, type OutboxItem } from './outbox';
import { pushPendingFields } from './project-fields';
import type { InitiatePhotoResponse } from './types';

// Port of `next/src/lib/sync-client.ts`. The three-step photo handshake is the same: the server
// only ever signs a URL, and the JPEG goes straight from the device to Supabase Storage.

let running = false;

const MAX_BATCH = 200;

/**
 * Push every queued survey row in one request before touching photos. A surveyor who was offline
 * for a day comes back with dozens of points; this turns that into a single round trip instead of
 * one per point. Photos still go individually — only the rows batch.
 *
 * Returns the ids the server actually stored. Failure is not fatal: every write is idempotent, so
 * anything missing from the set simply falls through to the per-item path below.
 */
async function batchUpsert(items: OutboxItem[]): Promise<Set<string>> {
  const done = new Set<string>();
  if (DEMO_MODE || items.length < 2) return done;

  for (let i = 0; i < items.length; i += MAX_BATCH) {
    const chunk = items.slice(i, i + MAX_BATCH);
    try {
      const res = await api<{ results: { id: string; status: string }[] }>('/api/sync/surveys', {
        method: 'POST',
        body: {
          surveys: chunk.map((it) => ({
            id: it.id,
            projectId: it.projectId,
            latitude: it.latitude,
            longitude: it.longitude,
            accuracyMeters: it.accuracyMeters,
            capturedAtUtc: it.capturedAtUtc,
            detailsJson: it.detailsJson,
          })),
        },
      });
      // Only created/updated count. A rejected row falls through so the per-item call can
      // surface the real validation message against that specific survey.
      for (const r of res.results ?? []) {
        if (r.status === 'created' || r.status === 'updated') done.add(r.id);
      }
    } catch {
      // Server too old, signal dropped mid-flight, whatever — per-item still handles it.
    }
  }
  return done;
}

export async function syncAll(online: boolean): Promise<void> {
  if (running) return;
  if (!DEMO_MODE && !online) return;

  running = true;
  try {
    // Form fields added offline go first, so the surveys that use them arrive at a form that knows them.
    if (!DEMO_MODE) await pushPendingFields();

    const pending = (await allItems()).filter((i) => i.status !== 'syncing');
    const upserted = await batchUpsert(pending);
    for (const item of pending) {
      await syncOne(item, upserted.has(item.id));
    }
  } finally {
    running = false;
  }
}

async function syncOne(item: OutboxItem, alreadyUpserted = false): Promise<void> {
  // The loop works from a snapshot of the queue. A capture the surveyor discarded since it was
  // taken must not be sent on the strength of that snapshot.
  if (!(await allItems()).some((i) => i.id === item.id)) return;

  await updateItem(item.id, { status: 'syncing', error: undefined });
  try {
    // Enough of a pause for the queue to be visible doing its work.
    if (DEMO_MODE) await new Promise((r) => setTimeout(r, 700));

    // The id is generated on the device and the server upsert is idempotent, so a retry after a
    // dropped connection updates the same row rather than creating a duplicate point.
    if (!alreadyUpserted) {
      await api('/api/surveys', {
        method: 'POST',
        body: {
          id: item.id,
          projectId: item.projectId,
          latitude: item.latitude,
          longitude: item.longitude,
          accuracyMeters: item.accuracyMeters,
          capturedAtUtc: item.capturedAtUtc,
          detailsJson: item.detailsJson,
        },
      });
    }

    // Demo mode has no storage behind the signed URL, so the photo step is skipped — but the
    // survey still lands, which is the part worth demonstrating.
    // Every photo id is fixed on the device and the server's handshake is idempotent per id, so a
    // retry after the second of three photos failed re-sends only what is missing.
    if (!DEMO_MODE) {
      for (const photo of itemPhotos(item)) await uploadPhoto(item, photo);
    }

    await removeItem(item.id);
  } catch (e) {
    await updateItem(item.id, { status: 'error', error: errorMessage(e, 'Sync failed.') });
  }
}

async function uploadPhoto(
  item: OutboxItem,
  photo: { id: string; uri: string; capturedAtUtc: string },
): Promise<void> {
  const file = new File(photo.uri);
  // The photo can go missing if the OS reclaimed storage. The survey point itself is already
  // saved, so drop the photo rather than trapping the item in a permanent error.
  if (!file.exists) return;

  const initiated = await api<InitiatePhotoResponse>(`/api/surveys/${item.id}/photos/initiate`, {
    method: 'POST',
    body: {
      id: photo.id,
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: file.size,
      latitude: item.latitude,
      longitude: item.longitude,
      // Each photo's own shutter time, which is also what orders a point's photos when it is shown.
      capturedAtUtc: photo.capturedAtUtc,
    },
  });

  const result = await file.upload(initiated.uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { 'Content-Type': 'image/jpeg' },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Photo upload failed (${result.status}).`);
  }

  await api(`/api/surveys/${item.id}/photos/${photo.id}/complete`, { method: 'POST' });
}
