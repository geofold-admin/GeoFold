# GeoFold Mobile

The field half of [GeoFold](../README.md), as a native iOS/Android app — React Native via Expo.

The UI implements the **"GeoFold mobile app prototype"** Claude Design project. The functionality
underneath is GeoFold's own: the real Supabase API, GPS, the burned-in coordinate stamp and the
offline outbox.

This is the **core capture loop only**. The design includes a Plan & billing screen — pricing
tiers, card on file, billing history — which is deliberately **not** implemented, because this app
carries no payment gateway. Plan limits are still enforced by the server; when one is hit the app
says so in plain language and stops, rather than offering to sell anything.

## What's in it

| Screen | What it does |
|---|---|
| **Welcome** | The design's opening screen. |
| **Sign in / Create account** | Supabase email/password, both modes. Session persists across cold starts. |
| **Map** | Synced points *and* unsynced local captures on a native map, with status filters and a project carousel. Plan-gated server-side; the app explains rather than sells. |
| **Projects** | Project list in the design's Jobs layout; project detail with the form as a checklist; create a project and build its form. |
| **Gallery** | Every capture as a grid grouped by day. Pending ones show the photo held on the device. |
| **Profile** | Account, sync state, usage counters, sign out. |
| **Sync & backup** | The outbox: what is queued, what failed, retry, sync now. |
| **Capture** | Live viewfinder → review. See below. |
| **Photo detail** | The photo with its stamp, position, accuracy, timestamps and field values. |

### Where the design was mapped rather than copied

The prototype is drawn around **Jobs with a fixed photo checklist**, over hardcoded seed data.
GeoFold's backend has **Projects with a custom form schema**. The layouts are the design's; the
concepts are the backend's:

- *Jobs* → **Projects**, keeping the design's row layout and status pills.
- *Photo checklist* → the project's **form fields**, ticked off against the latest survey.
- *"Continue with company SSO"* → omitted. The backend has no SSO, and a dead button is worse than
  no button.
- *Plan & billing* → omitted, as above.

### The capture loop

1. **Viewfinder** — a real `expo-camera` preview with the design's rule-of-thirds guides, a torch
   and three zoom steps, and a live coordinate readout.
2. **GPS fix** — `BestForNavigation` accuracy, *followed* for as long as the camera is up and frozen
   at the first shutter, so the point is where the phone was when the photo was taken and not where
   it was when the camera opened. The readout is graded (≤10 m good, ≤25 m fair, worse is flagged)
   and saving a point worse than 25 m asks first. On the review step a better reading taken since
   the shutter is offered back, for the surveyor still standing at the point.
3. **Photos** — up to four per point (`MAX_PHOTOS` in `capture.tsx`), each downscaled to a 1600 px
   longest edge and re-encoded as JPEG. The first one fixes the point's position and time; the rest
   are queued as `extraPhotos` on the outbox item and uploaded through the same handshake.
4. **Review** — the stamp is burned into every photo: coordinates, accuracy, time and project. What
   you approve on screen is exactly what uploads — a full-resolution copy of the same component is
   snapshotted off-screen, once its image has finished drawing.
5. **Form** — the project's `formSchema` rendered dynamically (text / number / integer / boolean /
   date / select), plus the always-present `catatan` note. It is there from the viewfinder on and
   carries into the review step, because the server validates required fields on upload and
   finding that out after leaving site is too late. The form can be shaped from here with what
   creating a project offers: a new field of any type, a sectoral template's fields, one more
   option on a choice field ("Other"), and a link to the project editor for renaming, reordering
   and removing. Additions are written to the phone first (`lib/project-fields.ts`) and joined to
   the project's form at the next sync, so none of it needs a signal. "Same as the last point"
   refills the form from the previous capture in the project.
6. **Save / Save & next** — the survey goes into the local outbox. *Save* returns to where the
   camera was opened from; *Save & next* clears the form and keeps the camera up for the next point.

A queued capture can be opened on **Sync & backup** — its photos, position and values — and
discarded there if it was taken by mistake.

### Offline behaviour

This is the part that matters in the field, so it's worth being precise about:

- A capture is **never** blocked on the network. It's written to the device and the UI moves on.
- Metadata lives in AsyncStorage; the watermarked JPEG lives as a real file in the document
  directory — not the cache, which the OS can evict under storage pressure.
