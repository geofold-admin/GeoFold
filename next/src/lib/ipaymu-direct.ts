import crypto from 'node:crypto'

/**
 * iPaymu Direct Payment — the channel where iPaymu hands back a payment NUMBER or a QR image
 * instead of a hosted checkout URL, so the buyer never leaves our own page.
 *
 * WHY THIS EXISTS ALONGSIDE createRedirectPayment. Redirect sends the buyer to
 * my.ipaymu.com/payment/…, which is a different site with a different header, a different
 * language and a "back to merchant" link that people miss. For a Rp 35.000 one-off purchase that
 * is a lot of trust to ask for at the last step, and every extra screen costs conversions.
 * Direct Payment keeps the whole transaction inside the pricing page: we show the QR, we show the
 * VA number with a copy button, we poll for settlement, and the buyer never navigates away.
 *
 * THE SAME SIGNATURE, THE SAME PROXY, THE SAME TRUST MODEL. Everything here goes through the
 * same signed-request helper and the same static-IP relay as the redirect flow (see ipaymu.ts),
 * and settlement is still decided only by `checkTransaction` against the authenticated API —
 * never by a callback body or by the browser.
 *
 * CHANNEL CHOICE. QRIS is the default because it is one scan for any Indonesian banking or
 * e-wallet app and has the shortest path to done. Virtual accounts are offered as the fallback
 * for buyers who prefer to pay from their own bank's app, and because QRIS codes expire in
 * minutes while a VA number is good for hours.
 */

export type DirectChannel =
  | { method: 'qris'; channel: 'mpm' }
  | { method: 'va'; channel: 'bca' | 'bni' | 'bri' | 'mandiri' | 'permata' | 'cimb' | 'bsi' }

/** What the browser is allowed to see. No session ids, no merchant identifiers. */
export interface DirectPaymentInstructions {
  orderId: string
  method: 'qris' | 'va'
  channel: string
  /** Human label for the channel, e.g. "QRIS" or "BCA Virtual Account". */
  label: string
  /** The VA number to pay into, or the raw QR payload when iPaymu returns one. */
  paymentNo: string | null
  /** A URL to a QR image, when the channel is QRIS. */
  qrUrl: string | null
  /** iPaymu's own total, in whole rupiah — the figure the buyer will actually be charged. */
  totalIdr: number
  /** Fee added on top, if the merchant account is configured for BUYER fee direction. */
  feeIdr: number
  /** ISO-ish local timestamp string as iPaymu reports it, or null. */
  expiresAt: string | null
  /** A page on iPaymu with the channel's payment steps, when the channel provides one. */
  instructionsUrl: string | null
}

/**
 * Channels offered in the UI, in the order they are shown.
 *
 * The VA list is deliberately short. iPaymu supports a dozen banks; showing all of them turns
 * the checkout into a menu and pushes the QRIS option — which most buyers want — below the fold.
 * These six cover the overwhelming majority of Indonesian retail banking, and anyone whose bank
 * is missing can still pay by QRIS from that bank's app.
 */
export const DIRECT_CHANNELS: ReadonlyArray<{ method: 'qris' | 'va'; channel: string; label: string }> = [
  { method: 'qris', channel: 'mpm', label: 'QRIS' },
  { method: 'va', channel: 'bca', label: 'BCA' },
  { method: 'va', channel: 'mandiri', label: 'Mandiri' },
  { method: 'va', channel: 'bni', label: 'BNI' },
  { method: 'va', channel: 'bri', label: 'BRI' },
  { method: 'va', channel: 'permata', label: 'Permata' },
  { method: 'va', channel: 'cimb', label: 'CIMB Niaga' },
  { method: 'va', channel: 'bsi', label: 'BSI' },
]

/** iPaymu's own channel names, for the instruction label. Falls back to the code itself. */
const CHANNEL_LABELS: Record<string, string> = {
  mpm: 'QRIS',
  bca: 'BCA Virtual Account',
  mandiri: 'Mandiri Virtual Account',
  bni: 'BNI Virtual Account',
  bri: 'BRI Virtual Account',
  permata: 'Permata Virtual Account',
  cimb: 'CIMB Niaga Virtual Account',
  bsi: 'BSI Virtual Account',
  bag: 'BAG Virtual Account',
  bpd_bali: 'BPD Bali Virtual Account',
  bmi: 'Bank Muamalat Virtual Account',
  danamon: 'Danamon Virtual Account',
  btn: 'BTN Virtual Account',
}

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel.toUpperCase()
}

