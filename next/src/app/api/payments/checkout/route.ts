import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getIdentity, unauthorized } from '@/lib/auth'
import { ensureProfile } from '@/lib/profile'
import { BUSINESS } from '@/lib/business'
import { midtransConfig, createSnapTransaction } from '@/lib/midtrans'
import { checkoutAvailability, checkoutExpiryHours, checkoutFailure, ipaymuConfig, createRedirectPayment } from '@/lib/ipaymu'
import { PREMIUM_PRICE_IDR, PREMIUM_DAYS, PREMIUM_STORAGE_LABEL } from '@/lib/pricing'

export const runtime = 'nodejs'

/**
 * Start a hosted checkout and return the URL to send the customer to. Premium is never granted
 * here — only the provider's verified callback grants it, after real settlement.
 *
 * `PAYMENT_PROVIDER` must pick the gateway explicitly ('ipaymu' | 'midtrans'). A live checkout
 * must never silently fall back to a different merchant account when one set of credentials is
 * missing or a deployment variable was scoped incorrectly.
 */
type Provider = 'ipaymu' | 'midtrans'

interface ExistingCheckout {
  ProviderOrderId: string
  QrUrl: string | null
  IsFreshReservation: boolean
}

type CheckoutReservation =
  | { kind: 'existing'; orderId: string; redirectUrl: string }
  | { kind: 'in_progress' }
  | { kind: 'new'; orderId: string }

// iPaymu requests are capped at 30 seconds in lib/ipaymu. Leave a generous window beyond that
// before recovering a row which was inserted but never received a hosted-checkout URL (for
// example, after a function crash). This prevents one broken request from blocking a user for the
// entire 24-hour payment expiry, while never issuing two iPaymu requests at the same time.
const IPAYMU_RESERVATION_GRACE_SECONDS = 90

function chooseProvider(): Provider | null {
  const wanted = process.env.PAYMENT_PROVIDER?.trim().toLowerCase()
  if (wanted === 'ipaymu') return ipaymuConfig() ? 'ipaymu' : null
  if (wanted === 'midtrans') return midtransConfig() ? 'midtrans' : null
  return null
}

