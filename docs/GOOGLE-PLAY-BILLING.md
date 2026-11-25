# Google Play billing: server-side purchase verification

The Android app sells Premium (30 days, Rp 40.000) as the one-time Google Play product
`geofold_premium_1month` in the app `app.geofold.mobile`. The server grants Premium only after the
**Google Play Developer API** has confirmed the purchase, and takes it back when Google reports the
purchase refunded or charged back. This doc covers what the server checks, how refunds are handled,
and the one-time setup it needs.

Code: [`next/src/app/api/subscriptions/verify-android/route.ts`](../next/src/app/api/subscriptions/verify-android/route.ts)
(grants), [`next/src/app/api/cron/google-play-voided/route.ts`](../next/src/app/api/cron/google-play-voided/route.ts)
(refunds), [`next/src/lib/google-play.ts`](../next/src/lib/google-play.ts) (the Google API client both
use), and [`mobile/src/lib/billing.ts`](../mobile/src/lib/billing.ts) (app).

---

## How a purchase becomes Premium

1. The app buys `geofold_premium_1month` and tags the purchase with the buyer's GeoFold user id
   (`obfuscatedAccountId`).
2. The app posts `{ productId, purchaseToken, orderId, packageName }` to
   `POST /api/subscriptions/verify-android`.
3. The server looks up the token with androidpublisher v3 **`purchases.products.get`** for package
   `app.geofold.mobile` and product `geofold_premium_1month`. It authenticates as a service account.
   Nothing in the request body is taken as proof of payment.
4. Premium is granted only when Google reports `purchaseState` **0 (purchased)** for that product in
   that package. The payment row and the extra 30 days are written in a single transaction.
5. The app consumes the purchase only after the server answers `{ granted: true }`. Any other answer
   leaves the purchase unconsumed. The app retries it each time Profile opens, and Google refunds a
   purchase that is still unconsumed after 3 days.

What the server enforces:

- **One purchase, one grant.** The purchase token is stored as `payments."ProviderOrderId"`, which
  is unique. If the same account posts the token again, it gets `{ granted: true, message: "Already
  processed" }` and no extra days. If a different account posts it, the server answers `409`.
- **Bought by a different account.** If Google says the purchase was tagged with a different
  GeoFold user id, the server answers `409`, even when no one has claimed the token yet.
- **Google's order id is recorded.** It goes in `payments."ProviderTxnId"` (and `RawPayload.orderId`)
  and in `subscriptions."ProviderRef"`. The `orderId` in the request body is ignored. License-test
  purchases can come back without an order id. Their `ProviderRef` is then the purchase token.
- **License testers get real Premium.** Their purchases are recorded with
  `RawPayload.purchaseType = 0`, so they can be excluded from revenue figures.
- **Without credentials, nothing is granted.** If `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` is missing or
  unusable, the route answers `503` and grants nothing.
- **A refund takes the days back.** See the next section.

---

## Refunds, chargebacks and other voided purchases

Once a day the server asks Google which purchases were voided and takes back the Premium they
granted. Google calls a purchase *voided* when it was refunded (the buyer asked Google, you refunded
it in Play Console, or Google did), charged back, or revoked by Google, for example as fraud or
because it was not acknowledged within 3 days.

1. Vercel Cron calls `GET /api/cron/google-play-voided` every day at 20:00 UTC (03:00 WIB), as set in
   [`next/vercel.json`](../next/vercel.json). On the Hobby plan Vercel may run it at any minute of
   that hour.
2. The job reads every purchase Google recorded as voided in the **last 30 days**, which is as far
   back as Google's Voided Purchases API (`purchases.voidedpurchases.list`) goes. It reads the whole
   30 days every time, not only what changed since the last run.
3. For each voided purchase **this server granted** (a `google_play` payment row with
   `"Status" = 'settled'` and `RawPayload.verifiedBy = 'androidpublisher'`), one transaction:
   - sets the payment's `"Status"` to `'refunded'` and adds `RawPayload.voided`: Google's order id,
     `voidedSource` and `voidedReason` (codes listed in `google-play.ts`), when the job ran,
     `PremiumUntilUtc` before and after, and `daysTakenBack`;
   - takes the payment's `"GrantsDays"` (30) back from `subscriptions."PremiumUntilUtc"`.
4. Everything else Google lists is ignored: purchases this server never granted, rows written by the
   old unverified route, and purchases an earlier run already took back.

