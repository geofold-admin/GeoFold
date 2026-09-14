# GeoFold — TODO

Actionable checklist. Longer-term roadmap and traps live in [`NEXT-STEPS.md`](NEXT-STEPS.md).

Last updated 2026-09-07 — audited against the live database and the production deployment; the
items below marked ✅ were verified done rather than assumed.

---

## 🔴 Read this first — there are two Supabase projects

Established 2026-09-07, by three independent checks. **`vdyuoqtoimtpienoqznc` is production.**

- The deployed site at `geofold.sayba.id` ships that ref in its client bundle, and no other.
- It holds the real accounts (3 users, all via Google) and the real Midtrans transactions
  (5 Snap orders, 2026-08-29 and 2026-09-06).
- It was created 2026-08-27, which is when the move happened.

`nkqjbxlliuodbxiymatc` is the **old** project: early dev data (1 profile, 1 project, 2 surveys,
no payments) and nothing points at it any more except stale local files.

- ⚠️ **The repo-root `.env.local` is stale.** It still points at the old project and carries
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key`. It was not updated when the project moved,
  so anything built from it targets the wrong database — and `placeholder-anon-key` does not look
  like a placeholder to a naive check, which is how it can produce a client that is *out* of demo
  mode and still cannot authenticate. `mobile/src/lib/config.ts` now rejects any value containing
  `placeholder`, so that particular build cannot happen by accident.
- `next/.env.local` was rewritten 2026-09-07 with the correct public values (verified byte-for-byte
  against what production ships) and **empty server-side secrets**, so local API routes fail loudly
  instead of quietly reading and writing the old database. Paste the service-role key, JWT secret
  and DB password from Vercel to make local development work.
- [ ] **Update the repo-root `.env.local` too**, or delete it. It is the source of the confusion,
      and `env.zip` beside it (dated 2026-07-26) is older still.
- [ ] **Decide whether to delete the old project.** It costs nothing to keep, but every future
      session has to work out which is which. `contact_messages` was applied to both.

## 🚦 Blocking — before the mobile app can be field-tested at all

- [x] ✅ **Done 2026-09-07 — the app is out of demo mode.** `mobile/.env.local` now carries
      `EXPO_PUBLIC_API_BASE_URL=https://geofold.sayba.id`,
      `EXPO_PUBLIC_SUPABASE_URL=https://vdyuoqtoimtpienoqznc.supabase.co` and the real legacy anon
      JWT — the identical key the deployed web app ships, so both clients present the same
      credential to the same project. `DEMO_MODE` evaluates false; the key was checked against
      `/auth/v1/settings` (HTTP 200). Note `/rest/v1/` answers 401 for that key: expected and
      correct, the `anon` role has no table grants and the app never uses PostgREST — it reaches
      Supabase for auth only, and all data goes through `/api/*` with a Bearer token.
- [ ] **List the mobile OAuth redirect URLs in Supabase** → Authentication → URL Configuration →
      Redirect URLs, on project `vdyuoqtoimtpienoqznc`. Google sign-in on the phone opens
      `Linking.createURL('auth/callback')`: `geofold://auth/callback` for the standard build,
      `geofolddrone://auth/callback` and `geofolddronev4://auth/callback` for the drone builds.
      All three are needed or the browser sheet returns and sign-in fails silently. Google itself
      **is** enabled on the project (verified), and all three existing users signed up with it.
- [ ] **Set `NEXT_PUBLIC_OAUTH_PROVIDERS=google` in the Vercel environment.** The web hides every
      social button until its id is listed there. Set locally already.

## 📱 APK status (2026-09-07)

`geofold-live.apk` at the repo root is the **standard survey build, out of demo mode** — built
2026-09-07 from `mobile/android/app/build/outputs/apk/release/app-release.apk`. Verified by
unzipping it: the shipped JS bundle carries `geofold.sayba.id` and the production Supabase ref, and
carries neither the retired project ref nor `placeholder-anon-key`. 178 MB, `app.geofold.mobile`,
minSdk 24 (Android 7.0), targetSdk 36, four ABIs.

- ⚠️ **`geofold.apk`, `geofold-drone.apk` and `geofold-drone-v4.apk` are DEMO builds.** Confirmed
  the same way — none has a server URL compiled in. They predate the env being set, run on sample
  data, and never contact the server. Delete them or rebuild them; do not hand them to anyone.
- [ ] **Rebuild the two drone variants** once you want them live:
      `npm run prebuild:drone && cd android && ./gradlew assembleRelease` (and `prebuild:drone-v4`).
      Each switch re-runs prebuild with `--clean`, so budget ~12 minutes per variant.
- [ ] ⚠️ **Release builds are signed with Android's DEBUG keystore** (`CN=Android Debug`) — Expo's
      default when no release signing config exists. That key is public and ships with the SDK, so
      it provides no authenticity guarantee: anyone can build an APK that Android will accept as an
      update to yours. Generate a release keystore, wire it into `android/app/build.gradle`, and
      keep it somewhere safe — losing it means no existing install can ever be upgraded. The
      `/download` page previously claimed signature protection; that claim has been removed until
      this is true.
