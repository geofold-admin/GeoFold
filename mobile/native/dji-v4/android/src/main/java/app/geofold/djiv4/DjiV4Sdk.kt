package app.geofold.djiv4

import android.app.Application
import dji.common.camera.SystemState
import dji.common.error.DJIError
import dji.common.error.DJISDKError
import dji.common.flightcontroller.FlightControllerState
import dji.sdk.base.BaseProduct
import dji.sdk.products.Aircraft
import dji.sdk.sdkmanager.DJISDKInitEvent
import dji.sdk.sdkmanager.DJISDKManager
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The MSDK **V4** lifecycle — the same job [app.geofold.dji.DjiSdk] does for V5, against a
 * completely different API.
 *
 * This exists because V5 does not support the aircraft this project actually owns. A Mavic Mini is
 * a V4 aircraft; on V5 it connects, answers the flight-controller keys, accepts a camera surface —
 * and never reports a camera or sends a frame. See `DJI-SETUP.md` §1 for the support matrix and the
 * days that cost.
 *
 * **Emits exactly the events the V5 module emits, under the same names**, because both register as
 * the Expo module `DjiMsdk` and share one JS surface (`native/dji-msdk/src/index.ts`). Only one is
 * ever linked into a build — `scripts/prepare-variant.js` decides which — so the name is free to be
 * reused, and the app's screens do not know or care which SDK is underneath.
 *
 * Where V4 differs from V5, and it differs a lot:
 *  - registration is one call, `registerApp(context, callback)`, not init-then-register;
 *  - telemetry arrives as a single `FlightControllerState` push rather than per-key listeners;
 *  - video is raw H.264 handed to *you* (see [DjiV4CameraView]) rather than decoded onto a surface
 *    by the SDK.
 */
object DjiV4Sdk {

  const val EVENT_REGISTER = "onRegister"
  const val EVENT_PRODUCT = "onProduct"
  const val EVENT_INIT_PROCESS = "onInitProcess"
  const val EVENT_TELEMETRY = "onTelemetry"
  const val EVENT_CAMERA = "onCamera"
  const val EVENT_PHOTO_TAKEN = "onPhotoTaken"
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

  /** The aircraft model, e.g. MAVIC_MINI — V4's answer to "what am I talking to". */
  @Volatile var model: String? = null; private set
  @Volatile var cameraType: String? = null; private set

  /*
   * Flight state, read off the same pushed FlightControllerState as the telemetry.
   *
   * These drive the flight controls: a Take off button on an aircraft already flying is wrong, and
   * a Return to home button that cannot become Cancel is worse — cancelling an RTH is the one
   * command a pilot may need instantly.
   */
  @Volatile var isFlying: Boolean = false; private set
  @Volatile var isGoingHome: Boolean = false; private set
  /** The aircraft is asking permission to touch down — it will hover until told. */
  @Volatile var needsLandingConfirm: Boolean = false; private set
  @Volatile var flightMode: String? = null; private set

  /** Charge remaining, 0–100. The one number every ground station shows and this one did not. */
  @Volatile var battery: Int? = null; private set
  @Volatile var batteryVoltage: Int? = null; private set
  @Volatile var batteryTemperature: Double? = null; private set

  /** Gimbal pitch in degrees: 0 is level, negative looks down. */
  @Volatile var gimbalPitch: Double? = null; private set

  @Volatile var recording: Boolean = false; private set
  @Volatile var recordingTime: Int? = null; private set
  @Volatile private var shooting: Boolean = false

  private var started = false

  @Volatile var installError: String? = null

  private val listeners = CopyOnWriteArrayList<(String, Map<String, Any?>) -> Unit>()

  fun addListener(listener: (String, Map<String, Any?>) -> Unit) = listeners.add(listener)
  fun removeListener(listener: (String, Map<String, Any?>) -> Unit) = listeners.remove(listener)

