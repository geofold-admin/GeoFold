import { NextResponse } from 'next/server'
import { getIdentity, unauthorized } from '@/lib/auth'
import sql from '@/lib/db'
import {
  lookUpPurchase,
  PACKAGE_NAME,
  PlayError,
  PRODUCT_ID,
  serviceAccount,
  VERIFIED_BY,
  type ProductPurchase,
} from '@/lib/google-play'
import { grantPremiumDays } from '@/lib/premium'
import { PREMIUM_DAYS } from '@/lib/pricing'
import { ensureProfile } from '@/lib/profile'

export const runtime = 'nodejs'

/**
 * Grants Premium for a Google Play purchase, and only after Google has confirmed it.
 *
 * The Android app (mobile/src/lib/billing.ts) posts `{ productId, purchaseToken, orderId,
 * packageName }` once Play reports a purchase, and consumes it on the device only when this route
 * answers `{ granted: true }`. Nothing in that body proves a payment. The token is looked up with
 * the Google Play Developer API (androidpublisher v3 purchases.products.get) under our own service
 * account, and only Google's answer decides. The body's `orderId` is accepted for compatibility but
 * never used: the order id recorded is the one Google returns.
 *
 * One purchase, one grant. The purchase token is the payment row's "ProviderOrderId", which is
 * unique, so posting a token again never adds days. The account that claimed it first gets
 * `granted: true` again with nothing added, and any other account is refused. When Google later
 * reports the purchase refunded or charged back, GET /api/cron/google-play-voided marks the row
 * 'refunded' and takes the days back, and a re-post of the token then answers `granted: false`.
 *
 * Setup (service account, Play Console permissions, the one-time SQL): docs/GOOGLE-PLAY-BILLING.md.
 */

/**
 * What Play charges for the product, as listed in Play Console. Google's purchase record carries no
 * price, so the ledger records the listed one. Change the two together.
 */
const PLAY_PRICE_IDR = 40_000

const fail = (error: string, message: string, status: number) =>
  NextResponse.json({ error, message }, { status })

const alreadyProcessed = (status: string) =>
  NextResponse.json({ granted: status === 'settled', message: 'Already processed' })

const ownedElsewhere = () =>
  fail(
    'purchase_belongs_to_another_account',
    'This Google Play purchase belongs to a different GeoFold account.',
    409,
  )

/**
 * Purchase tokens are opaque URL-safe strings a few hundred characters long. Requiring printable
 * ASCII keeps junk away from Google (and lone surrogates, which make encodeURIComponent throw). The
 * cap keeps the token well inside the row-size limit of the unique index it is stored under.
 */
const isPlausibleToken = (t: unknown): t is string => typeof t === 'string' && /^[\x21-\x7e]{20,2048}$/.test(t)

