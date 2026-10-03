# Load testing the GeoFold VPS backend

## What this measures

A realistic authenticated user flow against `https://api.geofold.sayba.id`:

1. `GET /api/user/me` — JWT verify + user upsert
2. `PUT /api/storage/raw?path=...` — image upload, Sharp -> WebP
3. `GET /api/pictures/view/...` — served by Caddy off disk
4. `GET /api/storage/download?path=...` — WebP -> PNG on the fly
5. `GET /api/pictures/` — picture list (cached 30s)

Think time is 5–10s between steps, so VUs behave like users reading pages,
not a tight request loop.

## Running it

```bash
# k6 v0.54+ ; testimg.b64 is a base64-encoded PNG (see below)
k6 run -e TEST_IMG=$(cat testimg.b64) k6_script.js
```

Generate a test image and its base64:

```bash
node -e "require('sharp')({create:{width:1200,height:900,channels:3,background:{r:70,g:130,b:200}}}).png().toFile('/tmp/t.png')"
base64 -w0 /tmp/t.png > testimg.b64
```

## Result — 2026-10-03, 50 concurrent users

Ramp 1 → 50 VUs over 2m, hold 3m, ramp down 30s.

| Metric | Value |
|--------|-------|
| Requests | 1,781 |
| Failures | 0 |
| Throughput | ~5.1 req/s |
| p95 (all) | **421 ms** |
| p99 (all) | ~1.0 s |
| view (Caddy) | p95 45 ms |
| list (cached) | p95 65 ms |
| upload (Sharp) | p95 524 ms |
| download (Sharp) | p95 597 ms |

**Ceiling on 1 vCPU / 1 GB: 50 concurrent users, p95 421 ms, 0 errors.**

Sharp (upload/download) is the first thing to bend — it is CPU-bound on a
single core. Everything read-only stays comfortably fast because Caddy serves
images and the list is cached.

## Auth note

Supabase signs access tokens with **ES256** for this project; the backend
verifies them locally against the cached JWKS public key
(`/auth/v1/.well-known/jwks.json`), so there is no per-request network call.
The legacy `SUPABASE_JWT_SECRET` path is unused (the project has no HS256
secret).
