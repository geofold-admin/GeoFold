import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * The last good answer to each GET, kept on the phone so the app still has something to show with
 * no signal (spec 3.1): the projects, their forms, and the points on the map.
 *
 * One file per account and request path, under the document directory rather than the cache. The
 * system may empty the cache under storage pressure, which is exactly when this copy matters most:
 * a phone full of survey photos, days away from a signal. Every call swallows its own errors. A
 * missing or unreadable copy is treated the same as no copy.
 */

const ROOT = 'api-cache';

interface Entry<T> {
  path: string;
  savedAt: number;
  data: T;
}

/** FNV-1a, for a short and stable file name per request path. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function ownerDir(owner: string): Directory {
  return new Directory(Paths.document, ROOT, owner);
}

function fileFor(owner: string, path: string): File | null {
  // expo-file-system has no web implementation; the web build simply keeps no copies.
  if (Platform.OS === 'web') return null;
  return new File(ownerDir(owner), `${hash(path)}.json`);
}

/** Stores a response body exactly as the server sent it, so the copy does not need re-encoding. */
export function saveResponse(owner: string, path: string, rawJson: string): void {
  try {
    const file = fileFor(owner, path);
    if (!file) return;
    const dir = ownerDir(owner);
    if (!dir.exists) dir.create({ intermediates: true });
    if (!file.exists) file.create();
    // The body goes in verbatim instead of being parsed and serialised again, because the point
    // feed can run to megabytes. The path is stored with it, so a hash collision reads as a miss
    // and never as another request's data.
    file.write(`{"path":${JSON.stringify(path)},"savedAt":${Date.now()},"data":${rawJson}}`);
  } catch {
    // Losing a copy only costs the offline fallback for this one request.
  }
}

export async function readResponse<T>(owner: string, path: string): Promise<{ data: T; savedAt: number } | null> {
  try {
    const file = fileFor(owner, path);
    if (!file?.exists) return null;
    const entry = JSON.parse(await file.text()) as Entry<T>;
    return entry?.path === path ? { data: entry.data, savedAt: entry.savedAt } : null;
  } catch {
    return null;
  }
}

export function hasResponse(owner: string, path: string): boolean {
  try {
    return fileFor(owner, path)?.exists ?? false;
  } catch {
    return false;
  }
}

/** Deletes every saved response for every account. Called on sign-out, so nothing is left behind on a shared phone. */
export function clearResponses(): void {
  try {
    if (Platform.OS === 'web') return;
    const dir = new Directory(Paths.document, ROOT);
    if (dir.exists) dir.delete();
  } catch {
    // Leftover copies are scoped per account and cannot be read by anyone else through the app.
  }
}
