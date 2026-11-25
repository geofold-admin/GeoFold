# GeoFold Drone — DJI setup

**A second version of the survey app, not a second app.** One codebase, one set of screens; the
drone variant is everything GeoFold already does — map, grid, projects, gallery, capture, sync —
plus a Drone screen reached from Profile. It ships under its own package name so it installs
*alongside* the standard build rather than replacing it.

```bash
npm run prebuild            # standard GeoFold        → app.geofold.mobile
npm run prebuild:drone      # GeoFold Drone           → app.geofold.drone
cd android && ./gradlew :app:assembleRelease
```

Switching variants means re-running prebuild: they produce different manifests, different ABIs and
a different native module set, so one `android/` cannot serve both.

### Why the module lives in `native/`, not `modules/`

Expo autolinks everything under `modules/` unconditionally — a module sitting there is compiled and
packaged whether the app config asked for it or not. The DJI module pulls roughly a quarter of a
gigabyte of native libraries and forces the APK to arm64, and inflicting that on a survey team with
no drone would be indefensible. So `native/dji-msdk/` is the source of truth (a path autolinking
does not scan) and `scripts/prepare-variant.js` copies it into `modules/` for the drone variant
only. **`modules/` is generated and gitignored — never edit anything in it.**

Everything below was read off DJI's own sample project, their Maven artifacts and the shipped jars,
not from prose docs — noted per item, because the parts that bite are the parts the prose leaves
out.

---

## 1. What DJI actually supports

**MSDK V5 is Android only.** DJI dropped iOS for V5. There is no path to an iOS drone build that
does not mean the older MSDK V4 and a different (older) set of aircraft.

| SDK | Aircraft | Platforms |
|---|---|---|
| **V5** (5.18.0, used here) | Matrice 4D / 4 Enterprise, Matrice 350 RTK, M300 RTK, Mavic 3 Enterprise series, M30 / M30T, Mini 3, Mini 3 Pro, Mini 4 Pro | Android |
| **V4** (4.16+) | Air 2S, Mini 2, Mini SE, Mavic Air 2, Mavic Mini, Phantom 4 RTK, Mavic 2 Pro / Zoom / Enterprise, M200 V2 series | Android, iOS |
| *neither* | Mavic 3 *consumer*, Air 3 / 3S, Mini 4K, Neo, Avata | — |

There is **no build that covers every DJI drone.** V4 and V5 are different SDKs with conflicting
native libraries and separate registration; supporting both means two product flavours, not one
APK. V5 was chosen first because it carries the RTK-capable aircraft, and centimetre positioning is
what makes drone data worth anything for survey work.

### Why the camera stayed black for days (2026-09-04)

**The test aircraft was a Mavic Mini, and it is a V4 aircraft.** MSDK V5 does not support it. The
symptom was maddening precisely because the SDK does *not* refuse an unsupported aircraft cleanly:
it reported a product id, answered `KeyAircraftLocation3D`, `KeyCompassHeading` and
`KeyGPSSatelliteCount`, and let `putCameraStreamSurface` succeed — while never reporting a camera
and never sending a byte of video. Everything looked connected and healthy.

What finally named it, in order:

1. `Video: no frames` under every one of the three surface modes, which ruled out the whole
   rendering path;
2. DJI's own status code, decoded — `0x1F100059` is **"Ready to GO"**. The aircraft had no fault at
   all, so there was no fault to fix;
3. the model, checked against the matrix above.

**Do not spend time on the V5 video path with a V4 aircraft attached.** The first question when the
feed is black is *which drone is this*, and the second is what `Camera payload` says under Info — an
aircraft that reports no camera cannot be argued with.

Note also that everything built on the V5 path — the stream enable, the camera-index fallback, the
surface-mode switch, the HMS diagnostics, the HUD — is **still unproven**, because it has never been
run against an aircraft this SDK supports.

## 2. Before anything will run — the App Key

Registration is not optional and cannot be stubbed.

