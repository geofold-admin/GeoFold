import { requireOptionalNativeModule, requireNativeView } from 'expo';
import { useEffect, useState } from 'react';
import type { ViewProps } from 'react-native';

/**
 * DJI Mobile SDK V5 — connection state only.
 *
 * `requireOptionalNativeModule` rather than `requireNativeModule`: the SDK is Android-only and
 * absent from any web or Expo Go run, and the app should say "no SDK" rather than fail to start.
 * This mirrors how the survey app defers MapLibre in `lib/native.ts`.
 */
const Native = requireOptionalNativeModule<{
  initialize(): Promise<void>;
  registerApp(): Promise<void>;
  isRegistered(): boolean;
  capturePhoto(): Promise<DronePhoto>;
  fetchLatestPhoto(): Promise<DronePhoto>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<void>;
  /** Present only on the V4 module for now; absent elsewhere, hence the optional call sites. */
  lastCrash?(): Promise<string | null>;
  clearCrash?(): Promise<void>;
  /** Flight commands — V4 module only for now; see `Telemetry.flightControls`. */
  takeOff?(): Promise<void>;
  land?(): Promise<void>;
  cancelLanding?(): Promise<void>;
  confirmLanding?(): Promise<void>;
  goHome?(): Promise<void>;
  cancelGoHome?(): Promise<void>;
  setHomeHere?(): Promise<void>;
  setGoHomeAltitude?(metres: number): Promise<void>;
  setGimbalPitch?(degrees: number): Promise<void>;
  resetGimbal?(): Promise<void>;
  setIso?(value: string): Promise<void>;
  setShutterSpeed?(value: string): Promise<void>;
  setExposureCompensation?(value: string): Promise<void>;
  setExposureMode?(value: string): Promise<void>;
  uploadMission?(
    points: { latitude: number; longitude: number; altitude: number }[],
    settings: { speed?: number; shootPhotos?: boolean },
  ): Promise<void>;
  startMission?(): Promise<void>;
  stopMission?(): Promise<void>;
  pauseMission?(): Promise<void>;
  resumeMission?(): Promise<void>;
  addListener(event: string, listener: (payload: any) => void): { remove(): void };
}>('DjiMsdk');

export const DJI_AVAILABLE = Native != null;

export interface RegisterEvent {
  registered: boolean;
  error: string | null;
}

export interface ProductEvent {
  connected: boolean;
  productId: number;
}

export interface InitProcessEvent {
  event: string;
  progress: number;
}

export interface Telemetry {
  latitude: number | null;
  longitude: number | null;
  /** Metres **relative to the take-off point**, which is DJI's definition — not an elevation. */
  altitude: number | null;
  /** Compass heading in degrees, -180 to 180. */
  heading: number | null;
  satellites: number | null;

  /**
   * True when this build can actually fly the aircraft.
   *
   * The Drone screen is shared between SDK variants and only the V4 module implements the flight
   * commands so far. Buttons that do nothing are worse than no buttons, especially these, so the
   * controls are hidden unless the module says it has them.
   */
  flightControls?: boolean;
  isFlying?: boolean;
  isGoingHome?: boolean;
  /** The aircraft is hovering, waiting for permission to touch down. */
  needsLandingConfirm?: boolean;
  flightMode?: string | null;

  /** Charge remaining, 0–100. */
  battery?: number | null;
  batteryVoltage?: number | null;
  batteryTemperature?: number | null;
  /** Gimbal pitch in degrees: 0 is level, negative looks down, −90 is straight down. */
  gimbalPitch?: number | null;
}

/** What `capturePhoto` resolves with: the file, plus the fix at the moment of the shutter. */
export interface DronePhoto extends Telemetry {
  /** `file://` URI in the app cache. Move it into the outbox before it is evicted. */
  uri: string;
  timestamp: number;
}

/** One entry from DJI's own health list — its words, not ours. */
export interface DroneWarning {
  code: string | null;
  title: string | null;
  description: string | null;
  /** NORMAL · NOTICE · CAUTION · WARNING · SERIOUS_WARNING · UNKNOWN */
  level: string | null;
}

/**
 * What the aircraft says is wrong with itself.
 *
 * A status light blinking red is the aircraft reporting a fault, and without this the app could
 * only show the *symptoms* — a black feed, a blinking light — with no way to tell whether they were
 * one problem or two. `cameraType` is the most direct answer to a stream that never starts: a
 * camera the aircraft does not report cannot send video, and no surface plumbing changes that.
 */
