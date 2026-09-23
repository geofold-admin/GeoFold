import crypto from 'node:crypto'
import { PREMIUM_PRICE_IDR, PREMIUM_DAYS } from './pricing'

/**
 * iPaymu API v2 client (Redirect Payment — iPaymu's hosted checkout page).
 *
 * Docs: https://docs.ipaymu.com/id/docs — signature, payment/redirect-payment, callback,
 * transaction/check-transaction. All secrets stay server-side; the browser only ever receives an
 * order id and the hosted-checkout URL.
 *
 * Configure via env:
 *   IPAYMU_VA             — merchant Virtual Account number; required
 *   IPAYMU_API_KEY        — merchant API key; required. Checkout returns 503 without either.
 *   IPAYMU_IS_PRODUCTION  — 'true' hits my.ipaymu.com, otherwise sandbox.ipaymu.com
 *   IPAYMU_LIVE_CHECKOUT_ENABLED — must be 'true' before a Production checkout can be created
 *   IPAYMU_FEE_DIRECTION  — 'MERCHANT' (default) or 'BUYER'
 *   IPAYMU_EXPIRY_HOURS   — hours a created payment stays payable (default 24)
 *   IPAYMU_TIMEOUT_MS     — outbound request timeout in milliseconds (default 15000)
 *
 * ⚠️ In production iPaymu requires the calling server to have a **static IP** and a registered
 * domain (docs: IP & Domain Validation). Vercel Hobby has dynamic function egress, so a
 * production Redirect Payment call can be rejected even with perfect credentials. Use Vercel Pro
 * Static IPs or a dedicated static-IP relay, register the canonical domain, then enable live
 * checkout explicitly with IPAYMU_LIVE_CHECKOUT_ENABLED=true.
 */

export interface IpaymuConfig {
  va: string
  apiKey: string
  baseUrl: string
  isProduction: boolean
}

export type IpaymuCheckoutAvailability =
  | { available: true }
  | { available: false; code: string; message: string }

/**
 * Creating a live checkout is deliberately an explicit second step after switching credentials.
 * It prevents a staging deploy, an accidental `IPAYMU_IS_PRODUCTION=true`, or a copied live key
 * from starting real charges before the merchant has approved the domain and egress IP.
 */
export function checkoutAvailability(cfg: IpaymuConfig): IpaymuCheckoutAvailability {
  if (!cfg.isProduction) return { available: true }

  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    return {
      available: false,
      code: 'live_checkout_not_available_in_preview',
      message: 'Checkout iPaymu Production hanya tersedia di deployment Production.',
    }
  }

  if (process.env.IPAYMU_LIVE_CHECKOUT_ENABLED?.trim().toLowerCase() !== 'true') {
    return {
      available: false,
      code: 'live_checkout_not_enabled',
      message: 'Checkout iPaymu Production belum diaktifkan. Selesaikan validasi IP dan domain, lalu set IPAYMU_LIVE_CHECKOUT_ENABLED=true.',
    }
  }

  return { available: true }
}

/** A customer-safe explanation for a failed call to iPaymu. Never return the raw gateway body. */
export function checkoutFailure(cfg: IpaymuConfig, error: unknown): { code: string; message: string } {
  const detail = String(error).toLowerCase()
  const prefix = cfg.isProduction ? 'ipaymu' : 'sandbox'

  // Sandbox and Production credentials are separate. A bad VA/key pair and a mismatched
  // signature are both reported by iPaymu as an authentication failure, so neither raw response
  // nor the credentials themselves should reach the browser.
  if (
    detail.includes('ipaymu_auth_rejected') ||
    detail.includes('unauthorized') ||
    detail.includes('signature') ||
    detail.includes('401')
  ) {
    return {
      code: `${prefix}_credentials_rejected`,
      message: cfg.isProduction
        ? 'iPaymu menolak kredensial atau signature Production. Periksa VA dan API Key dari my.ipaymu.com → Integration → API Key.'
        : 'Kredensial ditolak oleh iPaymu Sandbox. Gunakan VA dan API Key dari sandbox.ipaymu.com → Integration → API Key; kredensial my.ipaymu.com tidak bisa dipakai saat IPAYMU_IS_PRODUCTION=false.',
    }
  }

  if (
    detail.includes('ipaymu_origin_rejected') ||
    detail.includes('domain') ||
    /\bip\b/.test(detail) ||
    detail.includes('whitelist') ||
    detail.includes('allowlist')
  ) {
    return {
      code: `${prefix}_origin_rejected`,
      message: cfg.isProduction
        ? 'iPaymu menolak domain atau server ini. Periksa Domain dan IP Validation pada dashboard Production iPaymu.'
        : 'iPaymu menolak domain atau server ini. Periksa Domain Validation pada dashboard Sandbox iPaymu.',
    }
  }

  if (detail.includes('ipaymu_timeout')) {
    return {
      code: `${prefix}_gateway_timeout`,
      message: 'iPaymu tidak merespons tepat waktu. Coba lagi sebentar lagi.',
    }
  }

  return {
    code: `${prefix}_gateway_rejected`,
    message: cfg.isProduction
      ? 'iPaymu menolak pembuatan checkout. Periksa Integration, Domain Validation, dan IP Validation pada dashboard Production.'
      : 'iPaymu Sandbox menolak pembuatan checkout. Periksa Integration → API Key pada dashboard Sandbox, lalu coba lagi.',
  }
}

