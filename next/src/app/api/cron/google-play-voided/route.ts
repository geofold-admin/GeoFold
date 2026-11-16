import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { listVoidedPurchases, PlayError, serviceAccount, VERIFIED_BY, type VoidedPurchase } from '@/lib/google-play'
import { revokePremiumDays } from '@/lib/premium'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Takes Premium back from Google Play purchases that were refunded, charged back or otherwise
 * voided after POST /api/subscriptions/verify-android granted them.
 *
 * Vercel Cron calls this once a day (next/vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * Each run asks Google's Voided Purchases API (purchases.voidedpurchases.list) for every purchase
 * voided in the last 30 days, the whole window the API keeps, not just the ones since the last run.
 * That keeps the job stateless. A missed or failed run (Vercel does not retry) is made up by the
 * next one, and a purchase that was verified after Google first listed its void is still caught.
 *
 * A voided purchase is acted on only when its token is a 'settled' google_play payment that
 * verify-android stamped, meaning this server granted it. One transaction then marks the payment
 * 'refunded' and takes its days back (revokePremiumDays). Everything else Google lists is ignored:
 * purchases never granted here, and ones an earlier run already took back. The status change is
 * what makes the job idempotent: a second run, or two overlapping runs, never takes the same days
 * twice.
 *
 * How it behaves and how to set it up: docs/GOOGLE-PLAY-BILLING.md ("Refunds, chargebacks and other
 * voided purchases", and setup step 5).
 */

const fail = (error: string, message: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, message, ...extra }, { status })

/** Vercel's advice for CRON_SECRET is a random string of at least 16 characters. */
const MIN_SECRET_LENGTH = 16

/** Enough to match a log line to a purchase; not enough to look the purchase up again. */
const tokenRef = (token: string) => `${token.slice(0, 12)}…`

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    console.error(`[play-voided] CRON_SECRET is not set or shorter than ${MIN_SECRET_LENGTH} characters; refusing to run.`)
    return fail('cron_not_configured', 'The refund job is not set up on the server yet.', 503)
  }
  if (!sameSecret(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return fail('unauthorized', 'Unauthorized', 401)
  }

  const account = serviceAccount()
  if (!account) {
    return fail('payments_not_configured', 'Google Play access is not set up on the server yet.', 503)
  }

  let voided: VoidedPurchase[]
  try {
    voided = await listVoidedPurchases(account)
  } catch (err) {
    if (!(err instanceof PlayError)) throw err
    console.error('[play-voided] Google Play lookup failed', { kind: err.kind, detail: err.message })
    if (err.kind === 'rejected') {
      return fail('play_credentials_rejected', 'Google Play refused the server credentials.', 503)
    }
    return fail('play_unavailable', 'Could not read voided purchases from Google Play.', 502)
  }

  const byToken = new Map<string, VoidedPurchase>()
  for (const v of voided) if (typeof v?.purchaseToken === 'string' && v.purchaseToken) byToken.set(v.purchaseToken, v)

  // One query finds the voids that still have days to take back. On most days that is none of
  // them, and the run ends without opening a transaction.
  const due =
    byToken.size === 0
      ? []
      : await sql<{ ProviderOrderId: string }[]>`
          SELECT "ProviderOrderId" FROM payments
          WHERE "Provider" = 'google_play' AND "Status" = 'settled'
            AND "RawPayload" ->> 'verifiedBy' = ${VERIFIED_BY}
            AND "ProviderOrderId" = ANY(${sql.array([...byToken.keys()])}::text[])`

  let revoked = 0
  let failed = 0
  for (const { ProviderOrderId: token } of due) {
    try {
      const done = await revoke(token, byToken.get(token)!)
      if (!done) continue
      revoked++
      console.info('[play-voided] took back Premium for a voided Google Play purchase', { token: tokenRef(token), ...done })
    } catch (err) {
      // The next run tries this purchase again; one bad row must not hold up the rest.
      failed++
      console.error('[play-voided] could not take back Premium', { token: tokenRef(token), error: String(err) })
    }
  }

  const summary = { listed: voided.length, revoked, failed }
  if (failed) {
    return fail('revocation_failed', 'Some voided purchases could not be taken back; the next run retries them.', 500, summary)
  }
  return NextResponse.json({ ok: true, ...summary })
}

/**
 * Marks one voided purchase's payment 'refunded' and takes back the days it granted, and resolves
 * once that has committed. Resolves to null when there turns out to be nothing to do, which happens
 * when an overlapping run got there first.
 */
async function revoke(token: string, v: VoidedPurchase) {
  return sql.begin(async (tx) => {
    // The row lock makes an overlapping run wait here, and once this transaction commits the
    // "Status" condition no longer matches for it.
    const [pay] = await tx<{ Id: string; UserId: string; GrantsDays: number }[]>`
      SELECT "Id", "UserId", "GrantsDays" FROM payments
      WHERE "Provider" = 'google_play' AND "ProviderOrderId" = ${token} AND "Status" = 'settled'
        AND "RawPayload" ->> 'verifiedBy' = ${VERIFIED_BY}
      FOR UPDATE`
    if (!pay) return null

    const { before, after } = await revokePremiumDays(tx, pay.UserId, pay.GrantsDays)
    const daysTakenBack = before && after ? Math.round(((before.getTime() - after.getTime()) / 86_400_000) * 100) / 100 : 0
    const voidedAudit = {
      revokedAt: new Date().toISOString(),
      orderId: v.orderId ?? null,
      voidedTimeMillis: v.voidedTimeMillis ?? null,
      voidedSource: v.voidedSource ?? null, // 0 user, 1 developer, 2 Google
      voidedReason: v.voidedReason ?? null, // 7 chargeback, 1 remorse, 5 fraud, … (see google-play.ts)
      premiumUntilBefore: before?.toISOString() ?? null,
      premiumUntilAfter: after?.toISOString() ?? null,
      daysTakenBack,
    }
    // verifiedBy stays in RawPayload, so verify-android keeps treating the token as claimed and a
    // re-post of it answers granted: false instead of granting it again.
    await tx`
      UPDATE payments SET
        "Status" = 'refunded',
        "RawPayload" = COALESCE("RawPayload", '{}'::jsonb) || ${tx.json({ voided: voidedAudit })}
      WHERE "Id" = ${pay.Id}`

    return {
      userId: pay.UserId,
      orderId: voidedAudit.orderId,
      voidedReason: voidedAudit.voidedReason,
      daysTakenBack,
      premiumUntil: voidedAudit.premiumUntilAfter,
    }
  })
}

/** Constant-time comparison. Hashing first gives timingSafeEqual equal lengths. */
function sameSecret(got: string, want: string): boolean {
  const a = createHash('sha256').update(got).digest()
  const b = createHash('sha256').update(want).digest()
  return timingSafeEqual(a, b)
}
