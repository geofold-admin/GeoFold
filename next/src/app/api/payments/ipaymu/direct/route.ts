import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getIdentity, unauthorized } from '@/lib/auth'
import { ensureProfile } from '@/lib/profile'
import { BUSINESS } from '@/lib/business'
import { checkoutAvailability, checkoutExpiryHours, checkoutFailure, ipaymuConfig, createDirectPayment } from '@/lib/ipaymu'
import { DIRECT_CHANNELS, buyerFields, channelLabel, isDirectChannel, isTrustedQrUrl } from '@/lib/ipaymu-direct'
import { PREMIUM_PRICE_IDR, PREMIUM_DAYS, PREMIUM_STORAGE_LABEL } from '@/lib/pricing'

export const runtime = 'nodejs'

/**
 * Start an IN-PAGE payment and return the instructions to render, not a URL to navigate to.
 *
 * THE POINT OF THIS ROUTE. The redirect flow hands the buyer off to my.ipaymu.com, which is a
 * different site with a different header, a different language and a "back to merchant" link
 * people miss. This route uses iPaymu's Direct Payment endpoint instead, which returns a QR image
 * or a virtual-account number that we render ourselves — the buyer completes the payment without
 * ever leaving the pricing page.
 *
 * WHAT IT NEVER DOES. It never grants premium. Only a verified settlement does that, and only
 * through `settleIpaymuOrder` (lib/ipaymu-settle.ts), reached by the gateway callback or by the
 * sync route. A response from this route is an invoice, not a receipt.
 *
 * WHY THE CHANNEL IS VALIDATED AGAINST AN ALLOWLIST. `paymentChannel` is a value the client
 * picks, and it is interpolated into a signed request to the gateway. Without a fixed list, a
 * caller could ask for a channel the merchant account is not enabled for, or probe the gateway
 * with arbitrary strings under our signature. The list in lib/ipaymu-direct.ts is the whole
 * surface, and anything outside it is rejected before a request is built.
 *
 * REUSE. A double-click, or a retry after a slow response, must not create two live invoices for
 * the same buyer. The existing pending row for this user is reused when it is still within its
 * expiry window AND was created for the same channel — a QRIS invoice cannot be shown to someone
 * who now wants a BCA virtual account, so a channel change supersedes it.
 */

const IPAYMU_RESERVATION_GRACE_SECONDS = 90

interface ExistingRow {
  ProviderOrderId: string
  QrUrl: string | null
  Method: string
  IsFreshReservation: boolean
  RawPayload: Record<string, unknown> | null
}

type Reservation =
  | { kind: 'existing'; row: ExistingRow }
  | { kind: 'in_progress' }
  | { kind: 'new'; orderId: string }

/** The stored instructions for a reused order, read back out of RawPayload. */
function storedInstructions(row: ExistingRow): Record<string, unknown> | null {
  const direct = (row.RawPayload as { direct?: unknown } | null)?.direct
  return direct && typeof direct === 'object' ? (direct as Record<string, unknown>) : null
}