1. Create a developer account at [developer.dji.com](https://developer.dji.com).
2. Create an app of type **Mobile SDK**, and give it the package name
   **`app.geofold.drone`** — the key is bound to it. A mismatch fails registration with an error
   that reads like a network problem.
3. Put the key where the build can find it: `DJI_APP_KEY=...` in the environment, or pass
   `{ appKey }` to the plugin in `app.json`.

**`DJI_APP_KEY` must be set for every Gradle build, not just for `prebuild`.** `expo-constants`
re-evaluates `app.json` — and therefore every config plugin — during the build itself, in a task
called `createExpoConfig`. Without the variable the build fails there, and the message arrives
wrapped in an `expo-constants` failure that looks nothing like a DJI problem:

```bash
DJI_APP_KEY=... ./gradlew :app:assembleRelease
```

The plugin throws rather than defaulting on purpose. A missing key does not break the build
otherwise — it breaks registration, on the device, in the field, with an error that reads like a
network fault.

The first registration on a device **needs internet** — it calls DJI's servers, then caches. It
also downloads a fly-safe database of tens of megabytes on that first run. Later launches work
offline, which is the only reason this is viable as a field app at all.

## 3. Build constraints this imposes

- **arm64-v8a only.** MSDK V5 ships no other architecture, so this APK **will not install on an x86
  emulator, or on 32-bit armeabi-v7a hardware.** The survey app next door stays universal; only
  this one narrows. That constraint is a large part of why it is a separate app.

  `abiFilters` alone does **not** achieve this, and it fails silently: React Native's Gradle plugin
  applies its own ABI configuration from the `reactNativeArchitectures` property *after* the
  `android {}` block, so the APK ends up carrying all four. Caught by unzipping a built APK and
  finding `lib/armeabi-v7a`, `lib/x86` and `lib/x86_64` alongside arm64. The plugin now sets
  `reactNativeArchitectures=arm64-v8a` as well. The consequence of missing it is nasty: the APK
  installs happily on a 32-bit or x86 device and then fails when the SDK cannot load its
  libraries — which presents as a registration fault, not a packaging one.

- **The APK is large: ~386 MB release, arm64 only.** MSDK V5's native libraries are big and
  `doNotStrip` keeps all of them. For comparison the survey app is 170 MB across four ABIs. Play
  Store distribution would need an app bundle; sideloading is unaffected.
- **`doNotStrip` for 28 native libraries.** The SDK's libraries are checked at load; a stripped
  `.so` fails registration with an error pointing nowhere near the build config. The list is DJI's
  and is reproduced in the config plugin.
- **Three artifacts, three configurations** — `implementation` / `compileOnly` / `runtimeOnly`.
  Promoting any of them gives duplicate-class build failures.
- **`Helper.install()` in `attachBaseContext`, taking the `Application`.** The least discoverable
  step in the whole integration, and the one that already bit once.

  The SDK's classes are **not in the APK**. `dji-sdk-v5-aircraft.aar` ships an almost-empty
  `classes.jar` plus `assets/ac.zip`; `dji-sdk-v5-aircraft-provided` holds the API surface but is
  `compileOnly`, so none of it survives to runtime. `Helper.install()` is what unpacks `ac.zip` and
  installs the real dex through its own classloader. Until it has run, every SDK class throws
  `NoClassDefFoundError` — `dji/v5/manager/SDKManager` first, since that is what registration
  touches.

  It takes an `Application`, and it must be handed the Application *itself*. During
  `attachBaseContext` the application is not yet registered, so `base.applicationContext` is
  **null**; an earlier version of the installer derived the Application from the base context and
  returned quietly when it came back null. The build succeeded, the APK packaged, and the app
  failed on the device with `NoClassDefFoundError: dji/v5/manager/SDKManager` — a message that
  points at the SDK rather than at the silent `?: return` that caused it.
- **USB accessory, not USB host.** An aircraft arrives as a USB *accessory*. Without the feature
  declaration, the intent filter and `res/xml/accessory_filter.xml`, Android never hands over the
  connection and the SDK just reports no product, silently.

## 4. Building

```bash
cd drone
DJI_APP_KEY=... npx expo prebuild --platform android
cd android && DJI_APP_KEY=... ./gradlew :app:assembleRelease
```

APK: `drone/android/app/build/outputs/apk/release/app-release.apk`.

Separate from the survey app in every respect — its own Gradle project, its own package
(`app.geofold.drone` vs `app.geofold.mobile`), its own output. The two install side by side.

## 5. State of this code

**Nothing here has been run against an aircraft.** No DJI hardware and no App Key were available
when it was written, so what exists is the integration scaffold: the native wiring is transcribed
from DJI's sample, and the Kotlin bridges only the connection lifecycle.

Verified by building:

- the Kotlin module **compiles against the real SDK** — artifacts resolve from Maven Central and
  `SDKManager`, all seven `SDKManagerCallback` signatures, `IDJIError.description()`,
  `isRegistered` / `destroy()` / `registerApp()` and `Helper.install()` all type-check;
- `:app:checkDuplicateClasses` passes, so the three-artifact configuration split is right;
- a release APK builds, carries **only** `lib/arm64-v8a`, and contains the DJI native libraries.

Verified by reading DJI's sources: artifact coordinates and version (Maven Central), the
`com.dji.sdk.API_KEY` meta-data name, the USB accessory manifest entries, the `doNotStrip` list
(sample `build.gradle` / `AndroidManifest.xml`), `Helper.install()` placement
(`DJIAircraftApplication.kt`), and the `SDKManager` / `SDKManagerCallback` API surface
(`MSDKManagerVM.kt`).

**Not verified, because it needs the hardware:** that registration actually succeeds against DJI's
servers, that an aircraft connects over USB, and that the SDK survives R8 in release. The build
above used a placeholder key, which is enough to compile and package but not to register.

## 5b. The V4 variant — for the Mavic Mini and the older fleet

Added 2026-09-04, because the aircraft this project owns is a Mavic Mini and **V5 does not support
it**. Same app, same screens, same outbox; a different SDK underneath.

```bash
npm run prebuild:drone-v4      # GeoFold Drone V4 → app.geofold.drone.v4
cd android && DJI_APP_KEY_V4=... ./gradlew :app:assembleRelease
```

**One JS surface, two native modules.** Both register as the Expo module `DjiMsdk` and emit the
same events under the same names, so `native/dji-msdk/src/index.ts` and the whole Drone screen drive
either one without knowing which is underneath. `scripts/prepare-variant.js` links exactly one into
`modules/`; it clears *both* first, because leaving the other behind would be linked by autolinking
and the two cannot coexist.

### Why they cannot coexist — measured, not assumed

Both SDKs were unzipped and compared:

- **Six native libraries share a filename**: `libDJICSDKCommon.so`, `libDJIUpgradeCore.so`,
  `libDJIUpgradeJNI.so`, `libSdkyclx_clx.so`, `libdataclx.so`, `libwaes.so`. An APK has exactly one
  slot at `lib/<abi>/<name>.so`, so one SDK would load the other's library.
- **Both ship `com.cySdkyc.clx.Helper`** — the same fully-qualified class, two different
  implementations. (Older V4 documentation says `com.secneo.sdk.Helper`; 4.18 renamed it to match
  V5. Both AARs still carry an empty `com/secneo/` directory from that rename.)
- One `com.dji.sdk.API_KEY` meta-data slot, and one USB accessory intent-filter, for two SDKs that
  both want them.

### What differs from V5

| | V5 | V4 |
|---|---|---|
| ABIs | arm64-v8a only | armeabi-v7a, arm64-v8a, x86 |
| Registration | `init()` **then** `registerApp()` | `registerApp()` once — then `startConnectionToProduct()`, which is easy to miss and without which no product is ever reported |
| Telemetry | per-key listeners | one pushed `FlightControllerState` at ~10 Hz |
| Video | hand the SDK a `Surface`, it decodes | **the SDK hands *you* raw H.264**; you pump it into a `DJICodecManager` |
| Health | `DeviceStatusManager` + `DeviceHealthManager` | neither; the model and camera name are what there is |
| Photo download | `MediaDataCenter` | `MediaManager`, and the camera **must** be switched to `MEDIA_DOWNLOAD` mode first and back afterwards — in shooting mode the file list is simply empty, with no error |
| Dex | — | `multiDexEnabled true` is required; the transitive tree crosses 64k methods |

The inverted video path is an accident in this project's favour: because the bytes pass through
`DjiV4CameraView`, the frames-per-second reading is a **direct measurement** rather than the
inference it has to be on V5.

### `org.apache.http.legacy` — without it V4 cannot start at all

**The single most expensive line in the V4 plugin.** MSDK V4's internal HTTP client,
`dji.thirdparty.afinal.FinalHttp`, is built on `org.apache.http`, which Android **removed from the
bootclasspath at API 28**. It still ships as an optional shared library, but only for apps that name
it. Without the declaration the app dies the instant the Drone screen opens:

```
java.lang.NoClassDefFoundError: Failed resolution of: Lorg/apache/http/params/BasicHttpParams;
    at dji.thirdparty.afinal.FinalHttp.<init>
    at com.dji.frame.util.V_AppUtils.getFinalHttpWithSSL
    at dji.sdk.sdkmanager.DJISDKManager.registerApp
FATAL EXCEPTION: UrgentThreadPool#1
```

Note the thread: it is thrown **asynchronously on DJI's own pool**, inside a callback. No `try`/
`catch` around `registerApp` can contain it, however defensively the calling code is written — the
process goes down regardless. Hardening the Kotlin was tried first and did nothing. The manifest
declaration is the only fix:

```xml
<uses-library android:name="org.apache.http.legacy" android:required="false" />
```

Confirmed working on the device by logcat:

```
D/nativeloader: Configuring clns-4 for other apk /system/framework/org.apache.http.legacy.jar
                uses_libraries=ALL ... app.geofold.drone.v4
```

V5 does not need this — it dropped the Apache-based client — which is exactly why the V5 variant
runs on the same phone and the V4 one did not.

### Reading a crash with no cable to the phone

`DjiV4Installer` installs an uncaught-exception handler in `attachBaseContext` — the earliest point
in the process — which writes the stack trace and cause chain to `files/dji-last-crash.txt` on the
way down, then delegates to the previous handler so the app still dies normally. The Drone screen
shows it at the top of **Info** on the next launch, with a button to clear it.

It records; it does not swallow. A swallowed fatal error leaves the process in an undefined state,
which is worse than the crash. This is the gap `NEXT-STEPS.md` §5 lists as "a crash in the field
leaves no trace", closed for the drone screens at least.

### Flight controls, and why they are tapped twice

Take off, Land and Return to home are on the HUD's left column. Each **arms on the first tap and
sends on the second**, relabelling to "Tap to confirm" and disarming itself after four seconds.
These lift a real aircraft off the ground, land it, or send it home unattended; one mis-tap on a
phone held one-handed at a survey site is not an acceptable way to start a takeoff.

**Cancel RTH and Confirm landing fire on a single tap, deliberately.** Stopping an automated flight
is the one command a pilot may need instantly, and gating it behind a confirmation would be the
dangerous choice. "Confirm landing" appears only when the aircraft asks — it hovers and waits when
it is unsure of the ground beneath it (`isLandingConfirmationNeeded`).

The buttons swap on live state: Take off becomes Land once `isFlying`, Return home becomes Cancel
RTH once `isGoingHome`. All of it comes from the same pushed `FlightControllerState` as the
telemetry, at about 10 Hz.

**V4 only so far.** The module reports `flightControls: true` in its telemetry payload and the HUD
hides the controls when that is absent — V5's takeoff/landing keys are not on `FlightControllerKey`
and were not written blind against hardware that could not be tested. A dead Return-to-home button
would be worse than none.

### What else the HUD drives

| On the HUD | |
|---|---|
| Battery | Chip in the status row; amber ≤30%, red ≤15% — DJI's own warning thresholds |
| Gimbal pitch | −90° / −45° / 0°, **absolute** angles. A survey wants a known pitch — straight down for a nadir frame — and relative nudges drift off it over a flight. No arming: moving the camera cannot hurt anyone |
| Flight mode | In the telemetry strip |

| Under **Info** | |
|---|---|
| ISO | AUTO / 100 / 200 / 400 / 800 |
| Exposure compensation | −2 … +2 stops |
| Set home here | Home point at the aircraft's current position |
| Reset gimbal | |
| Return altitude | 30 / 50 / 80 / 120 m — how high an automatic return climbs before flying home |

Camera settings are in the panel rather than on the HUD deliberately: they are set before a flight,
not adjusted while watching the feed.

**Camera settings pass DJI's own enum names** (`ISO_400`, `N_1_0`) straight through to `valueOf`
rather than going via a curated list. The enums are large — 33 exposure-compensation values alone —
and a hardcoded subset would mean a second place to edit every time the UI offers one more. An
unknown name is rejected *with the name in the message*, which beats a silent no-op.

Gimbal pitch is clamped to −90…+30° on the native side, the Mavic Mini's physical range; asking for
more gets a less helpful refusal from the aircraft than from us.

### Survey missions — planning is separate from flying, deliberately

`src/lib/mission.ts` turns the survey grid into a flight plan: a waypoint at each cell centre, a
photo action at each, and the rows walked **alternately** — a boustrophedon, the way a field is
ploughed. Straight west-to-east rows would make the aircraft cross the plot empty between every
row; on a 20-cell-wide plot that is nineteen wasted crossings, which on a Mini's battery is the
difference between finishing a plot and not.

The plot is centred on the **aircraft**, not the map viewport, because on the Drone screen the
aircraft is the only frame of reference the pilot has. Longitude degrees are divided by cos(lat)
when sizing the box, or the plot is not square on the ground — the one thing the UTM grid exists to
prevent.

**Planning works on every aircraft. Flying does not.** DJI withholds waypoint missions from
airframes without obstacle avoidance — the **Mavic Mini among them** — and refuses at upload. That
refusal is DJI's own `DJIError`, passed through verbatim rather than reworded: "this aircraft does
not support waypoint missions" is exactly what needs reading, and a friendlier message would hide
the errors that mean something else.

So on a Mini the route still draws on the minimap and can be flown by hand, and the coverage the
grid asks for is still achievable. On a Mavic 2, Air 2S, Mavic Air 2 or Phantom 4, Upload → Start
flies it.

Mission settings worth knowing:

- `finishedAction(NO_ACTION)` — hovers at the end rather than landing. A survey ends at the last
  cell, which is not where the pilot is standing, and landing there is rarely what was wanted.
- `setExitMissionOnRCSignalLostEnabled(false)` — a dropped controller link does not abandon the
  plan. Continuing to fly a known route is the safer thing to be doing at that moment.
- 99 waypoints is DJI's per-mission ceiling; a larger plot is **truncated, not rejected**, and the
  panel says how many points the plan holds. Half a plot flown beats an error.

Upload and Start are armed (tap twice); **Stop is one tap**, like every other abort on this screen.

### Its own App Key

The DJI developer portal has one **Mobile SDK** app type covering both SDK generations — there is
no separate V4/V5 choice. What a key is bound to is the **package name**, so this variant needs its
own app entry for `app.geofold.drone.v4`. Set it as `DJI_APP_KEY_V4` (the plugin falls back to
`DJI_APP_KEY`, which builds fine but fails registration on the device, because that key belongs to
`app.geofold.drone`).

## 6. Order of work

1. ~~**Connect** — register the SDK, report the aircraft.~~ *(built)*
2. ~~**Telemetry + photo** — position, altitude, heading, satellites; shutter, pull the file off the
   aircraft, queue it in the shared outbox.~~ *(built)*
3. **Live video** — the SDK's decoder onto a native surface. *(built; black against the aircraft —
   see below)*