export function ipaymuConfig(): IpaymuConfig | null {
  const va = process.env.IPAYMU_VA?.trim()
  const apiKey = process.env.IPAYMU_API_KEY?.trim()
  if (!va || !apiKey) return null
  const isProduction = (process.env.IPAYMU_IS_PRODUCTION ?? 'false').toLowerCase() === 'true'
  return {
    va,
    apiKey,
    isProduction,
    baseUrl: isProduction ? 'https://my.ipaymu.com' : 'https://sandbox.ipaymu.com',
  }
}

// Defined in ./pricing so the public pages can quote the same numbers without importing this
// module (and node:crypto with it). Re-exported because the payment routes read them here.
export { PREMIUM_PRICE_IDR, PREMIUM_DAYS }

/* ── request signing ───────────────────────────────────────────────────────── */

/** iPaymu's header timestamp: local time as YYYYMMDDHHmmss (matches the official Go/PHP SDKs). */
function timestamp(): string {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}

/**
 * Signature = HMAC-SHA256( "METHOD:VA:sha256(body):APIKEY", APIKEY ), hex.
 *
 * `bodyJson` must be the byte-for-byte string sent as the request body — the hash is over the
 * serialised text, not over the object, so re-serialising for the request would silently produce a
 * different hash and a 403 that looks like bad credentials.
 */
export function signRequest(cfg: IpaymuConfig, method: string, bodyJson: string): string {
  const bodyHash = crypto.createHash('sha256').update(bodyJson, 'utf8').digest('hex')
  const stringToSign = `${method.toUpperCase()}:${cfg.va}:${bodyHash}:${cfg.apiKey}`
  return crypto.createHmac('sha256', cfg.apiKey).update(stringToSign, 'utf8').digest('hex')
}

