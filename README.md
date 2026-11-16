# GeoFold

**Field survey data collection for surveyors who work where the signal doesn't.**

GeoFold turns a phone into a survey instrument: take a geotagged photo at a point, fill in the
project's custom form, save. Everything is written to the device first and syncs on its own when
a connection comes back — the surveyor never waits on the network, and never loses a point.

Back in the office the same data is a map, a searchable record list, and a CSV/Excel export with
the photos embedded. A drone variant extends the same loop to the air.

---

## Table of contents

- [What it does](#what-it-does)
- [How a capture flows through the system](#how-a-capture-flows-through-the-system)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Data model](#data-model)
- [API surface](#api-surface)
- [Custom form schemas](#custom-form-schemas)
- [Plans and quotas](#plans-and-quotas)
- [Running locally](#running-locally)
- [Deployment](#deployment)
- [Security notes](#security-notes)

---

## What it does

### Capture (the core loop)

| | |
|---|---|
| **Geotagged photo** | Camera capture with a high-accuracy GPS fix taken at the same moment. |
| **Coordinates burned into the image** | Latitude, longitude and the capture timestamp are drawn onto the photo itself, so the evidence survives being copied out of the app. The image is also downscaled to a 1600 px longest edge and re-encoded to keep uploads small. |
| **Accuracy recorded** | The GPS accuracy radius (±m) is stored with the point, so bad fixes are visible later instead of silently trusted. |
| **Project form** | Each project defines its own fields (text / number / integer / boolean / date / select). The capture screen renders them dynamically. |
| **Free-text note** | A `catatan` note field is always available on top of the project schema. |
| **Offline-first** | The survey lands in a local outbox immediately. Sync happens in the background; the screen returns to "capture another" straight away. |
| **Drone capture** | A second mobile build carries the DJI Mobile SDK. An aerial photo lands in the *same* outbox as a ground survey — same row on the wire, same three-step handshake. A flight-plan planner turns the survey grid into a boustrophedon mission the aircraft can fly. |

### Review and output

- **Map** — every synced point plotted, with bounding-box and per-project filtering server-side.
- **Records** — a list of every survey with its photos, submitted field values, and a stable
  human-readable reference (`KAMPUNG-DURIAN-001`) instead of a UUID.
- **Projects** — create, edit, archive; each carries its own form schema and survey count.
- **Export** — CSV, or an `.xlsx` written by hand (no dependency) that **embeds the photos into
  the spreadsheet rows**.
- **GIS export** — GeoJSON, KML, or a zipped point shapefile (`next/src/lib/geo-export.ts`), all
  WGS 84 with ArcGIS-safe field names. The shapefile zip uploads to ArcGIS Online as is.
- **Auth** — Supabase email/password, with email confirmation links and password reset.

---

## How a capture flows through the system

```
  [ Field device ]                            [ Next.js API (Vercel) ]        [ Supabase ]
                                                                              Postgres + PostGIS

  photo + GPS fix
        │
        ▼
  watermark + downscale + compress (≤ 1 MB)
        │
        ▼
  ┌───────────────┐   offline-safe
  │ local outbox  │   (IndexedDB on web / AsyncStorage on mobile)
  └───────┬───────┘
          │ background sync, when online
          ▼
   POST /api/surveys ─────────────────────────► validate form data
                                                check quota            ──► Postgres + PostGIS
                                                insert survey              (geography point)
          │
          ▼
   POST /api/surveys/:id/photos/initiate ─────► reserve survey_photos row
                                                return a VPS upload URL
          │
          │ PUT the image straight to the VPS storage endpoint
          ▼
   PUT api.geofold.sayba.id/api/storage/raw ──► [ VPS backend (Express) ]
   ?path=<userId>/<surveyId>/<photoId>            sharp → WebP (q82)
                                                  write to /app/storage/pictures/
          │
          ▼
   POST /api/surveys/:id/photos/:pid/complete ► HEAD the VPS object to verify
                                                mark uploaded
          │
          ▼
    remove from outbox
```

Three properties are worth calling out:

1. **The survey id is generated on the device** (`crypto.randomUUID()`), and the server upsert is
   idempotent — last write wins, and quota is only charged the first time. A retry after a flaky
   connection can never create a duplicate point.
2. **Photo bytes go to the VPS, not through the Next.js app server.** The Next.js API only returns
   the target path; the device uploads directly to the VPS storage endpoint, which transcodes to
   WebP on the fly. Downloads come back as PNG (converted on request) or native WebP for the
   map/gallery.
3. **Survey metadata and photo bytes live in different places.** The `survey_photos` row (path,
   size, status) sits in Supabase Postgres; the actual WebP bytes sit on the VPS NVMe disk. The
   Next.js API is what joins them.

---

## Architecture

GeoFold is **three tiers**: a Next.js fullstack app on Vercel, an Express backend on a
self-managed VPS, and one Supabase project.

```
                         ┌────────────────────────────┐
                         │  Supabase                  │
                         │  · Postgres + PostGIS      │  Auth (JWT), survey data,
                         │  · Auth (JWT)              │  project/form schemas, quotas
                         └──────────────┬─────────────┘
                                        │
              ┌─────────────────────────┴──────────────────────────┐
              │                                                    │
         next/  (Next.js 16, App Router)              VPS backend  (Express 4, Node 20)
         web UI + API routes in one app               · WebP photo storage (sharp)
         → deployed to Vercel                          · iPaymu live payment egress
         geofold.sayba.id                              · local Postgres 16 (tiers, txns)
                                                        → Docker + Caddy
                                                        api.geofold.sayba.id
                                        ▲
                              same API, Bearer token
                                        │
                         mobile/  (Expo SDK 57, React Native)
                         the field client — standard + drone variants
```

| Piece | Stack | Lives at |
|---|---|---|
| `next/` | Next.js 16 (App Router), React 19, TypeScript, `postgres` (porsager) for direct SQL, Leaflet + react-leaflet, lucide-react, GSAP. **The web app and the survey/project API.** | Vercel → `geofold.sayba.id` |
| VPS backend | Express 4, Node 20-alpine, `pg`, `sharp`, `multer`, `axios`, `cors`. **Photo storage (WebP), iPaymu live egress, picture gallery, tier info.** Behind Caddy (auto-HTTPS) with a local Postgres 16. | Docker on VPS → `api.geofold.sayba.id` |
| `mobile/` | React Native via Expo (SDK 57), expo-router, TypeScript. The field client — capture, offline outbox, gallery, MapLibre map. Two build variants: standard and drone (DJI MSDK). Talks to the `next/` API; photos go to the VPS. | APK / EAS |
| Auth | Supabase Auth. The server accepts either the browser's cookie session or an `Authorization: Bearer ***` header. | Supabase |
| Survey DB | Supabase Postgres with **PostGIS** — points are `geography(point, 4326)`, written with `ST_MakePoint(lng, lat)` and read back with `ST_X`/`ST_Y`. | Supabase |
| Photo storage | VPS NVMe disk under `/app/storage/pictures/`. Uploaded bytes are transcoded to WebP (q82) by `sharp`; served as WebP or converted to PNG on download. Bounded by account quota (Free 20 MB / Pro 500 MB). | VPS |
| Payments | iPaymu (primary, live on VPS) or Midtrans (optional). The VPS backend proxies iPaymu API calls so the static egress IP can be whitelisted by the merchant account. | VPS + Next.js |

### Notable implementation choices

- **No ORM in the Next app.** API routes issue tagged-template SQL directly. It keeps the PostGIS
  calls honest and the query count visible.
- **The `.xlsx` writer is hand-rolled** (`next/src/lib/export.ts`): a STORED-method ZIP assembled
  byte by byte, with a DrawingML part so photos anchor into cells. Zero dependencies.
- **Demo mode.** If `NEXT_PUBLIC_SUPABASE_ANON_KEY` is absent or a placeholder, the whole app runs
  on sample data with no server at all — useful for design work and for showing the product.
- **The mobile map avoids Google.** MapLibre over OpenFreeMap tiles: no API key, no Google Cloud
  account, no billing. The Android Google Maps SDK would have required all three.
- **Photos are WebP on disk.** The VPS transcodes every upload to WebP at q82 — roughly half the
  size of the source JPEG for the same visible detail, which matters when storage is the binding
  cost. Downloads convert back to PNG on the fly so exports stay portable.
- **The drone build is the same app, not a parallel one.** `lib/drone-survey.ts` lands an aerial
  photo in the *same* outbox and sync queue as a ground survey, because an aerial survey is the
  same row on the wire. Only the native capture (`@dji`) differs; the drone build carries the DJI
  MSDK plugin, and the standard build throws if you reach for it.

---

## Repository layout

```
GeoFold/
├── next/                       # ★ the web app AND the survey/project API
│   ├── src/app/(app)/          #   authenticated screens: home, capture, surveys, projects, map
│   ├── src/app/(marketing)/    #   public site: landing, pricing, contact, legal, download
│   ├── src/app/api/            #   route handlers — projects, surveys, photos, sync, payments, health
│   ├── src/lib/                #   db, auth, quota, validation, outbox, sync, export, storage (VPS), ipaymu, midtrans
│   └── DEPLOY.md               #   Vercel deployment runbook
│
├── mobile/                     # React Native (Expo) field client
│   ├── src/app/                #   expo-router: welcome, signin, tabs, capture, sync, drone, details
│   ├── src/lib/                #   api, auth, outbox, sync, capture, photo, drone-survey, mission, grid, billing
│   ├── plugins/                #   with-dji-msdk.js, with-dji-v4.js (drone build only)
│   └── README.md               #   setup, dev builds, APK build, offline behaviour
│
├── docs/
│   ├── schema.sql              #   ★ canonical Supabase database schema (PostGIS)
│   ├── rls.sql                 #   row-level security policies
│   ├── migration-002…007.sql   #   subscriptions, profiles, contact, superadmin, storage bucket, iPaymu
│   ├── PAYMENT-SETUP.md        #   iPaymu / Midtrans configuration
│   └── WORKFLOW.md             #   end-to-end workflow notes
│
├── NEXT-STEPS.md               # handoff: roadmap, auth options, DB options, known traps
└── TODO.md                     # open work items
```

> The VPS backend lives in `vps/` in this repo (`vps/backend/`, `vps/Caddyfile`,
> `vps/docker-compose.yml`, `vps/scripts/deploy.sh`) and is deployed to `/home/deploy/app/` on the
> server via `vps/scripts/deploy.sh`. See [Deployment](#deployment).

---

## Data model

### Supabase (survey data — PostGIS)

```
profiles ──1:N── projects ──1:N── surveys ──1:N── survey_photos
    │
    └──1:1── subscriptions
```

| Table | Key columns |
|---|---|
| `profiles` | `Id` (uuid, = Supabase auth uid), `DisplayName`, `Role`, `CreatedAtUtc` |
| `projects` | `Id`, `UserId`, `Name`, `Description`, `FormSchema` (jsonb), `CreatedAtUtc`, `ArchivedAtUtc` |
| `surveys` | `Id` (client-generated), `ProjectId`, `UserId`, `Location` (geography point), `AccuracyMeters`, `CapturedAtUtc`, `SyncedAtUtc`, `Details` (jsonb), `Status` |
| `survey_photos` | `Id`, `SurveyId`, `StoragePath`, `Location`, `CapturedAtUtc`, `SizeBytes`, `UploadStatus` |
| `subscriptions` | `UserId`, `Plan`, `Status`, `CurrentPeriodEndUtc`, plus optional per-user limit overrides |

Deletes are restricted rather than cascading — survey data is evidence, and the schema refuses to
let a project deletion quietly take points with it.

The canonical schema is [`docs/schema.sql`](docs/schema.sql) — run it against a fresh
Supabase/Postgres database. It enables PostGIS first, because the `geography(Point, 4326)` columns
cannot be created without it.

> Identifiers are quoted PascalCase (`"Id"`, `"FormSchema"`) because that is what every query in
> `next/src/lib/` expects. Renaming them to snake_case means rewriting those queries.

### VPS local Postgres (backend concerns)

The VPS runs its **own** Postgres 16 (`app-db-1`), separate from Supabase, for the state the
Express backend tracks locally. It has **no PostGIS**.

| Table | Key columns |
|---|---|
| `users` | `id` (serial), `supabase_id` (uuid, unique — the join to Supabase Auth), `email`, `name`, `tier` (`free`/`pro`), `pro_expires_at`, `created_at` |
| `pictures` | `id`, `user_id` (→ `users.id`), `filename`, `original_name`, `mime_type`, `size_bytes`, `created_at` |
| `transactions` | payment records (iPaymu / Midtrans settlement) |
| `api_logs` | backend API request log |

`users.supabase_id` is the bridge: the VPS verifies the Supabase JWT, looks up the matching
`users` row, and reads `tier` / `pro_expires_at` to gate Pro features.

---

## API surface

Every data route requires a valid Supabase token and is scoped to the calling user — a survey or
project id alone is never sufficient to read or write a row. The only public routes are the ones
that must be reachable without a session: health checks, the iPaymu / Midtrans webhooks (verified
by signature, not by token), and the contact form. `GET /api/payment/logs` (VPS) was public when it
first shipped and is now admin-only (valid Supabase token, request/response bodies redacted). Both
the web UI and the mobile app consume the same routes.

### Next.js API (Vercel — `geofold.sayba.id`)

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/projects` | Active projects with survey counts |
| `POST` | `/api/projects` | Create (validates form schema, checks project quota) |
| `GET PUT` | `/api/projects/:id` | Read / update |
| `POST` | `/api/projects/:id/archive` · `/unarchive` | Soft archive |
| `GET` | `/api/surveys` | Paged list, optional `projectId` filter |
| `POST` | `/api/surveys` | **Idempotent upsert** by client-supplied id |
| `GET` | `/api/surveys/:id` | One survey with its photos |
| `GET` | `/api/surveys/geojson` | FeatureCollection for the map — `projectId`, bbox, `limit` |
| `POST` | `/api/surveys/:id/photos/initiate` | Reserve a `survey_photos` row, return a VPS upload URL |
| `POST` | `/api/surveys/:id/photos/:photoId/complete` | Verify the VPS object exists, mark uploaded |
| `GET` | `/api/surveys/:id/photos/:photoId/url` | Short-lived VPS download/view URL |
| `POST` | `/api/sync/surveys` | Batch upsert for bulk reconciliation |
| `GET` | `/api/subscriptions/me` | Plan, status, limits and current usage |
| `POST` | `/api/subscriptions/redeem` | Redeem an activation key |
| `POST` | `/api/subscriptions/verify-android` | Verify a Google Play IAP purchase |
| `POST` | `/api/payments/checkout` | Start an iPaymu / Midtrans checkout |
| `POST` | `/api/payments/ipaymu/callback` | iPaymu notify webhook (sandbox / dev) |
| `POST` | `/api/payments/midtrans/webhook` | Midtrans webhook |
| `POST` | `/api/contact` | Contact form submission |
| `GET` | `/api/profile` | Current user profile |
| `GET` | `/api/health` | Liveness — also used to warm a cold-started server |

### VPS backend API (`api.geofold.sayba.id`)

| Method | Route | Purpose |
|---|---|---|
| `PUT` | `/api/storage/raw?path=…` | Upload raw image bytes → transcoded to WebP on disk (≤ 3 MB) |
| `HEAD` | `/api/storage/raw?path=…` | Verify an object exists and get its stored size |
| `GET` | `/api/storage/info?path=…` | Object metadata (exists, sizeBytes) |
| `GET` | `/api/storage/download?path=…` | Download as PNG (converted from WebP on the fly) |
| `GET` | `/api/storage/view?path=…` | Stream native WebP (for map / gallery) |
| `POST` | `/api/pictures/upload` | Upload a picture (multipart, via `multer`) |
| `GET` | `/api/pictures` | List the calling user's pictures |
| `GET` | `/api/pictures/download/:filename` | Download a picture |
| `GET` | `/api/pictures/view/:filename` | View a picture |
| `DELETE` | `/api/pictures/:id` | Delete a picture |
| `POST` | `/api/payment/proxy` | Proxy an iPaymu API call (static-IP egress) |
| `POST` | `/api/payment/create` | Create an iPaymu payment session |
| `POST` | `/api/payment/notify` | iPaymu live notify webhook (production) |
| `GET` | `/api/payment/logs` | Payment API log |
| `GET` | `/api/user/me` | Authenticated user's VPS profile (tier, Pro status) |
| `GET` | `/api/feature/pro-tool` | Pro-gated feature example |
| `GET` | `/health` | Backend liveness |

**Photo constraints:** JPEG / PNG / WebP, 1 byte – 20 MB (survey photos) / 3 MB (raw VPS storage).
The client-supplied filename is deliberately ignored; the storage path is built from ids the
server controls, so a crafted name cannot escape the user's folder.

---

## Custom form schemas

A project's `formSchema` is a JSON array. The capture screen renders it, and the server validates
submissions against it.

```json
[
  { "key": "kondisi",  "label": "Kondisi lokasi", "type": "select",  "required": true },
  { "key": "tinggi",   "label": "Tinggi (m)",     "type": "number" },
  { "key": "jumlah",   "label": "Jumlah titik",   "type": "integer" },
  { "key": "berbahaya","label": "Area berbahaya", "type": "boolean" },
  { "key": "tanggal",  "label": "Tanggal survei", "type": "date" }
]
```

Supported types: `text` / `string`, `number`, `integer`, `boolean` / `bool`, `date`, `select`.
Keys must be unique and non-empty. Validation runs on both create and update, and a survey whose
`Details` don't match its project's schema is rejected with a per-field error list.

---

## Plans and quotas

| | Free | Premium |
|---|---|---|
| Projects | 3, plus 1 more every 24h | unlimited |
| Photos / project | 20 | unlimited |
| Storage | 20 MB | 500 MB |
| Daily caps (surveys captured, photos uploaded) | ✔ | — |
| Map view | — | ✔ |

Limits are enforced on every write from live counts and per-day counters, so they can't drift.
Exceeding one returns `403 { "error": "quota_exceeded", "message": … }`, which the clients surface
as a plain-language prompt rather than a failure.

Premium is unlimited on every axis while `pro_expires_at` (VPS) / `CurrentPeriodEndUtc` (Supabase)
is in the future. When Premium lapses while a workspace is over the free limits it is **frozen**:
reads and exports keep working, but new writes are blocked until it is renewed or back under the
free ceiling.

Premium is granted by an **activation key** (`POST /api/subscriptions/redeem`), a settled **iPaymu**
payment (primary; live egress via the VPS), a **Google Play in-app purchase** verified server-side
(`POST /api/subscriptions/verify-android`), or a **Midtrans** settlement (optional alternative
gateway). See [`docs/PAYMENT-SETUP.md`](docs/PAYMENT-SETUP.md) and
`docs/migration-002-subscription.sql`.

---

## Running locally

### The Next.js app (the one you probably want)

```bash
cd next
npm install
cp .env.example .env.local   # fill in, or leave the anon key as a placeholder for demo mode
npm run dev
```

Open <http://localhost:3000>.

With no real Supabase key configured the app starts in **demo mode**: sample projects, sample
survey points, simulated sync. Nothing touches a database.

Environment variables (see `next/.env.example`):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public — a real key turns demo mode **off** |
| `SUPABASE_SERVICE_ROLE_KEY` | server only — bypasses row-level security |
| `SUPABASE_JWT_SECRET` | legacy HS256 secret — see below |
| `SUPABASE_STORAGE_BUCKET` | `survey-photos` (legacy; active photo storage is the VPS) |
| `VPS_STORAGE_URL` | `https://api.geofold.sayba.id` — where `lib/storage.ts` sends photo bytes |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | Supabase pooler; port `6543` on serverless |
| `PAYMENT_PROVIDER` | `ipaymu` or `midtrans`; checkout requires an explicit choice |
| `IPAYMU_VA` `IPAYMU_API_KEY` | server-only iPaymu credentials; see `docs/PAYMENT-SETUP.md` |
| `IPAYMU_IS_PRODUCTION` `IPAYMU_LIVE_CHECKOUT_ENABLED` | both must be deliberately enabled only after Production IP/domain approval |
| `MIDTRANS_SERVER_KEY` `MIDTRANS_IS_PRODUCTION` | optional alternative gateway |
| `PREMIUM_PRICE_IDR` `PREMIUM_DAYS` `PREMIUM_STORAGE_GB` | plan parameters quoted on every public page |

Discrete `DB_*` variables are used instead of a connection URL so the password never has to be
URL-encoded, and `prepare: false` keeps the driver safe behind Supabase's transaction pooler.

#### Which JWT mode is this project on?

Supabase signs access tokens either with a **legacy HS256 shared secret** or with **asymmetric keys
published as JWKS**. It matters because `SUPABASE_JWT_SECRET` is only meaningful in the first case.
The JWKS document is public, so you can just look:

```bash
curl -s https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
```

- **Returns keys** (`"alg":"ES256"` or `"RS256"`) → asymmetric. **Leave `SUPABASE_JWT_SECRET`
  unset.** Rotation is picked up automatically. This is what Supabase recommends.
- **Returns `{"keys":[]}` or nothing** → legacy HS256. Set `SUPABASE_JWT_SECRET` to the secret from
  Project Settings → API.

Set it to a real secret or leave it absent — never blank. A blank value builds a zero-length key
and makes every authenticated request fail. `getUserId()` in `next/src/lib/auth.ts` tries HS256
first when a secret is present, then falls back to JWKS, so a project that has since rotated to
asymmetric keys keeps working.

### The mobile app

```bash
cd mobile
npm install
cp .env.example .env.local   # EXPO_PUBLIC_API_BASE_URL, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo run:android
```

Native modules mean it needs a development build rather than Expo Go. With no Supabase key
configured it starts in demo mode, same as the web app. The drone variant needs the DJI App Key in
`mobile/.env.local` (`DJI_APP_KEY` / `DJI_APP_KEY_V4`) and is built with the `with-dji-msdk` /
`with-dji-v4` config plugin. Details in [`mobile/README.md`](mobile/README.md).

### A fresh database

```bash
psql "$DATABASE_URL" -f docs/schema.sql
```

Or paste [`docs/schema.sql`](docs/schema.sql) into the Supabase SQL editor.

---

## Deployment

The system runs across **three hosts**.

### 1. Next.js → Vercel

Root directory `next`. Full runbook in [`next/DEPLOY.md`](next/DEPLOY.md).
Note Vercel's Hobby tier is non-commercial per their ToS.

Serves `geofold.sayba.id` — the web UI, the marketing site, and all survey/project/subscription
API routes. Connects to Supabase Postgres (transaction pooler, port 6543) and handles photo
metadata while delegating byte storage to the VPS.

### 2. VPS backend → Docker + Caddy

Host `vps.geofold.sayba.id` (Ubuntu 24.04). Serves `api.geofold.sayba.id`.

Stack (under `/home/deploy/app/`):

```
Caddy (80/443, auto-HTTPS)  ──reverse_proxy──►  backend:3000 (Node 20-alpine, Express)
                                                      │
                           app-db-1 (postgres:16-alpine, 127.0.0.1:5432)
                                                      │
                           /app/storage/pictures/  (WebP on NVMe)
```

`docker-compose.yml` defines three services — `backend`, `db`, `caddy` — with named volumes for
Postgres data, Caddy data/config, and bind mounts for `./backend/src` and `./storage`. The
`Caddyfile` is a single reverse-proxy block for `api.geofold.sayba.id` → `backend:3000`.

Backend env (`backend/.env`): `DB_*` (local Postgres), `FRONTEND_URL`, `BACKEND_URL`,
`IPAYMU_*` (production), `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

Deploy steps (run on the VPS, not from your laptop):

```bash
# The deploy SSH key is pinned to run only deploy.sh (authorized_keys
# command="/home/deploy/deploy.sh",restrict), so this is the whole deploy:
ssh deploy@202.155.16.213            # triggers deploy.sh, deploys main
# To deploy a specific commit, set COMMIT_REF before the forced command:
#   ssh -o SetEnv=COMMIT_REF=<sha> deploy@202.155.16.213
```

`deploy.sh` pulls the `vps/` subtree from GitHub, syntax-checks every JS file, runs an isolated boot
test, then hot-copies the source and recreates only the `backend` service. It rolls back the source
tree automatically if the post-deploy health check fails. The old `ssh root@<vps-ip>` path in this
README was removed — root SSH is key-only and the deploy key is restricted to `deploy.sh`.

### 3. Supabase (managed)

Project ref `vdyuoqtoimtpienoqznc`. Provides Auth (JWT, JWKS) and Postgres + PostGIS (the
canonical survey schema from `docs/schema.sql`), with RLS policies in `docs/rls.sql`. The legacy
`survey-photos` Storage bucket exists in the migrations, but **active photo storage is the VPS** —
`next/src/lib/storage.ts` routes all upload/download/view calls to `api.geofold.sayba.id`.

### Mobile → APK / EAS

See [`mobile/README.md`](mobile/README.md). Build locally with JDK 17 (not Android Studio's
bundled JDK 25 — it breaks the native build), or through EAS with the profiles in
`mobile/eas.json` (`development` / `preview` → APK, `production` → AAB).

Photo upload end-to-end needs PostGIS enabled on the Supabase project **and** the VPS storage
endpoint reachable from the client.

---

## Security notes

- `service_role` is server-only. It bypasses row-level security and must never reach a client.
  Clients use the anon/publishable key.
- Every Next.js query filters on the authenticated `UserId`; a survey id alone is never sufficient
  to read or write a row.
- Storage paths are server-constructed (`<userId>/<surveyId>/<photoId>`) and the VPS
  `getTargetPath` normalises the path and strips traversal segments — a crafted name cannot escape
  the user's folder.
- Photo size is verified against the actual stored WebP object (via `HEAD /api/storage/raw`), not
  just the client's claim, before it counts against the storage quota.
- The VPS storage path is built from UUIDs the Next.js API controls, so it is not guessable; the
  upload endpoint writes only to the path it is given.
- Rotate `SUPABASE_JWT_SECRET` before going live if it has ever been shared.
- iPaymu live charging requires `IPAYMU_IS_PRODUCTION=true` **and**
  `IPAYMU_LIVE_CHECKOUT_ENABLED=true`, plus a registered static egress IP and domain on the
  merchant account — the VPS provides the static IP that iPaymu validates against.