  private fun emit(event: String, payload: Map<String, Any?>) {
    listeners.forEach { runCatching { it(event, payload) } }
  }

  /**
   * Registers with DJI. One call, unlike V5's init-then-register two-step.
   *
   * The first registration on a device reaches DJI's servers and then caches, so a field app needs
   * connectivity once and never again. `startConnectionToProduct()` is what actually opens the link
   * to the aircraft and is easy to forget — registration alone reports no product, forever.
   */
  @JvmStatic
  @Synchronized
  fun start(application: Application) {
    if (started) return
    started = true

    val blocker = installError
    if (blocker != null) {
      registered = false
      registrationError = blocker
      emit(EVENT_REGISTER, registerPayload())
      return
    }

    // Every SDK call from here on is wrapped, and the catch is `Throwable` rather than `Exception`
    // on purpose: the failures this integration actually produces are `NoClassDefFoundError` and
    // `UnsatisfiedLinkError`, neither of which is an Exception. An escape here kills the process
    // before the Drone screen can say anything, taking the survey half of the app — which has
    // nothing to do with DJI — down with it. A screen showing why is strictly better than an app
    // that disappears. The V5 module is built on the same principle; this one was not, until it
    // crashed on open.
    try {
      registerWithDji(application)
    } catch (e: Throwable) {
      registered = false
      registrationError = "The DJI SDK could not start: ${e::class.java.simpleName}: ${e.message}"
      emit(EVENT_REGISTER, registerPayload())
    }
  }

  private fun registerWithDji(application: Application) {
    DJISDKManager.getInstance().registerApp(
      application,
      object : DJISDKManager.SDKManagerCallback {
        override fun onRegister(error: DJIError?) {
          // V4 signals success by passing REGISTRATION_SUCCESS rather than null, and the constant
          // lives on DJISDKError — DJIError itself does not carry it.
          if (error == null || error == DJISDKError.REGISTRATION_SUCCESS) {
            registered = true
            registrationError = null
            // Nothing connects until this runs. V4 separates "the app is allowed to talk to DJI"
            // from "start talking to the aircraft", and only the first is done by registerApp.
            runCatching { DJISDKManager.getInstance().startConnectionToProduct() }
          } else {
            registered = false
            // DJI's own wording, verbatim — it is what the forum answers are written against.
            registrationError = error.description
          }
          emit(EVENT_REGISTER, registerPayload())
        }

        override fun onProductConnect(product: BaseProduct?) {
          connected = true
          model = runCatching { product?.model?.name }.getOrNull()
          cameraType = runCatching { product?.camera?.displayName }.getOrNull()
          productId = 0
          attachAircraft(product)
          emit(EVENT_PRODUCT, productPayload())
          emit(EVENT_HEALTH, healthPayload())
        }

        override fun onProductDisconnect() {
          connected = false
          productId = -1
          clearTelemetry()
          emit(EVENT_PRODUCT, productPayload())
        }

        override fun onProductChanged(product: BaseProduct?) {
          connected = product?.isConnected == true
          model = runCatching { product?.model?.name }.getOrNull()
          cameraType = runCatching { product?.camera?.displayName }.getOrNull()
          attachAircraft(product)
          emit(EVENT_PRODUCT, productPayload())
          emit(EVENT_HEALTH, healthPayload())
        }

        override fun onComponentChange(
          key: BaseProduct.ComponentKey?,
          old: dji.sdk.base.BaseComponent?,
          new: dji.sdk.base.BaseComponent?,
        ) {
          // A camera arriving late is normal — the gimbal enumerates after the aircraft link is up,
          // and a screen that only asked once would show "no camera" for the whole flight.
          if (key == BaseProduct.ComponentKey.CAMERA) {
            cameraType = runCatching {
              DJISDKManager.getInstance().product?.camera?.displayName
            }.getOrNull()
            attachCamera()
            emit(EVENT_HEALTH, healthPayload())
          }
        }

        override fun onInitProcess(event: DJISDKInitEvent?, progress: Int) {
          // Not an enum, unlike V5's: the readable part is the initialization state it wraps.
          val label = runCatching { event?.initializationState?.name }.getOrNull() ?: "INIT"
          emit(EVENT_INIT_PROCESS, mapOf("event" to label, "progress" to progress))
        }

        override fun onDatabaseDownloadProgress(current: Long, total: Long) {
          val percent = if (total > 0L) ((current * 100) / total).toInt() else 0
          emit(EVENT_INIT_PROCESS, mapOf("event" to "DATABASE_DOWNLOAD", "progress" to percent))
        }
      },
    )
  }

