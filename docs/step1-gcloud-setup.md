# Step 1: Google Cloud setup — checklist with exact values

All values below are extracted from the codebase (verified 2026-10-03).
Copy-paste ready for the Google Cloud Console.

## Prerequisites gathered from the repo

| Item | Value | Source |
|---|---|---|
| Standard app package | `app.geofold.mobile` | `mobile/app.base.json` |
| Drone app package | `app.geofold.drone` | `mobile/app.config.js` DRONE.drone |
| Drone V4 app package | `app.geofold.drone.v4` | `mobile/app.config.js` DRONE.drone-v4 |
| Debug signing SHA-1 | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` | `mobile/android/app/debug.keystore` (standard Android debug key) |
| EAS project | `majesticp` / projectId `18bbc6b5-7e38-4ac4-b8c4-41995b5d4072` | `mobile/app.base.json` extra.eas |
| Web origin | `https://geofold.sayba.id` | deployed site (Vercel) |
| Privacy policy URL | `https://geofold.sayba.id/privacy` | verified live (HTTP 200) |
| Support email | to be decided (suggest the account email you use for the Cloud project) | — |
| Scope | `https://www.googleapis.com/auth/drive.file` ONLY — anything broader triggers a paid annual security assessment | build order |
| CSP check | `connect-src` already includes `https://storage.googleapis.com` → Google Identity Services will work in the browser with no code change | deployed site headers |

## Console steps (console.cloud.google.com)

1. **Create one Cloud project** — e.g. `geofold`. Every OAuth client must live in it:
   `drive.file` only exposes files created by files "your app" created, i.e. files created with
   tokens from THIS project. Split clients across projects and the web app can't see phone uploads.

2. **Enable the Drive API** — API & Services → Enable APIs and Services → "Google Drive API".

3. **OAuth consent screen:**
   - User type: **External**
   - App name: `GeoFold`
   - Support email: <your email>
   - Privacy policy: `https://geofold.sayba.id/privacy`
   - Add a verified domain: `geofold.sayba.id`

4. **Create the OAuth clients (2 for now, 3rd later if iOS ships):**

   **Android client** — required fields:
   - Package name: `app.geofold.mobile` + the debug SHA-1 above.
     Add the other two packages only when their builds need Drive too
     (`app.geofold.drone`, `app.geofold.drone.v4`).
   - SHA-1 fingerprint(s) — three of them, in priority order:
     1. `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (debug — for `npx expo run:android`)
     2. **EAS upload/release key SHA-1** — read from EAS console → your project →
        `majesticp/geofold` → Credentials → "Android upload key" (SHA-1 column).
        The key file is `upload-key.jks`; EAS regenerates it if you ever lose it,
        so always take the CURRENT one from the console.
     3. **Play App Signing cert SHA-1** — Play Console → your app →
        Release management → App integrity → App signing → "App signing key" → SHA-1.
        Skip this and Drive linking works in your self-built APK and fails in the
        Play release with `DEVELOPER_ERROR` (classic failure mode).
     The `verify-android` IAP route hard-checks `packageName === 'app.geofold.mobile'`,
     so the standard app is the one that matters for Play.

   **Web client** — authorized origins:
   - `https://geofold.sayba.id`
   - `http://localhost:3000` (local dev only)
   Used by the Google Identity Services token client in the web outbox (Step 4).

5. **APIs & services → Credentials → create the clients, then copy the two client IDs.**
   Format: `NNNNNN.apps.googleusercontent.com`. Store them:
   - `GOOGLE_DRIVE_ANDROID_CLIENT_ID` → mobile (expo config / native)
   - `GOOGLE_DRIVE_WEB_CLIENT_ID` → next (Vercel env + `NEXT_PUBLIC_` prefix — public)

6. **Publish the consent screen to Production.**
   In Testing mode refresh tokens die after 7 days and you're capped at 100 test
   users — a silent landmine for a shipping product.

## Done-when check

A Google account that is NOT on the test-users list sees the consent screen asking
for Drive access, grants it, and receives a token with the `drive.file` scope.

## What the mobile app changes (Step 4 prep, not this step)

- `@react-native-google-signin/google-signin` requests the
  `https://www.googleapis.com/auth/drive.file` scope; `getTokens()` supplies fresh
  access tokens on-device. Tokens never touch the backend.
- The app's package + signing SHA-1 must match one of the Android OAuth client
  entries, or sign-in dies with `DEVELOPER_ERROR` before the consent screen.
