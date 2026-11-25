package app.geofold.dji

import android.app.Application
import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.v5.common.error.IDJIError
import dji.v5.common.register.DJISDKInitEvent
import dji.v5.et.create
import dji.v5.et.listen
import dji.v5.manager.KeyManager
import dji.v5.manager.SDKManager
import dji.v5.manager.diagnostic.DJIDeviceHealthInfo
import dji.v5.manager.diagnostic.DeviceHealthManager
import dji.v5.manager.diagnostic.DeviceStatusManager
import dji.v5.manager.interfaces.SDKManagerCallback
import dji.v5.network.DJINetworkManager
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The SDK's lifecycle, held here rather than in a screen so it survives navigation and reloads.
 *
 * **Startup is a three-step sequence and every step is separate.** Missing any one of them fails
 * quietly rather than loudly, which is what made this expensive to get right:
 *
 *  1. `Helper.install()` in `Application.attachBaseContext` — unpacks the SDK, whose classes are
 *     not in the APK at all (see [DjiSdkInstaller]). Skipped, everything is NoClassDefFoundError.
 *  2. `SDKManager.init()` — gets the SDK ready. Reports progress, ending at INITIALIZE_COMPLETE.
 *  3. `SDKManager.registerApp()` — the actual registration, legal only after step 2 completes.
 *     `init()` does **not** do this for you. Without it the SDK reaches 100% and then sits there
 *     with no success, no failure and no aircraft, because it will not report a product until it
 *     is registered.
 *
 * Started lazily from JS rather than from `Application.onCreate` (which is what DJI's sample does).
 * Matching the sample was tried and reverted: it did not change the outcome, and because
 * `SDKManager.init()` works on its own thread pool, a failure in there is an uncaught exception on
 * a background thread that kills the process at launch — taking the survey half of the app, which
 * has nothing to do with DJI, down with it. Started from the Drone screen, the same failure is
 * contained to that screen.
 */
object DjiSdk {

  const val EVENT_REGISTER = "onRegister"
  const val EVENT_PRODUCT = "onProduct"
  const val EVENT_INIT_PROCESS = "onInitProcess"
  const val EVENT_TELEMETRY = "onTelemetry"
  const val EVENT_CAMERA = "onCamera"
  const val EVENT_PHOTO_TAKEN = "onPhotoTaken"

  /**
   * The aircraft's own account of what is wrong with it.
   *
   * A status LED blinking red is the aircraft saying it has a fault, and until this event existed
   * the app could not repeat what the fault *was* — leaving a black feed and a blinking light as
   * two unexplained symptoms that may or may not be the same problem. `DJIDeviceStatus` and
   * `DeviceHealthManager` are DJI's own diagnosis, in DJI's own words, and a camera or gimbal fault
   * named here explains a stream that never starts far better than anything in the app's code can.
   */
  const val EVENT_HEALTH = "onHealth"

  @Volatile var registered: Boolean? = null; private set
  @Volatile var registrationError: String? = null; private set
  @Volatile var connected: Boolean = false; private set
  @Volatile var productId: Int = -1; private set

  @Volatile var latitude: Double? = null; private set
  @Volatile var longitude: Double? = null; private set
  @Volatile var altitude: Double? = null; private set
  @Volatile var heading: Double? = null; private set
  @Volatile var satellites: Int? = null; private set

  /** The camera the aircraft reports carrying, or null when it reports none — see [startTelemetry]. */
  @Volatile var cameraType: String? = null; private set

  /** DJI's overall device status, e.g. NORMAL, COMPASS_ERROR, BATTERY_EXCEPTION. */
  @Volatile var deviceStatus: String? = null; private set
  @Volatile var deviceStatusDescription: String? = null; private set
  @Volatile var deviceStatusLevel: String? = null; private set

  /** Every current health warning, each with DJI's own title and description. */
  @Volatile var warnings: List<Map<String, Any?>> = emptyList(); private set

  @Volatile var recording: Boolean = false; private set
  /** Seconds into the current clip, straight from the camera. */
  @Volatile var recordingTime: Int? = null; private set
  @Volatile private var shooting: Boolean = false

  private var started = false

  /** True once the SDK reports INITIALIZE_COMPLETE. Registration is illegal before that. */
  @Volatile private var initialised = false

  /** Held only to resolve DJI's own code→text string resources — see [resolve]. */
  @Volatile private var appContext: Application? = null

  /** Set by [DjiSdkInstaller] if `Helper.install()` threw. Null means it completed. */
  @Volatile var installError: String? = null

  /**
   * Loads the SDK's JNI library from *this* classloader before handing over to DJI.
   *
   * Two reasons. First, it is a real diagnostic: `dlopen` failures name the missing library or
   * symbol, and that message is the single most useful thing available when the only other signal
   * is "No implementation found". Second, it is a guard — `SDKManager.init()` does its work on
   * DJI's own thread pool, so a failure in there is an uncaught exception on a background thread
   * and takes the whole process down. Better to find out here, on the caller's thread, and report
   * it than to let the app die at launch.
   *
   * It also discriminates between the two candidate causes. If the library loads here but DJI
   * still cannot bind its natives, the problem is the classloader `Helper` installs, not the
   * library. If it fails here, the message says what is actually missing.
   */
  private fun preflight(): String? {
    return try {
      System.loadLibrary("djisdk_jni")
      null
    } catch (e: Throwable) {
      "Could not load the DJI native library (djisdk_jni): ${e.message}"
    }
  }

  /** The module attaches here. A list because a reload can briefly leave two module instances. */
  private val listeners = CopyOnWriteArrayList<(String, Map<String, Any?>) -> Unit>()

  fun addListener(listener: (String, Map<String, Any?>) -> Unit) = listeners.add(listener)
  fun removeListener(listener: (String, Map<String, Any?>) -> Unit) = listeners.remove(listener)

  private fun emit(event: String, payload: Map<String, Any?>) {
    listeners.forEach { runCatching { it(event, payload) } }
  }

  /** Called from `MainApplication.onCreate` — see the class comment for why not from JS. */
  @JvmStatic
  @Synchronized
  fun start(application: Application) {
    appContext = application
    if (started) return
    started = true

    // Refuse to go further if the native side is not sound. Calling init() anyway means an
    // uncaught UnsatisfiedLinkError on DJI's thread pool, which kills the process — the screen
    // showing a message is strictly better than the app disappearing.
    val blocker = installError ?: preflight()
    if (blocker != null) {
      registered = false
      registrationError = blocker
      emit(EVENT_REGISTER, registerPayload())
      return
    }

    // The first registration on a device has to reach DJI's servers. If the app opens with no
    // signal — which for a field app is the normal case, not the exception — that first attempt
    // fails and nothing would retry it. This re-attempts the moment connectivity appears.
    DJINetworkManager.getInstance().addNetworkStatusListener { available ->
      if (initialised && available && !SDKManager.getInstance().isRegistered) {
        SDKManager.getInstance().registerApp()
      }
    }

    SDKManager.getInstance().init(application, object : SDKManagerCallback {
      override fun onRegisterSuccess() {
        registered = true
        registrationError = null
        emit(EVENT_REGISTER, registerPayload())
      }

      override fun onRegisterFailure(error: IDJIError) {
        registered = false
        // DJI's own wording, verbatim — it is what the developer-forum answers are written
        // against, and rewording it only makes the problem harder to look up.
        registrationError = error.description()
        emit(EVENT_REGISTER, registerPayload())
      }

      override fun onProductConnect(id: Int) {
        connected = true
        productId = id
        startTelemetry()
        emit(EVENT_PRODUCT, productPayload())
      }

      override fun onProductDisconnect(id: Int) {
        connected = false
        productId = id
        stopTelemetry()
        emit(EVENT_PRODUCT, productPayload())
      }

      override fun onProductChanged(id: Int) {
        connected = true
        productId = id
        emit(EVENT_PRODUCT, productPayload())
      }

      override fun onInitProcess(event: DJISDKInitEvent, totalProcess: Int) {
        emit(EVENT_INIT_PROCESS, mapOf("event" to event.name, "progress" to totalProcess))

        // `init()` does not register — it only gets the SDK ready to. Registration is a separate
        // call, and it is only legal once initialisation reports complete. Without this the SDK
        // reaches INITIALIZE_COMPLETE 100% and then sits there forever: no success, no failure,
        // and no aircraft, because the SDK will not report a product until it is registered.
        if (event == DJISDKInitEvent.INITIALIZE_COMPLETE) {
          initialised = true
          SDKManager.getInstance().registerApp()
        }
      }

      override fun onDatabaseDownloadProgress(current: Long, total: Long) {
        // Tens of megabytes on first registration. Progress, not failure — it must not read as one.
        val percent = if (total > 0L) ((current * 100) / total).toInt() else 0
        emit(EVENT_INIT_PROCESS, mapOf("event" to "DATABASE_DOWNLOAD", "progress" to percent))
      }
    })
  }

  /** Retry after a failure — most often the first run simply had no network. */
  fun retryRegistration() {
    if (started && !SDKManager.getInstance().isRegistered) {
      SDKManager.getInstance().registerApp()
    }
  }

  fun isRegistered(): Boolean = started && SDKManager.getInstance().isRegistered

  fun registerPayload(): Map<String, Any?> =
    mapOf("registered" to registered, "error" to registrationError)

  fun productPayload(): Map<String, Any?> =
    mapOf("connected" to connected, "productId" to productId)

  fun cameraPayload(): Map<String, Any?> =
    mapOf("recording" to recording, "recordingTime" to recordingTime)

  fun healthPayload(): Map<String, Any?> = mapOf(
    // See the V4 module: the shared Drone screen prints this rather than guessing.
    "sdkNote" to "DJI Mobile SDK V5 · Android · arm64 only",
    "cameraType" to cameraType,
    "status" to deviceStatus,
    "statusDescription" to deviceStatusDescription,
    "statusLevel" to deviceStatusLevel,
    "warnings" to warnings,
  )

  fun telemetryPayload(): Map<String, Any?> = mapOf(
    "latitude" to latitude,
    "longitude" to longitude,
    "altitude" to altitude,
    "heading" to heading,
    "satellites" to satellites,
  )

  /**
   * The aircraft's diagnosis of itself: overall status, plus every current health warning.
   *
   * Isolated in its own `runCatching` for the same reason the camera keys are — a firmware that
   * does not answer these must not cost us position and altitude as collateral.
   *
   * `init()` on both managers is not optional and is easy to miss: without it the listeners attach
   * and simply never fire, which reads exactly like an aircraft with nothing wrong.
   */
  private fun startDiagnostics() {
    runCatching {
      DeviceStatusManager.getInstance().init()
      DeviceStatusManager.getInstance().addDJIDeviceStatusChangeListener { _, now ->
        applyStatus(now)
        emit(EVENT_HEALTH, healthPayload())
      }
      // The current value, not just changes: a fault that was already present when the screen
      // opened would otherwise never be reported.
      applyStatus(DeviceStatusManager.getInstance().getCurrentDJIDeviceStatus())
    }

    runCatching {
      DeviceHealthManager.getInstance().init()
      DeviceHealthManager.getInstance().addDJIDeviceHealthInfoChangeListener { infos ->
        warnings = infos.orEmpty().map(::warningOf)
        emit(EVENT_HEALTH, healthPayload())
      }
      warnings = DeviceHealthManager.getInstance().getCurrentDJIDeviceHealthInfos().orEmpty().map(::warningOf)
    }

    emit(EVENT_HEALTH, healthPayload())
  }

  private fun applyStatus(now: dji.v5.manager.diagnostic.DJIDeviceStatus?) {
    val code = runCatching { now?.statusCode() }.getOrNull()
    deviceStatus = code
    deviceStatusDescription =
      runCatching { now?.description() }.getOrNull().orNull() ?: resolve("status_content_", code)
    deviceStatusLevel = runCatching { now?.warningLevel()?.name }.getOrNull()
  }

  private fun warningOf(info: DJIDeviceHealthInfo): Map<String, Any?> {
    val code = runCatching { info.informationCode() }.getOrNull()
    return mapOf(
      "code" to code,
      "title" to (runCatching { info.title() }.getOrNull().orNull() ?: resolve("hms_title_", code)),
      "description" to
        (runCatching { info.description() }.getOrNull().orNull() ?: resolve("hms_content_", code)),
      "level" to runCatching { info.warningLevel()?.name }.getOrNull(),
    )
  }

  private fun String?.orNull(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

  /**
   * Turns a DJI code into the sentence DJI wrote for it.
   *
   * The SDK's own `title()` / `description()` come back empty on this build, so the app was showing
   * bare codes — `0x1F100059` on screen, which reads like a crash and is in fact "Ready to GO".
   * The text exists: the aircraft AAR ships it as Android string resources, already merged into
   * this APK, named by the code — `status_content_0x1F100059`, `hms_title_…`, `hms_content_…`.
   * Looking it up by name is what DJI's own UX layer does.
   *
   * Case is tried both ways: the resource names use `0x` + uppercase hex, but the SDK hands the
   * code back in whichever case the field it came from used (`informationCodeInLowCase` exists for
   * exactly that reason).
   */
  private fun resolve(prefix: String, code: String?): String? {
    val context = appContext ?: return null
    val raw = code.orNull() ?: return null
    val hex = raw.removePrefix("0x").removePrefix("0X")
    val names = listOf(raw, "0x${hex.uppercase()}", "0x${hex.lowercase()}").distinct()

    for (name in names) {
      val id = runCatching {
        context.resources.getIdentifier("$prefix$name", "string", context.packageName)
      }.getOrDefault(0)
      if (id != 0) return runCatching { context.getString(id) }.getOrNull().orNull()
    }
    return null
  }

  /** Only once an aircraft is attached — these keys have nothing to report before that. */
  private fun startTelemetry() {
    startDiagnostics()

    FlightControllerKey.KeyAircraftLocation3D.create().listen(this) { location ->
      // Altitude is relative to the take-off point, which is DJI's definition — not an elevation.
      latitude = location?.latitude
      longitude = location?.longitude
      altitude = location?.altitude
      emit(EVENT_TELEMETRY, telemetryPayload())
    }
    FlightControllerKey.KeyCompassHeading.create().listen(this) {
      heading = it
      emit(EVENT_TELEMETRY, telemetryPayload())
    }
    FlightControllerKey.KeyGPSSatelliteCount.create().listen(this) {
      satellites = it
      emit(EVENT_TELEMETRY, telemetryPayload())
    }

    /*
     * The remote controller's own shutter and record buttons.
     *
     * There is no key for the physical buttons themselves, and trying to intercept them would be
     * the wrong approach anyway. What matters is that a photo was taken — by the pilot's thumb on
     * the RC, by the app's own button, or by an interval timer — so this watches the *effect*
     * instead of the cause, and catches all three.
     */
    // Isolated from the flight-controller keys above: those are the ones a survey point actually
    // needs, and an aircraft with no camera — or a camera key this firmware does not answer —
    // must not cost us position, altitude and satellites as collateral.
    runCatching {
      /*
       * Which camera the aircraft says it is carrying.
       *
       * The most direct answer to a stream that never starts: a camera the aircraft does not report
       * cannot send video, and no amount of surface plumbing changes that. A key that stays silent
       * here — while the flight-controller keys above are answering — means the fault is the payload
       * or the gimbal, not the app.
       */
      CameraKey.KeyCameraType.create().listen(this) {
        cameraType = it?.name
        emit(EVENT_HEALTH, healthPayload())
      }

      CameraKey.KeyIsShootingPhoto.create().listen(this) { busy ->
        val now = busy == true
        // The falling edge is the interesting one: true means the shutter is mid-exposure, and the
        // file does not exist on the card until it goes false again.
        if (shooting && !now) emit(EVENT_PHOTO_TAKEN, emptyMap())
        shooting = now
      }

      CameraKey.KeyIsRecording.create().listen(this) {
        recording = it == true
        emit(EVENT_CAMERA, cameraPayload())
      }

      CameraKey.KeyRecordingTime.create().listen(this) {
        recordingTime = it
        emit(EVENT_CAMERA, cameraPayload())
      }
    }
  }

  private fun stopTelemetry() {
    KeyManager.getInstance().cancelListen(this)
    latitude = null
    longitude = null
    altitude = null
    heading = null
    satellites = null
    recording = false
    recordingTime = null
    shooting = false

    // A fault list from an aircraft that has gone away is worse than none — it would sit on screen
    // describing hardware that is no longer attached.
    cameraType = null
    deviceStatus = null
    deviceStatusDescription = null
    deviceStatusLevel = null
    warnings = emptyList()
    runCatching { DeviceStatusManager.getInstance().clearAllListeners() }
    runCatching { DeviceHealthManager.getInstance().clearAllListeners() }

    emit(EVENT_TELEMETRY, telemetryPayload())
    emit(EVENT_CAMERA, cameraPayload())
    emit(EVENT_HEALTH, healthPayload())
  }
}
