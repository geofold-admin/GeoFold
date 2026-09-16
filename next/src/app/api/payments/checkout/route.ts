import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getIdentity, unauthorized } from '@/lib/auth'
import { ensureProfile } from '@/lib/profile'
import { midtransConfig, createSnapTransaction } from '@/lib/midtrans'
import { checkoutFailure, ipaymuConfig, createRedirectPayment } from '@/lib/ipaymu'
import { PREMIUM_PRICE_IDR, PREMIUM_DAYS, PREMIUM_STORAGE_LABEL } from '@/lib/pricing'

/**
 * Start a hosted checkout and return the URL to send the customer to. Premium is never granted
 * here — only the provider's verified callback grants it, after real settlement.
 *
 * Two gateways are wired up. `PAYMENT_PROVIDER` picks one explicitly ('ipaymu' | 'midtrans');
 * with it unset, iPaymu is preferred when configured and Midtrans is the fallback, so a deploy
 * that only has Midtrans credentials keeps working untouched.
 */
type Provider = 'ipaymu' | 'midtrans'

function chooseProvider(): Provider | null {
  const wanted = process.env.PAYMENT_PROVIDER?.trim().toLowerCase()
  if (wanted === 'ipaymu') return ipaymuConfig() ? 'ipaymu' : null
  if (wanted === 'midtrans') return midtransConfig() ? 'midtrans' : null
  if (ipaymuConfig()) return 'ipaymu'
  if (midtransConfig()) return 'midtrans'
  return null
}

export async function POST(req: Request) {
  const me = await getIdentity(req)
  if (!me) return unauthorized()

  const provider = chooseProvider()
  if (!provider) return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 })

  await ensureProfile(me.id)

  const orderId = `GF-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase()
  const amount = PREMIUM_PRICE_IDR
  const days = PREMIUM_DAYS

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const origin = `${proto}://${host}`

  // Reserve the payment row before calling the gateway so the callback always has a row to settle.
  const method = provider === 'ipaymu' ? 'redirect' : 'snap'
  await sql`
    INSERT INTO payments ("Id","UserId","Provider","ProviderOrderId","Method","AmountIdr","GrantsDays","Status")
    VALUES (gen_random_uuid(), ${me.id}, ${provider}, ${orderId}, ${method}, ${amount}, ${days}, 'pending')`

  let redirectUrl: string
  let raw: unknown
  try {
    if (provider === 'ipaymu') {
      const payment = await createRedirectPayment(ipaymuConfig()!, {
        orderId,
        amountIdr: amount,
        productName: `GeoFold Premium ${days} hari`,
        description: `Semua fitur, penyimpanan ${PREMIUM_STORAGE_LABEL}, berlaku ${days} hari`,
        returnUrl: `${origin}/subscription?order=${orderId}`,
        cancelUrl: `${origin}/subscription?order=${orderId}&cancelled=1`,
        notifyUrl: `${origin}/api/payments/ipaymu/callback`,
        buyerEmail: me.email ?? undefined,
      })
      redirectUrl = payment.url
      raw = payment.raw
    } else {
      const snap = await createSnapTransaction(midtransConfig()!, orderId, amount, `${origin}/subscription`)
      redirectUrl = snap.redirectUrl
      raw = snap.raw
    }
  } catch (e) {
    console.error('[checkout] gateway call failed', { provider, orderId, error: String(e) })
    await sql`
      UPDATE payments SET "Status" = 'denied', "RawPayload" = ${sql.json({ error: String(e) })}
      WHERE "ProviderOrderId" = ${orderId}`
    if (provider === 'ipaymu') {
      const failure = checkoutFailure(ipaymuConfig()!, e)
      return NextResponse.json({ error: failure.code, message: failure.message }, { status: 502 })
    }
    return NextResponse.json({ error: 'charge_failed', message: 'Gagal memulai pembayaran. Coba lagi.' }, { status: 502 })
  }

  // The stored payload is what the iPaymu callback reads the session id back out of, so it has to
  // be the gateway's own response, saved verbatim.
  await sql`
    UPDATE payments SET "QrUrl" = ${redirectUrl},
      "RawPayload" = ${sql.json(raw as Parameters<typeof sql.json>[0])}
    WHERE "ProviderOrderId" = ${orderId}`

  return NextResponse.json({ provider, orderId, redirectUrl, amountIdr: amount, grantsDays: days })
}