- [ ] **Nothing hosts the APK yet.** `/download` detects the empty `url` in `APP_DOWNLOADS` and
      tells visitors to request the file by email rather than showing a dead link. A GitHub release
      asset is the intended home (2 GB limit); Supabase Storage will not do at 50 MB per file on
      the free plan.
- **Build environment, for next time:** gradle needs **JDK 17**, at
  `~/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2`. Android Studio's bundled JBR is **JDK 25**,
  and React Native's CMake configure step dies on it with
  `WARNING: A restricted method in java.lang.System has been called` — which reads like a warning
  but fails the build. Set `JAVA_HOME` to the 17 before running `./gradlew`.

## 🖼️ Photo size cap — done 2026-09-07

Every route a photo can take into storage now goes through one 1 MB ceiling, because storage is
the binding cost in this product: a survey *is* a photo.

- `mobile/src/lib/photo.ts` — `MAX_BYTES = 1_000_000`, enforced by `compressToLimit`. Quality steps
  first (0.8 → 0.4), then bounded downscaling, because the coordinates burned into the frame have
  to stay readable and that survives a quality drop better than losing pixels. A photo already
  under the cap is returned untouched, so the common phone capture takes no second re-encode.
- `compressFile(uri)` is the same cap for a file whose dimensions are unknown — the DJI modules
  return a `file://` URI and no pixel size, so it probes the image first.
- `next/src/lib/capture.ts` — the web upload path has the identical cap and the same strategy. Both
  clients must agree or the cheaper one just moves the cost around.
- Covered: in-app viewfinder, system camera, library picker, drone download, web upload.

## 🚁 Drone capture — fixed 2026-09-07

- [x] ✅ **The hardcoded project was the "my photo vanished" bug.** `drone.tsx` queued every aerial
      survey against `projectId: 'drone-test'`, which exists on no server, so the row could never
      sync. The photo *was* downloaded and stored correctly — it just had nowhere to land. Replaced
      with `components/project-picker.tsx`: a modal listing the real projects, asked before the
      first capture, remembered per device (`geofold.drone.lastProject`) so a pilot flying a block
      is asked once rather than once per shutter press. A pending shutter press completes itself
      once a project is chosen. There is a "Save photos to … / Change" row in the drone settings.
- [x] ✅ **Drone photos now land in the phone's gallery.** `mobile/src/lib/gallery.ts` copies the
      full-resolution original into a `GeoFold` album via `expo-media-library` before the outbox
      move takes the file away. This is what makes a capture *visible* to the pilot — the app's own
      copy lives in private storage where no gallery or file manager can see it, which is why a
      correct capture looked lost. Best-effort by design: failing to write the gallery copy never
      loses the survey, and the result (`saved` / `denied` / `failed`) is reported on screen.
- [x] ✅ **Aerial photos are compressed like ground ones.** They previously went to the outbox
      uncompressed at 4–8 MB straight off the card.
- [ ] **Still unproven on hardware.** All of the above typechecks, lints and builds, but no
      aircraft was attached. What needs a real flight: that the gallery copy is written before the
      outbox move wins the race, and that `verifyReleaseResources` (below) has not changed runtime
      behaviour.

## 🔑 Superadmin — added 2026-09-07

`profiles."Role"` had existed since the .NET schema and **nothing ever read it**. It now does.

- Enforcement is in `next/src/lib/quota.ts::getWorkspace`, the single chokepoint every quota
  decision passes through — project count, photos per project, daily capture and upload caps, and
  the premium-gated survey map. A superadmin resolves to a premium workspace that never expires, so
  it travels the same path as a paying customer instead of needing a special case per call site.
- Granted to `gakaridase@gmail.com`. Verified against the live database: that account resolves to
  "premium (unlimited, never expires)", the other three still resolve to free.
- `docs/migration-005-superadmin.sql` records the grant, the revoke, and the "who holds it" query.
- **Scope is deliberately limited to lifting limits.** It grants no sight of other users' data —
  row ownership is still enforced everywhere — and there is no admin UI.

## 📲 V4 drone build — built, installed and verified 2026-09-07

Installed to the Redmi 23108RN04Y over adb. 180 MB, `app.geofold.drone.v4`.

Verified by unzipping the APK **pulled back off the phone**, not the one in the build directory:
`geofold.sayba.id` present, `vdyuoqtoimtpienoqznc` present, `placeholder-anon-key` absent,
`drone-test` **absent** (the hardcoded project is gone), the project picker string present.

Runtime, over logcat: app launches, `ReactNativeJS: Running "main"`, JSI installed, frames render,
process stays up, **zero fatal exceptions and zero JS errors**. The sign-in screen shows
"Continue with Google" and shows **no** "Continue with sample data" button and no "No Supabase
project is configured" notice — `signin.tsx` renders those only when `DEMO_MODE` is true, so that
is direct UI proof the build is live rather than demo.

- [x] ✅ **Fixed: `:dji-v4:verifyReleaseResources` failed the release build.** DJI's V4 AAR ships
      layouts (`dji_dialog_login.xml`, `lidar_map.xml`) referencing ConstraintLayout and AppCompat
      attributes — `layout_constraintTop_toTopOf`, `srcCompat` — but declares neither dependency,
      so AAPT could not link them. Added `androidx.constraintlayout` and `androidx.appcompat` to
      `native/dji-v4/android/build.gradle`. Only release builds run this verify task, which is why
      it had never surfaced.
