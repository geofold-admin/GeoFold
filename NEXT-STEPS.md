# GeoFold — handoff & roadmap

Context for picking this up in a fresh session: what exists, what's worth doing next, and the
traps that will waste your time if you don't know about them.

Written 2026-08-04. Last updated 2026-08-29 — map fixes and the survey grid (§1, §2, §5).

---

## 1. Where things stand

The stack is **two apps**: a Next.js fullstack web app that is also the API, and an Expo mobile
client that talks to it.

| Part | State |
|---|---|
| `next/` | **The web app and the backend.** Next.js 16 — UI plus API routes, direct SQL against Supabase Postgres/PostGIS, Supabase Storage & Auth. |
| `mobile/` | **Built and working.** Expo SDK 57 / RN 0.86. Implements the Claude Design prototype over that API. Universal release APK builds locally. |
The old ASP.NET Core API (`backend/`), the old Vite SPA (`web/`), their `deploy/` config and the
root `Dockerfile` have been **deleted from the working tree**. The deletions are not staged or
committed — they are still in git history if anything needs recovering.

> **What was rescued on the way out:** the EF migrations in `backend/` were the only definition of
> the database schema, since `next/` only queries and never creates a table. That schema is now
> [`docs/schema.sql`](docs/schema.sql) and is canonical. The JWT-mode decision tree from
> `docs/backend-setup.md` moved into the root README's environment section.

**Nothing is committed.** `README.md` and `next/src/lib/auth.ts` are modified; `mobile/`,
`NEXT-STEPS.md` and `docs/schema.sql` are untracked. Commit before doing anything destructive.

### Mobile stack

```
expo ~57.0.9          react-native 0.86.2       expo-router ~57.0.9
@maplibre/maplibre-react-native ^11.3.6         expo-camera ~57.0.3
expo-location ~57.0.7 expo-file-system ~57.0.1  expo-image-manipulator ~57.0.7
react-native-view-shot 5.1.0                    react-native-svg 15.15.4
expo-linear-gradient ~57.0.1                    @supabase/supabase-js ^2.111.0
@react-native-async-storage/async-storage 2.2.0
```

Screens: Welcome · Sign in/Create account · Map · Projects · Gallery · Profile · Project detail ·
Capture (viewfinder → review) · Photo detail · Sync & backup.

The map uses **MapLibre + OpenFreeMap** — no API key, no Google Cloud account, no card. This was a
deliberate move off `expo-maps`, which needs a billing-enabled Google project.

Everything MapLibre-shaped lives in `mobile/src/components/survey-map.tsx`, which now carries three
tools: the street/satellite basemap toggle, a two-point **ruler**, and the **survey grid** below.
The same component runs in `pickMode` as the tap-to-pick coordinate picker on the capture screen.

### The survey grid

A toggleable quadrat grid for laying systematic coverage over a parcel or a protected block. Cells
holding at least one survey are tinted, with an `N of M cells surveyed` readout; tapping a cell
gives its full grid reference (`49M 531600E 9995600N`) and how many surveys are in it. Coverage
honours the map's All/Pending/Synced chips, so "which cells have synced data" is a question you can
actually ask.

**Cell size** defaults to `Auto`, which follows the zoom: the size is picked from the viewport's
ground width targeting ~10 cells across, off a ladder running 1 m to 100 km — deliberately wider
than the chips at both ends, so zoomed right out there is still *a* grid rather than none. Steps
are compared on a **log** scale because the ladder is multiplicative: 250 sits between 100 and 500
by ratio, not by subtraction, and nearest-by-ratio is what stops a step feeling like a jump.
Measured at the default view — z10 → 2.5 km cells, z14 → 250 m, z18 → 10 m, z21 → 1 m, never
tripping `MAX_CELLS`. Manual sizes (10 m…1 km) override it. Whichever is in force is printed in the
panel: under Auto it changes as you zoom, so `8 of 20 cells` would otherwise mean nothing.

