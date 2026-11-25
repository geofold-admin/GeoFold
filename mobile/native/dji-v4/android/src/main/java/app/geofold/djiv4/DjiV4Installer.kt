package app.geofold.djiv4

import android.app.Application
import java.io.File

/**
 * Unpacks MSDK V4 and, before that, arranges for a crash to leave a trace.
 *
 * **On the Helper.** The SDK's loader is `com.cySdkyc.clx.Helper` — the *same* fully-qualified name
 * as V5 5.18, not the `com.secneo.sdk.Helper` that older V4 documentation describes. (Both AARs
 * still carry an empty `com/secneo/` directory from the rename, and that shared name is one reason
 * the two SDKs cannot occupy one APK.) Unlike V5, V4 4.18 ships its real classes in the APK's own
 * dex rather than in an encrypted payload — verified by finding `dji.sdk.sdkmanager.DJISDKManager`
 * in `classes*.dex` — but `install()` is still what DJI's samples call, and still runs first.
 *
 * Must run in `Application.attachBaseContext`, and must be handed the `Application` itself:
 * during `attachBaseContext` the application is not registered yet, so `base.applicationContext` is
 * null. Injected into the generated `MainApplication` by `plugins/with-dji-v4.js`.
 */
object DjiV4Installer {

  /** Where the last fatal error is kept, for the Drone screen to show on the next launch. */
  private const val CRASH_FILE = "dji-last-crash.txt"

  @JvmStatic
  fun install(application: Application) {
    // First, so that a crash *in* the install below is itself recorded.
    recordCrashes(application)

    // Caught rather than allowed to propagate: this runs before the app draws a frame, and a throw
    // here would take the survey half of the app down with it.
    try {
      com.cySdkyc.clx.Helper.install(application)
    } catch (e: Throwable) {
      DjiV4Sdk.installError =
        "The DJI SDK could not be unpacked: ${e::class.java.simpleName}: ${e.message}"
    }
  }

  /**
   * Writes the stack trace of any fatal error to disk before the process dies.
   *
   * A crash in the field currently leaves nothing behind: no cable to the phone, no logcat, and a
   * dialog that says only that the app stopped. That has already cost this project several rounds
   * of "it crashed" — "where?" — "I don't know". The trace is written on the way down and shown on
   * the Drone screen the next time it opens, which turns an unreproducible field crash into
   * something that can be read out.
   *
   * The previous handler is always called afterwards, so the app still dies exactly as it would
   * have. This records; it does not swallow. A swallowed fatal error leaves the process in an
   * undefined state, which is worse than the crash.
   */
  private fun recordCrashes(application: Application) {
    val previous = Thread.getDefaultUncaughtExceptionHandler()

    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      runCatching {
        File(application.filesDir, CRASH_FILE).writeText(
          buildString {
            appendLine("thread: ${thread.name}")
            // Readable, not epoch millis: this text is shown to a surveyor, and a raw number
            // beside a red stack trace reads like something happening right now rather than a
            // record of something that already happened.
            appendLine(
              "time: " +
                java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
                  .format(java.util.Date()),
            )
            appendLine()
            appendLine(error.stackTraceToString())
            // The cause chain is where the real reason usually is — an SDK failure arrives wrapped.
            var cause = error.cause
            var depth = 0
            while (cause != null && depth < 5) {
              appendLine("--- caused by ---")
              appendLine(cause.stackTraceToString())
              cause = cause.cause
              depth += 1
            }
          },
        )
      }

      previous?.uncaughtException(thread, error)
    }
  }

  /** The recorded trace, or null. Read by the module for the Drone screen. */
  @JvmStatic
  fun lastCrash(filesDir: File): String? =
    runCatching {
      val file = File(filesDir, CRASH_FILE)
      if (file.exists()) file.readText().takeIf { it.isNotBlank() } else null
    }.getOrNull()

  /** Clears it, so a fixed crash stops being reported. */
  @JvmStatic
  fun clearCrash(filesDir: File) {
    runCatching { File(filesDir, CRASH_FILE).delete() }
  }
}