- [ ] ⚠️ **Rebuild once more to narrow the gallery permissions.** `granularPermissions: ['photo']`
      was added to the `expo-media-library` plugin config *after* this build started, so the
      installed APK also declares `READ_MEDIA_AUDIO` and `READ_MEDIA_VIDEO`. They are never
      requested at runtime — the code asks for `['photo']` write-only — but they show in the app's
      permission list until the next build.
- [ ] **Still unproven: anything needing an aircraft or a signed-in session.** DJI registration, the
      gallery copy, the project picker against real projects, and the compression of a real 12 MP
      drone JPEG all need a flight. The app was left signed out deliberately.
- **Build environment:** gradle needs **JDK 17** (`~/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2`).
  Android Studio's bundled JBR is JDK 25 and React Native's CMake configure step dies on it.

## 💸 Check before deploying: what production charges

`payments` on the live project shows two orders at **`AmountIdr` = 1** (2026-08-29 and 2026-09-06)
alongside three at 49000 — so `PREMIUM_PRICE_IDR` in Vercel has been set to `1` for testing.

- [ ] **Set `PREMIUM_PRICE_IDR` to the real price before deploying the new pages.** Until
      2026-09-07 the pricing page hardcoded "Rp 49.000" while the checkout charged whatever the env
      said; they can no longer disagree, because every public page now reads the same value. That
      is the fix, but it also means a leftover `PREMIUM_PRICE_IDR=1` will publish "Rp 1" on the
      pricing page, the FAQ, the refund policy and the terms.
- [ ] **No payment has ever settled.** All five orders are `pending` or `expired`, none has a
      `SettledAtUtc`, and `subscriptions` is empty — so the webhook path from checkout to
      `grantPremiumDays` is still unproven end to end. This is consistent with the Midtrans
      notification URL not being set (below).

## 🚦 Blocking — before the subscription/premium feature works in production

The code (quota model, activation keys, Midtrans Snap) is written and typechecks. Most of the
one-time setup is now done; what remains is below.

- [x] ✅ **DB migration applied.** Verified 2026-09-03 against the live database: `usage_daily`,
      `activation_keys`, `activation_key_redemptions` and `payments` all exist, `subscriptions`
      carries `WorkspaceType`/`PremiumUntilUtc`/`FrozenAtUtc`, and every unique index the code's
      `ON CONFLICT` clauses depend on is present. `docs/migration-003-profile.sql` is applied too.
- [x] ✅ **Midtrans env is set in production.** Verified 2026-09-03: an unsigned POST to
      `https://geofold.sayba.id/api/payments/midtrans/webhook` answers `invalid_signature`, not
      `payments_not_configured` — that check runs first, so `MIDTRANS_SERVER_KEY` is configured on
      the deployment. Note this is Vercel's environment only. `next/.env.local` now exists
      (created 2026-09-07 by copying the root one, which Next does **not** read — it loads env from
      its own directory), so a local `npm run dev` reaches the real database; it still cannot
      authenticate anyone, because the anon key in it is a placeholder.
- [ ] **Set the Midtrans Payment Notification URL** →
      `https://geofold.sayba.id/api/payments/midtrans/webhook`. The endpoint is live and rejecting
      unsigned calls correctly; what cannot be checked from outside is whether the Midtrans
      dashboard is actually pointed at it. **No payment has ever settled**, though `payments` is
      not empty: the live project holds 5 orders, all `pending`/`expired` with no `SettledAtUtc`.
      (An earlier audit read this as "empty" — it was querying the old project.)
- [ ] **Activation-key generation.** There is no generator yet, and `activation_keys` is empty
      (confirmed 2026-09-03). Keys are stored only as `sha256(plaintext)` in
      `activation_keys."KeyHash"`. Build a small admin script/route that inserts a row and prints
      the plaintext once, or insert rows by hand.

## 🚀 Not deployed yet — the iPaymu form cannot be submitted until it is

Checked against `geofold.sayba.id` on 2026-09-07:

| Path | Live now | After deploy |
| --- | --- | --- |
| `/faq` | **404** | new page |
| `/refund-policy` | **404** | new page |
| `/download` | **404** | new page |
| `/sitemap.xml` | **404** | new |
| `/terms` | 200, old text | rewritten, bilingual |
| `/privacy` | 200, old text | rewritten, bilingual |
| `/contact` | 200, **shows a fake US address** | real details from `business.ts` |

- [ ] ⚠️ **`/contact` currently publishes an invented address** — "418 Millrace Ave, Suite 200,
      Corvallis, OR 97330" — and the addresses `sales@geofold.app` / `support@geofold.app`, which do
      not exist. That is live right now. If the iPaymu form was already submitted pointing at it,
      expect a rejection on the contact-page requirement.
- [ ] **Fill in `business.ts`, then deploy, then submit the form.** In that order — two of the four
      URLs 404 today.

## 🔐 Supabase security advisors (live project, 2026-09-07)

Run: `get_advisors(vdyuoqtoimtpienoqznc, security)`. Nothing here is caused by this session's work.