  /**
   * Telemetry, as one pushed state object.
   *
   * V4 has no per-key listeners: the flight controller pushes a whole `FlightControllerState` at
   * about 10 Hz and everything is read off it. Guarded because an aircraft without a flight
   * controller (or a product that is not an Aircraft) must not cost us the rest of the screen.
   */
  private fun attachAircraft(product: BaseProduct?) {
    val aircraft = product as? Aircraft ?: return
    runCatching {
      aircraft.flightController?.setStateCallback(
        FlightControllerState.Callback { state ->
          val location = state.aircraftLocation
          latitude = location?.latitude?.takeIf { it.isFinite() }
          longitude = location?.longitude?.takeIf { it.isFinite() }
          // Relative to the take-off point, which is DJI's definition — not an elevation.
          altitude = location?.altitude?.toDouble()?.takeIf { it.isFinite() }
          heading = state.attitude?.yaw?.takeIf { it.isFinite() }
          satellites = state.satelliteCount

          isFlying = state.isFlying
          isGoingHome = state.isGoingHome
          needsLandingConfirm = state.isLandingConfirmationNeeded
          flightMode = runCatching { state.flightModeString ?: state.flightMode?.name }.getOrNull()

          emit(EVENT_TELEMETRY, telemetryPayload())
        },
      )
    }
    attachCamera()
    attachBattery()
    attachGimbal()
  }

  /**
   * Charge, voltage and temperature, pushed by the aircraft.
   *
   * Battery is the number a pilot checks more often than any other, and its absence was the most
   * obvious gap in the HUD. Guarded like everything else: a product without a battery component
   * must not cost us the telemetry beside it.
   */
  private fun attachBattery() {
    runCatching {
      DJISDKManager.getInstance().product?.battery?.setStateCallback { state ->
        battery = state.chargeRemainingInPercent
        batteryVoltage = state.voltage
        batteryTemperature = state.temperature.toDouble()
        emit(EVENT_TELEMETRY, telemetryPayload())
      }
    }
  }

  /** Where the camera is actually pointed, so the pitch control can show a real angle. */
  private fun attachGimbal() {
    runCatching {
      DJISDKManager.getInstance().product?.gimbal?.setStateCallback { state ->
        gimbalPitch = runCatching { state.attitudeInDegrees?.pitch?.toDouble() }.getOrNull()
        emit(EVENT_TELEMETRY, telemetryPayload())
      }
    }
  }

  /**
   * The camera's own state: whether it is recording, and whether a shutter has just closed.
   *
   * The falling edge of `isShootingSinglePhoto` is the interesting one — the file does not exist on
   * the card until the exposure finishes — and it catches a photo however it was triggered: the
   * app's button, an interval timer, or the pilot's thumb on the controller.
   */
  private fun attachCamera() {
    runCatching {
      DJISDKManager.getInstance().product?.camera?.setSystemStateCallback(
        SystemState.Callback { state ->
          val busy = state.isShootingSinglePhoto || state.isShootingBurstPhoto
          if (shooting && !busy) emit(EVENT_PHOTO_TAKEN, emptyMap())
          shooting = busy

          recording = state.isRecording
          recordingTime = state.currentVideoRecordingTimeInSeconds
          emit(EVENT_CAMERA, cameraPayload())
        },
      )
    }
  }