**Custom origin.** "Set origin" arms a tap that places the plot's corner. That point becomes the
south-west corner of cell **A1**; columns run east (A…Z, AA, AB…), rows run north. Ground south or
west of the origin is *off-plot* — drawn thinner so the lattice stays continuous, but unlabelled
and excluded from the coverage count, so `18 of 40` counts the plot rather than the viewport. The
origin also pins the grid's UTM zone and hemisphere: without it, panning towards a zone boundary
silently renumbers every cell. `GridFrame` carries zone + hemisphere + origin as one value, so a
tap is always resolved in the frame its cells were drawn in — a tap resolved against a different
frame names the wrong cell and nothing on screen looks wrong.

Three ways to place it, in rising order of precision: tap anywhere, **drag the handle**, or **tap a
survey pin** while placing — which snaps to that survey's *recorded* position rather than to where
the finger landed, so a known control point becomes the plot corner exactly. Dragging is why the
handle is a `ViewAnnotation` and not a `Marker`: `Marker` has no drag support, `ViewAnnotation`
carries `draggable` + `onDragStart`/`onDrag`/`onDragEnd`, and Android implements it
(`MLRNPointAnnotation.withDraggable`). The grid rebuilds on `onDragEnd` only — regenerating several
hundred polygons per frame makes the drag itself stutter.

**It is built in UTM, not in degrees, and that is the whole point.** A "100 m" grid drawn as a fixed
number of degrees is not square — a degree of longitude shrinks towards the poles — and worse, it
drifts: the same ground falls in a different cell depending on where the viewport is. That makes
coverage meaningless, which is the one thing a survey grid exists to record. `mobile/src/lib/grid.ts`
carries Snyder's transverse Mercator series on WGS84, written out rather than pulled in (sixty
lines, and the app keeps no geodesy dependency — same call as `next/src/lib/export.ts`).

If you touch that file, re-run the checks it was verified with, because a plausible-looking wrong
answer here is invisible in the UI:

- meridian arc vs. numerical integration of the meridional radius of curvature — matched to
  sub-millimetre at 10°/30°/45°/60°/84°;
- generated 100 m cell edges measured with a Vincenty geodesic — 100.006–100.039 m on all four
  edges in Kalimantan, Sydney, NYC and northern Norway, i.e. exactly the 0.9996 UTM scale factor.

Both checks are self-contained, which is why they are the ones recorded here: spot-checking against
a remembered or copied "known" UTM coordinate proved worthless — the landmark's own latitude and
longitude have to be exactly the ones the quoted easting/northing was derived from, and when they
are not, the disagreement looks identical to a bug in the projection.

### One server change already made

`next/src/lib/auth.ts` — `getUserId()` previously only accepted `Authorization: Bearer` when the
legacy HS256 secret was configured, so a mobile client would silently fail on projects using
asymmetric JWT keys. It now verifies under **both** signing modes (HS256, then JWKS). The cookie
path is untouched.

---

## 2. Traps that will cost you an hour each

- **Do not build Android with JDK 25.** Android Studio bundles it now. The build dies at
  `:react-native-screens:configureCMakeRelWithDebInfo` on *"a restricted method in
  java.lang.System has been called"* — JEP 472 warning that AGP treats as fatal. Use **JDK 17**;
  Gradle keeps one at `~/.gradle/jdks/eclipse_adoptium-17-*`. Point Android Studio's Gradle JDK at
  it, or `npx expo run:android` will keep failing.
- **Expo Go cannot run this app.** `react-native-view-shot` and MapLibre resolve native modules at
  import and throw when absent. They're loaded lazily via `mobile/src/lib/native.ts` so the app
  degrades instead of crashing, but a dev build is required for real use.
- **`.env.local` changes need `npx expo start --clear`.** `EXPO_PUBLIC_*` is inlined at transform
  time and Metro's cache is keyed on file contents, not the environment. Symptom: app stays in
  demo mode after you've configured it.
