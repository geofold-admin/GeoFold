# Deploying GeoFold (Next.js → Vercel)

The app is a single Next.js fullstack app in `next/`. It talks to the existing
Supabase project (Postgres + PostGIS, Storage, Auth). Recommended host: **Vercel**.

## 0. Prerequisites (one-time, on Supabase)

These already exist on the current project, so you only need to redo them if you
point at a **fresh** Supabase project:

- [ ] Run [`../docs/schema.sql`](../docs/schema.sql) — it enables PostGIS and pgcrypto
      and creates `profiles`, `projects`, `surveys`, `survey_photos`, `subscriptions`
- [ ] Private Storage bucket named `survey-photos` (the SQL file cannot create this)

## 1. Rotate the JWT secret first

`SUPABASE_JWT_SECRET` was pasted in chat during development. Before going live:
Supabase → Project Settings → API → **rotate/legacy JWT secret**, then use the new
value everywhere.

## 2. Push to GitHub

```bash
git push origin main
```

## 3. Import to Vercel

1. vercel.com → **Add New → Project** → import the repo.
2. **Root Directory: `next`** (important — the app is in the subfolder).
3. Framework preset: Next.js (auto). Build command / output: defaults.

## 4. Set environment variables (Vercel → Settings → Environment Variables)

Add core application variables for **Production** and Preview if needed. Keep production payment
secrets scoped to **Production only**: a preview deployment must never create a real charge.
See `.env.example` for the shape. Do **not** prefix secrets with `NEXT_PUBLIC_`.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public — a **real** key turns demo mode OFF |
| `SUPABASE_SERVICE_ROLE_KEY` | secret |
| `SUPABASE_JWT_SECRET` | secret (the rotated one) |
| `SUPABASE_STORAGE_BUCKET` | `survey-photos` |
| `DB_HOST` | Supabase **transaction pooler** host |
| `DB_PORT` | `6543` (serverless pooler) |
| `DB_NAME` | `postgres` |
| `DB_USER` | `postgres.<project-ref>` |
| `DB_PASSWORD` | secret |
| `PAYMENT_PROVIDER` | `ipaymu` (explicit — no automatic gateway fallback) |
| `IPAYMU_VA` | secret — from **my.ipaymu.com** → Integration → API Key |
| `IPAYMU_API_KEY` | secret — from the same Production account |
| `IPAYMU_IS_PRODUCTION` | `true` only after iPaymu approves IP + domain |
| `IPAYMU_LIVE_CHECKOUT_ENABLED` | `true` only after the first three iPaymu values are verified live |
| `IPAYMU_FEE_DIRECTION` | `MERCHANT` — buyer is charged exactly the advertised price |
| `IPAYMU_EXPIRY_HOURS` | `24` |
| `IPAYMU_TIMEOUT_MS` | `15000` |
| `MIDTRANS_SERVER_KEY` | only when `PAYMENT_PROVIDER=midtrans` |
| `MIDTRANS_IS_PRODUCTION` | only when `PAYMENT_PROVIDER=midtrans`; `false` = sandbox |
| `PREMIUM_PRICE_IDR` | whole rupiah per premium period (default `35000`) |
| `PREMIUM_DAYS` | days of premium per payment/key (default `30`) |
| `PREMIUM_STORAGE_GB` | `5` |

Run `docs/migration-002-subscription.sql` against the database before deploying this build — the
quota, activation-key, and payment code all read tables it creates.

For iPaymu Production, set the callback URL to
`https://geofold.sayba.id/api/payments/ipaymu/callback` and register the exact `https` domain in
iPaymu. iPaymu also requires a static outbound IP. Vercel Hobby has dynamic function egress, so
use Vercel Pro Static IPs or a separately hosted static-IP payment relay before setting
`IPAYMU_LIVE_CHECKOUT_ENABLED=true`. The obsolete generic `/api/webhooks/[provider]` endpoint is
retired and cannot grant Premium.

## 5. Deploy & verify

- Deploy. Open the URL → you should land on the real **login** (not demo).
- Sign in with a Supabase user, create a project, capture a point, check `/map` and
  `/surveys` (export CSV/Excel).
- If writes fail: check `DB_*` (pooler host/port) and that PostGIS + bucket exist.

## Commercial note

Vercel's Hobby (free) tier is non-commercial per their ToS. To sell access you need
**Vercel Pro** (~$20/mo), or an alternative host (Cloudflare via OpenNext, Netlify, or a VPS).