4. **Automated missions** — waypoints generated from the survey grid, flown as a DJI mission.

4 is where this becomes a product, and also where it acquires real safety consequences — it flies
the aircraft.

### The Drone screen is a head-up display

Full-screen feed, minimap on the left, telemetry along the bottom, shutter and record under the
right thumb — the arrangement a ground station uses, because a pilot reads the video and the
position together.

**It locks to landscape, and only it does.** The rest of the app is portrait (`orientation` in
`app.base.json`); this screen calls `ScreenOrientation.lockAsync(LANDSCAPE)` on mount and restores
`PORTRAIT_UP` on unmount. The camera is 16:9 — in portrait a full-width feed covers about a third
of the screen and the rest is letterbox, which is not a full-screen camera in any useful sense. The
restore lives in the effect's cleanup rather than on the back button, because back is not the only
way off the screen.

Two details in `components/drone-minimap.tsx` are load-bearing and neither is obvious:

- **`androidView="texture"`.** MapLibre renders to a `GLSurfaceView` by default, and the camera
  feed under it is a `SurfaceView`. Two surfaces in one window are composited by SurfaceFlinger
  *outside* the view hierarchy, so their order is not the JSX's — the map would either disappear
  behind the video or punch a hole through it, silently. A `TextureView` draws inside the hierarchy
  like any other view.