- **`mobile/android/` shadows `app.json`.** Once prebuild has generated it, plugin changes don't
  apply until you re-run `prebuild --clean`. It's gitignored; delete it to return to managed flow.
- **Release APK is signed with the debug keystore** (Expo template default). Sideloads fine,
  Play Store rejects it.
- **Demo mode state is in memory** — created projects and captures vanish on reload.
- **Route collision:** never put a screen at `app/index.tsx` while `app/(tabs)/index.tsx` exists.
  Both resolve to `/` and navigation silently stops working. Welcome lives at `app/welcome.tsx`
  for this reason.
- **MapLibre's `lngLat` is a `[longitude, latitude]` tuple, not `{lng, lat}`.** Every press event
  carries it that way (`MapPressEvent.kt` → `putArray`). Reading `.lng`/`.lat` yields `undefined`,
  the guard returns early, and the symptom is a map that ignores every tap with no error anywhere.
  Read it through `pressCoords()` in `survey-map.tsx` rather than destructuring it again.
- **`Camera` re-applies its stop whenever a prop's identity changes.** It is `memo`'d on prop
  identity, so a `center={[lng, lat]}` array literal built during render re-flies the camera on
  *every* re-render — each basemap toggle, each feed refresh, each touch. Memoise the array on the
  lat/lng numbers. The same trap applies one level up: key the camera memo on coordinates, never on
  the `markers` array, which is new after every fetch.
- **`null` checks do not catch `NaN`.** A non-finite coordinate reaches Android as `Double.NaN` and
  takes the native renderer down — no JS exception, no stack. `isCoord()` in `survey-map.tsx`
  guards the camera, every marker and the picked point; use it for anything new that reaches
  MapLibre.
- **`Marker` cannot be dragged; `ViewAnnotation` can.** They look interchangeable — both take
  `lngLat`, `anchor` and a child view — but only `ViewAnnotation` exposes `draggable` and the drag
  callbacks. The trade is that on Android it renders its children to a bitmap, so it suits static
  handles and not interactive views. Both events extend `PressEvent`, so `pressCoords()` reads a
  drag result the same way it reads a tap.
- **A symbol layer with no glyph source draws nothing, silently.** The street style ships its own;
  `SATELLITE_STYLE` is ours, so it has to declare `glyphs` explicitly — that is what makes the grid's
  cell labels appear on satellite. OpenFreeMap serves `Noto Sans Regular`/`Medium`/`Bold` only.
- **The `Layer` `style` prop is deprecated** and goes away in MapLibre RN v12. New layers use
  `paint`/`layout` with style-spec kebab-case keys.
- **Esri serves a placeholder tile, not a 404, past its real coverage.** Beyond where imagery
  exists, `World_Imagery` answers **200 OK, `image/jpeg`**, with a byte-identical 2521-byte JPEG
  reading *"Map data not yet available"* — so MapLibre cannot detect it and simply draws it. The
  satellite source's `maxzoom` therefore has to be set to where imagery *actually* stops, not to
  Esri's nominal maximum, or zooming in shows that image. **Sampled 2026-08-29: rural Kalimantan and
  Balikpapan stop at z18; Jakarta and Pontianak reach z19.** Capped globally at 18 — this is a field
  app for rural Indonesia. Re-probe before changing it; a tile's byte size gives it away instantly
  (real imagery is 7–21 kB, the placeholder is always exactly 2521).
- **UTM's false northing belongs to the grid, not to the point.** The southern convention adds
  10 000 km to every northing. Deciding that per point (`if (latitude < 0)`) puts a 10 000 km cliff
  straight through the equator — and this app's default view sits on it, Kalimantan at −0.0376°, so
  it is the *likeliest* place a real survey hits it, not an edge case. `toUtm()` takes an explicit
  `southern`; inside a grid, always pass the grid's, and never let it fall back to the per-point
  default. Shipped wrong once (fixed 2026-08-29); the symptom would have been a grid torn in half
  at latitude zero.