  private fun clearTelemetry() {
    latitude = null
    longitude = null
    altitude = null
    heading = null
    satellites = null
    model = null
    cameraType = null
    recording = false
    recordingTime = null
    shooting = false
    isFlying = false
    isGoingHome = false
    needsLandingConfirm = false
    flightMode = null
    battery = null
    batteryVoltage = null
    batteryTemperature = null
    gimbalPitch = null
    emit(EVENT_TELEMETRY, telemetryPayload())
    emit(EVENT_CAMERA, cameraPayload())
    emit(EVENT_HEALTH, healthPayload())
  }

  fun retryRegistration() {
    if (started && registered != true) {
      runCatching { DJISDKManager.getInstance().startConnectionToProduct() }
    }
  }

  fun isRegistered(): Boolean = registered == true

  /** The waypoint mission operator, or null when no aircraft is attached. */
  fun missionOperator(): dji.sdk.mission.waypoint.WaypointMissionOperator? =
    runCatching { dji.sdk.mission.MissionControl.getInstance().waypointMissionOperator }.getOrNull()

  /** The gimbal, or null when no aircraft is attached. */
  fun gimbal(): dji.sdk.gimbal.Gimbal? =
    runCatching { DJISDKManager.getInstance().product?.gimbal }.getOrNull()

  /** The camera, or null when no aircraft is attached. */
  fun camera(): dji.sdk.camera.Camera? =
    runCatching { DJISDKManager.getInstance().product?.camera }.getOrNull()

  /** The flight controller, or null when no aircraft is attached. */
  fun flightController(): dji.sdk.flightcontroller.FlightController? =
    runCatching { (DJISDKManager.getInstance().product as? Aircraft)?.flightController }.getOrNull()

  fun registerPayload(): Map<String, Any?> =
    mapOf("registered" to registered, "error" to registrationError)

  fun productPayload(): Map<String, Any?> =
    mapOf("connected" to connected, "productId" to productId)

  fun cameraPayload(): Map<String, Any?> =
    mapOf("recording" to recording, "recordingTime" to recordingTime)

  /**
   * V4 has no `DeviceHealthManager`, so this carries what it does have: the model and the camera.
   *
   * `cameraType` is the field that matters and it is the same question the V5 module answers — an
   * aircraft reporting no camera cannot send video, whichever SDK is asking.
   */
  fun healthPayload(): Map<String, Any?> = mapOf(
    // Which SDK is actually underneath. The Drone screen is shared between the two variants and
    // cannot tell them apart on its own; it used to hardcode V5's wording and so described the
    // wrong SDK and the wrong ABIs on this build.
    "sdkNote" to "DJI Mobile SDK V4 · Android · armeabi-v7a, arm64-v8a, x86",
    "cameraType" to cameraType,
    "status" to model,
    "statusDescription" to model?.let { "Connected to $it" },
    "statusLevel" to null,
    "warnings" to emptyList<Map<String, Any?>>(),
  )

  fun telemetryPayload(): Map<String, Any?> = mapOf(
    "latitude" to latitude,
    "longitude" to longitude,
    "altitude" to altitude,
    "heading" to heading,
    "satellites" to satellites,
    // Flight state rides along with position because it comes from the same pushed state object,
    // at the same 10 Hz. `flightControls` tells JS this build can actually fly the aircraft — the
    // V5 module does not implement these yet, and buttons that do nothing are worse than none.
    "flightControls" to true,
    "isFlying" to isFlying,
    "isGoingHome" to isGoingHome,
    "needsLandingConfirm" to needsLandingConfirm,
    "flightMode" to flightMode,
    "battery" to battery,
    "batteryVoltage" to batteryVoltage,
    "batteryTemperature" to batteryTemperature,
    "gimbalPitch" to gimbalPitch,
  )
}