export interface DroneHealth {
  /**
   * Which SDK generation is underneath, in words fit to show.
   *
   * The Drone screen is shared by the V4 and V5 variants and cannot tell them apart; it used to
   * hardcode V5's wording and so described the wrong SDK and the wrong ABIs on a V4 build.
   */
  sdkNote: string | null;
  /** The camera the aircraft reports carrying, or null when it reports none. */
  cameraType: string | null;
  /** DJI's overall status code, e.g. NORMAL, COMPASS_ERROR, BATTERY_EXCEPTION. */
  status: string | null;
  statusDescription: string | null;
  statusLevel: string | null;
  warnings: DroneWarning[];
}

export interface CameraState {
  recording: boolean;
  /** Seconds into the current clip. */
  recordingTime: number | null;
}

export interface DroneLink {
  /** Null until the SDK has reported one way or the other. */
  registered: boolean | null;
  registrationError: string | null;
  connected: boolean;
  /** DJI's numeric product id; -1 when nothing is attached. */
  productId: number;
  /** Last init step reported — the fly-safe database download shows up here on first run. */
  progress: InitProcessEvent | null;
  /** Live from the aircraft; all-null until one is connected. */
  telemetry: Telemetry;
  camera: CameraState;
  /** The aircraft's own diagnosis of itself. */
  health: DroneHealth;
}

const NO_CAMERA: CameraState = { recording: false, recordingTime: null };

const NO_HEALTH: DroneHealth = {
  sdkNote: null,
  cameraType: null,
  status: null,
  statusDescription: null,
  statusLevel: null,
  warnings: [],
};

const NO_TELEMETRY: Telemetry = {
  latitude: null,
  longitude: null,
  altitude: null,
  heading: null,
  satellites: null,
};

/**
 * Subscribes to the SDK's lifecycle and reports the aircraft link.
 *
 * Registration reaches DJI's servers the first time an App Key is used and then caches, so the
 * first launch on a new device needs connectivity even though every later one does not. A failure
 * here is far more often that, a key that does not match the package name, or a key that was never
 * activated — than anything about the aircraft.
 */
export function useDroneLink(): DroneLink {
  const [state, setState] = useState<DroneLink>({
    registered: null,
    registrationError: null,
    connected: false,
    productId: -1,
    progress: null,
    telemetry: NO_TELEMETRY,
    camera: NO_CAMERA,
    health: NO_HEALTH,
  });

  useEffect(() => {
    if (!Native) {
      setState((s) => ({
        ...s,
        registered: false,
        registrationError: 'The DJI SDK is not part of this build.',
      }));
      return;
    }

    const subscriptions = [
      Native.addListener('onRegister', (e: RegisterEvent) =>
        setState((s) => ({ ...s, registered: e.registered, registrationError: e.error })),
      ),
      Native.addListener('onProduct', (e: ProductEvent) =>
        setState((s) => ({
          ...s,
          connected: e.connected,
          productId: e.productId,
          // Stale telemetry from a disconnected aircraft is worse than none: it looks live.
          telemetry: e.connected ? s.telemetry : NO_TELEMETRY,
          camera: e.connected ? s.camera : NO_CAMERA,
          // A fault list from an aircraft that has gone away describes hardware no longer attached.
          health: e.connected ? s.health : NO_HEALTH,
        })),
      ),
      Native.addListener('onTelemetry', (e: Telemetry) =>
        setState((s) => ({ ...s, telemetry: e })),
      ),
      Native.addListener('onCamera', (e: CameraState) =>
        setState((s) => ({ ...s, camera: e })),
      ),
      Native.addListener('onHealth', (e: DroneHealth) =>
        setState((s) => ({ ...s, health: { ...e, warnings: e.warnings ?? [] } })),
      ),
      Native.addListener('onInitProcess', (e: InitProcessEvent) =>
        setState((s) => ({ ...s, progress: e })),
      ),
    ];

    void Native.initialize().catch((error: unknown) =>
      setState((s) => ({
        ...s,
        registered: false,
        registrationError: error instanceof Error ? error.message : 'Could not start the DJI SDK.',
      })),
    );

    return () => subscriptions.forEach((sub) => sub.remove());
  }, []);

  return state;
}

/** Which camera. Almost always the default; multi-camera payloads use RIGHT, UP, FPV, etc. */
export type CameraIndex = 'LEFT_OR_MAIN' | 'RIGHT' | 'UP' | 'FPV' | 'VISION_ASSIST';