---

## 3. Google login (and other OAuth)

Worth doing, and **free** — unlike Maps, Google OAuth clients cost nothing and need no billing
account. Supabase Auth already supports it; the app just doesn't use it.

Two implementation routes:

**A. Supabase OAuth via browser redirect** — least code.
`supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'geofold://auth' } })`
plus `expo-web-browser` + `expo-linking`. The `geofold` scheme is already set in `app.json`.
Downside: bounces through a browser tab, which feels less native.

**B. Native Google Sign-In** — better UX, more setup.
`@react-native-google-signin/google-signin` → get an ID token → `supabase.auth.signInWithIdToken({
provider: 'google', token })`. Shows the native account picker. Needs SHA-1 fingerprints registered
in Google Cloud for **each** signing key (debug and release — easy to forget).

Setup either way: Google Cloud project → OAuth consent screen → OAuth client IDs (Android + Web) →
paste the Web client ID + secret into Supabase Dashboard → Authentication → Providers → Google.

**Also missing on the auth screen:**

- Password reset — the app currently tells people to use the web app. `resetPasswordForEmail` +
  a deep link would close that.
- Apple Sign-In — *required by App Store review* if you ship any other social login on iOS.
  `expo-apple-authentication` + `signInWithIdToken`.
- Biometric unlock for re-entry (`expo-local-authentication`).
- The design's "Continue with company SSO" button was deliberately omitted — no backend support.
  Supabase SSO (SAML) is a paid plan feature.

---

## 4. Database — free options, and the constraint that rules most of them out

**The constraint: this app is geospatial.** Surveys are stored as `geography(point, 4326)` and the
map feed uses `ST_Intersects` against a bounding box. Anything without PostGIS means either
rewriting that in application code or losing server-side spatial queries.

| Option | Free tier | PostGIS | Auth | Storage | Verdict |
|---|---|---|---|---|---|
| **Supabase** | yes | ✅ | ✅ | ✅ | **Stay here.** Only option covering all three, and the code already targets it. |
| Neon | yes | ✅ | ✗ | ✗ | Good Postgres. You'd add auth + file storage separately. |
| Self-hosted Postgres + PostGIS | VPS cost | ✅ | ✗ | ✗ | Full control, no free tier, you run it. |
| PocketBase | self-host | ✗ (SQLite) | ✅ | ✅ | One binary, auth + storage + DB. Loses spatial SQL. |
| Appwrite Cloud | yes | ✗ | ✅ | ✅ | Complete BaaS, no real geo support. |
| Firebase | yes | ✗ | ✅ | ✅ | Geo queries need geohash workarounds. Big rewrite. |
| Turso / Cloudflare D1 | generous | ✗ | ✗ | ✗ | SQLite. Great for edge, wrong shape for this. |

**Recommendation: stay on Supabase free.** It's the only one that gives Postgres + PostGIS + Auth +
Storage together, and every query in `next/src/lib/` is already written against it. Switching costs
a rewrite and buys nothing while usage is small.

Free-tier limits change — check current numbers before relying on them. The one that actually bites
in practice: **free projects pause after a period of inactivity** and need waking from the
dashboard. For a demo that's an annoyance; for anything customer-facing it's a reason to upgrade or
self-host.

If Supabase ever has to go, the least painful path is **Neon** (Postgres + PostGIS, so the SQL
survives) plus Supabase-compatible auth, or self-hosting the whole stack on a small VPS.

---

## 5. Improvements worth making

Roughly in order of value.

### High

- **Protected-area boundaries.** The grid gives systematic coverage *over* a protected block, but
  there is no way to define the block. Needs a polygon on the server — a table, `GET`/`POST`, and
  `ST_Intersects` against it — then the map can draw the reserve, clip the grid to it, and report
  coverage of the protected area rather than of whatever happens to be in view. This is the natural
  next step for the wildlife-survey use case and is the reason the grid stops where it does.
