const {
  withAndroidManifest,
  withAppBuildGradle,
  withGradleProperties,
  withMainApplication,
  AndroidConfig,
} = require('expo/config-plugins');

/**
 * Expo config plugin wiring DJI Mobile SDK **V4** into the Android build.
 *
 * Sibling of `with-dji-msdk.js`, which does the same job for V5. They are deliberately separate
 * files rather than one parameterised plugin: almost nothing carries over. Different artifacts,
 * different ABIs, different native libraries, a different `doNotStrip` list, and a different
 * relationship with the app manifest — V4's AAR declares far more of its own.
 *
 * **These two can never be applied to the same build.** Six native libraries share filenames
 * between the SDKs (`libDJICSDKCommon.so`, `libDJIUpgradeCore.so`, `libDJIUpgradeJNI.so`,
 * `libSdkyclx_clx.so`, `libdataclx.so`, `libwaes.so`) and an APK has one slot per name; both also
 * ship a class called `com.cySdkyc.clx.Helper`, with different implementations. Measured from the
 * 4.18 and 5.18 artifacts, not assumed. `scripts/prepare-variant.js` links exactly one.
 *
 * Values here were read off the shipped `dji-sdk-4.18.aar` rather than from documentation.
 */

const SDK_VERSION = '4.18';

/** The meta-data key DJI reads the App Key from — the same name in both SDK generations. */
const API_KEY_META = 'com.dji.sdk.API_KEY';

/**
 * V4 ships three ABIs and no x86_64.
 *
 * React Native builds four by default, and the extra one is not harmless: an APK carrying RN's
 * x86_64 libraries but none of DJI's installs happily on an x86_64 emulator and then fails when the
 * SDK cannot load, which presents as a registration fault rather than a packaging one. Restricting
 * RN to what DJI actually ships keeps the two in step. (V5 is arm64-only for the same reason; V4 is
 * simply less narrow.)
 */
const ABIS = 'armeabi-v7a,arm64-v8a,x86';

/**
 * Native libraries that must survive the release build untouched. Read from `jni/arm64-v8a/` in the
 * shipped AAR — 31 of them. A stripped `.so` fails at load with an error pointing nowhere near the
 * build config.
 */
const DO_NOT_STRIP = [
  'libDJICSDKCommon.so', 'libDJIFlySafeCore.so', 'libDJIMOP.so', 'libDJIMOPJni.so',
  'libDJISDKLOGJNI.so', 'libDJIUpgradeCore.so', 'libDJIUpgradeJNI.so', 'libDJIWaypointV2Core.so',
  'libDjiAffinity.so', 'libDjiLiveviewAR.so', 'libFR.so', 'libFRCorkscrew.so', 'libFlyForbid.so',
  'libGroudStation.so', 'libLiveviewARCore.so', 'libSDKRelativeJNI.so', 'libSdkyclx_clx.so',
  'libUpgradeVerify.so', 'libdataclx.so', 'libdjifs_jni.so', 'libdjisqlcipher.so', 'libdjivideo.so',
  'libdjiwpv2.so', 'libffmpeg.so', 'libnative-buffer.so', 'librtk-lib.so', 'libsfjni.so',
  'libudt.so', 'libudtjni.so', 'libwaes.so', 'libyuv2.so',
];

/**
 * Adds the App Key and hands the aircraft's USB accessory to the main activity.
 *
 * Deliberately adds **no permissions and no `accessory_filter`**: unlike V5, the V4 AAR declares
 * its own `uses-permission` set, the `android.hardware.usb.accessory` feature, and ships
 * `res/xml/accessory_filter.xml` itself. Writing our own copy of that file would *shadow* DJI's —
 * an app's resources beat a library's — and replace the real accessory identities with invented
 * ones, so plugging in a controller would do nothing at all. That exact mistake was made once on
 * the V5 side; see the note in `with-dji-msdk.js`.
 *
 * What the AAR cannot do is name the activity, so the intent filter goes here.
 */
