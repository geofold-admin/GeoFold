const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withGradleProperties,
  withMainApplication,
  AndroidConfig,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin wiring DJI Mobile SDK V5 into the Android build.
 *
 * Every value here was read off DJI's own sample project rather than from documentation prose,
 * because the parts that matter are the parts the prose does not mention. Sources:
 *   SampleCode-V5/android-sdk-v5-sample/build.gradle
 *   SampleCode-V5/android-sdk-v5-sample/src/main/AndroidManifest.xml
 *   .../src/main/java/dji/sampleV5/aircraft/DJIAircraftApplication.kt
 *
 * MSDK V5 is **Android only** — DJI dropped iOS for V5 — so this plugin deliberately touches
 * nothing on the iOS side.
 */

const SDK_VERSION = '5.18.0';

/** The meta-data key DJI reads the App Key from. Exact string; a typo here fails at registration. */
const API_KEY_META = 'com.dji.sdk.API_KEY';

/**
 * Native libraries that must survive the release build untouched.
 *
 * The SDK's own libraries are signature-checked at load, so a stripped .so fails registration with
 * an error that points nowhere near the build config. This list is DJI's, not a guess.
 */
const DO_NOT_STRIP = [
  '*/*/libconstants.so',
  '*/*/libdji_innertools.so',
  '*/*/libdjibase.so',
  '*/*/libDJICSDKCommon.so',
  '*/*/libDJIFlySafeCore-CSDK.so',
  '*/*/libdjifs_jni-CSDK.so',
  '*/*/libDJIRegister.so',
  '*/*/libdjisdk_jni.so',
  '*/*/libDJIUpgradeCore.so',
  '*/*/libDJIUpgradeJNI.so',
  '*/*/libDJIWaypointV2Core-CSDK.so',
  '*/*/libdjiwaypointv2_jni-CSDK.so',
  '*/*/libFlightRecordEngine.so',
  '*/*/libvideo-framing.so',
  '*/*/libwaes.so',
  '*/*/libagora-rtsa-sdk.so',
  '*/*/libc++.so',
  '*/*/libc++_shared.so',
  '*/*/libmrtc_28181.so',
  '*/*/libmrtc_agora.so',
  '*/*/libmrtc_core.so',
  '*/*/libmrtc_core_jni.so',
  '*/*/libmrtc_data.so',
  '*/*/libmrtc_log.so',
  '*/*/libmrtc_onvif.so',
  '*/*/libmrtc_rtmp.so',
  '*/*/libmrtc_rtsp.so',
];

/** Adds the App Key, the USB accessory plumbing, and the permissions the SDK needs. */
function withDjiManifest(config, { appKey }) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      API_KEY_META,
      appKey,
    );

    // A DJI aircraft reaches the phone as a USB *accessory*, not a USB host device. Without both
    // the feature declaration and the intent filter, Android never hands the app the connection
    // and the SDK simply reports no product — with no error to explain why.
    manifest.manifest['uses-feature'] = [
      ...(manifest.manifest['uses-feature'] ?? []),
      { $: { 'android:name': 'android.hardware.usb.accessory', 'android:required': 'true' } },
    ];

    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    mainActivity['intent-filter'] = [
      ...(mainActivity['intent-filter'] ?? []),
      { action: [{ $: { 'android:name': 'android.hardware.usb.action.USB_ACCESSORY_ATTACHED' } }] },
    ];
    mainActivity['meta-data'] = [
      ...(mainActivity['meta-data'] ?? []),
      {
        $: {
          'android:name': 'android.hardware.usb.action.USB_ACCESSORY_ATTACHED',
          'android:resource': '@xml/accessory_filter',
        },
      },
    ];

    return mod;
  });
}

/*
 * There is deliberately no `withAccessoryFilter` here.
 *
 * `@xml/accessory_filter` is shipped *by the SDK* — `res/xml/accessory_filter.xml` inside
 * dji-sdk-v5-aircraft.aar — and lists the accessory identities DJI hardware actually presents:
 *
 *     T600, HG210, WM160, com.dji.logiclink, com.dji.link
 *
 * An earlier version of this plugin wrote its own file at that path with invented model names
 * ("DJI-Accessory"). Because an app's resources override a library's, that shadowed DJI's real
 * list with one matching no hardware on earth, and plugging in a remote controller did nothing at
 * all — Android had nothing to match, so it never handed the app the accessory.
 *
 * The manifest still references `@xml/accessory_filter`; it now resolves to the SDK's copy.
 * Do not recreate this file.
 */

