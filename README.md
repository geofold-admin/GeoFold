# GeoFold

**Field survey data collection for surveyors who work where the signal doesn't.**

GeoFold turns a phone into a survey instrument: take a geotagged photo at a point, fill in the
project's custom form, save. Everything is written to the device first and syncs on its own when
a connection comes back — the surveyor never waits on the network, and never loses a point.

Back in the office the same data is a map, a searchable record list, and a CSV/Excel export with
the photos embedded.

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
| **Coordinates burned into the image** | Latitude, longitude and the capture timestamp are drawn onto the photo itself, so the evidence survives being copied out of the app. The image is also downscaled to a 1600 px longest edge and re-encoded as JPEG to keep uploads small. |
| **Accuracy recorded** | The GPS accuracy radius (±m) is stored with the point, so bad fixes are visible later instead of silently trusted. |
| **Project form** | Each project defines its own fields (text / number / integer / boolean / date / select). The capture screen renders them dynamically. |
| **Free-text note** | A `catatan` note field is always available on top of the project schema. |
| **Offline-first** | The survey lands in a local outbox immediately. Sync happens in the background; the screen returns to "capture another" straight away. |

### Review and output

- **Map** — every synced point plotted, with bounding-box and per-project filtering server-side.
- **Records** — a list of every survey with its photos, submitted field values, and a stable
  human-readable reference (`KAMPUNG-DURIAN-001`) instead of a UUID.
- **Projects** — create, edit, archive; each carries its own form schema and survey count.
- **Export** — CSV, or an `.xlsx` written by hand (no dependency) that **embeds the photos into
  the spreadsheet rows**.
- **Auth** — Supabase email/password, with email confirmation links and password reset.

---

## How a capture flows through the system

```
  [ Field device ]                              [ Server ]              [ Supabase ]

  photo + GPS fix
        │
        ▼
  watermark + downscale
        │
        ▼
  ┌───────────────┐   offline-safe
  │ local outbox  │   (IndexedDB on web)
  └───────┬───────┘
          │ background sync, when online
          ▼
   POST /api/surveys ─────────────────────────► validate form data
                                                check quota            ──► Postgres + PostGIS
                                                insert survey              (geography point)
          │
          ▼
   POST /api/surveys/:id/photos/initiate ─────► reserve row
                                                sign upload URL        ──► Storage (private)
          │
          │ PUT the JPEG straight to the signed URL
          ▼
   POST /api/surveys/:id/photos/:pid/complete ► verify object exists
                                                mark uploaded
          │
          ▼
    remove from outbox
```

Two properties are worth calling out:

1. **The survey id is generated on the device** (`crypto.randomUUID()`), and the server upsert is
   idempotent — last write wins, and quota is only charged the first time. A retry after a flaky
   connection can never create a duplicate point.
2. **Photo bytes never pass through the app server.** The server only signs a URL; the device
   uploads directly to Supabase Storage.

---

## Architecture

GeoFold is **two apps against one Supabase project**: a Next.js fullstack app that serves the web
UI *and* is the API, and an Expo mobile client that consumes that same API.

```
                         ┌────────────────────────────┐
                         │  Supabase                  │
                         │  · Postgres + PostGIS      │
                         │  · Storage (survey-photos) │
                         │  · Auth (JWT)              │
                         └──────────────┬─────────────┘
                                        │
                         next/  (Next.js 16, App Router)
                         web UI + API routes in one app
                         → deployed to Vercel
                                        ▲
                              same API, Bearer token
                                        │
                         mobile/  (Expo SDK 57, React Native)
                         the field client
```

| Piece | Stack |
|---|---|
| `next/` | Next.js 16 (App Router), React 19, TypeScript, `postgres` (porsager) for direct SQL, Leaflet + react-leaflet, lucide-react. **The web app and the backend.** |
| `mobile/` | React Native via Expo (SDK 57), expo-router, TypeScript. The field client — capture, offline outbox, gallery, MapLibre map. Talks to the `next/` API. |
| Auth | Supabase Auth. The server accepts either the browser's cookie session or an `Authorization: Bearer <access_token>` header. |
| Database | Supabase Postgres with **PostGIS** — points are `geography(point, 4326)`, written with `ST_MakePoint(lng, lat)` and read back with `ST_X`/`ST_Y`. |
| Files | Supabase Storage, private bucket `survey-photos`, all access through short-lived signed URLs. |

### Notable implementation choices

- **No ORM in the Next app.** API routes issue tagged-template SQL directly. It keeps the PostGIS
  calls honest and the query count visible.
- **The `.xlsx` writer is hand-rolled** (`next/src/lib/export.ts`): a STORED-method ZIP assembled
  byte by byte, with a DrawingML part so photos anchor into cells. Zero dependencies.
- **Demo mode.** If `NEXT_PUBLIC_SUPABASE_ANON_KEY` is absent or a placeholder, the whole app runs
  on sample data with no server at all — useful for design work and for showing the product.
- **The mobile map avoids Google.** MapLibre over OpenFreeMap tiles: no API key, no Google Cloud
  account, no billing. The Android Google Maps SDK would have required all three.