- **Persist demo state** — back the in-memory store in `mobile/src/lib/demo.ts` with AsyncStorage
  so a reload doesn't wipe it. Currently makes the demo look broken.
- **Google login** — see above.
- **Multiple photos per survey.** The server and schema already support it; the capture UI does
  one. The design's checklist concept assumed several.
- **Background sync.** Sync currently runs on launch, foreground and reconnect. `expo-background-task`
  would drain the outbox while the app is closed.
- **Real keystore** before any distribution.

### Medium

- **Heading in the stamp** — the design shows `heading N 38°`; `expo-location`'s
  `watchHeadingAsync` provides it. Currently only coordinates, accuracy and time are burned in.
- **Marker clustering** at low zoom — MapLibre supports it via `GeoJSONSource` with `cluster`.
- **Export the grid.** A surveyor writing cell references into a notebook wants them in the CSV
  too: add the cell reference of each survey to the export, and a per-cell coverage sheet.
- **Grid cell as a capture target** — "go to cell 16·56" and a nudge when a cell in the plan has no
  survey yet. The coverage shading answers this visually; a worklist would answer it in the field.
- **Offline map tiles** — MapLibre ships an `OfflineManager`. Genuinely useful for a field app in a
  dead zone, and currently unused.
- **Search and filters** in Gallery and Projects.
- **Edit / delete a survey** after capture. The API supports upsert; there's no UI.
- **Export CSV/XLSX from mobile.** `next/src/lib/export.ts` has a dependency-free implementation
  that could be ported.
- **Draft persistence** — if the app dies during the review form, the photo and form are lost.

### Lower

- **Tests.** Neither app has any. The only tests in the repo were xUnit tests in the retired
  `backend/`, and they go with it. `next/src/lib/validation.ts` and `quota.ts` are pure logic and
  the obvious first candidates.
- **Error reporting** (Sentry or similar) — currently a crash in the field leaves no trace.
- **i18n.** The UI is English but field labels are Indonesian (`Catatan`). Pick one or make it real.
- **App icon and splash** are still Expo defaults.
- **CI** — nothing builds or checks automatically.
- **APK size.** Universal APK is ~129 MB because native libs are stored uncompressed across four
  ABIs. ABI splits would give ~53 MB for phones (`arm64-v8a`) plus a separate emulator build.
  Deliberately universal right now so it installs anywhere.

---

## 6. Build commands

```bash
cd mobile && npx expo start --web
```

```bash
cd mobile/android && JAVA_HOME="$USERPROFILE/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2" ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" ./gradlew assembleRelease
```

APK: `mobile/android/app/build/outputs/apk/release/app-release.apk`

That command assembles **every** subproject, so each library's `assembleRelease` and
`lintVitalAnalyzeRelease` run alongside the four-ABI C++ builds and Metro. On a 16 GB machine that
wants roughly **6 GB free** — a cold build with less than that died on a native `malloc` and took
the Gradle daemon with it (`hs_err_pid*.log` in `mobile/android/`, *"insufficient memory for the
Java Runtime Environment"*). Close anything large first. If it still will not fit:

```bash
./gradlew :app:assembleRelease --no-parallel --max-workers=2 -Dkotlin.daemon.jvm.options=-Xmx1024m
```

`:app:` skips the library modules' own assemble and lint tasks. A crashed build leaves an orphaned
Kotlin daemon holding ~1 GB; `./gradlew --stop` does not take it, so kill the stray `java.exe`.

**Never pipe a gradle build through `tail`** — the pipeline's exit status is `tail`'s, so a failed
build reports success.

`mobile/eas.json` also has `preview`/`development` profiles pinned to APK output for cloud builds —
needs `eas login` and `EXPO_PUBLIC_*` supplied via `eas env:create`, since `.env.local` is
gitignored and never reaches EAS.

Checks: `npx tsc --noEmit` · `npm run lint` · `npx expo-doctor`