/**
 * Ships DJI's `libc++_shared.so` instead of React Native's.
 *
 * Both DJI's AAR and React Native carry a `libc++_shared.so`, and only one can be packaged. The
 * `pickFirst` rule resolved it to React Native's, and the result was:
 *
 *     dlopen failed: cannot locate symbol "__cxa_init_primary_exception"
 *     referenced by ".../lib/arm64/libdjisdk_jni.so"
 *
 * Measured: DJI's copy (1 253 544 bytes) exports that symbol; the NDK 27 copy React Native ships
 * (1 794 776 bytes) does not. DJI's native libraries were built against the older libc++ that still
 * exported it, so nothing of the SDK can load without it. DJI's own sample never meets this because
 * it has no React Native pulling in a newer libc++.
 *
 * Written into the *app's* `src/main/jniLibs`, which wins the merge against a library dependency's
 * copy. The file is vendored at `native/dji-msdk/libs/` rather than fished out of the Gradle cache,
 * whose path contains a version and a hash and is not something a build should depend on.
 *
 * **The trade:** React Native's own native libraries now run against DJI's older libc++. That is
 * the direction that usually works — the ABI is stable and the older library is a superset here —
 * but if some RN library needs a symbol only the newer one has, it will fail the same way, loudly,
 * at launch. Re-check this whenever either React Native or the DJI SDK is upgraded.
 */
function withDjiLibcxx(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const source = path.join(
        mod.modRequest.projectRoot,
        'native/dji-msdk/libs/arm64-v8a/libc++_shared.so',
      );
      if (!fs.existsSync(source)) {
        throw new Error(
          `with-dji-msdk: missing ${source}. Extract libc++_shared.so from the ` +
            'dji-sdk-v5-aircraft AAR (jni/arm64-v8a/) and vendor it there.',
        );
      }

      const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/jniLibs/arm64-v8a');
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(source, path.join(dir, 'libc++_shared.so'));
      return mod;
    },
  ]);
}

/**
 * The Gradle side: the three DJI artifacts, the ABI restriction, and the packaging rules.
 *
 * `abiFilters 'arm64-v8a'` is DJI's own setting and is not optional — MSDK V5 ships arm64 only.
 * It is also a real product constraint: this build will not install on an x86 emulator, and not on
 * 32-bit armeabi-v7a hardware either. The survey app next door stays universal; only this one is
 * narrowed, which is a large part of why it is a separate app.
 */
function withDjiGradle(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('with-dji-msdk: expected app/build.gradle to be Groovy.');
    }
    if (mod.modResults.contents.includes('dji-sdk-v5-aircraft')) {
      return mod; // already applied
    }

    const dependencies = `
    // ── DJI Mobile SDK V5 ─────────────────────────────────────────────────────
    // Three artifacts on three different configurations, and the configurations are load-bearing:
    // the "-provided" one is compileOnly (API surface only, kept out of the APK) and networkImp is
    // runtimeOnly. Promoting either to implementation gives duplicate-class build failures.
    implementation 'com.dji:dji-sdk-v5-aircraft:${SDK_VERSION}'
    compileOnly 'com.dji:dji-sdk-v5-aircraft-provided:${SDK_VERSION}'
    runtimeOnly 'com.dji:dji-sdk-v5-networkImp:${SDK_VERSION}'
`;

    let contents = mod.modResults.contents.replace(
      /dependencies\s*\{/,
      (match) => `${match}\n${dependencies}`,
    );

    const androidBlock = `
    // ── DJI Mobile SDK V5 ─────────────────────────────────────────────────────
    defaultConfig {
        ndk { abiFilters 'arm64-v8a' }
    }
    packagingOptions {
        // NOTE: legacy jniLibs packaging is deliberately NOT set here. The Expo template declares
        // its own jniLibs useLegacyPackaging block further down this same file, and the later one
        // wins — so it is set through the expo.useLegacyPackaging gradle property instead. See
        // withLegacyJniPackaging below for why it matters at all.
        pickFirst 'lib/*/libc++_shared.so'
        doNotStrip ${DO_NOT_STRIP.map((lib) => `'${lib}'`).join('\n        doNotStrip ')}
    }
`;

    contents = contents.replace(/android\s*\{/, (match) => `${match}\n${androidBlock}`);
    mod.modResults.contents = contents;
    return mod;
  });
}

/**
 * Narrows the build to arm64 at the property React Native actually reads.
 *
 * `abiFilters` alone is not enough and the failure is silent: RN's Gradle plugin applies its own
 * ABI configuration from `reactNativeArchitectures` afterwards, so the APK ends up carrying all
 * four architectures. DJI ships **arm64 only** — so that APK installs happily on an armeabi-v7a or
 * x86 device and then fails when the SDK cannot load its libraries, which looks like a
 * registration fault rather than a packaging one.
 *
 * Verified by unzipping the built APK: with `abiFilters` alone it contained lib/arm64-v8a,
 * lib/armeabi-v7a, lib/x86 and lib/x86_64.
 */
function withArm64Only(config) {
  return withGradleProperty(config, 'reactNativeArchitectures', 'arm64-v8a');
}