- The survey id is generated **on the device** and the server upsert is idempotent, so a retry
  after a dropped connection updates the same row instead of creating a duplicate point.
- Sync runs on launch, whenever the app returns to the foreground, and the moment connectivity
  comes back (`NetInfo`). Failures stay in the queue with their error visible under Records.
- An item stuck mid-upload when the app was killed is reset to pending at next launch.
- Photo bytes go **straight from the device to Supabase Storage** via a signed URL. The server only
  signs; it never proxies the image.

## Setup

```bash
cd mobile
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Notes |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Origin of the GeoFold Next.js app, no trailing slash |
| `EXPO_PUBLIC_SUPABASE_URL` | Same Supabase project the server uses |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon/publishable key — **never** the service-role key |

Everything prefixed `EXPO_PUBLIC_` is compiled into the app binary. Treat all of it as public. The
service-role key, the JWT secret and the database password stay on the server.

Leave any of them blank and the app runs in **demo mode**: sample projects, sample points, a
simulated sync, no backend. Handy for reviewing the UI before wiring anything up.

> **After editing `.env.local`, restart with `npx expo start --clear`.** `EXPO_PUBLIC_*` values are
> inlined into the bundle at transform time, and Metro's cache is keyed on file contents — not on
> the environment. Without `--clear` you keep running the previously inlined values, which most
> often shows up as the app still being in demo mode after you have configured it.

## Running it

Full functionality needs a **development build**:

```bash
npx expo run:android
```

```bash
npx expo run:ios
```

Once installed, `npx expo start` reloads JS into it as usual.

### Building an APK locally

> **Do not build with Android Studio's bundled JDK 25.** It fails at
> `:react-native-screens:configureCMakeRelWithDebInfo` with *"WARNING: A restricted method in
> java.lang.System has been called"*. JEP 472 emits that warning on JDK 24+, and the Android Gradle
> Plugin's CMake wrapper treats it as a failure. Use **JDK 17** — Gradle keeps one at
> `~/.gradle/jdks/eclipse_adoptium-17-*` once any toolchain build has run.
>
> To make it stick, point Android Studio at JDK 17 (Settings → Build Tools → Gradle → Gradle JDK)
> or set `JAVA_HOME` in your user environment. Otherwise `npx expo run:android` picks up 25 again.

Android Studio supplies the SDK; neither it nor the JDK is on `PATH` by default. Point at them for
the build rather than changing system settings:

```bash
cd mobile && JAVA_HOME="$USERPROFILE/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2" ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" npx expo prebuild --platform android
```

```bash
cd mobile/android && JAVA_HOME="$USERPROFILE/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2" ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" ./gradlew assembleRelease
```

The APK lands at `android/app/build/outputs/apk/release/app-release.apk`.

> **This APK is signed with the debug keystore.** Expo's template does that by default, which is
> fine for sideloading and demos, and rejected by the Play Store. Generate a real keystore and wire
> it into `android/app/build.gradle` before publishing.

`android/` is generated and gitignored. While it exists, `app.json` plugin changes do **not** apply
until you re-run `prebuild` — delete the folder if you go back to the managed flow.

### Building through EAS instead

`eas.json` already defines `preview` and `development` profiles pinned to `"buildType": "apk"`
(EAS's Android default is `.aab`). Needs `npx eas-cli login` first, and the `EXPO_PUBLIC_*` values
supplied via `eas env:create` — `.env.local` is gitignored, so EAS never sees it.

### Quickest look, no device

The app also runs in a browser, which needs no toolchain and no client app at all:

```bash
npx expo start --web
```

Sign-in, projects, records, survey detail and the whole capture form work. The map does not —
`expo-maps` has no web build — and photo capture goes through the browser's file picker rather than
a camera. Useful for reviewing the app, not for fieldwork.

`web.output` is `single` (SPA) rather than `static`: the session is resolved on the client, so
prerendering in Node has nothing to render and fails on `window`.

### What works in Expo Go

Expo Go can open the app for review, but two features depend on native modules it does not carry:

| | Expo Go | Development build |
|---|---|---|
| Sign in, Overview, Records, Projects, Survey detail | ✔ | ✔ |
| Capture — photo, GPS fix, form, live stamped preview | ✔ | ✔ |
| **Saving a capture** | ✖ — refuses, with an explanation | ✔ |
| **Map tab** | ✖ — shows a notice | ✔ |

Saving is blocked rather than degraded on purpose: the watermark is what puts the coordinates
*inside* the image, and uploading an unstamped photo would quietly discard that evidence.

Both modules (`react-native-view-shot`, `expo-maps`) resolve their native counterpart at module
scope and **throw** when it is missing. Since Expo Router requires every route file at startup to
build its route tree, importing either one directly would crash the app before it renders. They are
therefore loaded lazily behind a catch in [`src/lib/native.ts`](src/lib/native.ts) — anything
touching them goes through there, and nothing else in the app imports them.

### Pointing at a local server

The Android emulator reaches the host machine at `10.0.2.2`, so a Next.js dev server on port 3000
is:

```bash
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000
```

On a physical device, use the host machine's LAN address.

### Google Maps on Android

`expo-maps` renders through the Google Maps SDK on Android, which needs an API key in `app.json`
under `android.config.googleMaps.apiKey` before the map tab will draw tiles in a standalone build.
Everything else in the app works without it.

## How it talks to the server

The web client is same-origin and rides on the Supabase cookie session. A native app has no cookie
jar, so it sends `Authorization: Bearer <access_token>` instead — the server's `getUserId()` accepts
either, and verifies the token under both Supabase signing modes (legacy HS256 shared secret, or
asymmetric keys from JWKS).

Native `fetch` isn't subject to CORS, so no CORS configuration is needed on the server.

No new endpoints were added for mobile. It uses the same API as the web app:

```
GET  /api/projects
POST /api/projects
GET  /api/subscriptions/me
GET  /api/surveys
GET  /api/surveys/:id
GET  /api/surveys/geojson
POST /api/surveys                                   ← idempotent upsert
POST /api/surveys/:id/photos/initiate               ← returns a signed upload URL
POST /api/surveys/:id/photos/:photoId/complete
GET  /api/surveys/:id/photos/:photoId/url           ← signed download URL
```

## Layout

```
src/
├── app/                       # expo-router file routes
│   ├── _layout.tsx            #   providers + the signed-in/signed-out split
│   ├── welcome.tsx            #   NB: not index.tsx — that would collide with (tabs)/index
│   ├── signin.tsx
│   ├── (tabs)/                #   map · projects · gallery · profile
│   ├── capture.tsx            #   viewfinder → review (a route, not a tab)
│   ├── sync.tsx
│   ├── project/[id].tsx · project/new.tsx
│   └── survey/[id].tsx
├── components/
│   ├── ui.tsx                 # the design's component kit
│   ├── icons.tsx              # the design's own icon drawings, transcribed
│   ├── capture-sheet.tsx      # "capture for which project?" bottom sheet
│   ├── survey-map.tsx         # the only file that touches expo-maps
│   └── watermarked-photo.tsx  # the stamped image — preview and capture use the same component
├── lib/
│   ├── api.ts                 # fetch + bearer auth + typed errors
│   ├── auth.tsx               # Supabase session, persisted
│   ├── outbox.ts              # the offline queue
│   ├── sync.ts                # the drain loop and the photo handshake
│   ├── sync-context.tsx       # when to drain: launch, foreground, reconnect
│   ├── capture.ts             # GPS fix, form coercion, the stamp text
│   ├── photo.ts               # camera/library, downscale, stage sizing
│   ├── native.ts              # lazy loading for the two optional native modules
│   ├── details.ts             # port of the web app's value formatting
│   ├── reference.ts           # port of the web app's survey reference codes
│   ├── types.ts               # wire shapes, identical to the web client's
│   └── demo.ts                # in-memory sample backend (holds writes for the session)
└── constants/theme.ts         # the design's palette, converted to hex
```

> The design is authored in `oklch()`, which React Native's colour parser does not support. Every
> token in `constants/theme.ts` is the sRGB conversion, with the oklch source kept in a comment so
> the two stay traceable.

`details.ts`, `reference.ts` and `types.ts` are deliberate ports of their `next/src/lib`
counterparts rather than new code — the same survey has to carry the same reference and read the
same way on a phone as it does on a desktop.

## Checks

```bash
npx tsc --noEmit
```

```bash
npm run lint
```
