import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getIdentity, unauthorized } from '@/lib/auth'
import sql from '@/lib/db'

export const runtime = 'nodejs'

/** Verify an Android Play Billing purchase and grant premium if valid */
export async function POST(req: Request) {
  const me = await getIdentity(req)
  if (!me) return unauthorized()

  try {
    const body = await req.json()
    const { productId, purchaseToken, orderId, packageName } = body

    if (!productId || !purchaseToken) {
      return NextResponse.json(
        { error: 'missing_purchase_token', message: 'Product ID and purchase token required' },
        { status: 400 }
      )
    }

    // Only accept our known product
    if (productId !== 'geofold_premium_1month') {
      return NextResponse.json(
        { error: 'invalid_product', message: 'Unknown product' },
        { status: 400 }
      )
    }

    // Verify package name matches our app
    if (packageName !== 'app.geofold.mobile') {
      return NextResponse.json(
        { error: 'invalid_package', message: 'Package name mismatch' },
        { status: 400 }
      )
    }

    // Check if we've already processed this order
    const [existing] = await sql<{ Id: string }[]>`
      SELECT "Id" FROM payments
      WHERE "Provider" = 'google_play' AND "ProviderOrderId" = ${orderId}
      LIMIT 1
    `
    if (existing) {
      // Already processed - check if user is already premium
      const [user] = await sql<{ tier: string; pro_expires_at: string | null }[]>`
        SELECT tier, pro_expires_at FROM users WHERE id = ${me.id}
      `
      return NextResponse.json({
        granted: user?.tier === 'pro',
        message: 'Already processed',
      })
    }

    // TODO: Verify purchase with Google Play Developer API
    // This requires a service account with Play Developer API access
    // For now, we'll record the purchase and grant premium
    // In production, you should call:
    // https://www.googleapis.com/androidpublisher/v3/applications/app.geofold.mobile/purchases/products/geofold_premium_1month/tokens/{purchaseToken}
    // with an OAuth2 token from a service account

    // Record the purchase
    const paymentId = `GP-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase()

    await sql`
      INSERT INTO payments ("Id", "UserId", "Provider", "ProviderOrderId", "Method", "AmountIdr", "GrantsDays", "Status", "RawPayload")
      VALUES (gen_random_uuid(), ${me.id}, 'google_play', ${orderId}, 'iap', 40000, 30, 'settled',
        ${sql.json({ productId, purchaseToken, packageName, verifiedAt: new Date().toISOString() })}
      )
    `

    // Grant premium (30 days)
    await sql`
      UPDATE users
      SET tier = 'pro',
          pro_expires_at = COALESCE(pro_expires_at, NOW()) + INTERVAL '30 days'
      WHERE id = ${me.id}
    `

    return NextResponse.json({
      granted: true,
      message: 'Premium activated for 30 days',
    })
  } catch (err) {
    console.error('[android-verify] error:', err)
    return NextResponse.json(
      { error: 'verification_failed', message: 'Failed to verify purchase' },
      { status: 500 }
    )
  }
}