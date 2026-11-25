package app.geofold.dji

import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.et.action
import dji.v5.et.create
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.datacenter.media.MediaFile
import dji.v5.manager.datacenter.media.MediaFileDownloadListener
import dji.v5.manager.datacenter.media.PullMediaFileListParam
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/**
 * The JS bridge to DJI Mobile SDK V5.
 *
 * Note what this does *not* do: start the SDK. That happens in `MainApplication.onCreate` via
 * [DjiSdk], because starting it later fails — see the comment there. This module only reports the
 * state [DjiSdk] already holds, and drives the camera.
 */
class DjiMsdkModule : Module() {

  private val relay: (String, Map<String, Any?>) -> Unit = { event, payload ->
    // The SDK calls back on its own threads; sendEvent is safe from any of them.
    runCatching { sendEvent(event, payload) }
  }

  override fun definition() = ModuleDefinition {
    Name("DjiMsdk")

    Events(
      DjiSdk.EVENT_REGISTER,
      DjiSdk.EVENT_PRODUCT,
      DjiSdk.EVENT_INIT_PROCESS,
      DjiSdk.EVENT_TELEMETRY,
      DjiSdk.EVENT_CAMERA,
      DjiSdk.EVENT_PHOTO_TAKEN,
      DjiSdk.EVENT_HEALTH,
    )

    OnCreate {
      DjiSdk.addListener(relay)
    }

    /**
     * Replays current state rather than starting anything.
     *
     * By the time JS asks, the SDK has already been running since process start — so a screen that
     * mounts late must be told what it missed, or it would sit on "Registering…" forever waiting
     * for an event that already fired.
     */
    AsyncFunction("initialize") {
      // Starts the SDK if it is not already running. Kept on this side rather than in
      // Application.onCreate so that a failure inside SDKManager.init — which happens on DJI's own
      // thread pool, uncaught — cannot take the whole app down at launch. See with-dji-msdk.js.
      val application = appContext.reactContext?.applicationContext as? android.app.Application
      if (application != null) DjiSdk.start(application)

      relay(DjiSdk.EVENT_REGISTER, DjiSdk.registerPayload())
      relay(DjiSdk.EVENT_PRODUCT, DjiSdk.productPayload())
      relay(DjiSdk.EVENT_TELEMETRY, DjiSdk.telemetryPayload())
      relay(DjiSdk.EVENT_CAMERA, DjiSdk.cameraPayload())
      relay(DjiSdk.EVENT_HEALTH, DjiSdk.healthPayload())
    }

    AsyncFunction("registerApp") { DjiSdk.retryRegistration() }

    Function("isRegistered") { DjiSdk.isRegistered() }

    /**
     * Shutter, then fetch.
     *
     * A DJI photo is written to the aircraft's own storage — nothing lands on the phone until it is
     * pulled down, which is why this is one call and not two: a survey point with no photo, or a
     * photo with no point, is worse than a failure.
     *
     * The position stamped on the result is the aircraft's telemetry *at the moment of the
     * shutter*, snapshotted before the download starts. The download takes seconds and the aircraft
     * keeps moving; reading position afterwards would record where it drifted to.
     */
    AsyncFunction("capturePhoto") { promise: Promise ->
      val fix = DjiSdk.telemetryPayload() + ("timestamp" to System.currentTimeMillis())

      CameraKey.KeyStartShootPhoto.create().action({
        downloadNewestPhoto(fix, promise)
      }, { error: IDJIError ->
        promise.reject("ERR_SHOOT", "The camera did not take the photo: ${error.description()}", null)
      })
    }

    /**
     * Fetches the newest file off the camera *without* firing the shutter.
     *
     * This is the path for a photo the pilot took with the remote controller's own shutter button:
     * it already exists on the card, and shooting again would produce a second, near-identical
     * frame. The position comes from live telemetry, which for an RC-triggered shot is a moment
     * later than the exposure rather than exactly at it — the aircraft is usually holding station
     * when a survey photo is taken, but it is not the same guarantee as [capturePhoto].
     */
    AsyncFunction("fetchLatestPhoto") { promise: Promise ->
      downloadNewestPhoto(
        DjiSdk.telemetryPayload() + ("timestamp" to System.currentTimeMillis()),
        promise,
      )
    }

    /** Video recording, the other thing the remote controller has a dedicated button for. */
    AsyncFunction("startRecording") { promise: Promise ->
      CameraKey.KeyStartRecord.create().action({
        promise.resolve(null)
      }, { error: IDJIError ->
        promise.reject("ERR_RECORD", "Could not start recording: ${error.description()}", null)
      })
    }

    AsyncFunction("stopRecording") { promise: Promise ->
      CameraKey.KeyStopRecord.create().action({
        promise.resolve(null)
      }, { error: IDJIError ->
        promise.reject("ERR_RECORD", "Could not stop recording: ${error.description()}", null)
      })
    }

    /**
     * The live camera feed, as a native view.
     *
     * A view rather than a stream of frames over the bridge: the SDK decodes directly onto a
     * Surface, and moving 1080p30 through JS would not keep up for a second.
     */
    View(DjiCameraView::class) {
      // onStreamStatus is the black-screen diagnostic: a reading once a second of what the link is
      // actually delivering. See DjiCameraView for why an absence of events would not do.
      Events("onCameraAvailable", "onStreamStatus")

      Prop("componentIndex") { view: DjiCameraView, index: String? ->
        view.componentIndex = runCatching {
          ComponentIndexType.valueOf(index ?: "LEFT_OR_MAIN")
        }.getOrDefault(ComponentIndexType.LEFT_OR_MAIN)
      }

      // How the surface is composited. Switchable from JS because the three orderings cannot be
      // told apart from the native side, and the wrong one is invisible rather than wrong-looking.
      Prop("surfaceMode") { view: DjiCameraView, mode: String? ->
        view.surfaceMode = when (mode) {
          DjiCameraView.MODE_OVERLAY -> DjiCameraView.MODE_OVERLAY
          DjiCameraView.MODE_TOP -> DjiCameraView.MODE_TOP
          else -> DjiCameraView.MODE_NORMAL
        }
      }
    }

    OnDestroy {
      DjiSdk.removeListener(relay)
      // Deliberately NOT SDKManager.destroy(): the SDK belongs to the Application, not to this
      // module. Tearing it down on a JS reload would leave the next instance with a dead SDK.
    }
  }

