package app.geofold.djiv4

import dji.common.camera.SettingsDefinitions
import dji.common.gimbal.Rotation
import dji.common.gimbal.RotationMode
import dji.common.mission.waypoint.Waypoint
import dji.common.mission.waypoint.WaypointAction
import dji.common.mission.waypoint.WaypointActionType
import dji.common.mission.waypoint.WaypointMission
import dji.common.mission.waypoint.WaypointMissionFinishedAction
import dji.common.mission.waypoint.WaypointMissionFlightPathMode
import dji.common.mission.waypoint.WaypointMissionGotoWaypointMode
import dji.common.mission.waypoint.WaypointMissionHeadingMode
import dji.common.error.DJIError
import dji.common.util.CommonCallbacks
import dji.sdk.media.DownloadListener
import dji.sdk.media.MediaFile
import dji.sdk.media.MediaManager
import dji.sdk.sdkmanager.DJISDKManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * The JS bridge to DJI Mobile SDK **V4**.
 *
 * Registers under the name `DjiMsdk` — the same name the V5 module uses — on purpose. Only one of
 * the two is ever linked into a build (`scripts/prepare-variant.js` chooses), and sharing the name
 * means both are driven by one JS surface, `native/dji-msdk/src/index.ts`, and by one Drone screen
 * that never learns which SDK is underneath.
 */
class DjiV4Module : Module() {

  private val relay: (String, Map<String, Any?>) -> Unit = { event, payload ->
    runCatching { sendEvent(event, payload) }
  }

