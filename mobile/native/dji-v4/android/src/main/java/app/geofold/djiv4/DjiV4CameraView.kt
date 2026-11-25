package app.geofold.djiv4

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.ViewGroup
import dji.sdk.camera.VideoFeeder
import dji.sdk.codec.DJICodecManager
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * The aircraft's live camera feed, MSDK V4 edition.
 *
 * **The architecture is inverted compared with V5.** V5 takes a `Surface` and decodes onto it
 * itself; the app never sees a frame. V4 hands the app *raw H.264* through
 * `VideoFeeder.VideoDataListener.onReceive(bytes, size)` and expects the app to pump it into a
 * `DJICodecManager`, which owns the hardware decoder and draws to the surface.
 *
 * That inversion is an accident in this project's favour. The black-screen hunt on V5 was hard
 * because nothing in the app could tell "no video arriving" from "video arriving, drawn somewhere
 * invisible" — the SDK owned both ends. Here the bytes pass through this file, so the frame counter
 * is a direct measurement rather than an inference, and `no frames` means exactly what it says.
 *
 * Emits the same `onStreamStatus` / `onCameraAvailable` events as the V5 view, so one JS surface
 * drives either.
 */
class DjiV4CameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

  private val onCameraAvailable by EventDispatcher()
  private val onStreamStatus by EventDispatcher<Map<String, Any?>>()

  /**
   * Lets Android lay this view out rather than React Native.
   *
   * Required because the real content is a native child: with the default, React Native never lays
   * the SurfaceView out in response to `requestLayout`, it ends up 0x0, and the feed is invisible
   * with nothing in the log to say why.
   */
  override val shouldUseAndroidLayout = true

  /**
   * Which feed. V4 exposes a primary and a secondary rather than V5's component indices, so the
   * shared JS prop is mapped: anything other than the main camera asks for the secondary feed.
   */
  var componentIndex: String = "LEFT_OR_MAIN"
    set(value) {
      if (field == value) return
      field = value
      main.post { rebind() }
    }

  /** See the V5 view: same three orderings, same reason they are switchable from JS. */
  var surfaceMode: String = MODE_NORMAL
    set(value) {
      if (field == value) return
      field = value
      main.post { rebuildSurface() }
    }

  private val main = Handler(Looper.getMainLooper())

  private var codec: DJICodecManager? = null
  private var lastError: String? = null
  private var listening = false

  // Frame accounting, written on the SDK's video thread and read once a second on the main thread.
  @Volatile private var frames = 0
  @Volatile private var bytes = 0L
  @Volatile private var streamWidth = 0
  @Volatile private var streamHeight = 0

  /**
   * Raw H.264 off the link. Counted here *and* forwarded to the decoder.
   *
   * Counting before decoding is deliberate: it separates "the aircraft is not sending" from "the
   * decoder or the surface is not working", which is the one distinction that mattered on V5 and
   * could only be inferred there.
   */
  private val videoListener = VideoFeeder.VideoDataListener { data, size ->
    frames += 1
    bytes += size.toLong()
    codec?.let { runCatching { it.sendDataToDecoder(data, size) } }
  }

  private val callback = object : SurfaceHolder.Callback {
    override fun surfaceCreated(holder: SurfaceHolder) = Unit

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
      streamWidth = width
      streamHeight = height
      bind(holder, width, height)
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) = unbind()
  }

  private var surfaceView: SurfaceView

  /**
   * Builds the surface with its z-order already applied.
   *
   * `setZOrderOnTop` / `setZOrderMediaOverlay` only take effect **before the surface is created**;
   * calling either on a live SurfaceView does nothing, silently. Changing mode therefore means
   * building a new view, not reconfiguring this one.
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

  private fun rebuildSurface() {
    unbind()
    surfaceView.holder.removeCallback(callback)
    removeView(surfaceView)
    surfaceView = createSurfaceView()
  }

  /** Creates the decoder for this surface and starts feeding it. */
  private fun bind(holder: SurfaceHolder, width: Int, height: Int) {
    if (width == 0 || height == 0) return

    lastError = runCatching {
      // Rebuilt rather than reused on a size change: the decoder is configured with its output
      // dimensions at construction and keeps scaling to the old ones otherwise.
      codec?.destroyCodec()
      codec = DJICodecManager(context, holder, width, height)
    }.exceptionOrNull()?.let { it.message ?: it.javaClass.simpleName }

    listen()
  }

  private fun listen() {
    if (listening) return
    listening = runCatching {
      feed()?.addVideoDataListener(videoListener) == true
    }.getOrDefault(false)

    if (listening) {
      frames = 0
      bytes = 0
      // V4 has no "which cameras exist" callback, so this reports the one feed it has — the shared
      // JS still wants to know whether anything is available at all.
      onCameraAvailable(mapOf("available" to listOf(componentIndex)))
    }
  }

  private fun feed(): VideoFeeder.VideoFeed? =
    runCatching {
      if (componentIndex == "LEFT_OR_MAIN") VideoFeeder.getInstance()?.primaryVideoFeed
      else VideoFeeder.getInstance()?.secondaryVideoFeed
    }.getOrNull()

  private fun rebind() {
    unbind()
    val holder = surfaceView.holder
    bind(holder, surfaceView.width, surfaceView.height)
  }

  private fun unbind() {
    if (listening) {
      runCatching { feed()?.removeVideoDataListener(videoListener) }
      listening = false
    }
    runCatching { codec?.destroyCodec() }
    codec = null
  }

  /**
   * One reading a second, whether or not anything is arriving.
   *
   * A silence has to be reported as a measurement — `0 fps` — rather than as an absence of events,
   * which JS cannot tell from a listener that was never attached.
   */
  private val tick = object : Runnable {
    override fun run() {
      val framesPerSecond = frames
      val bytesPerSecond = bytes
      frames = 0
      bytes = 0

      onStreamStatus(
        mapOf(
          "requested" to componentIndex,
          "bound" to if (listening) componentIndex else null,
          "surfaceMode" to surfaceMode,
          "available" to if (listening) listOf(componentIndex) else emptyList<String>(),
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
    surfaceView = createSurfaceView()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    main.post(tick)
  }

  override fun onDetachedFromWindow() {
    main.removeCallbacks(tick)
    // A decoder left alive holds the hardware codec for the rest of the process.
    unbind()
    super.onDetachedFromWindow()
  }

  companion object {
    const val MODE_NORMAL = "normal"
    const val MODE_OVERLAY = "overlay"
    const val MODE_TOP = "top"
  }
}
