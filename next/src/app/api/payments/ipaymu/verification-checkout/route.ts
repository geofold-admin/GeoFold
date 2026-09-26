import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { BUSINESS } from '@/lib/business'
import { checkoutFailure, createRedirectPayment, ipaymuConfig } from '@/lib/ipaymu'
import { PREMIUM_DAYS, PREMIUM_PRICE_IDR, PREMIUM_STORAGE_LABEL } from '@/lib/pricing'

/**
 * Public, sandbox-only checkout for an iPaymu reviewer.
 *
 * The regular checkout correctly requires a GeoFold account, but iPaymu verifies an integration
 * by opening the public website and following it as far as their hosted payment page. This route
 * proves that page works without creating a payment row or granting anyone Premium.
 */

const WINDOW_MS = 60 * 60 * 1_000
const MAX_ATTEMPTS_PER_WINDOW = 3
type Attempt = { startedAt: number; count: number }
const attempts = new Map<string, Attempt>()

function clientKey(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function consumeAttempt(key: string): number | null {
  const now = Date.now()
  const old = attempts.get(key)
  if (!old || now - old.startedAt >= WINDOW_MS) {
    attempts.set(key, { startedAt: now, count: 1 })
    return null
  }
  if (old.count >= MAX_ATTEMPTS_PER_WINDOW) return Math.ceil((WINDOW_MS - (now - old.startedAt)) / 60_000)
  old.count += 1
  return null
}

export async function POST(req: Request) {
  const cfg = ipaymuConfig()

  // A public route capable of creating payment sessions exists solely for sandbox verification.
  // It must not remain available after the merchant switches to production.
  if (!cfg || cfg.isProduction) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const retryAfterMinutes = consumeAttempt(clientKey(req))
  if (retryAfterMinutes != null) {
    return NextResponse.json(
      { error: 'rate_limited', message: `Coba lagi dalam ${retryAfterMinutes} menit.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterMinutes * 60) } },
    )
  }

  const orderId = `GF-VERIFY-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase()
  const resultUrl = `${BUSINESS.site}/ipaymu-test?order=${encodeURIComponent(orderId)}`

  try {
    const payment = await createRedirectPayment(cfg, {
      orderId,
      amountIdr: PREMIUM_PRICE_IDR,
      productName: `GeoFold Premium ${PREMIUM_DAYS} hari (Sandbox verification)`,
      description: `Uji integrasi sandbox iPaymu. Tidak membuat akun atau Premium. ${PREMIUM_STORAGE_LABEL}, ${PREMIUM_DAYS} hari.`,
      returnUrl: resultUrl,
      cancelUrl: `${resultUrl}&cancelled=1`,
      notifyUrl: `${BUSINESS.site}/api/payments/ipaymu/verification-callback`,
    })
    return NextResponse.json({ redirectUrl: payment.url })
  } catch (error) {
    // iPaymu's error can reveal merchant/IP configuration. Keep that out of public page content.
    console.error('[ipaymu verification checkout] failed', { orderId, error: String(error) })
    const failure = checkoutFailure(cfg, error)
    return NextResponse.json(
      { error: failure.code, message: failure.message },
      { status: 502 },
    )
  }
}
