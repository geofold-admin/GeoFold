/**
 * Storage via GeoFold VPS.
 * - Stores all uploaded photos as WebP on the VPS NVMe disk to conserve storage.
 * - Converts to PNG on-the-fly when downloading.
 * - Bounded by account quota: Free (20MB) vs Pro (500MB).
 *
 * Every URL is signed (`vps-auth.ts`): the VPS refuses storage requests that do not carry a valid,
 * unexpired signature for that exact path and operation. These helpers are only called after the
 * route has checked that the caller owns the survey, so handing out a URL is granting access.
 */
import { signedStorageQuery } from './vps-auth'

const VPS_STORAGE =
  process.env.VPS_STORAGE_URL ||
  process.env.NEXT_PUBLIC_VPS_STORAGE_URL ||
  'https://api.geofold.sayba.id'

/** An upload URL outlives a slow upload on a weak signal, not much more. */
const UPLOAD_TTL_SECONDS = 60 * 60
/** Server-to-server existence/size checks are made immediately. */
const CHECK_TTL_SECONDS = 120

function storageUrl(route: string, objectPath: string, scope: 'PUT' | 'GET', ttlSeconds: number): string {
  return `${VPS_STORAGE}/api/storage/${route}?path=${encodeURIComponent(objectPath)}${signedStorageQuery(scope, objectPath, ttlSeconds)}`
}

export async function createUploadUrl(objectPath: string): Promise<string> {
  return storageUrl('raw', objectPath, 'PUT', UPLOAD_TTL_SECONDS)
}

export async function createDownloadUrl(objectPath: string, expiresIn = 900): Promise<string> {
  return storageUrl('download', objectPath, 'GET', expiresIn)
}

export async function createViewUrl(objectPath: string, expiresIn = 900): Promise<string> {
  return storageUrl('view', objectPath, 'GET', expiresIn)
}

export async function objectExists(objectPath: string): Promise<boolean> {
  try {
    const r = await fetch(storageUrl('raw', objectPath, 'GET', CHECK_TTL_SECONDS), { method: 'HEAD' })
    return r.ok
  } catch {
    return false
  }
}

/** Actual stored size in bytes (WebP size on VPS disk), or null. Used to verify quota. */
export async function objectSize(objectPath: string): Promise<number | null> {
  try {
    const r = await fetch(storageUrl('raw', objectPath, 'GET', CHECK_TTL_SECONDS), { method: 'HEAD' })
    if (!r.ok) return null
    const len = r.headers.get('content-length')
    return len ? Number(len) : null
  } catch {
    return null
  }
}