/**
 * What the video link is actually delivering, once a second.
 *
 * Every way the feed can fail looks identical on screen — a black rectangle — so this reports the
 * measurement instead of the symptom. `fps` counts frames arriving off the link *before* decoding:
 * black with frames arriving is a rendering fault, black with none is a link, camera or stream
 * fault. Without it the two are indistinguishable in the field, where there is no cable to the
 * phone and no log to read.
 */
export interface StreamStatus {
  /** The camera JS asked for. */
  requested: CameraIndex | string;
  /** The camera the surface is bound to — differs when the aircraft has no camera at `requested`. */
  bound: string | null;
  /** The compositing mode this reading was taken under, so a fix records what fixed it. */
  surfaceMode: SurfaceMode | string;
  /** Every camera the aircraft reports. Empty until it has said, which is itself a diagnosis. */
  available: string[];
  /** Frames off the link in the last second. Zero means no video is arriving at all. */
  fps: number;
  kbps: number;
  /** The stream's own dimensions, 0 until a frame has arrived. */
  width: number;
  height: number;
  /** The last SDK failure on the registration path, or null. */
  error: string | null;
}

/**
 * How the camera's surface is composited against the rest of the screen.
 *
 * A `SurfaceView`'s pixels are not drawn by the view hierarchy — the hierarchy punches a
 * transparent hole and the buffer is composited behind the window. When that hole does not come
 * through, frames decode perfectly into a black rectangle and nothing logs anything.
 *
 * - `normal` — behind the window, hole punched. What a video player uses; overlays draw on top.
 * - `overlay` — above other *surfaces* in the window but still below the view hierarchy, so the
 *   HUD survives. The one to try when a second surface (the minimap) is in play.
 * - `top` — above the window entirely. No hole to fail, so video here and nowhere else proves the
 *   fault is compositing — but it covers every React view, the HUD included.
 */
export type SurfaceMode = 'normal' | 'overlay' | 'top';

export interface DroneCameraProps extends ViewProps {
  componentIndex?: CameraIndex;
  /** Defaults to `normal`. See {@link SurfaceMode} — changing it rebuilds the surface. */
  surfaceMode?: SurfaceMode;
  /** Fires when the aircraft reports which cameras it exposes. */
  onCameraAvailable?: (event: { nativeEvent: { available: string[] } }) => void;
  /** Fires once a second while the view is on screen, whether or not video is arriving. */
  onStreamStatus?: (event: { nativeEvent: StreamStatus }) => void;
}

/**
 * The aircraft's live camera feed.
 *
 * A native view, not a frame stream: the SDK decodes straight onto a Surface, and pushing 1080p30
 * through the JS bridge would not keep up. Give it a real size — it fills its parent, and a parent
 * with no height renders nothing at all, which looks identical to a dead feed.
 *
 * `null` when the SDK is not in the build, so callers must guard on {@link DJI_AVAILABLE}.
 */
export const DroneCamera: React.ComponentType<DroneCameraProps> | null = (() => {
  if (!DJI_AVAILABLE) return null;
  try {
    return requireNativeView('DjiMsdk') as React.ComponentType<DroneCameraProps>;
  } catch {
    // Guarded because this resolves at *import* time, and `@dji` is imported by the Profile screen
    // as well as this one. An unguarded throw here would not fail the camera — it would fail the
    // whole app, on a screen that has nothing to do with the drone. A missing feed is recoverable;
    // an app that will not open is not.
    return null;
  }
})();

/**
 * Fires whenever the camera finishes an exposure — from the remote controller's own shutter
 * button, the app's capture button, or an interval timer.
 *
 * Watching the effect rather than the cause is deliberate: there is no SDK key for the RC's
 * physical buttons, and even if there were, a photo is a photo whoever triggered it. Returns an
 * unsubscribe function.
 */
export function onPhotoTaken(listener: () => void): () => void {
  if (!Native) return () => {};
  const sub = Native.addListener('onPhotoTaken', listener);
  return () => sub.remove();
}

/**
 * Pulls the newest file off the camera without firing the shutter.
 *
 * For a photo the pilot already took on the remote controller — shooting again would just make a
 * second, near-identical frame.
 */
export function fetchLatestPhoto(): Promise<DronePhoto> {
  if (!Native) throw new Error('The DJI SDK is not part of this build.');
  return Native.fetchLatestPhoto();
}