- [ ] **Leaked-password protection is disabled.** One toggle in Authentication → Policies; checks
      new passwords against HaveIBeenPwned. The only genuinely actionable item in the list.
- `spatial_ref_sys` has RLS disabled (ERROR), `postgis` is installed in `public` (WARN), and three
  `st_estimatedextent` overloads are executable by `anon`/`authenticated` (WARN). All four are
  PostGIS's own defaults. Enabling RLS on `spatial_ref_sys` without policies breaks PostGIS, so do
  not apply the linter's suggestion blindly. Exposure is limited: the `anon` role has no table
  grants at all on this project (verified — `/rest/v1/profiles` answers 401, not an empty array),
  because the app reaches Postgres directly and never uses PostGREST.
- `activation_keys` and `contact_messages` report "RLS enabled, no policy" (INFO). **Intentional
  for both** — they are written only by the server over the direct connection, and no client key
  should reach them.

## 🧾 Payment-gateway verification (iPaymu) — done 2026-09-07, one thing outstanding

The gateway's application form asks for four public URLs and requires the contact page to show an
email, a phone number and a business address. All four now exist, bilingual (Indonesian default,
English toggle), linked from the nav and the footer of every marketing page, and listed in
`sitemap.xml`:

| Field on the form | URL |
| --- | --- |
| Link FAQ | `/faq` |
| Link Refund Policy | `/refund-policy` |
| Link Syarat & Ketentuan | `/terms` |
| Link Kontak | `/contact` |

- [x] ✅ **`next/src/lib/business.ts` is filled in.** Address, phone, WhatsApp, legal name, email,
      hours and response time all carry real values, and `/contact`, `/terms`, `/refund-policy` and
      the footer render them from that one file.
- [x] ✅ **Address moved to Sintang (2026-09-15)**, as supplied by the operator:
      *Dusun Lalang Baru, Kec. Sintang, Kabupaten Sintang, Kalimantan Barat*. The two hardcoded
      "Pontianak" mentions on `/about` were updated with it.
- [ ] ⚠️ **The postcode is deliberately empty.** The operator gave the address without one, and a
      guessed postcode on the page a verifier reads is worse than an absent one. Every consumer
      filters blank parts out, so nothing renders oddly — but **fill it in before submitting for
      merchant verification** (Kec. Sintang is in the 786xx range).
- [ ] ⚠️ **Update the address on the iPaymu (and Midtrans) merchant account to match.**
      Verification fails on a mismatch between the merchant record and the contact page, not only
      on a wrong address.
- [x] ✅ `/faq`, `/refund-policy`, `/download` created; `/terms`, `/privacy` rewritten and moved
      into the `(marketing)` route group so they carry the site nav and footer (URLs unchanged).
- [x] ✅ **The contact form actually stores messages.** It used to compose a `mailto:` link, which
      is a dead end for anyone without a mail client configured — including a verifier working in a
      browser. Now `POST /api/contact` → `contact_messages` (migration 004), with validation, a
      honeypot, a per-IP-hash rate limit of 5/hour, and a reference number returned to the sender.
      Verified end to end against the live database.
- [x] ✅ **Price is no longer duplicated.** `next/src/lib/pricing.ts` is the single source for
      `PREMIUM_PRICE_IDR` / `PREMIUM_DAYS`; the pricing page, FAQ, refund policy, terms and the
      checkout all read it. A public page quoting a price the checkout disagrees with is a
      consumer-protection problem, so this must stay unduplicated.

## 🔴 LIVE SITE CANNOT TAKE PAYMENTS RIGHT NOW (found 2026-09-15)

The Vercel environment was switched to iPaymu, but **the iPaymu code was never deployed** — nothing
is committed; `HEAD` is still `2254841` and contains no `ipaymu` files. Verified against the live
site, not assumed. The result is a half-switched deployment:

- `MIDTRANS_SERVER_KEY` is now unset — `POST /api/payments/midtrans/webhook` answers **503
  `payments_not_configured`**, where it used to answer `invalid_signature`. The deployed checkout
  is Midtrans-only and calls `midtransConfig()` first, so **every upgrade attempt now fails**.
- `/api/payments/ipaymu/callback` does not exist there. Worse than missing: this deployment serves
  unmatched routes as **HTTP 200** with an HTML 404 body (`X-Matched-Path: /_not-found`), so iPaymu
  would read a delivered notification and **stop retrying** — silently dropping real payments.
- `/pricing` already quotes **Rp 35.000** (that figure comes from env, which the old code does
  read) while still promising *"Unlimited projects, surveys and photos"* and never mentioning 5 GB.
  The price moved; the claims it was supposed to move with did not.

- [ ] 🔴 **Deploy the branch.** Nothing else in this file matters until then. Until it
      ships, either roll `MIDTRANS_SERVER_KEY` back so checkout works again, or accept that
      upgrades are down.
- [ ] 🔴 **Do not register the iPaymu callback URL until the code is live.** Pointing it
      at a route that answers 200-with-a-404-page is the one configuration that loses payments
      without any error to notice.

## 💳 iPaymu gateway — built 2026-09-15, not yet proven against the live API