  override fun definition() = ModuleDefinition {
    Name("DjiMsdk")

    Events(
      DjiV4Sdk.EVENT_REGISTER,
      DjiV4Sdk.EVENT_PRODUCT,
      DjiV4Sdk.EVENT_INIT_PROCESS,
      DjiV4Sdk.EVENT_TELEMETRY,
      DjiV4Sdk.EVENT_CAMERA,
      DjiV4Sdk.EVENT_PHOTO_TAKEN,
      DjiV4Sdk.EVENT_HEALTH,
    )

    OnCreate { DjiV4Sdk.addListener(relay) }

    /** Starts the SDK if it is not running, then replays current state for a late-mounting screen. */
    AsyncFunction("initialize") {
      val application = appContext.reactContext?.applicationContext as? android.app.Application
      if (application != null) DjiV4Sdk.start(application)

      relay(DjiV4Sdk.EVENT_REGISTER, DjiV4Sdk.registerPayload())
      relay(DjiV4Sdk.EVENT_PRODUCT, DjiV4Sdk.productPayload())
      relay(DjiV4Sdk.EVENT_TELEMETRY, DjiV4Sdk.telemetryPayload())
      relay(DjiV4Sdk.EVENT_CAMERA, DjiV4Sdk.cameraPayload())
      relay(DjiV4Sdk.EVENT_HEALTH, DjiV4Sdk.healthPayload())
    }

    AsyncFunction("registerApp") { DjiV4Sdk.retryRegistration() }

    /**
     * The stack trace of the last fatal error, or null.
     *
     * Exists because a crash in the field otherwise leaves nothing to go on: no cable to the phone,
     * no logcat, and a system dialog that says only that the app stopped.
     */
    AsyncFunction("lastCrash") {
      appContext.reactContext?.filesDir?.let { DjiV4Installer.lastCrash(it) }
    }

    AsyncFunction("clearCrash") {
      appContext.reactContext?.filesDir?.let { DjiV4Installer.clearCrash(it) }
    }

    Function("isRegistered") { DjiV4Sdk.isRegistered() }

    /** Shutter, then pull the file down — one call, for the same reason as the V5 module. */
    AsyncFunction("capturePhoto") { promise: Promise ->
      val fix = DjiV4Sdk.telemetryPayload() + ("timestamp" to System.currentTimeMillis())
      val camera = DJISDKManager.getInstance().product?.camera
      if (camera == null) {
        promise.reject("ERR_NO_CAMERA", "The aircraft is not reporting a camera.", null)
        return@AsyncFunction
      }

      camera.startShootPhoto { error: DJIError? ->
        if (error != null) {
          promise.reject("ERR_SHOOT", "The camera did not take the photo: ${error.description}", null)
        } else {
          // The file is not on the card the instant the shutter returns; the system-state callback
          // reports the falling edge of "shooting", and that is what onPhotoTaken watches. A short
          // settle here is cruder but keeps this call self-contained.
          downloadNewest(fix, promise)
        }
      }
    }

    AsyncFunction("fetchLatestPhoto") { promise: Promise ->
      downloadNewest(
        DjiV4Sdk.telemetryPayload() + ("timestamp" to System.currentTimeMillis()),
        promise,
      )
    }

    AsyncFunction("startRecording") { promise: Promise ->
      val camera = DJISDKManager.getInstance().product?.camera
      if (camera == null) {
        promise.reject("ERR_NO_CAMERA", "The aircraft is not reporting a camera.", null)
        return@AsyncFunction
      }
      camera.startRecordVideo { error: DJIError? ->
        if (error == null) promise.resolve(null)
        else promise.reject("ERR_RECORD", "Could not start recording: ${error.description}", null)
      }
    }

    AsyncFunction("stopRecording") { promise: Promise ->
      val camera = DJISDKManager.getInstance().product?.camera
      if (camera == null) {
        promise.reject("ERR_NO_CAMERA", "The aircraft is not reporting a camera.", null)
        return@AsyncFunction
      }
      camera.stopRecordVideo { error: DJIError? ->
        if (error == null) promise.resolve(null)
        else promise.reject("ERR_RECORD", "Could not stop recording: ${error.description}", null)
      }
    }

    /*
     * Flight commands.
     *
     * These move a real aircraft, so each one is a single explicit call that reports DJI's own
     * error text on failure rather than swallowing it — a takeoff that silently did nothing is far
     * more dangerous than one that says why. Confirmation lives in the UI, not here: the native
     * side must stay a thin, predictable command surface, or two layers end up each assuming the
     * other asked.
     *
     * Cancel operations are deliberately *not* gated behind anything. Stopping an automated flight
     * is the one command a pilot may need instantly.
     */
    AsyncFunction("takeOff") { promise: Promise -> flight("take off", promise) { it.startTakeoff(cb(promise)) } }

    AsyncFunction("land") { promise: Promise -> flight("land", promise) { it.startLanding(cb(promise)) } }

    AsyncFunction("cancelLanding") { promise: Promise ->
      flight("cancel the landing", promise) { it.cancelLanding(cb(promise)) }
    }

    /** The aircraft hovers and waits for this when it is unsure of the ground beneath it. */
    AsyncFunction("confirmLanding") { promise: Promise ->
      flight("confirm the landing", promise) { it.confirmLanding(cb(promise)) }
    }

    AsyncFunction("goHome") { promise: Promise -> flight("return home", promise) { it.startGoHome(cb(promise)) } }

    AsyncFunction("cancelGoHome") { promise: Promise ->
      flight("cancel the return", promise) { it.cancelGoHome(cb(promise)) }
    }

    /** Sets home to where the aircraft is now — worth having when it took off before a GPS lock. */
    AsyncFunction("setHomeHere") { promise: Promise ->
      flight("set the home point", promise) { it.setHomeLocationUsingAircraftCurrentLocation(cb(promise)) }
    }

    /*
     * Gimbal.
     *
     * Absolute angles, not relative: a survey wants the camera at a known pitch — straight down for
     * a nadir shot, level for context — and relative nudges drift away from that over a flight.
     * `time` is the seconds DJI is allowed to take getting there; a small value is a snap, and 0
     * makes some firmware ignore the command entirely.
     */
    AsyncFunction("setGimbalPitch") { degrees: Double, promise: Promise ->
      val gimbal = DjiV4Sdk.gimbal()
      if (gimbal == null) {
        promise.reject("ERR_NO_GIMBAL", "No gimbal is connected.", null)
        return@AsyncFunction
      }
      // Clamped to what a Mavic Mini's gimbal can physically reach; asking for more is rejected by
      // the aircraft with a less helpful message than this.
      val pitch = degrees.coerceIn(-90.0, 30.0).toFloat()
      val rotation = Rotation.Builder()
        .mode(RotationMode.ABSOLUTE_ANGLE)
        .pitch(pitch)
        .time(1.0)
        .build()
      runCatching { gimbal.rotate(rotation, cb(promise)) }.onFailure {
        promise.reject("ERR_GIMBAL", "Could not move the gimbal: ${it.message}", null)
      }
    }

    AsyncFunction("resetGimbal") { promise: Promise ->
      val gimbal = DjiV4Sdk.gimbal()
      if (gimbal == null) promise.reject("ERR_NO_GIMBAL", "No gimbal is connected.", null)
      else runCatching { gimbal.reset(cb(promise)) }
        .onFailure { promise.reject("ERR_GIMBAL", "Could not reset the gimbal: ${it.message}", null) }
    }

    /*
     * Camera settings.
     *
     * Each takes DJI's own enum *name* rather than a curated list, and resolves it with `valueOf`.
     * The enums are large — 33 exposure-compensation values alone — and hardcoding a subset here
     * would mean a second place to edit every time the UI offers one more. An unknown name is
     * rejected with the name in the message, which is far easier to debug than a silent no-op.
     */
    AsyncFunction("setIso") { value: String, promise: Promise ->
      cameraSetting(promise, "ISO", value) { camera, v ->
        camera.setISO(SettingsDefinitions.ISO.valueOf(v), cb(promise))
      }
    }

    AsyncFunction("setShutterSpeed") { value: String, promise: Promise ->
      cameraSetting(promise, "shutter speed", value) { camera, v ->
        camera.setShutterSpeed(SettingsDefinitions.ShutterSpeed.valueOf(v), cb(promise))
      }
    }

    AsyncFunction("setExposureCompensation") { value: String, promise: Promise ->
      cameraSetting(promise, "exposure compensation", value) { camera, v ->
        camera.setExposureCompensation(SettingsDefinitions.ExposureCompensation.valueOf(v), cb(promise))
      }
    }

    AsyncFunction("setExposureMode") { value: String, promise: Promise ->
      cameraSetting(promise, "exposure mode", value) { camera, v ->
        camera.setExposureMode(SettingsDefinitions.ExposureMode.valueOf(v), cb(promise))
      }
    }

    /** Metres above the take-off point that an automatic return climbs to before flying home. */
    AsyncFunction("setGoHomeAltitude") { metres: Int, promise: Promise ->
      flight("set the return altitude", promise) {
        it.setGoHomeHeightInMeters(metres.coerceIn(20, 500), cb(promise))
      }
    }

    /*
     * Waypoint missions.
     *
     * **Not every aircraft will accept one.** DJI withholds waypoint support from airframes without
     * obstacle avoidance — the Mavic Mini among them — and the refusal arrives as an ordinary
     * `DJIError` from `loadMission` or `uploadMission`. That error is passed through verbatim rather
     * than reworded, because "this aircraft does not support waypoint missions" is exactly what a
     * surveyor needs to read, and inventing our own wording for it would only obscure the ones that
     * mean something else.
     *
     * The plan itself is built in JS (`lib/mission.ts`) from the survey grid. This side only flies
     * it: it takes a list of points and turns them into DJI's objects.
     */
    AsyncFunction("uploadMission") { points: List<Map<String, Any?>>, settings: Map<String, Any?>, promise: Promise ->
      val operator = DjiV4Sdk.missionOperator()
      if (operator == null) {
        promise.reject("ERR_NO_MISSION", "No aircraft is connected.", null)
        return@AsyncFunction
      }
      if (points.isEmpty()) {
        promise.reject("ERR_EMPTY_MISSION", "The plan has no waypoints.", null)
        return@AsyncFunction
      }

      val speed = (settings["speed"] as? Number)?.toFloat() ?: 5f
      val shootPhotos = settings["shootPhotos"] as? Boolean ?: true

      val builder = WaypointMission.Builder()
        .autoFlightSpeed(speed)
        .maxFlightSpeed(speed.coerceAtLeast(2f))
        .headingMode(WaypointMissionHeadingMode.AUTO)
        .flightPathMode(WaypointMissionFlightPathMode.NORMAL)
        // Hover at the end rather than land: a survey ends where the last cell is, which is not
        // where the pilot is standing, and an automatic landing there is rarely what was wanted.
        .finishedAction(WaypointMissionFinishedAction.NO_ACTION)
        // If the controller link drops mid-mission the aircraft keeps flying the plan rather than
        // abandoning it — the plan is the safer thing to be doing at that moment.
        .setExitMissionOnRCSignalLostEnabled(false)
        .gotoFirstWaypointMode(WaypointMissionGotoWaypointMode.SAFELY)

      for (point in points) {
        val lat = (point["latitude"] as? Number)?.toDouble() ?: continue
        val lng = (point["longitude"] as? Number)?.toDouble() ?: continue
        val alt = (point["altitude"] as? Number)?.toFloat() ?: 30f
        val waypoint = Waypoint(lat, lng, alt)
        // A photo at every waypoint is the entire point of a survey mission; without it the
        // aircraft flies the pattern and brings back nothing.
        if (shootPhotos) {
          waypoint.addAction(WaypointAction(WaypointActionType.START_TAKE_PHOTO, 0))
        }
        builder.addWaypoint(waypoint)
      }

      val loadError = runCatching { operator.loadMission(builder.build()) }.getOrElse {
        promise.reject("ERR_MISSION", "The plan could not be prepared: ${it.message}", null)
        return@AsyncFunction
      }
      if (loadError != null) {
        promise.reject("ERR_MISSION_LOAD", loadError.description, null)
        return@AsyncFunction
      }

      runCatching { operator.uploadMission(cb(promise)) }.onFailure {
        promise.reject("ERR_MISSION_UPLOAD", "The plan could not be uploaded: ${it.message}", null)
      }
    }

    AsyncFunction("startMission") { promise: Promise -> mission("start the mission", promise) { it.startMission(cb(promise)) } }

    AsyncFunction("stopMission") { promise: Promise -> mission("stop the mission", promise) { it.stopMission(cb(promise)) } }

    AsyncFunction("pauseMission") { promise: Promise -> mission("pause the mission", promise) { it.pauseMission(cb(promise)) } }

    AsyncFunction("resumeMission") { promise: Promise -> mission("resume the mission", promise) { it.resumeMission(cb(promise)) } }

    View(DjiV4CameraView::class) {
      Events("onCameraAvailable", "onStreamStatus")

      Prop("componentIndex") { view: DjiV4CameraView, index: String? ->
        view.componentIndex = index ?: "LEFT_OR_MAIN"
      }

      Prop("surfaceMode") { view: DjiV4CameraView, mode: String? ->
        view.surfaceMode = when (mode) {
          DjiV4CameraView.MODE_OVERLAY -> DjiV4CameraView.MODE_OVERLAY
          DjiV4CameraView.MODE_TOP -> DjiV4CameraView.MODE_TOP
          else -> DjiV4CameraView.MODE_NORMAL
        }
      }
    }

    OnDestroy { DjiV4Sdk.removeListener(relay) }
  }