export async function POST(req: Request) {
  const me = await getIdentity(req)
  if (!me) return unauthorized()

  const provider = chooseProvider()
  if (!provider)
    return NextResponse.json(
      { error: 'payments_not_configured', message: 'Pembayaran belum dikonfigurasi.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )

  const ipaymu = provider === 'ipaymu' ? ipaymuConfig()! : null
  if (ipaymu) {
    const availability = checkoutAvailability(ipaymu)
    if (!availability.available)
      return NextResponse.json(
        { error: availability.code, message: availability.message },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
  }

  await ensureProfile(me.id)

  const amount = PREMIUM_PRICE_IDR
  const days = PREMIUM_DAYS

  // iPaymu validates every return/notify URL against the merchant's approved domain. More
  // importantly, request host headers are not a trustworthy source for a URL that a payment
  // provider later calls, so use the canonical public origin only.
  const origin = BUSINESS.site

  // A double-click or retried request must reuse its existing hosted checkout rather than create
  // several payable invoices. The advisory lock makes that check/insert atomic per user+gateway
  // without holding a database transaction open while the remote gateway is called.
  const method = provider === 'ipaymu' ? 'redirect' : 'snap'
  const reuseWindowHours = provider === 'ipaymu' ? checkoutExpiryHours() : 24
  const reservation = await sql.begin(async (tx): Promise<CheckoutReservation> => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${provider}:${me.id}`}))`

    const [existing] = await tx<ExistingCheckout[]>`
      SELECT "ProviderOrderId", "QrUrl",
             "CreatedAtUtc" > now() - (${IPAYMU_RESERVATION_GRACE_SECONDS} * interval '1 second') AS "IsFreshReservation"
      FROM payments
      WHERE "UserId" = ${me.id} AND "Provider" = ${provider} AND "Status" = 'pending'
        AND "CreatedAtUtc" > now() - (${reuseWindowHours} * interval '1 hour')
      ORDER BY "CreatedAtUtc" DESC
      LIMIT 1 FOR UPDATE`
    if (existing?.QrUrl)
      return { kind: 'existing', orderId: existing.ProviderOrderId, redirectUrl: existing.QrUrl }

    if (existing) {
      // A remote Midtrans request has no bounded timeout in its legacy client, so leave its
      // reservation untouched. iPaymu calls are bounded above, allowing this narrow recovery
      // without risking a second live iPaymu invoice after a process failure.
      if (provider !== 'ipaymu' || existing.IsFreshReservation) return { kind: 'in_progress' }

      await tx`
        UPDATE payments SET "Status" = 'denied',
          "RawPayload" = COALESCE("RawPayload", '{}'::jsonb) ||
            ${tx.json({ checkout: { error: 'checkout_reservation_expired' } })}
        WHERE "ProviderOrderId" = ${existing.ProviderOrderId}
          AND "Provider" = 'ipaymu' AND "Status" = 'pending'`
    }

    const orderId = `GF-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase()
    await tx`
      INSERT INTO payments ("Id","UserId","Provider","ProviderOrderId","Method","AmountIdr","GrantsDays","Status")
      VALUES (gen_random_uuid(), ${me.id}, ${provider}, ${orderId}, ${method}, ${amount}, ${days}, 'pending')`
    return { kind: 'new', orderId }
  })

  if (reservation.kind === 'in_progress')
    return NextResponse.json(
      { error: 'checkout_in_progress', message: 'Pembayaran sedang dibuat. Tunggu sebentar lalu coba lagi.' },
      { status: 409, headers: { 'Cache-Control': 'no-store', 'Retry-After': '3' } },
    )

  if (reservation.kind === 'existing') {
    return NextResponse.json(
      { provider, orderId: reservation.orderId, redirectUrl: reservation.redirectUrl, amountIdr: amount, grantsDays: days, reused: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const orderId = reservation.orderId

  let redirectUrl: string
  let raw: unknown
  try {
    if (provider === 'ipaymu') {
      const payment = await createRedirectPayment(ipaymu!, {
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
      // Settlement needs SessionID to cross-check a callback; no other provider response field
      // needs to be retained. Keeping this compact avoids storing optional buyer data forever.
      raw = { Data: { SessionID: payment.sessionId, Url: payment.url } }
    } else {
      const snap = await createSnapTransaction(midtransConfig()!, orderId, amount, `${origin}/subscription`)
      redirectUrl = snap.redirectUrl
      raw = snap.raw
    }
  } catch (e) {
    const failure = provider === 'ipaymu' ? checkoutFailure(ipaymu!, e) : null
    const errorCode = failure?.code ?? 'gateway_error'
    console.error('[checkout] gateway call failed', { provider, orderId, error: errorCode })
    await sql`
      UPDATE payments SET "Status" = 'denied',
        "RawPayload" = COALESCE("RawPayload", '{}'::jsonb) || ${sql.json({ checkout: { error: errorCode } })}
      WHERE "ProviderOrderId" = ${orderId} AND "Provider" = ${provider} AND "Status" = 'pending'`
    if (provider === 'ipaymu') {
      return NextResponse.json(
        { error: failure!.code, message: failure!.message },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return NextResponse.json(
      { error: 'charge_failed', message: 'Gagal memulai pembayaran. Coba lagi.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // iPaymu settlement reads SessionID back out for an ownership check. Keep that minimal record
  // rather than saving the provider's entire checkout response.
  await sql`
    UPDATE payments SET "QrUrl" = ${redirectUrl},
      "RawPayload" = COALESCE("RawPayload", '{}'::jsonb) || ${sql.json(raw as Parameters<typeof sql.json>[0])}
    WHERE "ProviderOrderId" = ${orderId} AND "Provider" = ${provider}`

  return NextResponse.json(
    { provider, orderId, redirectUrl, amountIdr: amount, grantsDays: days },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
