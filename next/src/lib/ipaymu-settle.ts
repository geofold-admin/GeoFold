import sql from './db'
import { grantPremiumDays } from './premium'
import { mapIpaymuStatus, type IpaymuTransaction } from './ipaymu'

/**
 * Turning a verified iPaymu transaction into premium time.
 *
 * Two routes reach this: the callback (`/api/payments/ipaymu/callback`), and the reconcile route
 * (`/api/payments/ipaymu/sync`) that the subscription page calls when the customer comes back from
 * the hosted checkout. They must agree exactly — a second implementation is a second chance to
 * grant two periods for one payment — so the checks and the transaction live here, once.
 *
 * The caller's only job is to obtain `txn` from the authenticated iPaymu API. Nothing here trusts
 * anything a callback body said.
 */

/**
 * Some bank-transfer channels add a small "unique code" to the amount so incoming transfers can be
 * told apart, so the buyer pays a few rupiah more than the invoice. Overpayment up to this much is
 * accepted; underpayment never is.
 */
const UNIQUE_CODE_TOLERANCE_IDR = 999

export type SettleResult =
  | { ok: true; status: string; granted: boolean }
  | { ok: false; reason: 'order_not_found' | 'order_mismatch' | 'amount_mismatch' }

interface PaymentRow {
  UserId: string
  AmountIdr: string
  GrantsDays: number
  Status: string
  SessionId: string | null
}

/**
 * Record `txn` against `orderId` and, if it is paid, extend the workspace's premium window.
 *
 * Idempotent: an order already marked settled is left alone, so retried callbacks, a customer
 * reloading the return page, and the two routes racing each other all converge on one grant.
 */
export async function settleIpaymuOrder(
  orderId: string,
  txn: IpaymuTransaction,
  extra: Record<string, unknown> = {},
): Promise<SettleResult> {
  const [pay] = await sql<PaymentRow[]>`
    SELECT "UserId", "AmountIdr", "GrantsDays", "Status",
           "RawPayload" -> 'Data' ->> 'SessionID' AS "SessionId"
    FROM payments
    WHERE "ProviderOrderId" = ${orderId} AND "Provider" = 'ipaymu'`
  if (!pay) return { ok: false, reason: 'order_not_found' }
  if (pay.Status === 'settled') return { ok: true, status: 'settled', granted: false }

  // The transaction iPaymu described must actually be this order's. Both identifiers come back
  // from the authenticated API, so neither can be chosen by whoever sent the callback; without
  // this check a forged callback could pair our reference id with someone else's paid trx_id and
  // get a second premium period out of a single payment.
  const belongsToOrder =
    txn.referenceId === orderId || (!!pay.SessionId && !!txn.sessionId && txn.sessionId === pay.SessionId)
  if (!belongsToOrder) return { ok: false, reason: 'order_mismatch' }

  const expected = Number(pay.AmountIdr)
  const status = mapIpaymuStatus(txn.statusCode)
  if (status === 'settled' && !(txn.amountIdr >= expected && txn.amountIdr <= expected + UNIQUE_CODE_TOLERANCE_IDR))
    return { ok: false, reason: 'amount_mismatch' }

  let granted = false
  await sql.begin(async (tx) => {
    // Re-read under a row lock. The gap between the read above and this write is exactly where a
    // retried callback racing the sync route would double-grant.
    const [locked] = await tx<{ UserId: string; GrantsDays: number; Status: string }[]>`
      SELECT "UserId", "GrantsDays", "Status" FROM payments
      WHERE "ProviderOrderId" = ${orderId} FOR UPDATE`
    if (!locked || locked.Status === 'settled') return

    // Merged into the existing payload rather than replacing it: the checkout response lives under
    // `Data` and is where the session id used by the ownership check is read from. Replacing it
    // outright would erase that and break the check for any later callback on this order.
    const raw = tx.json({ ...extra, transaction: txn.raw } as Parameters<typeof tx.json>[0])
    if (status === 'settled') {
      await tx`
        UPDATE payments SET "Status" = 'settled', "ProviderTxnId" = ${txn.transactionId},
          "RawPayload" = COALESCE("RawPayload", '{}'::jsonb) || ${raw}, "SettledAtUtc" = now()
        WHERE "ProviderOrderId" = ${orderId}`
      await grantPremiumDays(tx, locked.UserId, locked.GrantsDays, 'ipaymu', orderId)
      granted = true
    } else {
      await tx`
        UPDATE payments SET "Status" = ${status}, "ProviderTxnId" = ${txn.transactionId},
          "RawPayload" = COALESCE("RawPayload", '{}'::jsonb) || ${raw}
        WHERE "ProviderOrderId" = ${orderId}`
    }
  })

  return { ok: true, status, granted }
}
