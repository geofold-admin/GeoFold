package app.geofold.dji

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.ViewGroup
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.datacenter.camera.StreamInfo
import dji.v5.manager.interfaces.ICameraStreamManager
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * The aircraft's live camera feed.
 *
 * The SDK decodes straight onto a `Surface`, so this is a `SurfaceView` handed to
 * `putCameraStreamSurface` — no frame copying through JS, which at 1080p30 would be hopeless.
 * `SurfaceView` rather than `TextureView` because the decoder writes on its own thread and a
 * SurfaceView's buffer is not tied to the view hierarchy's drawing pass.
 *
 * The surface must be registered *and unregistered* around its lifecycle: handing the decoder a
 * destroyed surface is a native crash, and leaving it registered after the view goes away leaks
 * the decode pipeline for the rest of the process.
 *
 * **Every failure in this path looks the same from the outside: a black rectangle.** A stream the
 * aircraft has not enabled, a camera index that aircraft does not have, a registration that threw,
 * and a decoder drawing onto a surface nobody can see are four different faults with one symptom
 * and — without a cable to the phone — no log to tell them apart. So this view reports what it is
 * actually seeing: which cameras the aircraft offers, which one the surface is bound to, and
 * whether video bytes are arriving at all ([onStreamStatus]). Black *with* frames arriving is a
 * rendering problem; black with none is a link or camera problem. That distinction is the whole
 * reason the status event exists.
 */
class DjiCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

  private val onCameraAvailable by EventDispatcher()

  // Typed explicitly for the nullable values: `bound` and `error` are null in exactly the cases
  // this event exists to report, and the inferred Map<String, Any> would not carry them.
  private val onStreamStatus by EventDispatcher<Map<String, Any?>>()

  /**
   * Lets Android lay this view out rather than React Native.
   *
   * Required because the real content is a native child. `ExpoView` is a `LinearLayout`, and with
   * the default (false) React Native never lays the child out in response to `requestLayout` — the
   * SurfaceView ends up 0x0 and the feed is invisible, with nothing in the log to say why.
   */
  override val shouldUseAndroidLayout = true

  /**
   * Which camera JS asked for. Most aircraft have one and it is LEFT_OR_MAIN — but if the aircraft
   * does not report this index as available, [resolvedIndex] uses one it does report rather than
   * binding to a camera that will never send anything.
   */
  var componentIndex: ComponentIndexType = ComponentIndexType.LEFT_OR_MAIN
    set(value) {
      field = value
      // A prop change after the surface is up used to do nothing at all: the only call to
      // putCameraStreamSurface was in surfaceChanged, which had long since fired.
      main.post { bind() }
    }

  private val main = Handler(Looper.getMainLooper())

  private val streamManager: ICameraStreamManager
    get() = MediaDataCenter.getInstance().cameraStreamManager

  /** What the aircraft says it has. Empty until it reports, which is itself worth showing. */
  private var available: List<ComponentIndexType> = emptyList()

  /** The index the surface is currently registered under; null when nothing is registered. */
  private var boundIndex: ComponentIndexType? = null

  /** The index the receive-stream listener is attached to, which may lag [boundIndex] by nothing. */
  private var listeningIndex: ComponentIndexType? = null

  /** Last failure from the SDK on this path, reported to JS rather than swallowed. */
  private var lastError: String? = null

  // Frame accounting. Written on the SDK's stream thread, read on the main thread once a second.
  @Volatile private var frames = 0
  @Volatile private var bytes = 0L
  @Volatile private var streamWidth = 0
  @Volatile private var streamHeight = 0

  /**
   * How the surface is composited — and the reason it is switchable at all.
   *
   * A `SurfaceView`'s content is not drawn by the view hierarchy. The hierarchy punches a
   * transparent hole where the view sits and SurfaceFlinger composites the real buffer *behind the
   * window*. When that hole does not come through — an opaque ancestor, a hardware layer, a second
   * surface in the same window fighting for order — the result is a black rectangle with frames
   * decoding perfectly into it and nothing in any log to say so.
   *
   * Android offers three orderings and they cannot be told apart from here:
   *
   *  - `normal` — surface behind the window, hole punched. Correct, and what every video player
   *    uses; the HUD draws over it.
   *  - `overlay` — `setZOrderMediaOverlay(true)`. Still behind the window, so the HUD survives, but
   *    above any *other* surface in the window. This is the one to reach for when a second surface
   *    (the minimap) is involved.
   *  - `top` — `setZOrderOnTop(true)`. Surface above the window entirely. No hole to fail, so if
   *    video appears here and nowhere else, the fault was compositing — but it covers every React
   *    view, HUD included.
   *
   * Guessing costs a 6-minute build and a flight per guess, and the wrong guess hides the
   * instruments. So JS picks, in the field, and the answer is a tap rather than a rebuild.
   */
  var surfaceMode: String = MODE_NORMAL
    set(value) {
      if (field == value) return
      field = value
      // Deliberately not persisted anywhere: `top` hides the HUD, Info button included, so the
      // only way back would be a reinstall if this survived leaving the screen.
      main.post { rebuildSurface() }
    }

  // Assigned in `init`, not here: `createSurfaceView` registers `callback`, which is declared
  // further down, and Kotlin runs property initialisers in declaration order — built here it would
  // attach a null callback and never receive `surfaceChanged`, so no surface would ever register.
  private var surfaceView: SurfaceView

  /**
   * Builds the surface with its z-order already set.
   *
   * `setZOrderOnTop` and `setZOrderMediaOverlay` only take effect **before the surface is
   * created** — calling either on a live SurfaceView does nothing at all, silently. So changing
   * mode means building a new view rather than reconfiguring this one.
   */
  private fun createSurfaceView(): SurfaceView =
    SurfaceView(context).also { view ->
      when (surfaceMode) {
        MODE_OVERLAY -> view.setZOrderMediaOverlay(true)
        MODE_TOP -> view.setZOrderOnTop(true)
        else -> Unit
      }
      view.layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      )
      view.holder.addCallback(callback)
      addView(view)
    }

  /** Swaps in a fresh surface in the new mode, taking the decoder off the old one first. */
  private fun rebuildSurface() {
    unbind()
    surfaceView.holder.removeCallback(callback)
    removeView(surfaceView)
    surfaceView = createSurfaceView()
    // No bind() here: the new view has no surface until Android creates one, and surfaceChanged
    // fires for it the moment it does.
  }

  /**
   * Reports which cameras the aircraft actually exposes.
   *
   * Worth surfacing rather than assuming: an aircraft with no camera, or one still negotiating the
   * link, produces a permanently black view that is indistinguishable from a broken one. JS can say
   * "waiting for camera" instead.
   *
   * It also arrives *late* — after the aircraft has connected, and so after this view has been
   * created and its surface registered. That is why it re-binds: the first registration is a guess
   * made before the aircraft had said anything.
   */
  private val availabilityListener =
    object : ICameraStreamManager.AvailableCameraUpdatedListener {
      override fun onAvailableCameraUpdated(cameras: List<ComponentIndexType>) {
        available = cameras
        onCameraAvailable(mapOf("available" to cameras.map { it.name }))
        main.post { bind() }
      }

      /**
       * Implemented even though Java declares it `default`, and that is not optional.
       *
       * A Kotlin `object :` expression does **not** inherit a Java interface's default methods
       * unless the module is compiled with `-Xjvm-default=all`. Without an override the generated
       * class has no implementation at all, and the first time the SDK calls it the app dies with:
       *
       *     AbstractMethodError: abstract method
       *     ICameraStreamManager$AvailableCameraUpdatedListener.onCameraStreamEnableUpdate(Map)
       *
       * The compiler flag is set as well (see this module's build.gradle, matching DJI's sample),
       * but this override does not depend on it — and a build-flag regression here would be
       * invisible until an aircraft was connected.
       */
      override fun onCameraStreamEnableUpdate(enabled: Map<ComponentIndexType, Boolean>) {
        // Not ignored any more: this map is the SDK saying, in as many words, whether it intends to
        // send this camera's video. A `false` here is a black feed with no other symptom.
        if (enabled[resolvedIndex()] == false) main.post { bind() }
      }
    }

  /**
   * Counts what arrives off the link, before any decoding — the "is video reaching us" answer.
   *
   * The counters are incremented without synchronisation on the SDK's stream thread. A lost
   * increment at 30 frames a second changes a diagnostic reading by nothing; a lock on the video
   * path would be a real cost for no gain.
   */
  private val streamListener = object : ICameraStreamManager.ReceiveStreamListener {
    override fun onReceiveStream(data: ByteArray, offset: Int, length: Int, info: StreamInfo) {
      frames += 1
      bytes += length.toLong()
      streamWidth = info.width
      streamHeight = info.height
    }
  }

  private val callback = object : SurfaceHolder.Callback {
    override fun surfaceCreated(holder: SurfaceHolder) = Unit

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
      // Re-registered on every size change: the decoder is told the target dimensions up front and
      // keeps scaling to the old ones otherwise, which shows up as a squashed image after rotation.
      bind()
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) = unbind()
  }

  /**
   * The camera to bind to: what JS asked for if the aircraft has it, otherwise the first one it
   * does report.
   *
   * Binding to an index the aircraft does not have is silent — `putCameraStreamSurface` accepts it
   * and no frame ever arrives — so a wrong default would cost a field trip to discover. The
   * substitution is reported in [onStreamStatus] rather than made quietly.
   */
  private fun resolvedIndex(): ComponentIndexType =
    if (available.isEmpty() || available.contains(componentIndex)) componentIndex
    else available.first()

  /**
   * Points the decoder at this view's surface, and the counters at the same camera.
   *
   * Safe to call repeatedly — it is called from the surface callback, from the availability
   * listener, and on a prop change, because any of the three can be the last one to happen.
   */
  private fun bind() {
    val surface = surfaceView.holder.surface
    val width = surfaceView.width
    val height = surfaceView.height
    // Registering a zero-sized or dead surface is how the decoder gets handed something it cannot
    // draw on; the next callback will bring a real one.
    if (surface == null || !surface.isValid || width == 0 || height == 0) return

    val index = resolvedIndex()

    // Enable before registering. An aircraft that can send several streams leaves the ones it is
    // not asked for switched off to save link bandwidth, and a disabled stream renders exactly like
    // a broken one: a black surface, no error, nothing in the log.
    runCatching { streamManager.enableStream(index, true) }

    // The SDK keys registered surfaces by surface, not by index, so re-binding the same surface to
    // a different camera has to remove it first or the old association is what survives.
    if (boundIndex != null && boundIndex != index) {
      runCatching { streamManager.removeCameraStreamSurface(surface) }
      boundIndex = null
    }

    val failure = runCatching {
      streamManager.putCameraStreamSurface(
        index,
        surface,
        width,
        height,
        // CENTER_INSIDE: letterbox rather than crop. A survey frame is evidence — cropping it to
        // fill the view would silently hide part of what the camera saw.
        ICameraStreamManager.ScaleType.CENTER_INSIDE,
      )
    }.exceptionOrNull()

    // Guarded because this runs on a surface callback during layout: an exception escaping here
    // takes down the screen, and a dead feed is a far better outcome than a dead app. Reported
    // rather than swallowed, though — a silent catch here is what made this black screen opaque.
    lastError = failure?.let { it.message ?: it.javaClass.simpleName }
    if (failure == null) boundIndex = index

    listen(index)
  }

  /** Moves the byte counter to whichever camera the surface is now bound to. */
  private fun listen(index: ComponentIndexType) {
    if (listeningIndex == index) return
    if (listeningIndex != null) runCatching { streamManager.removeReceiveStreamListener(streamListener) }
    listeningIndex = runCatching {
      streamManager.addReceiveStreamListener(index, streamListener)
      index
    }.getOrNull()
    frames = 0
    bytes = 0
    streamWidth = 0
    streamHeight = 0
  }

  private fun unbind() {
    val surface = surfaceView.holder.surface
    if (boundIndex != null) {
      runCatching { streamManager.removeCameraStreamSurface(surface) }
      boundIndex = null
    }
    if (listeningIndex != null) {
      runCatching { streamManager.removeReceiveStreamListener(streamListener) }
      listeningIndex = null
    }
  }

  /**
   * One status event a second, whether or not anything is arriving.
   *
   * A silence is the diagnosis here, so it has to be reported as a reading — "0 fps" — and not as
   * an absence of events, which JS cannot tell from a listener that was never attached.
   */
  private val tick = object : Runnable {
    override fun run() {
      val framesPerSecond = frames
      val bytesPerSecond = bytes
      frames = 0
      bytes = 0

      onStreamStatus(
        mapOf(
          "requested" to componentIndex.name,
          "bound" to boundIndex?.name,
          // Echoed back so the reading says which compositing mode produced it — otherwise "it
          // works now" would not record *what* fixed it.
          "surfaceMode" to surfaceMode,
          "available" to available.map { it.name },
          "fps" to framesPerSecond,
          "kbps" to (bytesPerSecond * 8 / 1000).toInt(),
          "width" to streamWidth,
          "height" to streamHeight,
          "error" to lastError,
        ),
      )

      main.postDelayed(this, 1000)
    }
  }

  init {
    // Runs after every property initialiser, so `callback` exists by now.
    surfaceView = createSurfaceView()
    // Constructor-time SDK call: if it throws, React cannot even create the view, which surfaces
    // as the screen crashing rather than as a camera problem.
    lastError = runCatching { streamManager.addAvailableCameraUpdatedListener(availabilityListener) }
      .exceptionOrNull()
      ?.let { "Camera listener: ${it.message ?: it.javaClass.simpleName}" }
  }

  companion object {
    const val MODE_NORMAL = "normal"
    const val MODE_OVERLAY = "overlay"
    const val MODE_TOP = "top"
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    main.post(tick)
  }

  override fun onDetachedFromWindow() {
    main.removeCallbacks(tick)
    // surfaceDestroyed usually fires first, but not on every path off screen — and a surface left
    // registered keeps the decoder alive for the rest of the process.
    unbind()
    runCatching { streamManager.removeAvailableCameraUpdatedListener(availabilityListener) }
    super.onDetachedFromWindow()
  }
}
