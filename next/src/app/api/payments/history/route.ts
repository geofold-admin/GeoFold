import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getIdentity, unauthorized } from '@/lib/auth'
import { PREMIUM_DAYS, PREMIUM_PRICE_IDR, PREMIUM_PRICE_LABEL, PREMIUM_STORAGE_LABEL } from '@/lib/pricing'

export const runtime = 'nodejs'

/**
 * THE CUSTOMER'S PAYMENT HISTORY — the read side of the account menu.
 *
 * WHY THIS EXISTS. The site has an account menu in the header once a buyer is signed in, and the
 * thing a buyer opens that menu to find out is "did my payment go through, and what have I paid
 * for?". Before this route there was no way to answer either question: the checkout modal showed
 * the order in flight and then closed, and the only record afterwards was the premium flag on the
 * subscription summary — a boolean where the reader wants a ledger.
 *
 * WHAT IT RETURNS. Every payment row this user owns, newest first, in the shape a table needs:
 * the order id, what it was for, what it cost, its state, and both timestamps. Nothing else. The
 * raw gateway payload is deliberately NOT returned: it carries the merchant's own request and the
 * gateway's internal ids, none of which belongs in a browser, and the two fields a customer could
 * want from it (the reference and the deadline) are already promoted to columns here.
 *
 * WHAT IT NEVER RETURNS. Another user's rows. The `WHERE "UserId"` clause is the only access
 * control this table needs, and the table's RLS policy says the same thing — belt and braces,
 * because this route runs as the service role and RLS does not apply to it.
 *
 * THE STATUS VOCABULARY is the database's, translated for display on the client rather than here:
 * 'pending' | 'settled' | 'expired' | 'denied' | 'refunded'. A row can be pending and past its
 * window, which is why `active` is computed rather than derived from `Status` on the client — the
 * same rule the checkout uses.
 */

interface Row {
  ProviderOrderId: string
  Provider: string
  Method: string
  AmountIdr: number
  GrantsDays: number
  Status: string
  CreatedAtUtc: string
  SettledAtUtc: string | null
  RawPayload: Record<string, unknown> | null
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

/** How many rows the menu asks for when it does not say. */
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export async function GET(req: Request) {
  const me = await getIdentity(req)
  if (!me) return unauthorized()

  const url = new URL(req.url)
  const requested = Number.parseInt(url.searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(requested) ? Math.min(MAX_LIMIT, Math.max(1, requested)) : DEFAULT_LIMIT

  const rows = await sql<Row[]>`
    SELECT "ProviderOrderId", "Provider", "Method", "AmountIdr", "GrantsDays", "Status",
           "CreatedAtUtc", "SettledAtUtc", "RawPayload"
    FROM payments
    WHERE "UserId" = ${me.id}
    ORDER BY "CreatedAtUtc" DESC
    LIMIT ${limit}`

  const payments = rows.map((row) => {
    const stored = ((row.RawPayload as { direct?: unknown } | null)?.direct ?? null) as StoredDirect | null
    const method = stored?.method ?? row.Method
    return {
      orderId: row.ProviderOrderId,
      provider: row.Provider,
      method,
      channel: stored?.channel ?? null,
      label: stored?.label ?? null,
      amountIdr: row.AmountIdr,
      feeIdr: stored?.feeIdr ?? 0,
      totalIdr: stored?.totalIdr ?? row.AmountIdr,
      grantsDays: row.GrantsDays,
      status: row.Status,
      createdAtUtc: row.CreatedAtUtc,
      settledAtUtc: row.SettledAtUtc,
      expiresAt: stored?.expiresAt ?? null,
    }
  })

  /* The offer travels with the history for the same reason it travels with the subscription
     summary and the invoice: the price lives in a server-only env var, so a client that imported
     it would quote the default figure while the gateway charged the configured one. The account
     page uses it for the "upgrade" panel beside the ledger. */
  return NextResponse.json(
    {
      payments,
      offer: {
        priceIdr: PREMIUM_PRICE_IDR,
        priceLabel: PREMIUM_PRICE_LABEL,
        days: PREMIUM_DAYS,
        storageLabel: PREMIUM_STORAGE_LABEL,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
