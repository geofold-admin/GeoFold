import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * The offline outbox — the reason a surveyor can work in a valley with no bars.
 *
 * A capture is written here first and the UI returns immediately; syncing happens later and
 * retries forever. Metadata lives in AsyncStorage (small, atomic enough for a queue); the
 * watermarked JPEG lives as a real file in the document directory, which survives cold starts
 * and is not subject to the cache being evicted under storage pressure.
 */
export interface OutboxItem {
  id: string;
  projectId: string;
  projectName: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAtUtc: string;
  detailsJson: string;
  photoId: string;
  /** `file://` URI in the outbox directory, or null when the capture has no photo. */
  photoUri: string | null;
  /**
   * Further photos of the same point — the wide shot and the close-up, the nameplate, the damage
   * from the other side. Absent on captures queued before a point could carry more than one.
   */
  extraPhotos?: { id: string; uri: string; capturedAtUtc?: string }[];
  status: 'pending' | 'syncing' | 'error';
  error?: string;
  createdAt: number;
}

const KEY = 'geofold.outbox';

function outboxDir(): Directory {
  const dir = new Directory(Paths.document, 'outbox');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Moves a freshly captured photo out of the cache and into permanent storage.
 * Returns the new URI, which is what gets recorded on the outbox item.
 */
export async function storePhoto(sourceUri: string, photoId: string): Promise<string> {
  const source = new File(sourceUri);
  const destination = new File(outboxDir(), `${photoId}.jpg`);
  if (destination.exists) destination.delete();
  await source.move(destination);
  return destination.uri;
}

/** Deletes a stored photo. Never throws: a file already gone is the outcome that was wanted. */
export function discardPhoto(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A missing or already-deleted photo must never block draining the queue.
  }
}

// Every mutation is a read-modify-write over one AsyncStorage key, so they are chained rather
// than run concurrently — two captures saved in the same tick would otherwise clobber each other.
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

async function read(): Promise<OutboxItem[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

async function write(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export function allItems(): Promise<OutboxItem[]> {
  return serialize(read);
}

export function pendingCount(): Promise<number> {
  return serialize(async () => (await read()).length);
}

export function addItem(item: OutboxItem): Promise<void> {
  return serialize(async () => {
    const items = await read();
    await write([...items.filter((i) => i.id !== item.id), item]);
  });
}

export function updateItem(id: string, patch: Partial<OutboxItem>): Promise<void> {
  return serialize(async () => {
    const items = await read();
    const index = items.findIndex((i) => i.id === id);
    if (index === -1) return;
    items[index] = { ...items[index], ...patch };
    await write(items);
  });
}

export function removeItem(id: string): Promise<void> {
  return serialize(async () => {
    const items = await read();
    const target = items.find((i) => i.id === id);
    if (!target) return;
    discardPhoto(target.photoUri);
    for (const extra of target.extraPhotos ?? []) discardPhoto(extra.uri);
    await write(items.filter((i) => i.id !== id));
  });
}

/** Every photo a queued capture carries, the main one first. */
export function itemPhotos(item: OutboxItem): { id: string; uri: string; capturedAtUtc: string }[] {
  return [
    ...(item.photoUri ? [{ id: item.photoId, uri: item.photoUri, capturedAtUtc: item.capturedAtUtc }] : []),
    ...(item.extraPhotos ?? []).map((p) => ({ ...p, capturedAtUtc: p.capturedAtUtc ?? item.capturedAtUtc })),
  ];
}

/**
 * Clears the `syncing` flag left behind if the app was killed mid-upload, so those items are
 * retried instead of sitting in limbo. Called once at startup.
 */
export function resetStuckItems(): Promise<void> {
  return serialize(async () => {
    const items = await read();
    if (!items.some((i) => i.status === 'syncing')) return;
    await write(items.map((i) => (i.status === 'syncing' ? { ...i, status: 'pending' } : i)));
  });
}