  /** Runs a mission command, or says why it cannot. */
  private fun mission(
    what: String,
    promise: Promise,
    action: (dji.sdk.mission.waypoint.WaypointMissionOperator) -> Unit,
  ) {
    val operator = DjiV4Sdk.missionOperator()
    if (operator == null) {
      promise.reject("ERR_NO_MISSION", "No aircraft is connected, so it cannot $what.", null)
      return
    }
    runCatching { action(operator) }.onFailure {
      promise.reject("ERR_MISSION", "Could not $what: ${it.message ?: it.javaClass.simpleName}", null)
    }
  }

  /** Applies one camera setting, turning an unknown enum name into a message rather than a crash. */
  private fun cameraSetting(
    promise: Promise,
    what: String,
    value: String,
    apply: (dji.sdk.camera.Camera, String) -> Unit,
  ) {
    val camera = DjiV4Sdk.camera()
    if (camera == null) {
      promise.reject("ERR_NO_CAMERA", "The aircraft is not reporting a camera.", null)
      return
    }
    runCatching { apply(camera, value) }.onFailure {
      promise.reject("ERR_SETTING", "This camera does not accept $what \"$value\".", null)
    }
  }

  /** Resolves or rejects with DJI's own wording — the text the forums are written against. */
  private fun cb(promise: Promise) = CommonCallbacks.CompletionCallback { error: DJIError? ->
    if (error == null) promise.resolve(null)
    else promise.reject("ERR_FLIGHT", error.description, null)
  }

