import sql from './db'

// The exact TransactionSql type `sql.begin` hands its callback — callers always pass their open
// transaction so the grant commits together with their ledger write. Derived rather than imported
// so it tracks the postgres types without naming an internal type.
type Db = Parameters<Parameters<typeof sql.begin>[1]>[0]

/**
 * Extend a workspace's premium window by `days`, stacking onto any time still remaining, and mark
 * it premium + un-frozen. This does NOT dedupe — the caller owns idempotency (the redemption ledger
 * for keys, the payment status for Midtrans) and must run this inside that same transaction.
 * Returns the new PremiumUntilUtc as an ISO string. revokePremiumDays below undoes a grant.
 */
export async function grantPremiumDays(
  db: Db,
  userId: string,
  days: number,
  provider: string,
  providerRef: string | null,
): Promise<string> {
  const [row] = await db<{ PremiumUntilUtc: Date }[]>`
    INSERT INTO subscriptions
      ("Id","UserId","Plan","Status","Provider","ProviderRef","WorkspaceType",
       "PremiumUntilUtc","CurrentPeriodEndUtc","FrozenAtUtc","UpdatedAtUtc")
    VALUES
      (gen_random_uuid(), ${userId}, 'premium', 'active', ${provider}, ${providerRef}, 'premium',
       now() + (${days} * interval '1 day'), now() + (${days} * interval '1 day'), NULL, now())
    ON CONFLICT ("UserId") DO UPDATE SET
      "Plan" = 'premium', "Status" = 'active', "Provider" = ${provider}, "ProviderRef" = ${providerRef},
      "WorkspaceType" = 'premium',
      -- Stack onto whatever premium time is left; if lapsed, start from now.
      "PremiumUntilUtc" = GREATEST(now(), COALESCE(subscriptions."PremiumUntilUtc", now())) + (${days} * interval '1 day'),
      "CurrentPeriodEndUtc" = GREATEST(now(), COALESCE(subscriptions."PremiumUntilUtc", now())) + (${days} * interval '1 day'),
      "FrozenAtUtc" = NULL, "UpdatedAtUtc" = now()
    RETURNING "PremiumUntilUtc"`
  return row.PremiumUntilUtc.toISOString()
}

/**
 * Take back `days` that grantPremiumDays added, for a payment that has since been refunded or
 * charged back. The days come off the end of the premium window, which never ends before now:
 * days already used stay used, and a window that has already lapsed is left alone. Nothing else
 * changes, so premium time bought some other way stays in the window. Like grantPremiumDays this
 * does NOT dedupe: the caller moves its payment out of 'settled' in the same transaction, and that
 * is what stops the same days being taken twice.
 *
 * Returns PremiumUntilUtc before and after (both null when the user has no subscription row, and
 * equal when there was nothing left to take).
 */
export async function revokePremiumDays(
  db: Db,
  userId: string,
  days: number,
): Promise<{ before: Date | null; after: Date | null }> {
  // Locked first so `before` is the value the update below starts from.
  const [sub] = await db<{ PremiumUntilUtc: Date | null }[]>`
    SELECT "PremiumUntilUtc" FROM subscriptions WHERE "UserId" = ${userId} FOR UPDATE`
  const before = sub?.PremiumUntilUtc ?? null
  const [row] = await db<{ PremiumUntilUtc: Date }[]>`
    UPDATE subscriptions SET
      "PremiumUntilUtc" = GREATEST(now(), "PremiumUntilUtc" - (${days} * interval '1 day')),
      "CurrentPeriodEndUtc" = GREATEST(now(), "PremiumUntilUtc" - (${days} * interval '1 day')),
      "UpdatedAtUtc" = now()
    WHERE "UserId" = ${userId} AND "PremiumUntilUtc" > now()
    RETURNING "PremiumUntilUtc"`
  return { before, after: row ? row.PremiumUntilUtc : before }
}
