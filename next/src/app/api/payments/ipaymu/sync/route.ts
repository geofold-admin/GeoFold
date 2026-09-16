import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getUserId, unauthorized } from '@/lib/auth'
import { ipaymuConfig, findTransactionByReference } from '@/lib/ipaymu'
import { settleIpaymuOrder } from '@/lib/ipaymu-settle'

/**
 * Reconcile the caller's own pending iPaymu payments against iPaymu, and grant premium for any
 * that have actually been paid.
 *
 * This exists because a callback is not guaranteed to arrive on time, and a notifyUrl on localhost
 * is unreachable during development. The subscription page calls this when the customer comes
 * back from the hosted checkout, which turns a delayed callback into a page refresh rather than a
 * support ticket.
 *
 * Safe to call at any time, by anyone signed in: it only ever looks at the caller's own payment
 * rows, and every grant goes through the same `settleIpaymuOrder` checks the callback uses.
 */

/** How far back to look. Past this, a stale pending row is reconciled by hand, not by a poll. */
const WINDOW_HOURS = 48

/** Bounded so one request cannot fan out into an unpredictable number of gateway calls. */
const MAX_ORDERS = 5

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()

  const cfg = ipaymuConfig()
  if (!cfg) return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 })

  const pending = await sql<{ ProviderOrderId: string }[]>`
    SELECT "ProviderOrderId" FROM payments
    WHERE "UserId" = ${userId} AND "Provider" = 'ipaymu' AND "Status" = 'pending'
      AND "CreatedAtUtc" > now() - (${WINDOW_HOURS} * interval '1 hour')
    ORDER BY "CreatedAtUtc" DESC
    LIMIT ${MAX_ORDERS}`

  let granted = false
  const checked: Array<{ orderId: string; status: string }> = []

  for (const { ProviderOrderId: orderId } of pending) {
    try {
      const txn = await findTransactionByReference(cfg, orderId)
      if (!txn) {
        // Not in iPaymu's history yet: the customer has not paid, or has not finished. Normal.
        checked.push({ orderId, status: 'pending' })
        continue
      }
      const result = await settleIpaymuOrder(orderId, txn, { reconciled: true })
      if (result.ok) {
        granted ||= result.granted
        checked.push({ orderId, status: result.status })
      } else {
        console.error('[ipaymu] sync rejected', { orderId, reason: result.reason })
        checked.push({ orderId, status: 'pending' })
      }
    } catch (e) {
      // One unreachable lookup should not fail the whole reconcile — report the rest.
      console.error('[ipaymu] sync lookup failed', { orderId, error: String(e) })
      checked.push({ orderId, status: 'pending' })
    }
  }

  return NextResponse.json({ granted, checked })
}
