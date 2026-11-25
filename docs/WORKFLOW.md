# GeoFold System Workflow: Web, App & VPS

Comprehensive architecture, integration flow, and runtime interaction between the **Web Application (Vercel)**, **Mobile Field App (Expo)**, **Storage & Egress VPS (Rumahweb)**, and external services (**Supabase** & **iPaymu**).

---

## 1. System Topology & Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │            Supabase Cloud Platform           │
                    │  · PostgreSQL + PostGIS (Point Geography)    │
                    │  · Auth (JWT Verification & User Sessions)   │
                    └──────────────────────┬───────────────────────┘
                                           │ SQL (postgres-js) / JWT
                                           ▼
┌────────────────────────┐         ┌───────────────────────────────┐
│   Mobile Field App     │         │      Web & API Backend        │
│   (Expo SDK 57 / RN)   │         │    (Next.js 16 / Vercel)      │
│   Android / iOS        │         │    geofold.sayba.id           │
└───────────┬────────────┘         └───────┬──────────────┬────────┘
            │                              │              │
            │ 1. Metadata Sync (Bearer)    │              │ 3. Static IP Egress
            ├──────────────────────────────┘              │    Payment Proxy
            │                                             │
            │ 2. Direct WebP Upload                       ▼
            │    (Signed URL)              ┌───────────────────────────────┐
            │                              │       GeoFold Linux VPS       │
            └─────────────────────────────►│    api.geofold.sayba.id       │
                                           │    IP: 202.155.16.213         │
                                           │  · NVMe WebP Photo Store      │
                                           │  · iPaymu Proxy Gateway       │
                                           └──────────────┬────────────────┘
                                                          │
                                                          │ Egress via 202.155.16.213
                                                          ▼
                                           ┌───────────────────────────────┐
                                           │        iPaymu Gateway         │
                                           │   (Whitelisted Origin IP)     │
                                           └───────────────────────────────┘