- **`pointerEvents="none"`.** MapLibre RN v11 exposes no prop to disable panning, and a pilot who
  nudges the minimap reaching for the shutter would drag it off the aircraft with no way back.

The minimap is not `SurveyMap`: that component carries the basemap toggle, the ruler, the grid and
its panels, sized for a full screen. Over a video feed its chrome would cover the thing it floats on.

### The black feed, and how to tell which black feed it is

The view is registered and the app is stable, but no picture arrives. That symptom is worth
describing carefully, because **four unrelated faults produce the identical black rectangle** and
the field has no cable to the phone and no log to read:

1. the stream is switched off — an aircraft that can send several leaves the unasked-for ones off
   to save link bandwidth (`enableStream`);
2. the surface is bound to a camera index this aircraft does not have — `putCameraStreamSurface`
   accepts any index and simply never sends a frame;
3. registration threw, and the `runCatching` around it swallowed the reason;
4. frames are arriving and being decoded onto a surface that is not visible — a rendering fault
   with nothing wrong on the link at all.

1–3 are now handled or reported: the stream is enabled before every registration, an index the
aircraft does not list falls back to one it does, and a registration failure is surfaced instead of
swallowed. The surface is also re-registered when the aircraft reports its cameras, which arrives
*after* the view has been created — the first registration is a guess made before the aircraft had
said anything.