/**
 * Makes Android extract the native libraries to disk at install time.
 *
 * The SDK loads its own `.so` files through `Helper`'s classloader, from real filesystem paths.
 * Since AGP 4.2 the default is the opposite — leave them compressed in the APK and map them
 * straight from there (`android:extractNativeLibs="false"`) — so they never reach the filesystem
 * and DJI's loader finds nothing. The app launches, and then dies the moment anything touches the
 * SDK. DJI's sample sets `android:extractNativeLibs="true"` on `<application>` for exactly this.
 *
 * Set as a gradle property rather than in `packagingOptions`, because the Expo template declares
 * its own `jniLibs { useLegacyPackaging ... }` later in `app/build.gradle` and the last block wins.
 * `expo.useLegacyPackaging` is the input that block reads.
 */
function withLegacyJniPackaging(config) {
  return withGradleProperty(config, 'expo.useLegacyPackaging', 'true');
}

/** Sets a gradle.properties entry, replacing any existing value for the key. */
function withGradleProperty(config, key, value) {
  return withGradleProperties(config, (mod) => {
    const existing = mod.modResults.find(
      (item) => item.type === 'property' && item.key === key,
    );
    if (existing) {
      existing.value = value;
    } else {
      mod.modResults.push({ type: 'property', key, value });
    }
    return mod;
  });
}

/**
 * Injects `Helper.install()` into the Application's `attachBaseContext`.
 *
 * This is the single most omittable and least discoverable step in the whole integration. The SDK
 * unpacks obfuscated native components there, and it has to happen before anything else touches
 * the SDK — DJI's sample does it in `DJIAircraftApplication.attachBaseContext`. Miss it and
 * registration fails at runtime with a message that mentions none of this.
 */
function withDjiApplication(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.contents.includes('DjiSdkInstaller')) {
      return mod; // already applied
    }
    if (mod.modResults.language !== 'kt') {
      throw new Error('with-dji-msdk: expected a Kotlin MainApplication.');
    }

    // `this`, not `base`. During attachBaseContext the application is not registered yet, so
    // `base.applicationContext` is null — deriving the Application from it silently no-ops and the
    // SDK never installs, which surfaces later as NoClassDefFoundError on dji/v5/manager/SDKManager.
    // Both halves, in DJI's order: unpack the SDK in attachBaseContext, then start it in onCreate.
    // Splitting them apart — starting the SDK later, from a screen — fails with
    // UnsatisfiedLinkError on dji.jni.JNIKeyValue, because the JNI bindings only resolve for the
    // classloader Helper installs and init() does native work immediately. See DjiSdk.kt.
    const attachBaseContext = `
  override fun attachBaseContext(base: Context?) {
    super.attachBaseContext(base)
    // DJI MSDK V5: unpacks the SDK. Must be here, not onCreate. See plugins/with-dji-msdk.js.
    app.geofold.dji.DjiSdkInstaller.install(this)
  }
`;

    // Inserted after the class's opening brace so it lands inside the class body regardless of
    // what else the Expo template puts in there.
    let contents = mod.modResults.contents.replace(
      /class MainApplication[^{]*\{/,
      (match) => `${match}\n${attachBaseContext}`,
    );

    if (contents === mod.modResults.contents) {
      throw new Error('with-dji-msdk: could not find the MainApplication class body to patch.');
    }

    // The SDK is deliberately NOT started from onCreate.
    //
    // DJI's sample does start it there, and matching that was tried — it did not fix the
    // UnsatisfiedLinkError on dji.jni.JNIKeyValue, and it turned a broken screen into an app that
    // could not launch at all: SDKManager.init does its work on its own thread pool, so the
    // exception is uncaught on a background thread and takes the process down at startup.
    //
    // Started from JS instead, the same failure is contained to the Drone screen and the rest of
    // the survey app keeps working. That is not a fix, it is damage control, and it stays this way
    // until the link error itself is understood.

    mod.modResults.contents = contents.includes('import android.content.Context')
      ? contents
      : contents.replace(/^(package .*\n)/m, `$1\nimport android.content.Context\n`);

    return mod;
  });
}

module.exports = function withDjiMsdk(config, props = {}) {
  const appKey = props.appKey ?? process.env.DJI_APP_KEY;

  if (!appKey) {
    // Deliberately loud. A missing key does not fail the build — it fails at registration, on the
    // device, in the field, with an error that reads like a network problem.
    throw new Error(
      'with-dji-msdk: no DJI App Key. Set DJI_APP_KEY, or pass { appKey } to the plugin.\n' +
        'Get one at developer.dji.com — it is bound to the Android package name, which must be\n' +
        'exactly the `android.package` in app.json.\n' +
        'Note: this is needed for every gradle build, not only for `expo prebuild` — expo-constants\n' +
        're-evaluates app.json (and so every plugin) in its createExpoConfig task.',
    );
  }

  config = withDjiManifest(config, { appKey });
  config = withDjiLibcxx(config);
  config = withDjiGradle(config);
  config = withDjiApplication(config);
  config = withArm64Only(config);
  config = withLegacyJniPackaging(config);
  return config;
};