  /** Runs a flight command, or explains why it cannot. */
  private fun flight(
    what: String,
    promise: Promise,
    action: (dji.sdk.flightcontroller.FlightController) -> Unit,
  ) {
    val controller = DjiV4Sdk.flightController()
    if (controller == null) {
      promise.reject("ERR_NO_AIRCRAFT", "No aircraft is connected, so it cannot $what.", null)
      return
    }
    runCatching { action(controller) }.onFailure {
      promise.reject("ERR_FLIGHT", "Could not $what: ${it.message ?: it.javaClass.simpleName}", null)
    }
  }

  /**
   * Pulls the newest photo off the card.
   *
   * **The camera has to be put into `MEDIA_DOWNLOAD` mode first, and put back afterwards.** This is
   * the V4 quirk with no V5 equivalent: in shooting mode the media list is simply empty, with no
   * error to say why — and leaving the camera in download mode afterwards means the next shutter
   * press does nothing.
   */
  private fun downloadNewest(fix: Map<String, Any?>, promise: Promise) {
    val camera = DJISDKManager.getInstance().product?.camera
    val manager = camera?.mediaManager
    if (camera == null || manager == null) {
      promise.reject("ERR_NO_MEDIA", "This aircraft's camera has no media manager.", null)
      return
    }

    val cacheDir = appContext.reactContext?.cacheDir
    if (cacheDir == null) {
      promise.reject("ERR_NO_CACHE", "No cache directory to download into.", null)
      return
    }

    camera.setMode(SettingsDefinitions.CameraMode.MEDIA_DOWNLOAD) { modeError: DJIError? ->
      if (modeError != null) {
        promise.reject("ERR_MODE", "Could not switch the camera to download mode: ${modeError.description}", null)
        return@setMode
      }

      manager.refreshFileListOfStorageLocation(SettingsDefinitions.StorageLocation.SDCARD) { listError: DJIError? ->
        if (listError != null) {
          restoreShootMode(camera)
          promise.reject("ERR_MEDIA_LIST", "The file list could not be read: ${listError.description}", null)
          return@refreshFileListOfStorageLocation
        }

        // Newest last in DJI's list, so the tail is the photo just taken.
        val newest = runCatching { manager.sdCardFileListSnapshot?.lastOrNull() }.getOrNull()
        if (newest == null) {
          restoreShootMode(camera)
          promise.reject("ERR_NO_MEDIA", "The camera reported no file after the shutter.", null)
          return@refreshFileListOfStorageLocation
        }

        fetch(newest, cacheDir, camera, fix, promise)
      }
    }
  }