  /**
   * Pulls the most recent file off the camera and writes it into the app's cache.
   *
   * The list is re-pulled after the shutter — the SDK's cached list is whatever it held before the
   * photo existed. Index 0 is the newest.
   */
  private fun downloadNewestPhoto(fix: Map<String, Any?>, promise: Promise) {
    val mediaManager = MediaDataCenter.getInstance().mediaManager

    mediaManager.pullMediaFileListFromCamera(
      PullMediaFileListParam.Builder().mediaFileIndex(0).count(1).build(),
      object : CommonCallbacks.CompletionCallback {
        override fun onSuccess() {
          val newest: MediaFile? = mediaManager.mediaFileListData?.data?.firstOrNull()
          if (newest == null) {
            promise.reject("ERR_NO_MEDIA", "The camera reported no file after the shutter.", null)
            return
          }
          writeToCache(newest, fix, promise)
        }

        override fun onFailure(error: IDJIError) {
          promise.reject(
            "ERR_MEDIA_LIST",
            "The photo was taken but the file list could not be read: ${error.description()}",
            null,
          )
        }
      },
    )
  }

  /** Streams the file down in chunks and hands JS back a `file://` URI the outbox can store. */
  private fun writeToCache(file: MediaFile, fix: Map<String, Any?>, promise: Promise) {
    val cacheDir = appContext.reactContext?.cacheDir
    if (cacheDir == null) {
      promise.reject("ERR_NO_CACHE", "No cache directory to download into.", null)
      return
    }

    val destination = File(cacheDir, "drone-${System.currentTimeMillis()}.jpg")
    val output = FileOutputStream(destination)
    var failed = false

    file.pullOriginalMediaFileFromCamera(0, object : MediaFileDownloadListener {
      override fun onStart() = Unit

      override fun onProgress(total: Long, current: Long) = Unit

      override fun onRealtimeDataUpdate(data: ByteArray, position: Long) {
        // Chunks arrive in order; appending is what DJI's own sample does.
        if (!failed) output.write(data)
      }

      override fun onFinish() {
        output.flush()
        output.close()
        promise.resolve(HashMap(fix).apply { put("uri", "file://${destination.absolutePath}") })
      }

      override fun onFailure(error: IDJIError) {
        failed = true
        output.close()
        // A half-written file is worse than none — the outbox would upload a truncated JPEG.
        destination.delete()
        promise.reject("ERR_DOWNLOAD", "The photo could not be downloaded: ${error.description()}", null)
      }
    })
  }
}