export async function POST(req: Request) {
  const me = await getIdentity(req)
  if (!me) return unauthorized()

  const body: unknown = await req.json().catch(() => null)
  const { productId, purchaseToken, packageName } = (body && typeof body === 'object' ? body : {}) as Record<
    string,
    unknown
  >

  if (!productId || !isPlausibleToken(purchaseToken)) {
    return fail('missing_purchase_token', 'Product ID and purchase token required', 400)
  }
  if (productId !== PRODUCT_ID) return fail('invalid_product', 'Unknown product', 400)
  // Google is only ever asked about our own package (below), so this just turns away requests
  // meant for another app.
  if (packageName !== PACKAGE_NAME) return fail('invalid_package', 'Package name mismatch', 400)

  // Enough to match a request in the logs; not enough to look the purchase up again.
  const tokenRef = `${purchaseToken.slice(0, 12)}…`

  try {
    // A token this route has already verified is answered from the ledger. The app retries every
    // purchase it has not consumed each time Profile opens, so this saves a Google round trip,
    // and a token another account holds is refused without asking Google about it.
    const [claim] = await sql<{ UserId: string; Status: string }[]>`
      SELECT "UserId", "Status" FROM payments
      WHERE "ProviderOrderId" = ${purchaseToken} AND "Provider" = 'google_play'
        AND "RawPayload" ->> 'verifiedBy' = ${VERIFIED_BY}`
    if (claim) return claim.UserId === me.id ? alreadyProcessed(claim.Status) : ownedElsewhere()

    const account = serviceAccount()
    if (!account) {
      return fail('payments_not_configured', 'Google Play purchase verification is not set up on the server yet.', 503)
    }

    let purchase: ProductPurchase
    try {
      purchase = await lookUpPurchase(account, purchaseToken)
    } catch (err) {
      if (!(err instanceof PlayError)) throw err
      console.error('[android-verify] Google Play lookup failed', { kind: err.kind, detail: err.message, token: tokenRef })
      if (err.kind === 'not_found') return fail('invalid_purchase', 'Google Play has no record of this purchase.', 400)
      if (err.kind === 'rejected') {
        return fail('play_credentials_rejected', 'The server could not get access to Google Play to confirm the purchase.', 503)
      }
      return fail('verification_failed', 'Could not reach Google Play to confirm the purchase.', 502)
    }

    // The package matched by construction: the lookup URL names ours, and Google answers only for
    // tokens bought in that app. The product is in the URL too, and checked again here if echoed.
    if (purchase.productId && purchase.productId !== PRODUCT_ID) return fail('invalid_product', 'Unknown product', 400)
    if (purchase.purchaseState === 2) {
      return fail('purchase_pending', 'Google Play has not finished processing this payment yet.', 409)
    }
    if (purchase.purchaseState !== 0) {
      return fail('purchase_cancelled', 'Google Play reports this purchase as cancelled.', 409)
    }
    // The app tags each purchase with the buyer's user id (obfuscatedAccountId), so a token bought
    // by one account cannot be redeemed by another, even if the other gets to this route first.
    if (purchase.obfuscatedExternalAccountId && purchase.obfuscatedExternalAccountId !== me.id) {
      return ownedElsewhere()
    }

    const orderId = purchase.orderId || null // license-test purchases can come back without one
    const audit = {
      verifiedBy: VERIFIED_BY,
      verifiedAt: new Date().toISOString(),
      productId: PRODUCT_ID,
      orderId,
      purchaseTimeMillis: purchase.purchaseTimeMillis ?? null,
      purchaseType: purchase.purchaseType ?? null, // absent: real purchase; 0 test, 1 promo, 2 rewarded
      regionCode: purchase.regionCode ?? null,
    }

    // payments and subscriptions both reference profiles.
    await ensureProfile(me.id)

    const outcome = await sql.begin(async (tx) => {
      // The unique "ProviderOrderId" decides who claimed the token, so two requests racing here
      // cannot both grant. The conflict branch upgrades only a row the old, unverified route
      // wrote. That route never extended Premium here (its UPDATE targeted the `users` table,
      // which lives in the VPS database, not this one), and it keyed a test purchase without an
      // order id by its token, so such a row must not stop the purchase being granted now. A row
      // this route verified is left alone and RETURNING comes back empty.
      const [row] = await tx<{ Id: string }[]>`
        INSERT INTO payments
          ("Id", "UserId", "Provider", "ProviderOrderId", "ProviderTxnId", "Method",
           "AmountIdr", "GrantsDays", "Status", "RawPayload", "SettledAtUtc")
        VALUES
          (gen_random_uuid(), ${me.id}, 'google_play', ${purchaseToken}, ${orderId}, 'iap',
           ${PLAY_PRICE_IDR}, ${PREMIUM_DAYS}, 'settled', ${tx.json(audit)}, now())
        ON CONFLICT ("ProviderOrderId") DO UPDATE SET
          "UserId" = EXCLUDED."UserId", "ProviderTxnId" = EXCLUDED."ProviderTxnId",
          "Method" = EXCLUDED."Method", "AmountIdr" = EXCLUDED."AmountIdr",
          "GrantsDays" = EXCLUDED."GrantsDays", "Status" = EXCLUDED."Status",
          "RawPayload" = EXCLUDED."RawPayload" || jsonb_build_object('unverifiedRecord', payments."RawPayload"),
          "SettledAtUtc" = EXCLUDED."SettledAtUtc"
        WHERE payments."Provider" = 'google_play'
          AND payments."RawPayload" ->> 'verifiedBy' IS DISTINCT FROM ${VERIFIED_BY}
        RETURNING "Id"`
      if (row) {
        await grantPremiumDays(tx, me.id, PREMIUM_DAYS, 'google_play', orderId ?? purchaseToken)
        return { granted: true as const }
      }
      // Another request recorded this token between the ledger check above and this insert.
      const [existing] = await tx<{ UserId: string; Status: string }[]>`
        SELECT "UserId", "Status" FROM payments WHERE "ProviderOrderId" = ${purchaseToken}`
      return { granted: false as const, existing }
    })

    if (!outcome.granted) {
      return outcome.existing?.UserId === me.id ? alreadyProcessed(outcome.existing.Status) : ownedElsewhere()
    }
    return NextResponse.json({ granted: true, message: `Premium activated for ${PREMIUM_DAYS} days` })
  } catch (err) {
    if (isProviderNotAllowed(err)) {
      console.error(
        "[android-verify] payments_provider_check does not allow 'google_play' yet. Run the SQL in docs/GOOGLE-PLAY-BILLING.md.",
        { token: tokenRef },
      )
      return fail('payments_not_configured', 'Google Play purchases are not enabled on the server yet.', 503)
    }
    console.error('[android-verify] error:', err, { token: tokenRef })
    return fail('verification_failed', 'Failed to verify purchase', 500)
  }
}

/**
 * Migration 007 limits payments."Provider" to the web gateways. Until the SQL in
 * docs/GOOGLE-PLAY-BILLING.md widens it, a verified purchase cannot be recorded. That is answered
 * as a configuration problem, and the app retries later.
 */
function isProviderNotAllowed(err: unknown): boolean {
  const e = err as { code?: unknown; constraint_name?: unknown } | null
  return e?.code === '23514' && e.constraint_name === 'payments_provider_check'
}