interface IpaymuEnvelope {
  Status?: number
  Success?: boolean
  Message?: unknown
  Data?: unknown
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_EXPIRY_HOURS = 24

function timeoutMs(): number {
  const value = Math.round(Number(process.env.IPAYMU_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS))
  return Number.isFinite(value) ? Math.min(30_000, Math.max(1_000, value)) : DEFAULT_TIMEOUT_MS
}

/** A bounded expiry that is safe to use for both the request and local checkout reuse. */
export function checkoutExpiryHours(): number {
  const value = Math.round(Number(process.env.IPAYMU_EXPIRY_HOURS ?? DEFAULT_EXPIRY_HOURS))
  return Number.isFinite(value) ? Math.min(168, Math.max(1, value)) : DEFAULT_EXPIRY_HOURS
}

/** Returns a non-sensitive classification suitable for logs and customer-safe failures. */
function responseFailure(status: number, message: unknown): Error {
  const detail = String(message ?? '').toLowerCase()
  if (detail.includes('unauthorized') || detail.includes('signature') || status === 401)
    return new Error(`ipaymu_auth_rejected: ${status}`)
  if (detail.includes('domain') || /\bip\b/.test(detail) || detail.includes('whitelist') || detail.includes('allowlist'))
    return new Error(`ipaymu_origin_rejected: ${status}`)
  return new Error(`ipaymu_gateway_rejected: ${status}`)
}

/** POST a signed JSON request and return the parsed envelope. Throws on transport/API failure. */
async function post(cfg: IpaymuConfig, path: string, body: Record<string, unknown>): Promise<IpaymuEnvelope> {
  // Route via VPS static IP (202.155.16.213) to satisfy iPaymu IP validation
  const vpsUrl =
    process.env.VPS_STORAGE_URL ||
    process.env.NEXT_PUBLIC_VPS_STORAGE_URL ||
    'https://api.geofold.sayba.id'
  if (vpsUrl) {
    const res = await fetch(`${vpsUrl}/api/payment/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, method: 'POST', body }),
    })
    const text = await res.text()
    let raw: IpaymuEnvelope | null = null
    try {
      raw = JSON.parse(text) as IpaymuEnvelope
    } catch {
      throw new Error(`ipaymu_bad_response: HTTP ${res.status} ${text.slice(0, 200)}`)
    }
    if (raw.Status !== 200) {
      const msg = typeof raw.Message === 'string' ? raw.Message : JSON.stringify(raw.Message ?? null)
      throw new Error(`ipaymu_error: ${raw.Status ?? res.status} ${msg}`)
    }
    return raw
  }

  const bodyJson = JSON.stringify(body)
  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        va: cfg.va,
        signature: signRequest(cfg, 'POST', bodyJson),
        timestamp: timestamp(),
      },
      body: bodyJson,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs()),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name.toLowerCase() : ''
    if (name.includes('timeout') || String(error).toLowerCase().includes('timeout')) throw new Error('ipaymu_timeout')
    throw new Error('ipaymu_network_error')
  }

  const text = await res.text()
  let raw: IpaymuEnvelope | null = null
  try {
    raw = JSON.parse(text) as IpaymuEnvelope
  } catch {
    // iPaymu can reply with HTML when an IP is unregistered or the host is wrong. Do not put that
    // response in logs: a proxy could include merchant identifiers in an otherwise harmless page.
    throw new Error(`ipaymu_bad_response: ${res.status}`)
  }

  // iPaymu reports failures in the body with HTTP 200 as often as with a 4xx, so the envelope's
  // own Status is the authority, not res.ok.
  if (raw.Status !== 200 || raw.Success === false) {
    throw responseFailure(raw.Status ?? res.status, raw.Message)
  }
  return raw
}

/* ── redirect payment ──────────────────────────────────────────────────────── */

export interface RedirectPayment {
  sessionId: string
  url: string
  raw: unknown
}

export interface RedirectPaymentInput {
  orderId: string
  amountIdr: number
  productName: string
  description: string
  returnUrl: string
  cancelUrl: string
  notifyUrl: string
  buyerName?: string
  buyerEmail?: string
  buyerPhone?: string
}

/**
 * Create a Redirect Payment. The response carries the hosted checkout URL that every enabled
 * channel (VA, QRIS, e-wallet, card, retail) is offered on; send the customer there.
 *
 * `feeDirection` defaults to MERCHANT so the buyer is charged exactly the advertised price and the
 * gateway fee comes out of settlement. Setting it to BUYER would make the customer pay more than
 * the figure on the pricing page, which the pricing page does not disclose.
 */
export async function createRedirectPayment(
  cfg: IpaymuConfig,
  input: RedirectPaymentInput,
): Promise<RedirectPayment> {
  const expiryHours = checkoutExpiryHours()
  const feeDirection = (process.env.IPAYMU_FEE_DIRECTION ?? 'MERCHANT').toUpperCase() === 'BUYER' ? 'BUYER' : 'MERCHANT'

  // Arrays are positional: index 0 of each describes the same line item. Prices go as strings,
  // matching the documented example.
  const raw = await post(cfg, '/api/v2/payment', {
    product: [input.productName],
    qty: ['1'],
    price: [String(Math.round(input.amountIdr))],
    description: [input.description],
    returnUrl: input.returnUrl,
    notifyUrl: input.notifyUrl,
    cancelUrl: input.cancelUrl,
    referenceId: input.orderId,
    ...(input.buyerName ? { buyerName: input.buyerName } : {}),
    ...(input.buyerEmail ? { buyerEmail: input.buyerEmail } : {}),
    ...(input.buyerPhone ? { buyerPhone: input.buyerPhone } : {}),
    expired: expiryHours,
    feeDirection,
  })

  const data = (raw.Data ?? {}) as Record<string, unknown>
  const sessionId = typeof data.SessionID === 'string' ? data.SessionID : ''
  const url = typeof data.Url === 'string' ? data.Url : ''
  if (!url) throw new Error('ipaymu_no_checkout_url')

  // The browser receives this URL directly. Only accept iPaymu's own HTTPS host instead of
  // turning an unexpected gateway response into an open redirect from an authenticated page.
  try {
    const checkout = new URL(url)
    const gateway = new URL(cfg.baseUrl)
    if (checkout.protocol !== 'https:' || checkout.hostname !== gateway.hostname)
      throw new Error('ipaymu_untrusted_checkout_url')
  } catch (error) {
    if (error instanceof Error && error.message === 'ipaymu_untrusted_checkout_url') throw error
    throw new Error('ipaymu_untrusted_checkout_url')
  }
  return { sessionId, url, raw }
}

/* ── transaction status (the authoritative check) ──────────────────────────── */

/** Transaction status codes, per docs/transaction/check-transaction. */
export interface IpaymuTransaction {
  transactionId: string
  sessionId: string
  referenceId: string
  /** Gross amount the buyer was charged, in whole rupiah. */
  amountIdr: number
  statusCode: number
  statusDesc: string
  raw: unknown
}

/**
 * Ask iPaymu directly what happened to a transaction. This call is authenticated with the API key,
 * so unlike the callback it cannot be spoofed — it is what actually decides whether premium is
 * granted. See the note on callback signatures in `verifyCallbackSignature`.
 */
export async function checkTransaction(cfg: IpaymuConfig, transactionId: string): Promise<IpaymuTransaction> {
  const raw = await post(cfg, '/api/v2/transaction', { transactionId: String(transactionId) })
  const d = (raw.Data ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (v == null ? '' : String(v))
  return {
    transactionId: str(d.TransactionId),
    sessionId: str(d.SessionId),
    referenceId: str(d.ReferenceId),
    amountIdr: Math.round(Number(d.Amount)),
    statusCode: Math.round(Number(d.Status)),
    statusDesc: str(d.StatusDesc),
    raw,
  }
}

/**
 * Find a transaction by the reference id we set at checkout, by walking the transaction history.
 *
 * `/api/v2/history` has no reference filter, so this pages through recent transactions (newest
 * first) and matches locally. That is the only way to recover a trx_id we were never told about —
 * which is the normal case whenever the callback did not arrive. It also gives the customer a
 * safe recovery route if iPaymu's callback was delayed or temporarily unavailable.
 *
 * Bounded by `maxPages` so a merchant with a long history cannot turn this into a slow loop.
 * Returns null when no transaction carries that reference.
 */
export async function findTransactionByReference(
  cfg: IpaymuConfig,
  referenceId: string,
  maxPages = 3,
): Promise<IpaymuTransaction | null> {
  const PER_PAGE = 20 // the documented maximum
  for (let page = 1; page <= maxPages; page++) {
    const raw = await post(cfg, '/api/v2/history', {
      orderBy: 'id',
      order: 'DESC',
      limit: String(PER_PAGE),
      page,
    })
    const data = (raw.Data ?? {}) as Record<string, unknown>
    const results = Array.isArray(data.Results) ? (data.Results as Record<string, unknown>[]) : []
    if (results.length === 0) return null

    const hit = results.find((r) => String(r.ReferenceId ?? '') === referenceId)
    if (hit) {
      // The history row carries no SessionId, so ask for the full record: the caller checks the
      // amount against it, and a partial row would mean checking against a field that isn't there.
      return checkTransaction(cfg, String(hit.TransactionId))
    }

    const totalPages = Math.round(Number(data.Total_Page))
    if (Number.isFinite(totalPages) && page >= totalPages) return null
  }
  return null
}

/**
 * Map an iPaymu transaction status code onto our `payments.Status` enum.
 *
 * 0 pending · 1 success · 2 cancelled · 3 refund · 4 error · 5 failed · 6 success-unsettled
 * 7 escrow · -2 expired.
 *
 * 6 counts as settled: the buyer has paid and the money is ours, only the payout to the bank
 * account has not run yet. 7 (escrow) does not — the funds are held, so it stays pending.
 */
export function mapIpaymuStatus(statusCode: number): 'pending' | 'settled' | 'expired' | 'denied' | 'refunded' {
  if (statusCode === 1 || statusCode === 6) return 'settled'
  if (statusCode === 0 || statusCode === 7) return 'pending'
  if (statusCode === -2) return 'expired'
  if (statusCode === 3) return 'refunded'
  if (statusCode === 2 || statusCode === 4 || statusCode === 5) return 'denied'
  return 'pending'
}

/* ── callback signature ────────────────────────────────────────────────────── */

/**
 * Normalise a callback payload the way the documented validation expects, before hashing:
 * a handful of fields are integers, `is_escrow` is a boolean, `additional_info` is an array that
 * must be present even when the form-encoded payload omits it, and everything else is a string.
 */
function normalizeCallback(raw: Record<string, unknown>): Record<string, unknown> {
  const INTS = new Set(['trx_id', 'status_code', 'transaction_status_code', 'paid_off'])
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(raw)) {
    if (key === 'signature') continue // never part of its own hash
    if (key === 'is_escrow') out[key] = val === 'true' || val === '1' || val === 1 || val === true
    else if (INTS.has(key)) out[key] = parseInt(String(val), 10)
    else if (key === 'additional_info') out[key] = val === '[]' || val == null ? [] : val
    else out[key] = String(val)
  }
  if (!Object.prototype.hasOwnProperty.call(out, 'additional_info')) out.additional_info = []
  return out
}

/** Re-serialise with keys in a given order, escaping "/" the way PHP's json_encode does. */
function serialise(obj: Record<string, unknown>, keys: string[], escapeUnicode: boolean): string {
  const ordered: Record<string, unknown> = {}
  for (const k of keys) ordered[k] = obj[k]
  let json = JSON.stringify(ordered).replace(/\//g, '\\/')
  // PHP's json_encode also escapes non-ASCII as \uXXXX unless JSON_UNESCAPED_UNICODE is set. A
  // buyer name with an accent is enough to make this matter. Walked by code unit rather than
  // matched by a regex range, so this source file carries no literal non-ASCII of its own.
  if (escapeUnicode) {
    let escaped = ''
    for (let i = 0; i < json.length; i++) {
      const code = json.charCodeAt(i)
      escaped += code > 0x7f ? '\\u' + code.toString(16).padStart(4, '0') : json[i]
    }
    json = escaped
  }
  return json
}

/**
 * Verify a callback's `X-Signature` header.
 *
 * ⚠️ Read this before trusting it. iPaymu signs callbacks with the **merchant VA number** as the
 * HMAC secret (docs/callback, "Secret Key for Signature Validation"). The VA number is not a
 * secret: it is printed on the hosted checkout page, and it is echoed inside the callback body
 * itself as `merchant`. Anyone who has ever paid this merchant can therefore forge a callback that
 * passes this check. It proves the payload was not mangled in transit; it does NOT prove the
 * payment happened. Settlement must be confirmed against `checkTransaction`, which is
 * authenticated with the API key. The callback route does exactly that.
 *
 * The documented recipe is PHP's `ksort` + `json_encode`, and the JS sample in the same document
 * sorts with `localeCompare`, which disagrees with PHP's byte ordering on keys like `reference_id`
 * vs `referenceId`. Rather than guess, every plausible serialisation is tried and any match
 * accepted — the check is a tamper signal, not the authorisation, so breadth costs nothing.
 */
export function verifyCallbackSignature(
  cfg: IpaymuConfig,
  payload: Record<string, unknown>,
  received: string,
): boolean {
  if (!received) return false
  const data = normalizeCallback(payload)
  const keys = Object.keys(data)
  const byteSorted = [...keys].sort() // PHP ksort: byte order
  const localeSorted = [...keys].sort((a, b) => a.localeCompare(b)) // the doc's JS sample

  const candidates = [
    serialise(data, byteSorted, false),
    serialise(data, byteSorted, true),
    serialise(data, localeSorted, false),
    serialise(data, localeSorted, true),
  ]

  const want = Buffer.from(received.trim().toLowerCase())
  return candidates.some((json) => {
    const got = Buffer.from(crypto.createHmac('sha256', cfg.va).update(json, 'utf8').digest('hex'))
    return got.length === want.length && crypto.timingSafeEqual(got, want)
  })
}