export async function POST(req: Request) {
  const me = await getIdentity(req)
  if (!me) return unauthorized()

  const cfg = ipaymuConfig()
  if (!cfg)
    return NextResponse.json(
      { error: 'payments_not_configured', message: 'Pembayaran belum dikonfigurasi.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )

  const availability = checkoutAvailability(cfg)
  if (!availability.available)
    return NextResponse.json(
      { error: availability.code, message: availability.message },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )

  /* ---- the channel the buyer picked ---- */
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    /* No body at all is allowed: it means "give me the default", which is QRIS. */
  }
  const requested = body ?? { method: 'qris', channel: 'mpm' }
  if (!isDirectChannel(requested))
    return NextResponse.json(
      { error: 'unsupported_channel', message: 'Metode pembayaran tidak dikenali.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  const { method, channel } = requested

  await ensureProfile(me.id)

  const amount = PREMIUM_PRICE_IDR
  const days = PREMIUM_DAYS
  /* iPaymu validates every URL against the merchant's approved domain, and request host headers
     are not a trustworthy source for a URL a payment provider later calls. Canonical origin only. */
  const origin = BUSINESS.site

  const reservation = await sql.begin(async (tx): Promise<Reservation> => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`direct:ipaymu:${me.id}`}))`

    const [existing] = await tx<ExistingRow[]>`
      SELECT "ProviderOrderId", "QrUrl", "Method",
             "CreatedAtUtc" > now() - (${IPAYMU_RESERVATION_GRACE_SECONDS} * interval '1 second') AS "IsFreshReservation",
             "RawPayload"
      FROM payments
      WHERE "UserId" = ${me.id} AND "Provider" = 'ipaymu' AND "Status" = 'pending'
        AND "CreatedAtUtc" > now() - (${checkoutExpiryHours()} * interval '1 hour')
      ORDER BY "CreatedAtUtc" DESC
      LIMIT 1 FOR UPDATE`

    if (existing) {
      /* Same channel and we still hold its instructions → hand the same invoice back. */
      const reusable =
        existing.Method === method &&
        !!storedInstructions(existing) &&
        /* A QRIS code expires in minutes; iPaymu reports the deadline and we stored it. Only
           reuse while it is still in the future. A VA number is good for hours, so it is
           reused on the reservation window alone. */
        (method !== 'qris' || isQrStillValid(storedInstructions(existing)?.expiresAt))
      if (reusable) return { kind: 'existing', row: existing }

      /* Still inside the window where the gateway call may be in flight: do not race it. */
      if (existing.IsFreshReservation && existing.Method === method) return { kind: 'in_progress' }

      /* Anything else — a stale reservation, or the buyer switched channel — is superseded.
         Marking it denied releases the unique order id and stops a forgotten invoice from being
         paid later against a period the buyer no longer expects. */
      await tx`
        UPDATE payments SET "Status" = 'denied',
          "RawPayload" = COALESCE("RawPayload", '{}'::jsonb) ||
            ${tx.json({ direct: { error: 'superseded_by_new_channel' } })}
        WHERE "ProviderOrderId" = ${existing.ProviderOrderId}
          AND "Provider" = 'ipaymu' AND "Status" = 'pending'`
    }

    const orderId = `GF-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase()
    await tx`
      INSERT INTO payments ("Id","UserId","Provider","ProviderOrderId","Method","AmountIdr","GrantsDays","Status")
      VALUES (gen_random_uuid(), ${me.id}, 'ipaymu', ${orderId}, ${method}, ${amount}, ${days}, 'pending')`
    return { kind: 'new', orderId }
  })

  if (reservation.kind === 'in_progress')
    return NextResponse.json(
      { error: 'checkout_in_progress', message: 'Pembayaran sedang disiapkan. Tunggu sebentar, lalu coba lagi.' },
      { status: 409, headers: { 'Cache-Control': 'no-store', 'Retry-After': '3' } },
    )

  if (reservation.kind === 'existing') {
    const stored = storedInstructions(reservation.row)
    if (!stored)
      return NextResponse.json(
        { error: 'checkout_in_progress', message: 'Pembayaran sedang disiapkan. Tunggu sebentar, lalu coba lagi.' },
        { status: 409, headers: { 'Cache-Control': 'no-store', 'Retry-After': '3' } },
      )
    /* `qrPayload` is stripped before the response. It is stored so the encoder route can draw the
       QR, not so it can be handed to the browser — the modal asks for a PNG instead. */
    const { qrPayload: _storedPayload, ...publicInstructions } = stored
    return NextResponse.json(
      { ...publicInstructions, orderId: reservation.row.ProviderOrderId, reused: true, amountIdr: amount, grantsDays: days },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const orderId = reservation.orderId

  /* ---- ask iPaymu for the number / QR ---- */
  /* iPaymu requires name, phone and email on this endpoint, but a GeoFold account can exist with
     nothing but an email — Supabase sign-up does not collect a name or a phone number. The
     fallbacks are the trading name and the merchant's own support number, so nothing that is not
     real is invented. See buyerFields() for the full argument. */
  const buyer = buyerFields({
    email: me.email,
    name: null,
    phone: null,
    fallbackName: BUSINESS.brand,
    fallbackPhone: BUSINESS.whatsapp,
  })

  let payment
  try {
    payment = await createDirectPayment(cfg, {
      orderId,
      amountIdr: amount,
      productName: `GeoFold Premium ${days} hari`,
      comments: `Premium ${days} hari, penyimpanan ${PREMIUM_STORAGE_LABEL}`,
      notifyUrl: `${origin}/api/payments/ipaymu/callback`,
      successUrl: `${origin}/subscription?order=${orderId}`,
      buyerName: buyer.name,
      buyerEmail: buyer.email,
      buyerPhone: buyer.phone,
      paymentMethod: method,
      paymentChannel: channel,
    })
  } catch (e) {
    const failure = checkoutFailure(cfg, e)
    console.error('[direct] gateway call failed', { orderId, channel, error: failure.code })
    await sql`
      UPDATE payments SET "Status" = 'denied',
        "RawPayload" = COALESCE("RawPayload", '{}'::jsonb) || ${sql.json({ direct: { error: failure.code } })}
      WHERE "ProviderOrderId" = ${orderId} AND "Provider" = 'ipaymu' AND "Status" = 'pending'`
    return NextResponse.json(
      { error: failure.code, message: failure.message },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  /* ---- what the browser is allowed to render ---- */
  const qrUrl = payment.qrUrl && isTrustedQrUrl(payment.qrUrl) ? payment.qrUrl : null
  const instructions = {
    orderId,
    method,
    channel: payment.channel,
    label: payment.paymentName || channelLabel(payment.channel),
    /* The VA number, or a human-readable payment number. Never the QR payload: that is machine
       data, and the modal renders it as a scannable image through /api/payments/ipaymu/qr. */
    paymentNo: payment.paymentNo || null,
    /* The EMVCo string, stored so the encoder route can draw it. It is NOT sent to the browser:
       the modal requests a PNG instead, which keeps the payload out of the client bundle and
       stops the endpoint from being usable as an open QR generator. */
    qrUrl,
    totalIdr: payment.totalIdr || amount,
    feeIdr: payment.feeIdr,
    expiresAt: payment.expired || null,
  }

  /* Stored so a reload, a second tab or a re-opened modal gets the SAME invoice rather than a
     new one — and so the amount the buyer was shown is recoverable for support.

     `qrPayload` is written separately from the public `instructions` object above: the encoder
     route reads it back out of the row, and it must survive a browser reload. */
  await sql`
    UPDATE payments SET "QrUrl" = ${qrUrl},
      "RawPayload" = COALESCE("RawPayload", '{}'::jsonb) || ${sql.json({
        direct: { ...instructions, qrPayload: payment.qrPayload || null },
      })}
    WHERE "ProviderOrderId" = ${orderId} AND "Provider" = 'ipaymu' AND "Status" = 'pending'`

  return NextResponse.json(
    { ...instructions, amountIdr: amount, grantsDays: days, channels: DIRECT_CHANNELS },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * A stored QRIS deadline, as iPaymu formats it ("2023-12-31 23:59:59", local time).
 *
 * Treated as local time deliberately: iPaymu reports WIB and the server may run in UTC, so
 * parsing it as UTC would shift the deadline by seven hours — in the direction that reuses an
 * expired code. A short grace is subtracted so a code that is about to lapse is replaced rather
 * than handed over. An unparseable value returns false, which forces a fresh invoice; that is the
 * safe direction to fail in.
 */
function isQrStillValid(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  const parsed = Date.parse(value.replace(' ', 'T'))
  if (!Number.isFinite(parsed)) return false
  return parsed - Date.now() > 60_000
}
