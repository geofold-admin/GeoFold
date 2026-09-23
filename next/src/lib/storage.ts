/**
 * Storage via GeoFold VPS.
 * - Stores all uploaded photos as WebP on the VPS NVMe disk to conserve storage.
 * - Converts to PNG on-the-fly when downloading.
 * - Bounded by account quota: Free (20MB) vs Pro (500MB).
 */
const VPS_STORAGE =
  process.env.VPS_STORAGE_URL ||
  process.env.NEXT_PUBLIC_VPS_STORAGE_URL ||
  'https://api.geofold.sayba.id'

export async function createUploadUrl(objectPath: string): Promise<string> {
  return `${VPS_STORAGE}/api/storage/raw?path=${encodeURIComponent(objectPath)}`
}

export async function createDownloadUrl(objectPath: string, expiresIn = 900): Promise<string> {
  return `${VPS_STORAGE}/api/storage/download?path=${encodeURIComponent(objectPath)}`
}

export async function createViewUrl(objectPath: string): Promise<string> {
  return `${VPS_STORAGE}/api/storage/view?path=${encodeURIComponent(objectPath)}`
}

export async function objectExists(objectPath: string): Promise<boolean> {
  try {
    const r = await fetch(`${VPS_STORAGE}/api/storage/raw?path=${encodeURIComponent(objectPath)}`, {
      method: 'HEAD',
    })
    return r.ok
  } catch {
    return false
  }
}

/** Actual stored size in bytes (WebP size on VPS disk), or null. Used to verify quota. */
export async function objectSize(objectPath: string): Promise<number | null> {
  try {
    const r = await fetch(`${VPS_STORAGE}/api/storage/raw?path=${encodeURIComponent(objectPath)}`, {
      method: 'HEAD',
    })
    if (!r.ok) return null
    const len = r.headers.get('content-length')
    return len ? Number(len) : null
  } catch {
    return null
  }
}
