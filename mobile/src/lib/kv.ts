import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Small synchronous JSON store for state that has to be known before the first frame — the theme
 * above all, because reading it asynchronously means painting one frame in the wrong colours.
 *
 * Native: one file per key under the document directory, which survives restarts and is not
 * evicted under storage pressure the way the cache is. Web: localStorage (expo-file-system has no
 * web implementation). Every call swallows its own errors — a corrupt or unreadable file falls
 * back to the caller's defaults rather than taking the app down at startup.
 */

const DIR = 'state';

function fileFor(key: string): File {
  const dir = new Directory(Paths.document, DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, `${key}.json`);
}

export function readJsonSync<T>(key: string): T | null {
  try {
    if (Platform.OS === 'web') {
      const raw = globalThis.localStorage?.getItem(`geofold.${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    const file = fileFor(key);
    if (!file.exists) return null;
    return JSON.parse(file.textSync()) as T;
  } catch {
    return null;
  }
}

export function writeJsonSync(key: string, value: unknown): void {
  try {
    const json = JSON.stringify(value);
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(`geofold.${key}`, json);
      return;
    }
    const file = fileFor(key);
    if (!file.exists) file.create();
    file.write(json);
  } catch {
    // Losing a preference write is not worth surfacing; the in-memory value is still correct.
  }
}