---

## Repository layout

```
GeoFold/
├── next/                       # ★ the web app AND the API
│   ├── src/app/(app)/          #   authenticated screens: home, capture, surveys, projects, map
│   ├── src/app/api/            #   route handlers — projects, surveys, photos, sync, webhooks
│   ├── src/lib/                #   db, auth, quota, validation, outbox, sync, export, capture
│   ├── src/components/         #   MapView, ProjectForm, nav, theme toggle
│   └── DEPLOY.md               #   Vercel deployment runbook
│
├── mobile/                     # React Native (Expo) field client
│   ├── src/app/                #   expo-router: welcome, signin, tabs, capture, sync, details
│   ├── src/lib/                #   api, auth, outbox, sync, capture, photo, native
│   ├── src/components/         #   UI kit, icons, survey map, watermarked photo
│   └── README.md               #   setup, dev builds, APK build, offline behaviour
│
├── docs/
│   └── schema.sql              #   ★ canonical database schema
│
└── NEXT-STEPS.md               # handoff: roadmap, auth options, DB options, known traps
```

---

## Data model

```
profiles ──1:N── projects ──1:N── surveys ──1:N── survey_photos
    │
    └──1:1── subscriptions
```

| Table | Key columns |
|---|---|
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

---

## API surface

All routes require authentication and are scoped to the calling user. Both the web UI and the
mobile app consume the same routes.

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
| `POST` | `/api/surveys/:id/photos/initiate` | Reserve a photo row, return a signed upload URL |
| `POST` | `/api/surveys/:id/photos/:photoId/complete` | Confirm the upload landed |
| `GET` | `/api/surveys/:id/photos/:photoId/url` | Short-lived signed download URL |
| `POST` | `/api/sync/surveys` | Batch upsert for bulk reconciliation |
| `GET` | `/api/subscriptions/me` | Plan, status, limits and current usage |
| `GET` | `/api/health` | Liveness — also used to warm a cold-started server |

**Photo constraints:** JPEG / PNG / WebP, 1 byte – 20 MB. The client-supplied filename is
deliberately ignored; the storage path is built from ids the server controls plus a whitelisted
extension, so a crafted name cannot escape the user's folder.

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
| Daily caps (surveys captured, photos uploaded) | ✔ | — |
| Map view | — | ✔ |

Limits are enforced on every write from live counts and per-day counters, so they can't drift.
Exceeding one returns `403 { "error": "quota_exceeded", "message": … }`, which the clients surface
as a plain-language prompt rather than a failure.

Premium is unlimited on every axis while `PremiumUntilUtc` is in the future. When Premium lapses
while a workspace is over the free limits it is **frozen**: reads and exports keep working, but new
writes are blocked until it is renewed or back under the free ceiling. Premium is granted by an
activation key or a settled QRIS payment (Midtrans); see `docs/migration-002-subscription.sql`.

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
| `SUPABASE_STORAGE_BUCKET` | `survey-photos` |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | Supabase pooler; port `6543` on serverless |
| `PAYMENT_PROVIDER` | `ipaymu` or `midtrans`; checkout requires an explicit choice |
| `IPAYMU_VA` `IPAYMU_API_KEY` | server-only iPaymu credentials; see `docs/PAYMENT-SETUP.md` |
| `IPAYMU_IS_PRODUCTION` `IPAYMU_LIVE_CHECKOUT_ENABLED` | both must be deliberately enabled only after Production IP/domain approval |

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
cp .env.example .env.local
npx expo run:android
```

Native modules mean it needs a development build rather than Expo Go. With no Supabase key
configured it starts in demo mode, same as the web app. Details in
[`mobile/README.md`](mobile/README.md).

### A fresh database

```bash
psql "$DATABASE_URL" -f docs/schema.sql
```

Or paste [`docs/schema.sql`](docs/schema.sql) into the Supabase SQL editor. Then create a
**private** Storage bucket named `survey-photos` — the schema file cannot do that part.

---

## Deployment

**Next.js → Vercel.** Root directory `next`. Full runbook in [`next/DEPLOY.md`](next/DEPLOY.md).
Note Vercel's Hobby tier is non-commercial per their ToS.

**Mobile → APK / EAS.** See [`mobile/README.md`](mobile/README.md). Build locally with JDK 17 (not
Android Studio's bundled JDK 25 — it breaks the native build), or through EAS with the profiles in
`mobile/eas.json`.

Both need PostGIS enabled and the private `survey-photos` bucket on the target Supabase project.

---

## Security notes

- `service_role` is server-only. It bypasses row-level security and must never reach a client.
  Clients use the anon/publishable key.
- Every query filters on the authenticated `UserId`; a survey id alone is never sufficient to read
  or write a row.
- Storage paths are server-constructed (`<userId>/<surveyId>/<photoId>.<ext>`) and the bucket is
  private — all access is via signed URLs with short expiry.
- Photo size is verified against the actual stored object, not just the client's claim, before it
  counts against the storage quota.
- Rotate `SUPABASE_JWT_SECRET` before going live if it has ever been shared.