How the days are taken back:

- **30 days come off the end of the Premium window, but it never ends before now.** If fewer than
  30 days are left, Premium ends now, because days already used can't be taken back. A window that
  has already ended is not changed.
- **Premium bought another way stays.** The window shrinks only by the refunded purchase's days. A
  buyer with 10 days left from the web checkout who buys on Play (40 days) and is refunded is back
  to 10 days. If part of the window had already been used, those days count against what remains:
  a buyer who bought on Play, redeemed a 30-day key a few days later and was refunded on day 10
  keeps 20 days, so 30 days in all, which is what the key gave.
- Nothing else on the subscription changes. Once `PremiumUntilUtc` has passed, the workspace is Free
  like any lapsed one, and it freezes on its next write if it is over the Free limits.
- A refunded purchase can't be used again. If the app posts its token to `verify-android`, the
  answer is `{ granted: false, message: "Already processed" }`.

**Running it twice changes nothing.** The payment moves from `settled` to `refunded` in the same
transaction that takes the days back, under a row lock, so a second run, or two runs at once,
finds nothing left to do. Because every run reads the full 30 days, a missed run is made up the
next day (Vercel doesn't retry a failed cron run), and a purchase that is verified only after
Google first listed its refund is caught on the next run.

To see what the job has done:

```sql
select "UserId", "ProviderTxnId" as order_id, "RawPayload" -> 'voided' as voided
from payments
where "Provider" = 'google_play' and "Status" = 'refunded'
order by "RawPayload" -> 'voided' ->> 'revokedAt' desc;
```

The Vercel logs also get one `[play-voided] took back Premium` line for each purchase a run takes
back.

---

## One-time setup

### 1. Google Cloud: enable the API and create a service account

You can use the existing GeoFold Cloud project (see [step1-gcloud-setup.md](step1-gcloud-setup.md))
or any other project you own.

1. **APIs & Services → Library → "Google Play Android Developer API" → Enable.**
2. **IAM & Admin → Service Accounts → Create service account**, e.g. `play-purchase-verifier`. It
   needs **no** Cloud IAM roles, so skip the "Grant this service account access" step.
3. Open the account → **Keys → Add key → Create new key → JSON**. The downloaded file is the
   credential and can only be downloaded once. Keep it in a password manager and never commit it.
4. Note the account's email (`client_email` in the file, `…@<project>.iam.gserviceaccount.com`).

### 2. Play Console: give the service account access

> **There is no "API access → link the Cloud project" step any more.** Older guides tell you to
> open *Setup → API access* and link a Google Cloud project. Google has removed that step: per the
> [Play Developer API getting-started guide](https://developers.google.com/android-publisher/getting_started),
> "you no longer need to link your developer account to a Google Cloud Project". Access is now
> granted by inviting the service account like any other user.

1. Play Console → **Users and permissions → Invite new users**.
2. **Email address:** the service account's `client_email`.
3. **App permissions → Add app → GeoFold (`app.geofold.mobile`)**, then tick:
   - **View financial data, orders, and cancellation survey responses**. This is what lets the
     server read purchases.
   - **Manage orders and subscriptions**. Google's guide lists it for the billing APIs. Nothing on
     the server needs it today, because the verify route and the refund job (step 5) only read. It
     would be needed to refund or revoke orders from the server.
4. **Invite user.** Service accounts don't have to accept the invitation.

**Expect a delay.** Google doesn't document how long access takes to arrive. Developers commonly
report up to 24 hours (sometimes longer) before calls stop returning `401 permissionDenied`. Until
then the route answers `503 play_credentials_rejected`. Another commonly reported fix, also not in
Google's docs: if the in-app product existed before the service account was invited, edit the
product (for example its description) and save it. That has unstuck access for others.

### 3. Vercel: set the credential

**Vercel → geo-fold → Settings → Environment Variables → Add**:

| Key | Value |
|-----|-------|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | The entire JSON key file, as is (one line is fine), **or** its base64 encoding (`base64 -w0 key.json`) if the host mangles multi-line values. Mark it **Sensitive**, scoped to **Production**. |

Then **Deployments → ⋯ → Redeploy**. Never give it a `NEXT_PUBLIC_` prefix. It is a private key.

### 4. Supabase: allow `google_play` in `payments` (once)

[`migration-007-ipaymu.sql`](migration-007-ipaymu.sql) limits `payments."Provider"` to the web
gateways. Run this in **Supabase → SQL Editor**:

```sql
-- Google Play purchases are verified by /api/subscriptions/verify-android and recorded with
-- Provider 'google_play'. The purchase token is the ProviderOrderId; Google's order id is the
-- ProviderTxnId.
alter table payments drop constraint if exists payments_provider_check;
alter table payments add constraint payments_provider_check
  check ("Provider" in ('ipaymu', 'midtrans', 'google_play'));
```

Running it twice is safe. Until it has run, a purchase Google has confirmed can't be recorded: the
route answers `503 payments_not_configured`, logs `payments_provider_check does not allow
'google_play'`, and the app retries later.

The one-grant-per-token rule depends on the unique constraint that migration 002 put on
`"ProviderOrderId"`. Confirm it exists:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'payments'::regclass and contype = 'u';
-- expect a row with: UNIQUE ("ProviderOrderId")
```

While you're there, check for rows written by the **old route**, which recorded purchases without
asking Google:

```sql
select "Id", "UserId", "ProviderOrderId", "CreatedAtUtc", "RawPayload"
from payments
where "Provider" = 'google_play'
  and "RawPayload" ->> 'verifiedBy' is distinct from 'androidpublisher';
```

You should find none. The old route also wrote Premium to a `users` table that only exists in the
VPS database, so any such row almost certainly never gave anyone Premium. If the row's
`ProviderOrderId` is the purchase token, it is upgraded in place the next time that purchase
verifies. If it is a Google order id (`GPA.…`), it stays behind as a duplicate `settled` row: look
the order up in Play Console → Order management and fix or delete the row by hand.

### 5. Vercel: turn on the refund job

The schedule is already in [`next/vercel.json`](../next/vercel.json). The job also needs a secret,
so that only Vercel Cron can run it:

1. Make a random secret of letters and digits, at least 16 characters long, for example with
   `openssl rand -hex 32`.
2. **Vercel → geo-fold → Settings → Environment Variables → Add**: key `CRON_SECRET`, that value,
   scoped to **Production**, marked **Sensitive**. Paste it with no spaces or line breaks. Vercel
   sends it in the `Authorization` header exactly as stored.
3. Redeploy production. Cron jobs run only on the production deployment, and each deployment keeps
   the `CRON_SECRET` it was built with, so a new value takes effect only after a redeploy.
4. **Settings → Cron Jobs** should now list `/api/cron/google-play-voided` with `0 20 * * *`.
   **View Log** there shows each run.

Nothing else needs setting up: the job uses the service account from steps 1–3, and there is no
Pub/Sub topic to create. Google's Voided Purchases guide asks for the "View financial reports"
permission. Play Console now calls it **View financial data, orders, and cancellation survey
responses**, which step 2 already gives the service account.

The job runs once a day because the Hobby plan allows no more often than that, and a schedule that
runs more often makes the deployment fail. On Pro you can make it hourly (`0 * * * *`), which stays
well inside Google's quota of 6,000 calls a day.

---

## Check the setup

**Without the app.** Post a made-up token while signed in. The answer tells you which step is
missing:

```bash
curl -s -X POST https://geofold.sayba.id/api/subscriptions/verify-android -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"productId":"geofold_premium_1month","purchaseToken":"made-up-token-for-a-setup-check","packageName":"app.geofold.mobile"}'
```

| Answer | Meaning |
|---|---|
| `503 payments_not_configured` | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` is missing or not valid JSON (the Vercel log says which). Step 3. |
| `503 play_credentials_rejected` | Google rejected the service account: the API isn't enabled, the account hasn't been invited, access hasn't propagated yet, or the key was deleted. The log has Google's reason. Steps 1–2. |
| `400 invalid_purchase` | **Everything is wired up.** Google accepted the credentials and simply has no purchase with that token. |

**With the app.**

1. Play Console → **Setup → License testing**: add the tester's Google account.
2. Install the app from a Play testing track (internal testing is enough), signed in on the phone
   as that tester.
3. Buy Premium. The Play sheet offers a test card that always approves.
4. Profile should show Premium. In Supabase, the `payments` row should have
   `"Provider" = 'google_play'`, `"Status" = 'settled'`, and `RawPayload.verifiedBy = 'androidpublisher'`
   with `purchaseType: 0`.
5. To test a refund: Play Console → **Order management**, find the order (its id is the row's
   `"ProviderTxnId"`), **Refund**. Then run the job by hand (below) or wait for the next run. The
   row should turn `refunded` and Profile should lose the 30 days. Google can take a while to list a
   refund, so if the run reports `listed: 0`, try again later.

**The refund job.** It is safe to run by hand at any time:

```bash
curl -s https://geofold.sayba.id/api/cron/google-play-voided -H "Authorization: Bearer $CRON_SECRET"
```

| Answer | Meaning |
|---|---|
| `200 { ok: true, listed, revoked, failed: 0 }` | **It works.** `listed` is how many voided purchases Google reported for the last 30 days, and `revoked` is how many of them had their Premium taken back on this run. |
| `401 unauthorized` | The `Authorization` header doesn't match `CRON_SECRET`. |
| `503 cron_not_configured` | `CRON_SECRET` isn't set on this deployment, or is shorter than 16 characters. Step 5. |
| `503 payments_not_configured` | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` is missing or unusable. Step 3. |
| `503 play_credentials_rejected` | Google refused the service account. Steps 1–2. If `verify-android` works but this doesn't, check the service account's permission to view financial data. |
| `502 play_unavailable` | Google was unreachable, rate-limited, or returned an error. The next run tries again. |
| `500 revocation_failed` | Some purchases couldn't be updated. The body has the counts and the `[play-voided]` log line has the reason. Those payments stay `settled` and the next run tries them again. |
| any other `500` | An unexpected error, such as the database being unreachable. The Vercel log has it, and the next run tries again. |

---

## Responses

Request and response shapes are unchanged from the earlier version, so the app needs no update.

| Status | `error` | When |
|---|---|---|
| 200 | — `{ granted: true, message: "Premium activated for 30 days" }` | Google confirmed the purchase; Premium extended |
| 200 | — `{ granted: true, message: "Already processed" }` | Same account re-posting a token it already claimed; no days added |
| 200 | — `{ granted: false, message: "Already processed" }` | Same account re-posting a token whose purchase was refunded; nothing granted |
| 400 | `missing_purchase_token` | No product id or token, or the token is malformed |
| 400 | `invalid_product` | Not `geofold_premium_1month` |
| 400 | `invalid_package` | Not `app.geofold.mobile` |
| 400 | `invalid_purchase` | Google has no purchase with this token for this product |
| 401 | `unauthorized` | No valid GeoFold session |
| 409 | `purchase_pending` | Google says the payment is still pending (state 2) |
| 409 | `purchase_cancelled` | Google says the purchase was cancelled (state 1) |
| 409 | `purchase_belongs_to_another_account` | Another account already claimed the token, or Google says it was bought by another account |
| 502 | `verification_failed` | Google unreachable, timed out, rate-limited, or returned 5xx. The next retry may succeed. |
| 503 | `payments_not_configured` | Credential missing or unusable, or the SQL in step 4 hasn't run |
| 503 | `play_credentials_rejected` | Google refused the service account (step 2, or propagation) |
| 500 | `verification_failed` | Anything else. Check the Vercel logs (`[android-verify]`). |

The days granted come from `PREMIUM_DAYS`, the same setting the web checkout uses. The amount
recorded is `PLAY_PRICE_IDR` in the route (Rp 40.000). Google's purchase record carries no price,
so if the price changes in Play Console, change that constant too.

## Not handled yet

- **Refunds take up to a day to take effect.** The refund job polls once a day. Google's Real-time
  developer notifications could bring that down to minutes, and Google's Voided Purchases guide
  recommends integrating them too. They need a Cloud Pub/Sub topic, a push subscription, an
  endpoint that checks Google's signed push requests, and Play Console setup. If they are added,
  this job is still worth keeping, to catch any notification that never arrives.
- **A refund the job never saw within 30 days is lost.** Google lists a voided purchase for 30 days.
  As long as the job runs at least once every 30 days, nothing is missed. If it has been off for
  longer, check Play Console → Order management for refunds in that period against `payments` by
  hand.
- **Partial refunds of multi-quantity purchases are not requested.** Keep the product
  single-quantity: `verify-android` grants 30 days per purchase, whatever quantity was bought.
- **The server doesn't acknowledge or consume purchases.** The app consumes them after a
  `granted: true`, and consuming also acknowledges.