```

---

## 2. Component Responsibilities

| Component | Host / Runtime | Core Roles |
|---|---|---|
| **Web & API Backend** | Vercel (`geofold.sayba.id`)<br>Next.js 16 App Router | • Serves admin/surveyor web dashboard & map UI.<br>• Central API gateway (`/api/*`) for web and mobile clients.<br>• Direct PostGIS query execution (ST_MakePoint, ST_X, ST_Y).<br>• Enforces user plan quotas (Free vs Pro).<br>• Assembles hand-rolled `.xlsx` exports with embedded photos.<br>• Initiates payment checkout & reconciles transaction status. |
| **Mobile Field App** | Native Device (Expo SDK 57)<br>Offline-First Client | • High-accuracy GPS capture (`BestForNavigation`).<br>• Viewfinder + burned-in coordinate watermark on photo.<br>• Offline outbox queue (AsyncStorage + local filesystem).<br>• Automatic background sync upon network reconnection.<br>• Zero-proxy direct upload to VPS storage. |
| **GeoFold VPS** | Rumahweb VPS (Virtualizor 39545)<br>`202.155.16.213`<br>`api.geofold.sayba.id` | • **Image Service**: Stores photos as WebP on NVMe storage; converts on-the-fly to PNG for downloads; provides `HEAD` size checks.<br>• **Egress Proxy**: Relays iPaymu payment calls via whitelisted static IP `202.155.16.213` to bypass Vercel dynamic IP blocks. |
| **Supabase** | Managed Cloud DB | • Single source of truth for Auth, User Accounts, Projects, Surveys, and Photo metadata. |

---

## 3. Core Workflows

### Workflow A: Field Data Capture & Offline Sync Loop

The mobile client is designed for environments without cellular connectivity. The network is never in the critical path of data collection.

```
[ Field Device (Mobile) ]             [ Next.js API (Vercel) ]           [ VPS (Storage) ]
           │                                      │                              │
 1. Snap photo + GPS                              │                              │
 2. Burn watermark (canvas)                       │                              │
 3. Write to local Outbox                         │                              │
 4. UI returns to ready state                     │                              │
           │                                      │                              │
           │ ── Network Reconnected ──            │                              │
           │                                      │                              │
 5. POST /api/surveys ───────────────────────────►│                              │
    (Client UUID, GeoJSON, FormSchema values)     │ Idempotent SQL upsert        │
    ◄─────────────────────────────────────────────┤ Check quota limits           │
           │                                      │                              │
 6. POST /api/surveys/:id/photos/initiate ───────►│                              │
    (Photo ID, Ext, Size, Coords)                 │ Validate extension & size    │
    ◄── Returns { uploadUrl, storagePath } ───────┤ Creates upload endpoint      │
           │                                      │                              │
 7. PUT binary stream to uploadUrl ─────────────────────────────────────────────►│
    ◄── 200 OK (WebP stored on NVMe) ────────────────────────────────────────────┤
           │                                      │                              │
 8. POST /api/surveys/:id/photos/:pid/complete ──►│                              │
                                                  │── HEAD request check ───────►│
                                                  │◄─ Content-Length / OK ───────┤
                                                  │ Update status = 'uploaded'   │
    ◄── 204 No Content ───────────────────────────┤ Deduct quota                 │
 9. Purge local photo from outbox queue           │                              │
```

#### Key Guarantees:
- **Idempotency:** Survey ID is generated on the client via `crypto.randomUUID()`. Server uses `ON CONFLICT ("Id") DO UPDATE`, ensuring flaky connection retries never produce duplicate entries.
- **Direct Pipe:** Binary photo bytes **never** touch Vercel serverless memory. The mobile client streams directly to the VPS storage service.

---

### Workflow B: Web Review, Mapping & XLSX Export

Web users view spatial survey points on interactive maps and export deliverables with embedded photographic evidence.

```
[ Web Browser Client ]                [ Next.js Server ]                 [ VPS / DB ]
           │                                   │                               │
 1. View Project Map / List                   │                               │
    GET /api/surveys?projectId=... ───────────►│                               │
                                               │── ST_AsGeoJSON(Location) ────►│ Supabase PostGIS
                                               │◄─ Points & Form Metadata ─────┤
    ◄── JSON Survey Records ───────────────────┤                               │
           │                                   │                               │
 2. Render Map (Leaflet / MapLibre)            │                               │
    Display photo thumbnails ─────────────────────────────────────────────────►│ VPS /api/storage/view
           │                                   │                               │
 3. Request Export (.xlsx)                     │                               │
    GET /projects/:id/export?format=xlsx ─────►│                               │
                                               │ Fetch photos via stream ─────►│ VPS /api/storage/raw
                                               │ Hand-roll ZIP archive         │
                                               │ Inject DrawingML parts        │
                                               │ Embed images into cells       │
    ◄── Binary .xlsx Download ─────────────────┤                               │
```

---

### Workflow C: Billing, Payment & Static IP Egress Proxy

iPaymu requires origin requests to come from a whitelisted static IP and verified domain. Vercel runs on dynamic serverless egress IPs, requiring the VPS proxy gateway.

```
[ User Browser ]                   [ Vercel (Next.js) ]           [ VPS (202.155.16.213) ]        [ iPaymu Gateway ]
       │                                     │                               │                           │
 1. Click "Upgrade to Pro"                   │                               │                           │
    (In-page checkout modal)                 │                               │                           │
 2. POST /api/payments/checkout ────────────►│                               │                           │
                                             │ POST /api/payment/proxy ─────►│                           │
                                             │ { path, method, body }        │ POST /api/v2/payment ────►│
                                             │                               │ (Whitelisted Static IP)   │
                                             │                               │◄── Session / Payment URL ─┤
                                             │◄── Return Payload ────────────┤                           │
    ◄── Return Payment URL / QRIS ───────────┤                               │                           │
 3. User completes payment                   │                               │                           │
       │                                     │                               │                           │
 4. Webhook notification                     │                               │                           │
    POST /api/payments/ipaymu/callback ◄─────────────────────────────────────────────────────────────────┤
    Verify signature & update subscription   │                                                           │
       │                                     │                                                           │
 5. (Fallback) User redirected to /app       │                                                           │
    POST /api/payments/ipaymu/sync ─────────►│ Re-query status via proxy ───►│                           │
    Instant subscription activation          │                               │                           │
```

---

## 4. Storage & Storage Quotas

| Tier | Storage Quota | Photo Upload Cap | Survey Records |
|---|---|---|---|
| **Free** | 20 MB | 10 photos/day | 50 points |
| **Pro** | 500 MB | Unlimited | Unlimited |

- **VPS Disk Management:** Uploads are stored under `/data/geofold/storage/{userId}/{surveyId}/{photoId}.webp`.
- **Pre-flight & Post-flight Checks:**
  - Before upload: `next/src/lib/quota.ts` verifies declared size against user plan ceiling.
  - After upload: Next.js API makes a `HEAD` request to `api.geofold.sayba.id/api/storage/raw`, reading true `Content-Length` on disk before finalizing.

---

## 5. Security & Boundary Isolation

1. **Tokens & Secrets Isolation:**
   - Client Apps (Web client bundle & Mobile APK) **only** hold `NEXT_PUBLIC_SUPABASE_ANON_KEY` and public URLs.
   - Database connection string, iPaymu VA/API Key, and service-role keys reside strictly inside Vercel environment variables.
2. **VPS Surface Area:**
   - VPS only accepts authenticated/signed proxy calls and strictly scoped storage requests.
   - Storage paths are generated server-side using UUIDs to prevent directory traversal (`../`).
3. **Database RLS & Scoping:**
   - All survey and project queries are scoped by `UserId` extracted from validated Supabase JWT tokens.