Checkout now runs on **iPaymu Redirect Payment**; Midtrans stays wired as the fallback and is
selected with `PAYMENT_PROVIDER`. Full setup steps, including the two traps below, are in
[`docs/PAYMENT-SETUP.md`](docs/PAYMENT-SETUP.md).

New files: `next/src/lib/ipaymu.ts` (API client + signatures), `next/src/lib/ipaymu-settle.ts`
(the one place that grants premium), `api/payments/ipaymu/callback` and `api/payments/ipaymu/sync`.

- [x] ✅ **Callback signature verified against the vendor's own reference implementation.** The
      documented recipe is PHP `ksort` + `json_encode`, while the vendor's JavaScript sample sorts
      with `localeCompare` — and the two genuinely disagree on a real payload, because it carries
      both `reference_id` and `referenceId`. Both orderings are accepted, plus PHP-style escaping
      of slashes and of non-ASCII. Checked against generated reference signatures: both sort
      orders accepted, tampered amount rejected, empty signature rejected.
- [x] ✅ **A callback is never treated as proof of payment.** iPaymu signs callbacks with the
      merchant **VA number**, which is not a secret — it is shown on the checkout page and echoed
      in the callback body as `merchant`. The signature is logged as a tamper signal only; the
      grant is decided by an API-key-authenticated `POST /api/v2/transaction`, and the transaction
      returned must carry this order's `ReferenceId` or `SessionId`, or one payment could buy two
      premium periods.
- [x] ✅ **Request signing is verified against the vendor's own SDK.** `signRequest` produces
      byte-identical output to `GenerateSignature` in `ipaymu-go-api/signature.go`, checked on the
      test vector in their `signature_test.go`, for both POST and GET. If iPaymu returns
      `401 unauthorized signature`, it is the credentials, not this code.
- [ ] 🔴 **You must register a sandbox account — it cannot be done from here.** Sandbox is a
      *separate account*, not a mode of the production one: sign up at <https://sandbox.ipaymu.com/>
      (no business verification, and the static-IP rule does not apply), then Integration → API Key,
      and paste the pair into `next/.env.local` — which is set up and waiting, with the two values
      deliberately left empty.
      **Do not retry the demo credentials from iPaymu's own sample repos** (VA `1179000899`):
      tested 2026-09-15 against `sandbox.ipaymu.com`, they answer `401 unauthorized signature`.
      They are dead, and chasing them looks exactly like a signing bug.
- [x] ✅ **There is a one-request way to check credentials**: `GET /api/payments/ipaymu/diagnose`
      (sign-in required, 404s when `IPAYMU_IS_PRODUCTION=true`). It creates a sandbox payment and
      returns the checkout URL, names the missing env var when unconfigured, and distinguishes a
      credential rejection from an IP-validation rejection. `?trx=<id>` looks up one transaction.
- [ ] **Then run one real end-to-end payment** on the deployed site — not localhost, where iPaymu
      cannot reach `notifyUrl` and only the `/sync` path gets exercised.
