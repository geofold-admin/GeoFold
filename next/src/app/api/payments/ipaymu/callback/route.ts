import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { ipaymuConfig, checkTransaction, verifyCallbackSignature } from '@/lib/ipaymu'
import { settleIpaymuOrder } from '@/lib/ipaymu-settle'

/**
 * iPaymu callback (notifyUrl). Set this URL on the merchant account:
 *   https://geofold.sayba.id/api/payments/ipaymu/callback
 *
 * ⚠️ The callback body is NOT treated as proof of payment. iPaymu signs callbacks with the
 * merchant VA number, which is not a secret — it is shown on the hosted checkout page and echoed
 * inside the callback body as `merchant`, so anyone who has ever paid this merchant could forge
 * one. The signature is checked as a tamper signal only; what decides whether premium is granted
 * is a server-to-server `POST /api/v2/transaction` call authenticated with the API key, and the
 * ownership and amount checks in `settleIpaymuOrder`.
 *
 * All this route takes from the body is which order and which transaction to go and ask about.
 */

/** iPaymu posts either JSON or form-urlencoded, depending on a dashboard setting. Accept both. */
async function readPayload(req: Request): Promise<Record<string, unknown> | null> {
  const type = req.headers.get('content-type') ?? ''
  try {
    if (type.includes('application/json')) {
      const parsed: unknown = await req.json()
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    }
    const form = await req.formData()
    const out: Record<string, unknown> = {}
    for (const [k, v] of form.entries()) out[k] = typeof v === 'string' ? v : ''
    return out
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const cfg = ipaymuConfig()
  if (!cfg) return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 })

  const payload = await readPayload(req)
  if (!payload) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })

  const str = (v: unknown) => (v == null ? '' : String(v))
  const orderId = str(payload.reference_id) || str(payload.referenceId)
  const trxId = str(payload.trx_id)
  if (!orderId || !trxId) return NextResponse.json({ error: 'missing_reference' }, { status: 400 })

  // Advisory only — see the header comment. A mismatch is worth knowing about (it means either a
  // forgery attempt or that iPaymu changed its serialisation), but it gates nothing, because
  // passing it would not have proved anything either.
  const signatureOk = verifyCallbackSignature(cfg, payload, req.headers.get('x-signature') ?? '')
  if (!signatureOk) console.warn('[ipaymu] callback signature did not match', { orderId, trxId })

  // Cheap local check before any outbound call. Anyone can POST here, so an unknown reference must
  // not be able to make us call iPaymu — that would turn this endpoint into an amplifier, and it
  // would burn the gateway's rate limit on traffic we already know is junk.
  const [known] = await sql<{ Status: string }[]>`
    SELECT "Status" FROM payments
    WHERE "ProviderOrderId" = ${orderId} AND "Provider" = 'ipaymu'`
  if (!known) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  // Already granted. 200 stops the retries; nothing left to do.
  if (known.Status === 'settled') return new NextResponse(null, { status: 200 })

  let txn
  try {
    txn = await checkTransaction(cfg, trxId)
  } catch (e) {
    // Transient as far as we can tell — answer non-2xx so iPaymu retries, rather than swallowing
    // a real payment.
    console.error('[ipaymu] check-transaction failed', { orderId, trxId, error: String(e) })
    return NextResponse.json({ error: 'verification_failed' }, { status: 502 })
  }

  const result = await settleIpaymuOrder(orderId, txn, { callback: payload, signatureOk })
  if (!result.ok) {
    console.error('[ipaymu] callback rejected', { orderId, trxId, reason: result.reason })
    return NextResponse.json({ error: result.reason }, { status: result.reason === 'order_not_found' ? 404 : 400 })
  }

  // 200 tells iPaymu the notification landed and stops the retry schedule.
  return new NextResponse(null, { status: 200 })
}
