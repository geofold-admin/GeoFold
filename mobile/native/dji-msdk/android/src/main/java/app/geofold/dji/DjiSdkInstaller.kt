package app.geofold.dji

import android.app.Application

/**
 * The one line of MSDK V5 integration that is impossible to guess and fatal to omit.
 *
 * The SDK's real classes are **not in the APK**. `dji-sdk-v5-aircraft.aar` ships an almost-empty
 * `classes.jar` plus an `assets/ac.zip`; `dji-sdk-v5-aircraft-provided` carries the API surface but
 * is `compileOnly`, so nothing of it survives to runtime. `Helper.install()` is what unpacks
 * `ac.zip` and installs the real dex through its own classloader. Until it has run, every SDK
 * class — `SDKManager` first — throws `NoClassDefFoundError`.
 *
 * It must run inside `Application.attachBaseContext`, before anything touches the SDK. DJI's sample
 * does exactly this in `DJIAircraftApplication.attachBaseContext`.
 *
 * **Takes the `Application`, not the base `Context`.** During `attachBaseContext` the application
 * is not registered yet, so `base.applicationContext` is null — an earlier version of this file
 * resolved the Application from the base context and silently gave up when it came back null,
 * which produced exactly the `NoClassDefFoundError: dji/v5/manager/SDKManager` this comment exists
 * to prevent. `Helper.install` takes an `Application` and the caller has one: itself.
 *
 * A plain object rather than an Expo `ApplicationLifecycleListener`: that interface has no
 * `attachBaseContext` hook. The call is injected into the generated `MainApplication` by
 * `plugins/with-dji-msdk.js`.
 */
object DjiSdkInstaller {
  @JvmStatic
  fun install(application: Application) {
    // Caught rather than allowed to propagate: this runs in attachBaseContext, so anything thrown
    // here kills the app before it draws a frame — including the survey half, which has nothing to
    // do with DJI. The failure is recorded and surfaced on the Drone screen instead, which is the
    // only place it means anything.
    try {
      com.cySdkyc.clx.Helper.install(application)
    } catch (e: Throwable) {
      DjiSdk.installError = "The DJI SDK could not be unpacked: ${e::class.java.simpleName}: ${e.message}"
    }
  }
}