export function startRecording(): Promise<void> {
  if (!Native) throw new Error('The DJI SDK is not part of this build.');
  return Native.startRecording();
}

export function stopRecording(): Promise<void> {
  if (!Native) throw new Error('The DJI SDK is not part of this build.');
  return Native.stopRecording();
}

/**
 * The stack trace of the last fatal crash, or null.
 *
 * A crash on the Drone screen in the field leaves no other trace — no cable, no logcat, just a
 * dialog saying the app stopped. The native side records it on the way down; this reads it back on
 * the next launch so it can be seen and reported.
 */
export async function lastCrash(): Promise<string | null> {
  if (!Native?.lastCrash) return null;
  return (await Native.lastCrash()) ?? null;
}

export async function clearCrash(): Promise<void> {
  await Native?.clearCrash?.();
}

/*
 * Flight commands.
 *
 * Each moves a real aircraft. They reject with DJI's own wording when the aircraft refuses — a
 * command that silently did nothing is far more dangerous than one that says why — and reject
 * clearly when the build has no flight support at all rather than resolving into the void.
 */
function flight(name: keyof NonNullable<typeof Native>): () => Promise<void> {
  return async () => {
    const fn = Native?.[name] as undefined | (() => Promise<void>);
    if (!fn) throw new Error('This build cannot send flight commands.');
    await fn.call(Native);
  };
}

export const takeOff = flight('takeOff');
export const land = flight('land');
export const cancelLanding = flight('cancelLanding');
export const confirmLanding = flight('confirmLanding');
export const goHome = flight('goHome');
export const cancelGoHome = flight('cancelGoHome');
export const setHomeHere = flight('setHomeHere');

/**
 * Commands that take an argument.
 *
 * Camera settings are passed as DJI's own enum *names* (`ISO_400`, `N_1_0`, `SHUTTER_SPEED_1_60`)
 * rather than a curated set, so the UI can offer more without a second place to edit. An unknown
 * name is rejected by the native side with the name in the message.
 */
function command<A>(name: keyof NonNullable<typeof Native>): (arg: A) => Promise<void> {
  return async (arg: A) => {
    const fn = Native?.[name] as undefined | ((a: A) => Promise<void>);
    if (!fn) throw new Error('This build does not support that command.');
    await fn.call(Native, arg);
  };
}

/** Absolute pitch in degrees; clamped to the gimbal's range on the native side. */
export const setGimbalPitch = command<number>('setGimbalPitch');
export const resetGimbal = flight('resetGimbal');
/** Metres above the take-off point an automatic return climbs to first. */
export const setGoHomeAltitude = command<number>('setGoHomeAltitude');
export const setIso = command<string>('setIso');
export const setShutterSpeed = command<string>('setShutterSpeed');
export const setExposureCompensation = command<string>('setExposureCompensation');
export const setExposureMode = command<string>('setExposureMode');

/**
 * Sends a flight plan to the aircraft.
 *
 * **Not every aircraft accepts one.** DJI withholds waypoint missions from airframes without
 * obstacle avoidance — the Mavic Mini among them — and refuses at upload with its own wording,
 * which is passed through rather than reworded: "this aircraft does not support waypoint missions"
 * is exactly what needs reading, and a friendlier message would only hide the errors that mean
 * something else. Plan first with `lib/mission.ts`; that half works on any aircraft.
 */
export async function uploadMission(
  points: { latitude: number; longitude: number; altitude: number }[],
  settings: { speed?: number; shootPhotos?: boolean } = {},
): Promise<void> {
  if (!Native?.uploadMission) throw new Error('This build cannot fly missions.');
  await Native.uploadMission(points, settings);
}

export const startMission = flight('startMission');
export const stopMission = flight('stopMission');
export const pauseMission = flight('pauseMission');
export const resumeMission = flight('resumeMission');

/** Retry after a registration failure — worth offering, since the usual cause is no network. */
export function retryRegistration(): Promise<void> {
  return Native ? Native.registerApp() : Promise.resolve();
}

/**
 * Fires the shutter and pulls the resulting file off the aircraft.
 *
 * One call rather than two on purpose: the photo is written to the aircraft's own storage, and a
 * survey point with no photo — or a photo with no point — is worse than a clean failure. Expect it
 * to take seconds; the file comes down over the RC link.
 */
export function capturePhoto(): Promise<DronePhoto> {
  if (!Native) throw new Error('The DJI SDK is not part of this build.');
  return Native.capturePhoto();
}