Which leaves telling 4 apart from the rest, and that is what the readings are for. A
`ReceiveStreamListener` counts bytes off the link **before any decoding**, and the screen reports a
reading once a second whether or not anything arrives. The short form is the `Video` chip along the
top of the HUD; the full set is under **Info**, which opens by itself whenever no aircraft is
attached:

| Reading | What it means |
|---|---|
| `Video: 1920×1080 · 30 fps · 4.1 Mbps` and still black | The link is fine. The fault is the surface — the decoder is drawing somewhere the screen is not showing. Z-order or clipping of the `SurfaceView`, not DJI. |
| `Video: no frames`, `Aircraft reports` lists cameras | Nothing is being sent on this camera. Tap the other indices listed — they are tappable for exactly this — before suspecting the view. |
| `Aircraft reports: nothing yet` | The SDK has not reported a camera at all: payload still starting up, or no camera on the aircraft. |
| An error under **Info** | `putCameraStreamSurface` itself failed; the message is DJI's. |

A silence has to be reported as a reading (`0 fps`) rather than as an absence of events — JS cannot
tell an absence from a listener that was never attached.

#### Both fixable causes are switchable in the field

Each guess at this costs a six-minute build and a flight, so neither remaining guess is compiled in:

- **Camera index** — the chips under `Aircraft reports`. An index the aircraft does not have accepts
  the surface and then sends nothing.