- [ ] 🔴 **Production requires a static IP + registered domain** (iPaymu "IP & Domain
      Validation"). **Vercel has neither.** A production call from a Vercel function can be
      rejected on that basis alone, with correct credentials. Settle this with iPaymu support
      before go-live — it is the single most likely reason this fails in production.
- [x] ✅ **Lost callbacks have a recovery path.** `POST /api/payments/ipaymu/sync` reconciles the
      signed-in user's pending payments against iPaymu; `/subscription` calls it automatically when
      the customer returns from checkout. Same checks, same grant function, so it cannot double-grant.
- [ ] **Register the callback URL** on the merchant account (sandbox and production are separate
      settings): `https://geofold.sayba.id/api/payments/ipaymu/callback`.
- [x] ✅ **[`docs/migration-007-ipaymu.sql`](docs/migration-007-ipaymu.sql) applied 2026-09-15** to
      `vdyuoqtoimtpienoqznc`, and verified after the fact: `payments."Provider"` now defaults to
      `ipaymu`, `"Method"` to `redirect`, `payments_provider_check` and `payments_pending_idx` both
      exist. The six Midtrans rows are untouched and still recorded as Midtrans, which is the point
      of the column.
- [x] ✅ **Checked while I was in there:** `subscriptions` does have a unique index on `UserId`
      (`IX_subscriptions_UserId`), so the `ON CONFLICT ("UserId")` in `grantPremiumDays` is sound.
      Worth having confirmed — no payment has ever settled, so that path has never actually run.
      Also: the old Supabase project is gone, only `vdyuoqtoimtpienoqznc` remains.
- [ ] 🔴 **Rotate the iPaymu API key.** The production VA and API key were shared as a
      screenshot in a chat transcript, so they must be considered exposed. Regenerate in the
      dashboard, then update Vercel and `next/.env.local`.

## 💾 Storage quota (5 GB) — new axis, 2026-09-15

Premium is now "every feature, unmetered counts, **5 GB** of stored photos". The ceiling is real:
`checkPhotoUpload` sums `survey_photos."SizeBytes"` and refuses an upload that would cross it,
counting the incoming photo before issuing the upload URL.

- [x] ✅ Enforced in [`next/src/lib/quota.ts`](next/src/lib/quota.ts), surfaced by
      `GET /api/subscriptions/me`, and shown as a meter on `/subscription`.
- [x] ✅ Every page that used to promise "unlimited photos" now says what is actually unlimited
      (the counts) and what is capped (the bytes) — pricing, FAQ and the home page.
- [ ] **Free plan has no byte cap**, deliberately: 3 projects × 20 photos cannot approach 5 GB, so
      a second limit there would be a number nobody reaches. Revisit if the free limits change.
- [ ] **`SizeBytes` is nullable and was not always recorded.** Rows written before the upload-complete
      step started storing the real object size count as 0 towards the quota. Worth a one-off
      backfill from the storage bucket if the numbers look low.

## ⚠️ Confirm these placeholder values (product decisions, not from any spec)

- [ ] **Daily caps** in [`next/src/lib/quota.ts`](next/src/lib/quota.ts): `FREE_DAILY_SURVEYS = 30`,
      `FREE_DAILY_PHOTOS = 60`. Guessed defaults — set to your real numbers.
- [x] ✅ **Price / duration / storage decided 2026-09-15**: `PREMIUM_PRICE_IDR = 35000`,
      `PREMIUM_DAYS = 30`, `PREMIUM_STORAGE_GB = 5`, defined in
      [`next/src/lib/pricing.ts`](next/src/lib/pricing.ts). Every public page reads them from there,
      so changing the env vars is enough — nothing needs keeping in sync by hand.
- [ ] 🔴 **Vercel still carries the old `PREMIUM_PRICE_IDR`.** Vercel's environment wins over the
      repo default for the deployed site, so until it is set to `35000` the live pages will quote
      whatever is there — it has been `1` for testing in the past. Add `PREMIUM_STORAGE_GB=5` too.
- [ ] **Free project rule** is implemented as: first 3 projects free, then +1 per 24h cooldown for
      the 4th onward. Confirm that matches intent.

## 🧹 Code cleanup found during audit

- [ ] **Retire or fix the generic webhook.**
      [`next/src/app/api/webhooks/[provider]/route.ts`](next/src/app/api/webhooks/[provider]/route.ts)
      predates the new model: it sets `Plan='premium'` but not `WorkspaceType`/`PremiumUntilUtc`, so
      under the new quota logic it would **not** actually grant premium. It's superseded by the
      Midtrans webhook + activation keys. Either delete it (and `WEBHOOKS_SHARED_SECRET`) or route it
      through `grantPremiumDays`. `WEBHOOKS_SHARED_SECRET` **is** set, so the route is live: it fails
      closed only when the secret is absent.
- [x] ✅ **Fixed 2026-09-07: mobile now collects the profile and terms consent.** The web gates the whole app shell behind
      `RequireProfile` → `/onboarding` (name, WhatsApp, domicile, gender, terms). The mobile app has
      had no equivalent, so a surveyor who signed up on the phone used the app with an empty profile
      and `AgreedTermsAtUtc` left null — a legal record captured on only one of two clients.
      `mobile/src/lib/profile.tsx` (gate + per-user cache so an offline cold start does not re-ask)
      and `mobile/src/app/onboarding.tsx` (the form) now mirror the web, writing the same
      `PUT /api/profile`. The navigator holds the app screens behind it. Unproven on a device.
- [x] ✅ **Fixed 2026-09-03: the map feed's premium gate never expired.**
      [`surveys/geojson/route.ts`](next/src/app/api/surveys/geojson/route.ts:12) was the last reader
      of the retired `Plan`/`Status` model and compared neither against `PremiumUntilUtc`. Since
      `grantPremiumDays` sets `Status='active'` and nothing ever sets it back, one payment or one
      activation key bought the survey map **permanently**. Now gated on `premiumActive()` like every
      other quota decision. Demonstrated against a lapsed row: old gate → access, new gate → denied.
- [x] ✅ **Fixed 2026-09-03: one bad row 500'd an entire sync batch.**
      [`sync/surveys/route.ts`](next/src/app/api/sync/surveys/route.ts:21) applied each survey
      "independently" but ran `upsertSurvey` unguarded — it returns rejections for what it validates
      and *throws* for what it does not (malformed uuid, unparseable date, null coordinate), so one
      such row aborted the whole request. Now each row is wrapped, and coordinates are range-checked
      up front the same way `POST /api/surveys` does.

## 📦 Repo / git housekeeping (see "Push status" below)

- [ ] ⚠️ **Push is blocked: the stored credential is the wrong GitHub account.** Fetch and pull
      work (public read), but `git push` to `MindlessSoul/GeoFold` returns
      *"Permission to MindlessSoul/GeoFold.git denied to **teklingweb-cell**"* (HTTP 403). Windows
      Credential Manager is holding a token for `teklingweb-cell`, while commits are authored as
      `MajesticP <gakaridase@gmail.com>`. Fix by either signing in as the account that owns the
      repo, or giving `teklingweb-cell` write access. To force a re-prompt:
      `cmdkey /delete:git:https://github.com` then push again.
      **Two commits are sitting locally, ready to push** (2026-09-07): the API fixes, and the
      compliance pages. Nothing else from this session is committed — mobile is deliberately left
      out of the web push.
- [ ] **Do not commit `env.zip`** (added to `.gitignore`). Rotate anything inside it if it was ever
      shared, and delete the file once its contents are safe elsewhere. It holds one `.env.local`
      (702 bytes, dated 2026-07-26) — identify which app's it is; see the mobile blocker above.
- [ ] **Commit the migration.** The working tree still holds the whole uncommitted `backend/`→
      `next/`+`mobile/` migration (see `NEXT-STEPS.md`). Decide commit scope before pushing.

## 🚁 Drone variant — blocked on you

- [ ] **Register a DJI App Key** at [developer.dji.com](https://developer.dji.com) for package
      `app.geofold.drone`, and set `DJI_APP_KEY` in the build environment. Nothing registers without
      it, it cannot be stubbed, and it must be present for **every gradle build**, not just
      `prebuild`. See [`mobile/DJI-SETUP.md`](mobile/DJI-SETUP.md).
- [ ] **Test on an aircraft.** The integration compiles against the real SDK and packages, but no
      DJI hardware was available — registration succeeding, a product connecting over USB, and R8
      surviving release are all unproven.
- [ ] **Decide the drone list.** "All DJI drones" is not possible: MSDK V5 (Android only) and V4 are
      separate SDKs with conflicting native libraries, and Mavic 3 consumer / Air 3 / Mini 4K / Neo /
      Avata are supported by neither. V5 is built; covering the V4 fleet means a second flavour.
- [ ] **Decide how aerial photos carry their coordinates.** The ground app will not save a survey
      unless the coordinates are burned into the JPEG — that stamp is the evidentiary model. A drone
      photo arrives already taken, so the drone path bypasses it. Stamp on the phone after download,
      rely on the drone's EXIF GPS, or accept unstamped aerial photos and say so in the export.
      Left open deliberately; it is a question about evidence, not code.
- [ ] **Wire real project selection** into drone capture — the screen currently hardcodes a
      `drone-test` project.
- [x] ✅ **Black video: root cause found 2026-09-04 — the test aircraft is a Mavic Mini, which
      MSDK V5 does not support.** It is a **V4** aircraft (see the matrix in `DJI-SETUP.md` §1).
      The SDK reports a product and answers the flight-controller keys, which is what made this
      look like a bug for so long, but it never reports a camera and never sends a frame. No change
      to the V5 build can produce video on this drone. Diagnosed via `Video: no frames` in every
      surface mode plus DJI's own status codes (`0x1F100059` = "Ready to GO" — the aircraft was
      healthy the whole time).
- [x] ✅ **V4 variant built (2026-09-04).** Third flavour, `app.geofold.drone.v4`, on
      `com.dji:dji-sdk:4.18` — covers the Mavic Mini and the older consumer fleet. Its own App Key
      is set (`DJI_APP_KEY_V4` in `mobile/.env.local`). Both SDK modules register as the Expo
      module `DjiMsdk` and emit identical events, so one JS surface and one Drone screen drive
      either; `prepare-variant.js` links exactly one and clears the other. See `DJI-SETUP.md` §5b.
- [x] ✅ **V4 crash on opening the Drone screen — fixed 2026-09-04.** MSDK V4's HTTP client is built
      on `org.apache.http`, removed from Android's bootclasspath at API 28, so `registerApp` died
      with `NoClassDefFoundError: org.apache.http.params.BasicHttpParams` on DJI's own thread pool —
      where no try/catch could contain it. Fixed by declaring
      `<uses-library android:name="org.apache.http.legacy" android:required="false" />`. Verified on
      the device over adb: app launches, stays up, `nativeloader` loads the legacy jar, zero fatal
      exceptions. Details in `DJI-SETUP.md` §5b.
- [x] ✅ **V4 registers on the device (2026-09-04).** Verified over adb on a Redmi 23108RN04Y,
      Android 14: app opens, `Registration: Registered`, native libraries load (`libdjivideo.so`,
      `libdjisqlcipher.so`, `libDJIUpgradeJNI.so`), `DJIUsbAccessoryReceiver` started, zero fatal
      exceptions. The V4 App Key for `app.geofold.drone.v4` is accepted. Remaining log noise is
      benign: `Failed to load LDM Plus license file …dlf` (Local Data Mode, unused) and
      `DJIComponentManager: Service Not Connected` (no aircraft attached).
- [ ] **Fly the V4 build.** Registration works and the HUD renders, but it **has never met an
      aircraft**. Expect on the Mini: `Aircraft status` = `MAVIC_MINI`, live telemetry, and a
      real resolution/fps on the **Video** chip — on V4 the H.264 passes through our own listener,
      so that number is a direct measurement rather than an inference.
- [ ] **The V5 path is still unproven too.** Stream enable, camera-index fallback, surface-mode
      switch, HMS diagnostics and the HUD are all written and building, but no V5-supported
      aircraft has ever been attached. Needs a Mini 3 / Mavic 3E / M30 to verify.
- [ ] **Fly the new Drone HUD.** The screen is now a full-screen feed with the minimap on the left,
      telemetry along the bottom and the controls on the right, locked to landscape for that screen
      only (`expo-screen-orientation`, added 2026-09-03 — so this needs a fresh `prebuild:drone`).
      Unproven on hardware: that the runtime landscape lock wins over the portrait `orientation` in
      `app.base.json` on Android, and that the minimap's `TextureView` really does composite above
      the camera's `SurfaceView`.
- [x] ✅ **Grid-driven waypoint missions built (2026-09-04).** `mobile/src/lib/mission.ts` plans a
      serpentine route from the grid (cell centres, photo at each, rows alternating); the Drone
      screen draws it on the minimap and can upload/start/stop it. **Planning works on any
      aircraft; flying does not** — DJI blocks waypoint missions on airframes without obstacle
      avoidance, the Mavic Mini included, and the refusal is surfaced in DJI's own words. Untested
      against hardware. See `DJI-SETUP.md` §5b.

## 🗺️ Mobile map — next up

- [ ] **Protected-area boundaries.** The grid measures coverage of whatever is in view; it cannot
      measure coverage of a *reserve*, because nothing defines one. Needs a polygon table on the
      server, `GET`/`POST`, and `ST_Intersects` — then the map can draw the boundary, clip the grid
      to it, and report progress against the protected block. Biggest single win for the
      wildlife-survey use case. See `NEXT-STEPS.md` §5.
- [ ] **Grid references in the export.** A surveyor writing cell references in a notebook wants them
      in the CSV too — add each survey's cell reference, and a per-cell coverage sheet.
- [ ] **Verify the grid on a real device.** It typechecks, lints, and the geodesy is verified
      numerically, but no build has been run on hardware yet — no Android device was attached.
      Worth confirming the cell labels actually render on both basemaps (a symbol layer with no
      glyph source draws nothing, silently) and that the grid stays smooth while panning.

## ✅ Done in the last sessions (for reference)

- Web map: draggable markers, edit-coordinates popup, ruler/measure, satellite/street basemap.
- `PATCH /api/surveys/[id]` to edit coordinates.
- Mobile: satellite basemap, hidden project card, manual coordinate entry.
- Gallery per-project/folder filter.
- `/reset` restyled to brand; pricing page on the free/premium model.
- New subscription/quota model end-to-end (see the Blocking section for go-live steps).
- **Mobile map fixes (2026-08-29).** Tap-to-pick never fired — `lngLat` is a `[lng, lat]` tuple, not
  `{lng, lat}`, so every tap was silently discarded. The camera re-flew on every re-render because
  `center` was a fresh array. `NaN` coordinates could reach the native renderer past a `null` check.
  The ruler button sat under the capture FAB, unpressable. Markers swallowed taps meant for the
  ruler. Plus an error boundary around the map. Traps written up in `NEXT-STEPS.md` §2.
- **Survey grid (2026-08-29).** UTM quadrat overlay with coverage shading, per-cell reference and
  survey count, 50 m–1 km cells. `mobile/src/lib/grid.ts`; the why and the verification method are
  in `NEXT-STEPS.md` §1.
- **Custom grid origin (2026-08-29).** "Set origin" anchors the grid to a tapped corner and names
  cells A1/B2/C3 from there; ground outside the plot is greyed and left out of the coverage count.
- **Draggable origin + snap to a survey point (2026-08-29).** The origin handle can be dragged to
  move the whole grid, and tapping a survey pin while placing snaps the grid to that survey's
  recorded coordinates.
- **Map controls reworked (2026-08-29).** Four stacked floating containers became one grid card
  plus a single bottom row; tool buttons no longer collide with each other, and the status readout
  is one line instead of a panel wide enough to reach the sync button.
- **Auto cell size (2026-08-29).** The grid subdivides with the zoom by default — 2.5 km cells at
  z10 down to 1 m at z21 — with manual 10 m–1 km overrides still available.
- **Satellite "no map data" fix (2026-08-29).** The Esri source was capped at z19, but rural
  Kalimantan only carries imagery to z18, and past its coverage Esri returns a *placeholder JPEG*
  under HTTP 200 rather than an error. Capped at z18 so MapLibre upscales instead. See
  `NEXT-STEPS.md` §2.
- **Equator fix (2026-08-29).** `toUtm` was applying UTM's 10 000 km southern false northing per
  point rather than per grid, which would have torn any grid straddling latitude zero in half —
  including at the app's own default view in Kalimantan. Hemisphere is now pinned per grid.
  Verified on a viewport deliberately straddling the equator: rows contiguous across it, worst cell
  edge 1.2 mm off 100.04 m.

---

## Later / roadmap

See [`NEXT-STEPS.md`](NEXT-STEPS.md) for the full backlog (Google login is now partly wired,
persist demo state, multiple photos per survey, background sync, tests, etc.).

---

> **⚠️ Recovery note — 2026-09-15.** This file was accidentally truncated to zero bytes during an
> automated edit and has been restored from a capture taken on 2026-09-07.
>
> Everything up to and including the **“Protected-area boundaries”** bullet is verified
> byte-for-byte against the original, checked at six independent points. From the **“Grid
> references in the export”** bullet onwards, the text came from a slightly older revision — the
> only full capture of the newest version stopped mid-line exactly there, so roughly 700 bytes of
> that tail may be missing or out of date.
>
> (The iPaymu, storage-quota, address and pricing sections were written after the restore and are
> current.) Compare the tail against your own copy, then delete this note.