function withDjiV4Manifest(config, { appKey }) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, API_KEY_META, appKey);

    /*
     * Apache HTTP, without which V4 cannot register at all.
     *
     * MSDK V4's own HTTP client — `dji.thirdparty.afinal.FinalHttp` — is built on `org.apache.http`,
     * which Android **removed from the bootclasspath at API 28**. It still ships as an optional
     * shared library, but only for apps that ask for it by name.
     *
     * Without this the app dies the moment the Drone screen opens:
     *
     *     java.lang.NoClassDefFoundError: Failed resolution of: Lorg/apache/http/params/BasicHttpParams;
     *         at dji.thirdparty.afinal.FinalHttp.<init>
     *         at dji.sdk.sdkmanager.DJISDKManager.registerApp
     *     FATAL EXCEPTION: UrgentThreadPool#1
     *
     * Note the thread. It is thrown asynchronously on DJI's own pool, inside a callback, so no
     * try/catch around `registerApp` can contain it and the process goes down regardless of how
     * defensively the calling code is written. The declaration is the only fix.
     *
     * `required="false"` so the APK still installs on a device or image that lacks the library;
     * the SDK is what needs it, and the rest of the survey app does not.
     *
     * V5 does not need this — it dropped the Apache-based client — which is why the V5 variant runs
     * on the same phone without it.
     */
    application['uses-library'] = [
      ...(application['uses-library'] ?? []),
      { $: { 'android:name': 'org.apache.http.legacy', 'android:required': 'false' } },
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

/**
 * The Gradle side: the two artifacts, multidex, ABI filters and packaging rules.
 *
 * `multiDexEnabled` is not optional. V4 is a large SDK with a large transitive tree (gson, wire,
 * bouncycastle, jts, eventbus, disruptor…) and a release build crosses the 64k method limit; the
 * failure is a dex merge error that names none of this.
 */
function withDjiV4Gradle(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('with-dji-v4: expected app/build.gradle to be Groovy.');
    }
    if (mod.modResults.contents.includes("com.dji:dji-sdk:")) {
      return mod; // already applied
    }

    const dependencies = `
    // ── DJI Mobile SDK V4 ─────────────────────────────────────────────────────
    // Two artifacts, two configurations, and the split is load-bearing: "-provided" is the API
    // surface only and must stay compileOnly, or it duplicates the implementation at runtime.
    implementation 'com.dji:dji-sdk:${SDK_VERSION}'
    compileOnly 'com.dji:dji-sdk-provided:${SDK_VERSION}'
`;

    let contents = mod.modResults.contents.replace(
      /dependencies\s*\{/,
      (match) => `${match}\n${dependencies}`,
    );

    const androidBlock = `
    // ── DJI Mobile SDK V4 ─────────────────────────────────────────────────────
    defaultConfig {
        multiDexEnabled true
        ndk { abiFilters ${ABIS.split(',').map((a) => `'${a}'`).join(', ')} }
    }
    packagingOptions {
        // The SDK's transitive tree ships several copies of these; without pickFirst the merge
        // fails outright rather than choosing.
        pickFirst 'lib/*/libc++_shared.so'
        pickFirst 'lib/*/libstlport_shared.so'
        pickFirst 'lib/*/libRSSupport.so'
        exclude 'META-INF/rxjava.properties'
        doNotStrip ${DO_NOT_STRIP.map((lib) => `'*/*/${lib}'`).join('\n        doNotStrip ')}
    }
`;

    contents = contents.replace(/android\s*\{/, (match) => `${match}\n${androidBlock}`);
    mod.modResults.contents = contents;
    return mod;
  });
}

/** Sets a gradle.properties entry, replacing any existing value for the key. */
function withGradleProperty(config, key, value) {
  return withGradleProperties(config, (mod) => {
    const existing = mod.modResults.find((item) => item.type === 'property' && item.key === key);
    if (existing) existing.value = value;
    else mod.modResults.push({ type: 'property', key, value });
    return mod;
  });
}

/**
 * Injects `Helper.install()` into the Application's `attachBaseContext`.
 *
 * Same shape as the V5 plugin and the same two traps: it must be `attachBaseContext` rather than
 * `onCreate`, and it must be handed `this` rather than `base` — during `attachBaseContext` the
 * application is not registered yet, so `base.applicationContext` is null and an installer derived
 * from it silently no-ops, surfacing much later as `NoClassDefFoundError` on an SDK class.
 */
function withDjiV4Application(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.contents.includes('DjiV4Installer')) return mod;
    if (mod.modResults.language !== 'kt') {
      throw new Error('with-dji-v4: expected a Kotlin MainApplication.');
    }

    const attachBaseContext = `
  override fun attachBaseContext(base: Context?) {
    super.attachBaseContext(base)
    // DJI MSDK V4: unpacks the SDK. Must be here, not onCreate. See plugins/with-dji-v4.js.
    app.geofold.djiv4.DjiV4Installer.install(this)
  }
`;

    let contents = mod.modResults.contents.replace(
      /class MainApplication[^{]*\{/,
      (match) => `${match}\n${attachBaseContext}`,
    );

    if (contents === mod.modResults.contents) {
      throw new Error('with-dji-v4: could not find the MainApplication class body to patch.');
    }

    mod.modResults.contents = contents.includes('import android.content.Context')
      ? contents
      : contents.replace(/^(package .*\n)/m, `$1\nimport android.content.Context\n`);

    return mod;
  });
}

module.exports = function withDjiV4(config, props = {}) {
  const appKey = props.appKey ?? process.env.DJI_APP_KEY_V4 ?? process.env.DJI_APP_KEY;

  if (!appKey) {
    // Deliberately loud, for the same reason as the V5 plugin: a missing key does not fail the
    // build, it fails at registration, on the device, with an error that reads like a network fault.
    throw new Error(
      'with-dji-v4: no DJI App Key. Set DJI_APP_KEY_V4 (or DJI_APP_KEY), or pass { appKey }.\n' +
        'The key is bound to the Android package name, which for this variant is\n' +
        '`app.geofold.drone.v4` — a key issued for another package fails registration with an\n' +
        'error that reads like a network problem.\n' +
        'Note: needed for every gradle build, not only `expo prebuild` — expo-constants\n' +
        're-evaluates app.config.js (and so every plugin) in its createExpoConfig task.',
    );
  }

  config = withDjiV4Manifest(config, { appKey });
  config = withDjiV4Gradle(config);
  config = withDjiV4Application(config);
  config = withGradleProperty(config, 'reactNativeArchitectures', ABIS);
  // The SDK loads its own .so files from real filesystem paths; since AGP 4.2 the default leaves
  // them compressed in the APK, where DJI's loader finds nothing. Same fix as the V5 build.
  config = withGradleProperty(config, 'expo.useLegacyPackaging', 'true');
  return config;
};