  private fun fetch(
    file: MediaFile,
    cacheDir: File,
    camera: dji.sdk.camera.Camera,
    fix: Map<String, Any?>,
    promise: Promise,
  ) {
    val name = "drone-${System.currentTimeMillis()}.jpg"

    file.fetchFileData(cacheDir, name.removeSuffix(".jpg"), object : DownloadListener<String> {
      override fun onStart() = Unit
      override fun onRateUpdate(total: Long, current: Long, persize: Long) = Unit
      override fun onRealtimeDataUpdate(data: ByteArray?, position: Long, isComplete: Boolean) = Unit
      override fun onProgress(total: Long, current: Long) = Unit

      override fun onSuccess(path: String?) {
        restoreShootMode(camera)
        // V4 hands back the path it actually wrote, extension included — trusting our own guess
        // instead would produce a URI to a file that is not there.
        val written = path ?: File(cacheDir, name).absolutePath
        promise.resolve(HashMap(fix).apply { put("uri", "file://$written") })
      }

      override fun onFailure(error: DJIError?) {
        restoreShootMode(camera)
        promise.reject("ERR_DOWNLOAD", "The photo could not be downloaded: ${error?.description}", null)
      }
    })
  }

  /** Back to shooting, or the next shutter press silently does nothing. */
  private fun restoreShootMode(camera: dji.sdk.camera.Camera) {
    runCatching {
      camera.setMode(SettingsDefinitions.CameraMode.SHOOT_PHOTO) { _: DJIError? -> }
    }
  }
}
