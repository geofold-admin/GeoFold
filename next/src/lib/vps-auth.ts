import crypto from 'node:crypto'

/**
 * Signs requests this API makes to (or hands out for) the GeoFold VPS — the mirror of
 * `vps/backend/src/security.js`, which verifies them. Both sides derive their keys from the same
 * GEOFOLD_VPS_SECRET, one key per purpose, so a storage URL signature can never be replayed as a
 * payment-proxy signature.
 *
 *  - Storage URLs get `exp` + `sig`: an HMAC over the scope (PUT for uploads, GET for reads), the
 *    exact object path and the expiry. They are issued only after this API has checked that the
 *    caller owns the survey, so a URL is now a short-lived permission rather than a bare path.
 *  - Calls through the iPaymu egress proxy carry a timestamp and an HMAC over the exact body.
 *
 * Rollout: with no secret configured this signs nothing and the URLs are the old unsigned ones,
 * which the VPS accepted before it started verifying. So this code can ship before the secret
 * exists — but the verifying VPS code refuses anything unsigned, so the secret must be on Vercel
 * (and this app redeployed) before that VPS code goes live. /api/health reports
 * `vpsAuth: true` once it is.
 */

const SECRET = process.env.GEOFOLD_VPS_SECRET ?? ''

export function vpsAuthConfigured(): boolean {
  return SECRET.length >= 32
}

let warned = false
function warnOnce() {
  if (warned) return
  warned = true
  console.warn('[vps-auth] GEOFOLD_VPS_SECRET is not set — VPS storage URLs and proxy calls are unsigned.')
}

function subkey(purpose: string): Buffer {
  return crypto.createHmac('sha256', SECRET).update(`geofold:${purpose}`).digest()
}

/**
 * A short public tag of the secret, from its own derived key, so it reveals nothing about the
 * signing keys. The VPS computes the same tag; its deploy script compares the two and stops if
 * Vercel and the VPS hold different secrets (which would make every signature fail).
 */
export function vpsAuthFingerprint(): string | null {
  return vpsAuthConfigured() ? subkey('fingerprint').toString('hex').slice(0, 12) : null
}

/** `&exp=…&sig=…` for a storage URL, or '' when signing is not configured. */
export function signedStorageQuery(scope: 'PUT' | 'GET', objectPath: string, ttlSeconds: number): string {
  if (!vpsAuthConfigured()) {
    warnOnce()
    return ''
  }
  const exp = Math.floor(Date.now() / 1000) + Math.max(30, Math.round(ttlSeconds))
  const sig = crypto
    .createHmac('sha256', subkey('storage'))
    .update(`${scope}\n${objectPath}\n${exp}`)
    .digest('hex')
  return `&exp=${exp}&sig=${sig}`
}

/** Headers authenticating one call through the VPS payment proxy, over the exact body sent. */
export function proxyAuthHeaders(rawBody: string): Record<string, string> {
  if (!vpsAuthConfigured()) {
    warnOnce()
    return {}
  }
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = crypto
    .createHmac('sha256', subkey('payment-proxy'))
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
  return { 'X-GeoFold-Timestamp': timestamp, 'X-GeoFold-Signature': signature }
}
