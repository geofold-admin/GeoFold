import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getIdentity, unauthorized } from '@/lib/auth'
import { checkoutExpiryHours } from '@/lib/ipaymu'
import { isTrustedQrUrl } from '@/lib/ipaymu-direct'
import { PREMIUM_DAYS, PREMIUM_PRICE_IDR, PREMIUM_STORAGE_LABEL, PREMIUM_PRICE_LABEL } from '@/lib/pricing'

export const runtime = 'nodejs'

/**
 * THE CUSTOMER'S OUTSTANDING INVOICE — the read side of the in-page checkout.
 *
 * WHY THIS EXISTS. The checkout used to be a modal that rendered the QR or the virtual-account
 * number inline and closed when the buyer navigated away. That is fine for a two-minute payment
 * and wrong for everything else: the buyer who wants to come back tomorrow, pay from another
 * device, or check whether the transfer landed had no page to return to, and a second press of
 * "Upgrade" started a second invoice. The invoice now has an address (`/invoice`) and this route
 * is what that page reads.
 *
 * WHAT IT RETURNS. One payment row, and only ever the caller's own. With `?order=` it returns
 * that specific order whatever its status, so the page can show "already paid" rather than
 * pretending the order vanished. Without it, the caller's most recent PENDING payment — the one
 * they are meant to be paying.
 *
 * WHAT IT NEVER RETURNS. The QRIS payload string. It stays server-side and the page asks for a
 * PNG through /api/payments/ipaymu/qr, which is the same rule the modal follows: the payload is
 * machine data and the endpoint that draws it takes an order id, never a string, so it cannot be
 * used as an open QR generator.
 *
 * `active` is computed rather than stored. A pending row stops being payable when its gateway
 * window lapses (iPaymu's own expiry hours, or a QRIS code's own deadline), and the database has
 * no job that flips those rows. Deriving it here means the answer is correct on every read
 * without a scheduler, and the UI can offer "make a new invoice" exactly when that is allowed.
 */

interface Row {
  ProviderOrderId: string
  Method: string
  AmountIdr: number
  GrantsDays: number
  Status: string
  QrUrl: string | null
  RawPayload: Record<string, unknown> | null
  CreatedAtUtc: string
}

/** The stored direct-payment instructions, as written by /api/payments/ipaymu/direct. */
interface StoredDirect {
  method?: string
  channel?: string
  label?: string
  paymentNo?: string | null
  qrUrl?: string | null
  qrPayload?: string | null
  totalIdr?: number
  feeIdr?: number
  expiresAt?: string | null
}

export async function GET(req: Request) {
  const me = await getIdentity(req)
  if (!me) return unauthorized()

  const url = new URL(req.url)
  const orderId = url.searchParams.get('order')
  if (orderId && orderId.length > 64)
    return NextResponse.json({ error: 'bad_order' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })

  /* One query, two shapes: a named order regardless of status, otherwise the newest pending one.
     The named branch is scoped to this user as well — an order id is not a capability. */
  const [row] = await sql<Row[]>`
    SELECT "ProviderOrderId", "Method", "AmountIdr", "GrantsDays", "Status", "QrUrl", "RawPayload", "CreatedAtUtc"
    FROM payments
    WHERE "UserId" = ${me.id} AND "Provider" = 'ipaymu'
      AND (${orderId}::text IS NULL OR "ProviderOrderId" = ${orderId}::text)
      AND (${orderId}::text IS NOT NULL OR "Status" = 'pending')
    ORDER BY "CreatedAtUtc" DESC
    LIMIT 1`

  if (!row)
    return NextResponse.json(
      { invoice: null, offer: offer() },
      { headers: { 'Cache-Control': 'no-store' } },
    )

  const stored = ((row.RawPayload as { direct?: unknown } | null)?.direct ?? null) as StoredDirect | null
  const method = stored?.method ?? row.Method
  const createdAt = Date.parse(row.CreatedAtUtc)
  const withinWindow = Number.isFinite(createdAt)
    ? Date.now() - createdAt < checkoutExpiryHours() * 3_600_000
    : false
  /* A QRIS code lapses on its own clock. Parsed as LOCAL time on purpose: iPaymu reports WIB and
     the server may run in UTC, so reading it as UTC would move the deadline seven hours — in the
     direction that keeps an expired code on screen. An unparseable value counts as expired, which
     is the safe direction to fail in. */
  const qrDeadline = typeof stored?.expiresAt === 'string' ? Date.parse(stored.expiresAt.replace(' ', 'T')) : NaN
  const qrAlive = !Number.isFinite(qrDeadline) || qrDeadline - Date.now() > 60_000

  const active = row.Status === 'pending' && withinWindow && (method !== 'qris' || qrAlive)

  const hostedUrl = row.Method === 'redirect' && row.QrUrl ? row.QrUrl : null
  const qrUrl = stored?.qrUrl && isTrustedQrUrl(stored.qrUrl) ? stored.qrUrl : null
  /* Whether the page should ask our own encoder for a PNG. A QRIS order stores the payload; a VA
     order never does, so this is also what keeps a virtual-account number from being drawn as an
     unscannable code. */
  const qrAvailable = Boolean(
    (typeof stored?.qrPayload === 'string' && stored.qrPayload.startsWith('000201')) ||
      (typeof stored?.paymentNo === 'string' && stored.paymentNo.startsWith('000201')),
  )

  return NextResponse.json(
    {
      invoice: {
        orderId: row.ProviderOrderId,
        status: row.Status,
        active,
        method,
        channel: stored?.channel ?? null,
        label: stored?.label ?? null,
        paymentNo: method === 'va' ? (stored?.paymentNo ?? null) : null,
        qrUrl,
        qrAvailable,
        hostedUrl,
        amountIdr: row.AmountIdr,
        feeIdr: stored?.feeIdr ?? 0,
        totalIdr: stored?.totalIdr ?? row.AmountIdr,
        expiresAt: stored?.expiresAt ?? null,
        createdAtUtc: row.CreatedAtUtc,
        grantsDays: row.GrantsDays,
      },
      offer: offer(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * The offer travels with the invoice for the same reason it travels with the subscription
 * summary: the price lives in a server-only env var, so a client that imported it would quote
 * the default figure while the gateway charged the configured one.
 */
function offer() {
  return {
    priceIdr: PREMIUM_PRICE_IDR,
    priceLabel: PREMIUM_PRICE_LABEL,
    days: PREMIUM_DAYS,
    storageLabel: PREMIUM_STORAGE_LABEL,
  }
}
