import { NextResponse } from 'next/server'
import { getUserId, unauthorized } from '@/lib/auth'
import { ipaymuConfig, createRedirectPayment, checkTransaction } from '@/lib/ipaymu'
import { PREMIUM_PRICE_IDR, PREMIUM_DAYS, PREMIUM_STORAGE_LABEL } from '@/lib/pricing'

/**
 * Sandbox-only smoke test for the iPaymu integration.
 *
 * Answers the one question that cannot be answered by reading code: do the configured credentials
 * and the signature this app generates actually authenticate against iPaymu? It creates a real
 * sandbox Redirect Payment and hands back the checkout URL, so the whole flow can be walked
 * through by hand — pay on the hosted page, then watch the callback and `/subscription`.
 *
 *   GET /api/payments/ipaymu/diagnose            -> create a test payment, return the checkout URL
 *   GET /api/payments/ipaymu/diagnose?trx=12345  -> look up a transaction instead
 *
 * ⚠️ Two guards, because this endpoint makes outbound calls on the merchant's behalf and a
 * deployed sandbox build would otherwise expose it to the whole internet:
 *   1. Sign-in required — so it cannot be hammered anonymously.
 *   2. Refuses to run when IPAYMU_IS_PRODUCTION is true, answering 404 rather than 403. A
 *      diagnostic that creates payments has no business being reachable on a live merchant
 *      account, and an endpoint that admits it exists is one someone will poke at.
 * Nothing it returns includes the API key; the VA is masked.
 *
 * It writes no database row, so it is deliberately NOT a substitute for testing the real checkout:
 * it proves the credentials and the signature, not the settlement path.
 */
export async function GET(req: Request) {
  if (!(await getUserId(req))) return unauthorized()

  const cfg = ipaymuConfig()

  if (!cfg)
    return NextResponse.json(
      {
        ok: false,
        error: 'payments_not_configured',
        missing: [
          ...(process.env.IPAYMU_VA?.trim() ? [] : ['IPAYMU_VA']),
          ...(process.env.IPAYMU_API_KEY?.trim() ? [] : ['IPAYMU_API_KEY']),
        ],
        hint: 'Set both in next/.env.local (local) or the Vercel environment (deployed), then restart.',
      },
      { status: 503 },
    )

  if (cfg.isProduction) return new NextResponse(null, { status: 404 })

  const mask = (s: string) => (s.length <= 4 ? '****' : '*'.repeat(s.length - 4) + s.slice(-4))
  const base = { baseUrl: cfg.baseUrl, va: mask(cfg.va), mode: 'sandbox' as const }

  const trx = new URL(req.url).searchParams.get('trx')
  const started = Date.now()

  try {
    if (trx) {
      const txn = await checkTransaction(cfg, trx)
      return NextResponse.json({
        ok: true,
        ...base,
        ms: Date.now() - started,
        transaction: {
          transactionId: txn.transactionId,
          referenceId: txn.referenceId,
          sessionId: txn.sessionId,
          amountIdr: txn.amountIdr,
          statusCode: txn.statusCode,
          statusDesc: txn.statusDesc,
        },
      })
    }

    const orderId = `GF-DIAG-${Date.now().toString(36).toUpperCase()}`
    const origin = new URL(req.url).origin
    const payment = await createRedirectPayment(cfg, {
      orderId,
      amountIdr: PREMIUM_PRICE_IDR,
      productName: `GeoFold Premium ${PREMIUM_DAYS} hari`,
      description: `Semua fitur, penyimpanan ${PREMIUM_STORAGE_LABEL}, berlaku ${PREMIUM_DAYS} hari`,
      returnUrl: `${origin}/subscription?order=${orderId}`,
      cancelUrl: `${origin}/subscription?order=${orderId}&cancelled=1`,
      notifyUrl: `${origin}/api/payments/ipaymu/callback`,
    })

    return NextResponse.json({
      ok: true,
      ...base,
      ms: Date.now() - started,
      signature: 'accepted',
      note: 'Credentials and signature are good. No payments row was written — this is not the real checkout.',
      orderId,
      amountIdr: PREMIUM_PRICE_IDR,
      sessionId: payment.sessionId,
      checkoutUrl: payment.url,
    })
  } catch (e) {
    const message = String(e)
    // The three failures worth telling apart, because the fix differs completely for each.
    const diagnosis = message.includes('ipaymu_error: 401')
      ? 'Credentials rejected. Check for a sandbox key paired with the production host (or the reverse) — the two are separate accounts.'
      : message.includes('ipaymu_bad_response')
        ? 'iPaymu answered with something other than JSON, which usually means an unregistered IP or a wrong host.'
        : 'See the message. If it mentions signature, the body was re-serialised somewhere between signing and sending.'
    return NextResponse.json({ ok: false, ...base, ms: Date.now() - started, message, diagnosis }, { status: 502 })
  }
}
