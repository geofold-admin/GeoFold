import crypto from 'node:crypto'
import { PREMIUM_PRICE_IDR, PREMIUM_DAYS } from './pricing'

/**
 * Midtrans Core API (QRIS) helpers. All secrets stay server-side; the client only ever receives an
 * order id and a QR image URL. Configure via env:
 *   MIDTRANS_SERVER_KEY     — required; the charge + webhook are disabled (503) without it
 *   MIDTRANS_IS_PRODUCTION  — 'true' hits api.midtrans.com, otherwise the sandbox
 *   PREMIUM_PRICE_IDR       — price of one premium period in whole rupiah (default 49000)
 *   PREMIUM_DAYS            — days of premium granted per payment (default 30)
 * ⚠️ PREMIUM_PRICE_IDR / PREMIUM_DAYS default to Rp 49.000 for 30 days to match the pricing page —
 * confirm both before launch; they define what a customer is charged.
 */
export interface MidtransConfig {
  serverKey: string
  snapUrl: string
}

export function midtransConfig(): MidtransConfig | null {
  const serverKey = process.env.MIDTRANS_SERVER_KEY
  if (!serverKey || !serverKey.trim()) return null
  const isProd = (process.env.MIDTRANS_IS_PRODUCTION ?? 'false').toLowerCase() === 'true'
  // Snap (hosted checkout, all enabled payment methods) lives on the app.* host, not api.*.
  return { serverKey, snapUrl: isProd ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com' }
}

// Defined in ./pricing so the public pages can quote the same numbers without importing this
// module (and node:crypto with it). Re-exported here because the payment routes read them here.
export { PREMIUM_PRICE_IDR, PREMIUM_DAYS }

/**
 * Verify a notification's signature: sha512(order_id + status_code + gross_amount + server_key),
 * compared over the exact strings Midtrans sent. Timing-safe.
 */
export function verifyMidtransSignature(
  cfg: MidtransConfig,
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signatureKey: string,
): boolean {
  const expected = crypto
    .createHash('sha512')
    .update(orderId + statusCode + grossAmount + cfg.serverKey)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signatureKey ?? '')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export interface SnapTransaction {
  token: string
  redirectUrl: string
  raw: unknown
}

/**
 * Create a Snap transaction — Midtrans's hosted checkout that presents every payment method
 * enabled in the dashboard (cards, bank transfer/VA, GoPay, ShopeePay, QRIS, …). The client
 * redirects the user to `redirectUrl`; settlement still arrives on the same webhook.
 * gross_amount must be a whole rupiah integer (IDR has no minor unit).
 */
export async function createSnapTransaction(
  cfg: MidtransConfig,
  orderId: string,
  amountIdr: number,
  finishUrl?: string,
): Promise<SnapTransaction> {
  const res = await fetch(`${cfg.snapUrl}/snap/v1/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Basic auth: server key as the username, empty password.
      Authorization: 'Basic ' + Buffer.from(cfg.serverKey + ':').toString('base64'),
    },
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: amountIdr },
      item_details: [{ id: 'premium', price: amountIdr, quantity: 1, name: `GeoFold Premium ${PREMIUM_DAYS} hari` }],
      credit_card: { secure: true },
      ...(finishUrl ? { callbacks: { finish: finishUrl } } : {}),
    }),
  })

  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg =
      raw && typeof raw === 'object' && 'error_messages' in raw
        ? String((raw as Record<string, unknown>).error_messages)
        : `HTTP ${res.status}`
    throw new Error(`midtrans_snap_failed: ${msg}`)
  }

  const o = (raw ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return { token: str(o.token), redirectUrl: str(o.redirect_url), raw }
}

/** Map a Midtrans transaction_status/fraud_status onto our payments.Status enum. */
export function mapMidtransStatus(transactionStatus: string, fraudStatus: string): string {
  // QRIS settles as 'settlement'. 'capture' (cards) only counts when fraud review accepted it —
  // 'challenge' is still under review, so it stays pending.
  if (transactionStatus === 'settlement' || (transactionStatus === 'capture' && fraudStatus === 'accept')) return 'settled'
  if (transactionStatus === 'pending') return 'pending'
  if (transactionStatus === 'expire') return 'expired'
  if (transactionStatus === 'deny' || transactionStatus === 'cancel') return 'denied'
  if (transactionStatus === 'refund' || transactionStatus === 'partial_refund') return 'refunded'
  return 'pending'
}
