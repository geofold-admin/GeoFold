import { importPKCS8, SignJWT } from 'jose'

/**
 * Google Play Developer API (androidpublisher v3) client: one service account, the GeoFold app,
 * and its one product.
 *
 * Used by POST /api/subscriptions/verify-android, which grants Premium once Google confirms a
 * purchase, and by GET /api/cron/google-play-voided, which takes Premium back when Google reports
 * the purchase refunded, charged back or otherwise voided. Setup: docs/GOOGLE-PLAY-BILLING.md.
 */

export const PACKAGE_NAME = 'app.geofold.mobile'
export const PRODUCT_ID = 'geofold_premium_1month'

/**
 * Stamped on every payment row verify-android verified with Google. Rows written by the earlier
 * version of that route, which never asked Google, lack it: they do not count as claims, and they
 * never granted Premium here, so a refund has nothing to take back from them.
 */
export const VERIFIED_BY = 'androidpublisher'

const API_BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}`
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
const GOOGLE_TIMEOUT_MS = 10_000

export interface ServiceAccount {
  clientEmail: string
  privateKey: string
  keyId?: string
}

/** The fields of a purchases.products resource verify-android reads. */
export interface ProductPurchase {
  /** 0 purchased, 1 cancelled, 2 pending. */
  purchaseState?: number
  productId?: string
  orderId?: string
  purchaseTimeMillis?: string
  purchaseType?: number
  regionCode?: string
  obfuscatedExternalAccountId?: string
}

/** One entry of purchases.voidedpurchases.list. */
export interface VoidedPurchase {
  purchaseToken?: string
  orderId?: string
  purchaseTimeMillis?: string
  /** When the purchase was refunded, charged back or cancelled. */
  voidedTimeMillis?: string
  /** 0 user, 1 developer, 2 Google. */
  voidedSource?: number
  /**
   * 0 other, 1 remorse, 2 not received, 3 defective, 4 accidental purchase, 5 fraud,
   * 6 friendly fraud, 7 chargeback, 8 unacknowledged purchase.
   */
  voidedReason?: number
  /** Only on quantity-based partial refunds, which are not requested. */
  voidedQuantity?: number
}

/**
 * not_found: Google has no such purchase of our product. rejected: Google refused our credentials,
 * which an operator has to fix. unavailable: Google could not be reached or answered oddly, so a
 * retry may succeed.
 */
export class PlayError extends Error {
  constructor(
    readonly kind: 'not_found' | 'rejected' | 'unavailable',
    detail: string,
  ) {
    super(detail)
  }
}

/**
 * The service account in GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: the JSON key file Google Cloud
 * downloads, pasted whole or base64-encoded. Null when unset or unusable, and callers then refuse
 * with 503 instead of acting without Google.
 */
export function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) {
    console.error('[google-play] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set; Google Play cannot be asked about purchases.')
    return null
  }
  let parsed: { client_email?: unknown; private_key?: unknown; private_key_id?: unknown }
  try {
    parsed = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    console.error('[google-play] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is neither JSON nor base64-encoded JSON.')
    return null
  }
  if (typeof parsed?.client_email !== 'string' || typeof parsed.private_key !== 'string') {
    console.error('[google-play] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON has no client_email or private_key.')
    return null
  }
  return {
    clientEmail: parsed.client_email,
    // A key that went through one round of escaping too many arrives with literal "\n"s.
    privateKey: parsed.private_key.replace(/\\n/g, '\n'),
    keyId: typeof parsed.private_key_id === 'string' ? parsed.private_key_id : undefined,
  }
}

/** purchases.products.get for our package and product. */
export async function lookUpPurchase(account: ServiceAccount, token: string): Promise<ProductPurchase> {
  const purchase = (await playGet(
    account,
    `${API_BASE}/purchases/products/${PRODUCT_ID}/tokens/${encodeURIComponent(token)}`,
  )) as ProductPurchase | null
  if (typeof purchase?.purchaseState !== 'number') {
    throw new PlayError('unavailable', 'purchases.products.get answered without a purchaseState')
  }
  return purchase
}

/** More pages than this means the pagination is looping, not that this many purchases were voided. */
const MAX_VOIDED_PAGES = 20

/**
 * purchases.voidedpurchases.list for our package: every one-time purchase in the app that Google
 * recorded as refunded, charged back or otherwise voided in the last 30 days, which is as far back
 * as the API goes. Subscriptions (type 1) and quantity-based partial refunds are not requested: the
 * app sells one single-quantity product, and a full void is the only kind that undoes a grant.
 */
export async function listVoidedPurchases(account: ServiceAccount): Promise<VoidedPurchase[]> {
  const voided: VoidedPurchase[] = []
  let pageToken = ''
  for (let page = 1; page <= MAX_VOIDED_PAGES; page++) {
    // No startTime or endTime: Google then uses its widest window, the last 30 days up to now.
    const query = new URLSearchParams({ type: '0', maxResults: '1000', ...(pageToken ? { token: pageToken } : {}) })
    const body = (await playGet(account, `${API_BASE}/purchases/voidedpurchases?${query}`)) as {
      voidedPurchases?: unknown
      tokenPagination?: { nextPageToken?: unknown }
    } | null
    if (!body || typeof body !== 'object') {
      throw new PlayError('unavailable', 'purchases.voidedpurchases.list answered without a body')
    }
    if (Array.isArray(body.voidedPurchases)) voided.push(...(body.voidedPurchases as VoidedPurchase[]))
    const next = body.tokenPagination?.nextPageToken
    if (typeof next !== 'string' || !next) return voided
    pageToken = next
  }
  throw new PlayError('unavailable', `purchases.voidedpurchases.list kept paging past ${MAX_VOIDED_PAGES} pages`)
}

/** Reused across requests on a warm instance, until five minutes before it expires. */
let cachedToken: { clientEmail: string; value: string; expiresAt: number } | null = null

/** An OAuth access token for the service account, via the JWT bearer grant. */
async function accessToken(account: ServiceAccount, fresh: boolean): Promise<string> {
  if (!fresh && cachedToken?.clientEmail === account.clientEmail && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.value
  }

  let assertion: string
  try {
    const now = Math.floor(Date.now() / 1000)
    assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', ...(account.keyId ? { kid: account.keyId } : {}) })
      .setIssuer(account.clientEmail)
      .setAudience(TOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600) // Google's maximum
      .sign(await importPKCS8(account.privateKey, 'RS256'))
  } catch (err) {
    throw new PlayError('rejected', `private_key is not a usable RSA key: ${String(err)}`)
  }

  const res = await googleFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const body = (await res.json().catch(() => null)) as {
    access_token?: unknown
    expires_in?: unknown
    error?: unknown
    error_description?: unknown
  } | null
  if (!res.ok || typeof body?.access_token !== 'string') {
    const detail = `token endpoint ${res.status} ${String(body?.error ?? '')} ${String(body?.error_description ?? '')}`
    // 400 invalid_grant / 401 is a deleted key or a disabled account; anything else may pass.
    throw new PlayError(res.status === 400 || res.status === 401 || res.status === 403 ? 'rejected' : 'unavailable', detail.trim())
  }
  const ttlSeconds = typeof body.expires_in === 'number' ? body.expires_in : 3600
  cachedToken = { clientEmail: account.clientEmail, value: body.access_token, expiresAt: Date.now() + ttlSeconds * 1000 }
  return body.access_token
}

/** An authorised GET against the API. Resolves to the parsed JSON body, or null if it was not JSON. */
async function playGet(account: ServiceAccount, url: string): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const res = await googleFetch(url, { headers: { Authorization: `Bearer ${await accessToken(account, attempt > 1)}` } })
    if (res.ok) return res.json().catch(() => null)

    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string; errors?: { reason?: string }[] }
    } | null
    const reason = body?.error?.errors?.[0]?.reason ?? ''
    const detail = `androidpublisher ${res.status} ${reason} ${body?.error?.message ?? ''}`.trim()

    // A cached access token can stop working before it expires. One retry with a fresh token
    // separates that from a service account that has no access to the app.
    if (res.status === 401 && attempt === 1) continue
    // Older Google APIs report quota as 403 rateLimitExceeded / quotaExceeded / dailyLimitExceeded.
    if (res.status === 429 || res.status >= 500 || /rate|quota|limit/i.test(reason)) throw new PlayError('unavailable', detail)
    // permissionDenied, projectNotLinked, API disabled: Play Console or Cloud setup, not the buyer.
    if (res.status === 401 || res.status === 403) throw new PlayError('rejected', detail)
    // 400 "Invalid Value" and 404/410: no purchase of this product in this app has that token.
    if (res.status === 400 || res.status === 404 || res.status === 410) throw new PlayError('not_found', detail)
    throw new PlayError('unavailable', detail)
  }
}

/** fetch with a timeout and no caching; a network failure means Google is unavailable. */
async function googleFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) })
  } catch (err) {
    throw new PlayError('unavailable', `${new URL(url).host}: ${String(err)}`)
  }
}