- **Surface mode** — `normal` / `overlay` / `top`, under **Surface**. A `SurfaceView`'s pixels are
  not drawn by the view hierarchy: the hierarchy punches a transparent hole and SurfaceFlinger
  composites the buffer *behind the window*. When that hole does not come through — an opaque
  ancestor, a hardware layer, or a second surface in the same window (the minimap) fighting for
  order — frames decode perfectly into a black rectangle and nothing logs anything.

  | Mode | Ordering | Use |
  |---|---|---|
  | `normal` | Behind the window, hole punched | Default; what a video player uses, HUD draws over it |
  | `overlay` | `setZOrderMediaOverlay(true)` — above other *surfaces*, below the hierarchy | Try first: fixes surface-vs-surface order and **keeps the HUD** |
  | `top` | `setZOrderOnTop(true)` — above the window | Diagnostic: no hole to fail, so video here and nowhere else proves compositing was the fault. **Hides the HUD**, Info included |

  The mode is echoed back in the status reading, so whatever ends up working records *what* worked.
  It is deliberately **not persisted**: `top` covers every control on the screen, so leaving and
  re-entering has to be the way back out.

  Z-order can only be set **before the surface is created** — `setZOrderOnTop` on a live
  `SurfaceView` does nothing, silently — so switching mode rebuilds the `SurfaceView` rather than
  reconfiguring it.

### Open decisions in what is built

- **Aerial photos are not stamped.** The ground app refuses to save a survey unless the coordinates
  are burned into the JPEG — that stamp is its evidentiary model, and `capture.tsx` will not let a
  surveyor past it. A photo from the aircraft arrives already taken, so this path bypasses that
  guarantee entirely. Three ways out: re-encode with a stamp on the phone after download, rely on
  the drone's own EXIF GPS as the evidence, or accept aerial photos as unstamped and say so in the
  export. This was left open deliberately rather than decided quietly — it is a question about
  evidence, not about code.
- **Project selection.** `captureDroneSurvey` takes a project, but the screen currently hardcodes
  `drone-test`. Wiring the real project list is the next slice.
- **Capture position is the live telemetry at the shutter**, snapshotted before the download
  starts, not the photo's own EXIF. Close enough for a survey point and far better than reading it
  after a download that takes seconds while the aircraft moves — but it is not the camera's own
  record of where it was.

### Notes on fidelity

- `accuracyMeters` is stored as `null`. The aircraft reports a satellite *count*, not a horizontal
  accuracy estimate; the count goes into `detailsJson` rather than a metre figure being invented.
- Altitude is **relative to the take-off point** (DJI's definition), not an elevation. Stored as
  `altitudeAboveTakeoff` and labelled as such in the UI.