export function isDirectChannel(value: unknown): value is { method: 'qris' | 'va'; channel: string } {
  if (typeof value !== 'object' || value === null) return false
  const v = value as { method?: unknown; channel?: unknown }
  if (v.method !== 'qris' && v.method !== 'va') return false
  if (typeof v.channel !== 'string' || v.channel.length === 0 || v.channel.length > 24) return false
  return DIRECT_CHANNELS.some((c) => c.method === v.method && c.channel === v.channel)
}

export interface DirectPaymentInput {
  orderId: string
  amountIdr: number
  productName: string
  comments: string
  notifyUrl: string
  successUrl: string
  buyerName: string
  buyerEmail: string
  buyerPhone: string
  method: 'qris' | 'va'
  channel: string
}

/**
 * The buyer fields iPaymu insists on, with safe fallbacks.
 *
 * `name`, `phone` and `email` are all REQUIRED by the Direct Payment endpoint, but a GeoFold
 * account can exist with nothing but an email — Supabase sign-up does not ask for a name or a
 * phone number, and the profile step is optional. Sending an empty string is rejected by the
 * gateway, so a missing name falls back to the trading name and a missing phone to the
 * merchant's own support number. Neither is buyer PII invented out of nowhere; both are
 * obviously placeholders that will not be mistaken for real data.
 */
export function buyerFields(opts: {
  email?: string | null
  name?: string | null
  phone?: string | null
  fallbackName: string
  fallbackPhone: string
}): { name: string; email: string; phone: string } {
  const clean = (v: string | null | undefined) => (typeof v === 'string' ? v.trim() : '')
  const phoneDigits = clean(opts.phone).replace(/[^\d+]/g, '')

  return {
    name: clean(opts.name) || opts.fallbackName,
    email: clean(opts.email) || 'noreply@geofold.sayba.id',
    /* iPaymu wants digits; a leading + is accepted by their examples, so it is kept. */
    phone: phoneDigits.length >= 8 ? phoneDigits : opts.fallbackPhone,
  }
}

interface DirectEnvelope {
  Status?: number
  Success?: boolean
  Message?: unknown
  Data?: unknown
}

/**
 * Read iPaymu's Direct Payment response into the shape the modal renders.
 *
 * iPaymu is inconsistent about which field carries what: QRIS returns the image under `Url` and
 * sometimes a raw payload under `QrString`, while VA returns the number under `PaymentNo`. The
 * amount comes back as `Total` (what the buyer pays) and `Fee` (what was added on top, which is
 * 0 under the default MERCHANT fee direction). Every field is read defensively — a missing one
 * becomes null rather than throwing, because a QR with no image is still payable by the string.
 */
export function readDirectResponse(
  raw: DirectEnvelope,
  input: { orderId: string; method: 'qris' | 'va'; channel: string },
): DirectPaymentInstructions {
  const data = (raw.Data ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (v == null ? '' : String(v))
  const num = (v: unknown) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? n : 0
  }

  const qrUrl = str(data.Url) || str(data.QrUrl) || null
  const paymentNo = str(data.PaymentNo) || str(data.QrString) || null

  return {
    orderId: str(data.ReferenceId) || input.orderId,
    method: input.method,
    channel: str(data.Channel) || input.channel,
    label: str(data.PaymentName) || channelLabel(str(data.Channel) || input.channel),
    paymentNo,
    qrUrl,
    totalIdr: num(data.Total),
    feeIdr: num(data.Fee),
    expiresAt: str(data.Expired) || null,
    instructionsUrl: null,
  }
}

/**
 * Where the QRIS image is allowed to come from.
 *
 * The URL is handed to the browser as an <img src>, so it must be an https URL on iPaymu's own
 * host — anything else and a malformed gateway response becomes an arbitrary image fetch from an
 * authenticated page. Same guard, same reasoning, as the checkout-URL check in ipaymu.ts.
 *
 * NOTE: iPaymu returns the QR as a URL to their storage rather than an inline data URI, so this
 * also has to be added to the CSP `img-src` in src/proxy.ts. Both ends are required; one without
 * the other produces a broken image with no error anywhere.
 */
const ALLOWED_QR_HOSTS = new Set([
  'my.ipaymu.com',
  'sandbox.ipaymu.com',
  'payment.ipaymu.com',
  'storage.googleapis.com',
])

export function isTrustedQrUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return ALLOWED_QR_HOSTS.has(parsed.hostname) || parsed.hostname.endsWith('.ipaymu.com')
  } catch {
    return false
  }
}

/** A per-order idempotency hint for the client, so a retry cannot start two live invoices. */
export function directOrderFingerprint(orderId: string): string {
  return crypto.createHash('sha256').update(orderId).digest('hex').slice(0, 16)
}
