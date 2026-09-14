-- ---------------------------------------------------------------------------
-- 007 — move the payments table off its Midtrans assumptions (2026-09-15)
--
-- Nothing here changes existing rows. The six Midtrans payments already in the
-- table keep their Provider and Method exactly as recorded, because the point
-- of those columns is to say which gateway a payment actually went through —
-- rewriting history to say "ipaymu" would make old orders unreconcilable
-- against the Midtrans dashboard.
--
-- What changes is what a row gets when the application does not say: the
-- defaults still read 'midtrans' / 'qris', which is no longer what this app
-- does. The app always passes both explicitly, so this is a safety net rather
-- than a behaviour change — but a safety net that points at the wrong gateway
-- is worse than none.
-- ---------------------------------------------------------------------------

-- 1. Defaults follow the live integration: iPaymu Redirect Payment.
alter table payments alter column "Provider" set default 'ipaymu';
alter table payments alter column "Method"   set default 'redirect';

-- 2. Constrain Provider to the gateways the code actually knows how to settle.
--    Both webhook routes filter on this value, so a typo here is a payment that
--    can never be settled by either of them. Existing rows are all 'midtrans',
--    so this validates cleanly.
--
--    Deliberately NOT applied to subscriptions."Provider": that column also
--    carries 'activation-key', and api/webhooks/[provider] still writes an
--    arbitrary string into it. Constraining it would turn that route's next
--    call into a 500. Retire that route first (see TODO.md), then revisit.
do $$ begin
  alter table payments add constraint payments_provider_check
    check ("Provider" in ('ipaymu', 'midtrans'));
exception when duplicate_object then null; end $$;

-- 3. Index for the reconcile route (POST /api/payments/ipaymu/sync), which
--    looks up one user's recent pending payments on every return from the
--    hosted checkout page. Partial, because settled rows are never its target
--    and there will eventually be far more of them than pending ones.
create index if not exists payments_pending_idx
  on payments ("UserId", "Provider", "CreatedAtUtc" desc)
  where "Status" = 'pending';

-- 4. Document two columns whose names no longer match what they hold, so the
--    next person reading the schema does not have to guess.
comment on column payments."QrUrl" is
  'Hosted checkout URL the buyer is redirected to (iPaymu Data.Url, or the Midtrans Snap '
  'redirect_url). Named QrUrl when the only method was a QRIS image; it has not held a bare '
  'QR image since.';

comment on column payments."RawPayload" is
  'Gateway payloads for this order, merged rather than replaced. The checkout response lands '
  'under "Data" (iPaymu SessionID is read back from Data.SessionID to prove a callback belongs '
  'to this order); the callback body and the verified transaction record are added at settlement.';

comment on column subscriptions."StorageQuotaMb" is
  'VESTIGIAL — not read by any code. The storage ceiling is PREMIUM_STORAGE_GB (5 GB) in '
  'next/src/lib/pricing.ts, enforced in quota.ts by summing survey_photos."SizeBytes". Kept only '
  'because dropping a column is irreversible; safe to remove once nothing references it.';

comment on column subscriptions."MaxSurveysPerMonth" is
  'VESTIGIAL — the monthly survey cap was retired by migration 002 in favour of daily caps in '
  'next/src/lib/quota.ts. Not read by any code.';
