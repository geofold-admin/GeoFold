import * as ScreenOrientation from 'expo-screen-orientation';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DroneMinimap, type MinimapPoint } from '@/components/drone-minimap';
import {
  ProjectPicker,
  lastProject,
  rememberProject,
  type PickedProject,
} from '@/components/project-picker';
import { BackChevron } from '@/components/icons';
import { Button, ErrorNote, Row, RowGroup } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { captureDroneSurvey } from '@/lib/drone-survey';
import { buildGrid } from '@/lib/grid';
import { formatDistance, planFromGrid, type MissionPlan } from '@/lib/mission';
import { useSync } from '@/lib/sync-context';
import {
  DJI_AVAILABLE,
  DroneCamera,
  onPhotoTaken,
  retryRegistration,
  startRecording,
  stopRecording,
  useDroneLink,
  lastCrash,
  clearCrash,
  takeOff,
  land,
  confirmLanding,
  goHome,
  cancelGoHome,
  setHomeHere,
  setGimbalPitch,
  resetGimbal,
  setIso,
  setExposureCompensation,
  setGoHomeAltitude,
  uploadMission,
  startMission,
  stopMission,
  type CameraIndex,
  type StreamStatus,
  type SurfaceMode,
} from '@dji';

/**
 * The aircraft, flown from a full-screen head-up display.
 *
 * The feed fills the screen and everything else floats on top of it: the minimap on the left, the
 * telemetry along the bottom, the shutter and record controls under the right thumb. That is the
 * arrangement every ground station uses, and the reason is not aesthetic — a pilot reads the video
 * and the position together, and a layout that makes them take turns costs the frame that mattered.
 *
 * **Landscape, locked for this screen only.** The camera is 16:9 and the rest of the app is
 * portrait-locked; in portrait a full-width feed covers barely a third of the screen and the rest is
 * letterbox. The lock is released on the way out, so nothing else in the app changes.
 *
 * The diagnostics that used to fill this screen are not gone — registration, the USB handover, the
 * App Key and the video stream each fail in a way that looks like one of the others, and a blank
 * HUD would leave a surveyor guessing. They moved behind **Info**, and they open automatically
 * whenever there is no aircraft, which is when they are the only thing worth showing.
 */
export default function DroneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const C = useColors();
  const link = useDroneLink();
  const { items } = useSync();

  const [busy, setBusy] = useState(false);
  const [autoIngest, setAutoIngest] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  /*
   * Video diagnostics — a reading once a second from the native view.
   *
   * The feed fails in four ways that all look like the same black rectangle: stream not enabled,
   * wrong camera index, registration threw, or frames arriving onto a surface nothing is showing.
   * In the field there is no cable to the phone and no log to read, so the reading is the only way
   * to tell them apart.
   */
  const [reading, setReading] = useState<StreamStatus | null>(null);
  const [camera, setCamera] = useState<CameraIndex>('LEFT_OR_MAIN');

  /*
   * Which of those four the black screen is cannot be settled from here, and each guess costs a
   * rebuild and a flight. So both of the fixable ones are switchable in the field: the camera index
   * below, and how the surface is composited here.
   *
   * Not persisted on purpose — `top` draws the video over every control on this screen, Info
   * included, so leaving and re-entering has to be the way back out.
   */
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>('normal');

  /*
   * The stack trace of the last fatal crash, if there was one.
   *
   * A crash on this screen in the field leaves nothing else behind: no cable to the phone, no
   * logcat, and a system dialog that says only that the app stopped. The native side writes the
   * trace on the way down; this reads it back on the next open so it can actually be reported.
   */
  const [crash, setCrash] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void lastCrash().then((c) => alive && setCrash(c));
    return () => {
      alive = false;
    };
  }, []);

  /*
   * Landscape while this screen is up, portrait again on the way out.
   *
   * Restored in the cleanup rather than on the back button, because back is not the only way off
   * this screen — a deep link or a hardware gesture leaves the same way, and an app stuck in
   * landscape after leaving the drone behind would look like a bug in every other screen.
   */
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  // No aircraft means nothing to fly by, so the panel *is* the screen rather than an option —
  // derived, not forced into state, so that the moment an aircraft connects the panel gets out of
  // the way of the feed on its own and the pilot's own choice takes over from there.
  const panelVisible = panelOpen || !link.connected;

  const hasFix = link.telemetry.latitude != null && link.telemetry.longitude != null;

  // The camera view unmounts when the aircraft goes away, so its last reading would sit there
  // looking live. Derived rather than cleared, so there is no window where it can.
  const stream = link.connected ? reading : null;
  const cameras = stream?.available ?? [];

  const video =
    stream == null
      ? '—'
      : stream.fps === 0
        ? 'no frames'
        : `${stream.width}×${stream.height} · ${stream.fps} fps`;

  // What has been captured but not yet synced, so the pilot sees the pattern flown so far and not
  // just where the aircraft is now.
  const points = useMemo<MinimapPoint[]>(
    () => items.map((i) => ({ id: i.id, latitude: i.latitude, longitude: i.longitude, pending: true })),
    [items],
  );

  /*
   * Flight commands, armed before they fire.
   *
   * These lift a real aircraft off the ground, land it, or send it home on its own. A single
   * mis-tap on a phone held one-handed at a survey site is not an acceptable way to start a
   * takeoff, so a command has to be tapped twice: the first tap arms it and relabels the button,
   * the second sends it, and it disarms itself after a few seconds.
   *
   * **Cancels are exempt and fire on the first tap.** Stopping an automated flight is the one
   * command a pilot may need instantly, and making them confirm it would be the dangerous choice.
   */
  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (armTimer.current) clearTimeout(armTimer.current);
  }, []);

  const disarm = useCallback(() => {
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = null;
    setArmed(null);
  }, []);

  const runFlight = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setCaptureError(null);
      try {
        await action();
        setResult(`${key} sent`);
      } catch (e) {
        setCaptureError(e instanceof Error ? e.message : `${key} failed.`);
      }
    },
    [],
  );

  /** First tap arms, second sends. */
  const armOrRun = useCallback(
    (key: string, action: () => Promise<void>) => {
      if (armed === key) {
        disarm();
        void runFlight(key, action);
        return;
      }
      if (armTimer.current) clearTimeout(armTimer.current);
      setArmed(key);
      armTimer.current = setTimeout(() => setArmed(null), 4000);
    },
    [armed, disarm, runFlight],
  );

  /*
   * The flight plan, built from the survey grid around the aircraft.
   *
   * This is the join the grid exists for: the grid says which ground is covered, a mission says how
   * to cover the rest. The plot is centred on the aircraft rather than on the map's viewport,
   * because on this screen the aircraft is the only frame of reference the pilot has.
   *
   * Planning is separate from flying on purpose — it works on any aircraft, including the ones DJI
   * refuses to fly missions on. A Mavic Mini pilot can read the route off the minimap and fly it by
   * hand and still get the coverage the grid is asking for.
   */
  const [cellSize, setCellSize] = useState(50);
  const [span, setSpan] = useState(5);
  const [missionAltitude, setMissionAltitude] = useState(40);

  const plan = useMemo<MissionPlan | null>(() => {
    const { latitude, longitude } = link.telemetry;
    if (latitude == null || longitude == null) return null;

    // A box `span` cells wide centred on the aircraft. Longitude degrees shrink with latitude, so
    // the east–west half-width is divided by cos(lat) — without it the plot is not square on the
    // ground, which is the whole thing the UTM grid exists to avoid.
    const halfMetres = (span * cellSize) / 2;
    const dLat = halfMetres / 111_320;
    const dLng = halfMetres / (111_320 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180)));

    const grid = buildGrid(
      [longitude - dLng, latitude - dLat, longitude + dLng, latitude + dLat],
      cellSize,
      [],
    );
    // `onlyUncovered: false` — this plots the whole block. Nothing on this screen knows which cells
    // already hold surveys; that lives on the map.
    return planFromGrid(grid.cells, missionAltitude, { onlyUncovered: false });
  }, [cellSize, link.telemetry, missionAltitude, span]);

  /*
   * Which project aerial photos are filed under.
   *
   * Restored from the last flight so a pilot working one block is asked once, not once per
   * shutter press. Held in a ref as well because the remote-controller subscription below reads it
   * from a callback that must not be rebuilt on every render.
   */
  const [project, setProject] = useState<PickedProject | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const projectRef = useRef<PickedProject | null>(null);
  const pendingCaptureRef = useRef<boolean | null>(null);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    void lastProject().then((saved) => {
      if (saved) setProject(saved);
    });
  }, []);

  const runCapture = useCallback(async (alreadyTaken: boolean, target: PickedProject) => {
    setBusy(true);
    setResult(null);
    setCaptureError(null);
    try {
      const survey = await captureDroneSurvey({
        projectId: target.id,
        projectName: target.name,
        alreadyTaken,
      });
      const gallery =
        survey.gallery === 'saved'
          ? ' · disimpan ke galeri'
          : survey.gallery === 'denied'
            ? ' · galeri: izin ditolak'
            : ' · galeri: gagal';
      setResult(
        `Queued ${survey.surveyId.slice(0, 8)}${alreadyTaken ? ' (RC)' : ''} → ${target.name} at ` +
          `${survey.latitude.toFixed(6)}, ${survey.longitude.toFixed(6)}${gallery}`,
      );
    } catch (e) {
      setCaptureError(e instanceof Error ? e.message : 'The capture failed.');
    } finally {
      setBusy(false);
    }
  }, []);

  /** Asks for a project first if none is chosen yet, then captures. */
  const capture = useCallback(
    async (alreadyTaken: boolean) => {
      const target = projectRef.current;
      if (!target) {
        // Remember what the pilot was doing, so picking a project completes that same capture
        // rather than making them press the shutter again.
        pendingCaptureRef.current = alreadyTaken;
        setPickerOpen(true);
        return;
      }
      await runCapture(alreadyTaken, target);
    },
    [runCapture],
  );

  const onPickProject = useCallback(
    (picked: PickedProject) => {
      setProject(picked);
      projectRef.current = picked;
      void rememberProject(picked);
      setPickerOpen(false);

      const pending = pendingCaptureRef.current;
      pendingCaptureRef.current = null;
      if (pending !== null) void runCapture(pending, picked);
    },
    [runCapture],
  );

  /*
   * Photos the pilot takes on the remote controller.
   *
   * Held in a ref, not a dependency: the subscription must not be torn down and rebuilt on every
   * render, or a shutter press landing mid-render would be missed entirely.
   */
  const autoRef = useRef(autoIngest);
  const busyRef = useRef(busy);
  useEffect(() => {
    autoRef.current = autoIngest;
  }, [autoIngest]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!link.connected) return;
    return onPhotoTaken(() => {
      // Ignore the echo of our own capture, which raises this event too — otherwise every app
      // capture would queue the same frame twice.
      if (!autoRef.current || busyRef.current) return;
      void capture(true);
    });
  }, [capture, link.connected]);

  const toggleRecording = async () => {
    setCaptureError(null);
    try {
      await (link.camera.recording ? stopRecording() : startRecording());
    } catch (e) {
      setCaptureError(e instanceof Error ? e.message : 'The recording command failed.');
    }
  };

  const registration =
    link.registered === null
      ? 'Registering…'
      : link.registered
        ? 'Registered'
        : 'Not registered';

  /*
   * The single most useful thing to put on the HUD when something is actually wrong.
   *
   * Driven by DJI's warning *level*, not by the presence of a status. An earlier version showed any
   * status code in red and so painted `0x1F100059` — which is DJI's code for **"Ready to GO"** — as
   * a scarlet fault chip. A healthy aircraft must say nothing here, or the one place a real fault
   * appears is the place the eye has learned to ignore.
   */
  const SEVERE = ['WARNING', 'SERIOUS_WARNING'];
  const severe = link.health.warnings.filter((w) => w.level && SEVERE.includes(w.level));
  const fault =
    severe[0]?.title ??
    severe[0]?.code ??
    (link.health.statusLevel && SEVERE.includes(link.health.statusLevel)
      ? link.health.statusDescription ?? link.health.status
      : null);

  /** The aircraft's own words for its current state — shown plainly, whatever the level. */
  const statusText = link.health.statusDescription ?? link.health.status;

  const captureLabel = busy
    ? 'Capturing…'
    : !link.connected
      ? 'No aircraft'
      : !hasFix
        ? 'No GPS'
        : 'Capture';

  return (
    <View style={styles.root}>
      {/* The feed, full bleed and behind everything. Only once an aircraft is attached — before
          that the decoder has nothing to draw and the view is a black rectangle indistinguishable
          from a broken one. */}
      {link.connected && DroneCamera ? (
        <DroneCamera
          style={StyleSheet.absoluteFill}
          componentIndex={camera}
          surfaceMode={surfaceMode}
          onStreamStatus={(e) => setReading(e.nativeEvent)}
        />
      ) : null}

      {/* `box-none`: the overlay covers the feed but must not swallow touches meant for it — only
          the controls themselves take a press. */}
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 10,
            paddingLeft: insets.left + 12,
            paddingRight: insets.right + 12,
          },
        ]}
        pointerEvents="box-none">
        {/* ── left: back, then the minimap ─────────────────────────────────────── */}
        <View style={styles.leftCol} pointerEvents="box-none">
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
            <BackChevron color="#fff" size={18} />
            <Text style={styles.backText}>Drone</Text>
          </Pressable>

          <View style={styles.minimap}>
            <DroneMinimap
              latitude={link.telemetry.latitude}
              longitude={link.telemetry.longitude}
              heading={link.telemetry.heading}
              points={points}
              path={plan?.waypoints ?? []}
            />
          </View>

          {/* Flight controls. Only when the module actually implements them — see
              `Telemetry.flightControls`; a dead Return-to-home button would be worse than none. */}
          {link.connected && link.telemetry.flightControls ? (
            <View style={styles.flight} pointerEvents="box-none">
              {link.telemetry.needsLandingConfirm ? (
                // The aircraft is hovering, waiting for permission to touch down. Nothing else on
                // this screen matters while that is true, and it fires on one tap.
                <Pressable
                  onPress={() => void runFlight('Confirm landing', confirmLanding)}
                  style={[styles.flightBtn, styles.flightBtnUrgent]}>
                  <Text style={styles.flightText}>Confirm landing</Text>
                </Pressable>
              ) : null}

              {link.telemetry.isGoingHome ? (
                <Pressable
                  onPress={() => void runFlight('Cancel RTH', cancelGoHome)}
                  style={[styles.flightBtn, styles.flightBtnUrgent]}>
                  <Text style={styles.flightText}>Cancel RTH</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => armOrRun('Return home', goHome)}
                  style={[styles.flightBtn, armed === 'Return home' ? styles.flightBtnArmed : null]}>
                  <Text style={styles.flightText}>
                    {armed === 'Return home' ? 'Tap to confirm' : 'Return home'}
                  </Text>
                </Pressable>
              )}

              {link.telemetry.isFlying ? (
                <Pressable
                  onPress={() => armOrRun('Land', land)}
                  style={[styles.flightBtn, armed === 'Land' ? styles.flightBtnArmed : null]}>
                  <Text style={styles.flightText}>
                    {armed === 'Land' ? 'Tap to confirm' : 'Land'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => armOrRun('Take off', takeOff)}
                  style={[styles.flightBtn, armed === 'Take off' ? styles.flightBtnArmed : null]}>
                  <Text style={styles.flightText}>
                    {armed === 'Take off' ? 'Tap to confirm' : 'Take off'}
                  </Text>
                </Pressable>
              )}

              {armed ? (
                <Pressable onPress={disarm} style={styles.flightCancel}>
                  <Text style={styles.flightCancelText}>Cancel</Text>
                </Pressable>
              ) : null}

              {/* Gimbal pitch. Absolute angles, because a survey wants a known one — straight down
                  for a nadir frame, level for context — and relative nudges drift off it. No arming:
                  moving the camera cannot hurt anyone. */}
              <View style={styles.gimbalRow}>
                {([['−90°', -90], ['−45°', -45], ['0°', 0]] as const).map(([label, deg]) => (
                  <Pressable
                    key={label}
                    onPress={() => void runFlight(`Gimbal ${label}`, () => setGimbalPitch(deg))}
                    style={styles.gimbalBtn}>
                    <Text style={styles.gimbalText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.gimbalNow}>
                gimbal{' '}
                {link.telemetry.gimbalPitch == null
                  ? '—'
                  : `${Math.round(link.telemetry.gimbalPitch)}°`}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── centre: status along the top, telemetry along the bottom ──────────── */}
        <View style={styles.centreCol} pointerEvents="box-none">
          <View style={styles.chipRow} pointerEvents="box-none">
            {link.camera.recording ? (
              <View style={[styles.chip, styles.chipRec]}>
                <View style={styles.recDot} />
                <Text style={styles.chipText}>
                  REC{link.camera.recordingTime != null ? ` ${link.camera.recordingTime}s` : ''}
                </Text>
              </View>
            ) : null}
            {/* A fault the aircraft is already reporting belongs on the HUD, not two taps away —
                it is usually the explanation for whatever else looks broken. */}
            {fault ? (
              <View style={[styles.chip, styles.chipFault]}>
                <Text style={styles.chipText}>{fault}</Text>
              </View>
            ) : null}
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                {link.connected ? `Aircraft ${link.productId}` : registration}
              </Text>
            </View>
            {link.connected ? (
              <View style={[styles.chip, stream?.fps === 0 ? styles.chipWarn : null]}>
                <Text style={styles.chipText}>{video}</Text>
              </View>
            ) : null}
            {/* Battery: the number a pilot checks more than any other. Amber under 30, red under
                15 — the thresholds DJI itself warns at. */}
            {link.telemetry.battery != null ? (
              <View
                style={[
                  styles.chip,
                  link.telemetry.battery <= 15
                    ? styles.chipFault
                    : link.telemetry.battery <= 30
                      ? styles.chipWarn
                      : null,
                ]}>
                <Text style={styles.chipText}>{link.telemetry.battery}%</Text>
              </View>
            ) : null}
          </View>

          {link.connected ? (
            <View style={styles.telemetry} pointerEvents="none">
              <Stat label="LAT" value={link.telemetry.latitude?.toFixed(6) ?? '—'} />
              <Stat label="LNG" value={link.telemetry.longitude?.toFixed(6) ?? '—'} />
              {/* Relative to the take-off point, which is DJI's definition — not an elevation. */}
              <Stat
                label="ALT"
                value={link.telemetry.altitude == null ? '—' : `${link.telemetry.altitude.toFixed(1)} m`}
              />
              <Stat
                label="HDG"
                value={link.telemetry.heading == null ? '—' : `${Math.round(link.telemetry.heading)}°`}
              />
              <Stat label="SAT" value={link.telemetry.satellites?.toString() ?? '—'} />
              {link.telemetry.flightMode ? (
                <Stat label="MODE" value={link.telemetry.flightMode} />
              ) : null}
            </View>
          ) : null}
        </View>

        {/* ── right: the controls, under the thumb ──────────────────────────────── */}
        <View style={styles.rightCol} pointerEvents="box-none">
          <Pressable
            onPress={() => setPanelOpen((open) => !open)}
            style={[styles.hudButton, panelVisible ? styles.hudButtonOn : null]}>
            <Text style={styles.hudButtonText}>Info</Text>
          </Pressable>

          <View style={{ flex: 1 }} pointerEvents="none" />

          {link.connected ? (
            <Pressable
              onPress={() => void toggleRecording()}
              style={[styles.hudButton, link.camera.recording ? styles.hudButtonRec : null]}>
              <Text style={styles.hudButtonText}>{link.camera.recording ? 'Stop' : 'Record'}</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => void capture(false)}
            disabled={busy || !link.connected || !hasFix}
            style={[
              styles.shutter,
              busy || !link.connected || !hasFix ? styles.shutterOff : null,
            ]}>
            <Text style={styles.shutterText}>{captureLabel}</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Info: everything the HUD does not have room for ─────────────────────── */}
      {panelVisible ? (
        <View
          style={[
            styles.panel,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, right: insets.right + 12 },
          ]}>
          <ScrollView contentContainerStyle={styles.panelBody} showsVerticalScrollIndicator={false}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Link</Text>
              {link.connected ? (
                <Pressable onPress={() => setPanelOpen(false)} hitSlop={10}>
                  <Text style={styles.panelClose}>Close</Text>
                </Pressable>
              ) : null}
            </View>

            {/* First, above everything: if the app died last time, that is the most important
                thing on this screen and the reason anything else looks wrong. */}
            {crash ? (
              <>
                <Text style={styles.subhead}>Last crash — already happened</Text>
                <Text style={styles.note}>
                  A record of a crash from an earlier run, kept so it can be reported. It is not a
                  problem happening now, and clearing it is safe.
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator style={styles.crashBox}>
                  <Text style={styles.crashText}>{crash}</Text>
                </ScrollView>
                <Button
                  title="Clear crash report"
                  variant="outline"
                  onPress={() => {
                    void clearCrash();
                    setCrash(null);
                  }}
                />
                <View style={{ height: 12 }} />
              </>
            ) : null}

            <RowGroup>
              <Row label="SDK in build" value={DJI_AVAILABLE ? 'yes' : 'no'} />
              <Row label="Registration" value={registration} />
              <Row
                label="Aircraft"
                value={link.connected ? `connected (id ${link.productId})` : 'not connected'}
              />
              {link.progress ? (
                <Row label="Init" value={`${link.progress.event} ${link.progress.progress}%`} last />
              ) : null}
            </RowGroup>

            {/* The aircraft's own diagnosis. A status light blinking red is the aircraft saying
                something is wrong; this is it saying *what*, in DJI's words. A camera the aircraft
                does not report cannot send video — which is a far better explanation for a stream
                that never starts than anything left in the app's code. */}
            {link.connected ? (
              <>
                <View style={{ height: 12 }} />
                <RowGroup>
                  <Row label="Camera payload" value={link.health.cameraType ?? 'none reported'} />
                  <Row
                    label="Aircraft status"
                    value={statusText ?? '—'}
                    last={link.health.warnings.length === 0}
                  />
                  {link.health.warnings.map((w, i) => (
                    <Row
                      key={w.code ?? String(i)}
                      label={w.title ?? w.code ?? 'Warning'}
                      value={w.level ?? ''}
                      last={i === link.health.warnings.length - 1}
                    />
                  ))}
                </RowGroup>

                {link.health.warnings
                  .filter((w) => w.description)
                  .map((w, i) => (
                    <Text key={`d-${w.code ?? i}`} style={styles.note}>
                      {w.description}
                    </Text>
                  ))}

                {link.health.cameraType == null ? (
                  <Text style={styles.note}>
                    The aircraft is not reporting a camera. While that is true there is no video to
                    receive, and no setting on this screen will produce any — check the gimbal is
                    seated and that the aircraft is not showing a fault on its own controller.
                  </Text>
                ) : null}
              </>
            ) : null}

            {link.connected ? (
              <>
                <View style={{ height: 12 }} />
                <RowGroup>
                  <Row label="Camera" value={stream?.bound ?? 'not bound'} />
                  <Row
                    label="Aircraft reports"
                    value={cameras.length ? cameras.join(', ') : 'nothing yet'}
                  />
                  <Row
                    label="Video"
                    value={
                      stream == null
                        ? '—'
                        : stream.fps === 0
                          ? 'no frames'
                          : `${video} · ${(stream.kbps / 1000).toFixed(1)} Mbps`
                    }
                    last
                  />
                </RowGroup>

                {/* Switching index is a diagnosis, not a feature: an index the aircraft does not
                    have accepts the surface and then sends nothing, so being able to try the others
                    on the spot is worth more than a rebuild per guess. */}
                {cameras.length > 1 ? (
                  <View style={styles.chips}>
                    {cameras.map((name) => (
                      <Pressable
                        key={name}
                        onPress={() => setCamera(name as CameraIndex)}
                        style={[styles.indexChip, stream?.bound === name ? styles.indexChipOn : null]}>
                        <Text
                          style={[
                            styles.indexChipText,
                            stream?.bound === name ? styles.indexChipTextOn : null,
                          ]}>
                          {name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {/* The other half of the black-screen diagnosis, and the half that cannot be
                    reasoned about from the code: whether the frames are arriving and simply not
                    being shown. Switchable here so the answer is a tap, not a rebuild. */}
                <Text style={styles.subhead}>Surface</Text>
                <View style={styles.chips}>
                  {(['normal', 'overlay', 'top'] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() => setSurfaceMode(mode)}
                      style={[styles.indexChip, surfaceMode === mode ? styles.indexChipOn : null]}>
                      <Text
                        style={[
                          styles.indexChipText,
                          surfaceMode === mode ? styles.indexChipTextOn : null,
                        ]}>
                        {mode}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.note}>
                  If the video is arriving but the screen stays black, the frames are being drawn
                  somewhere nothing is showing. Try <Text style={styles.bold}>overlay</Text> first —
                  it keeps this HUD. <Text style={styles.bold}>top</Text> puts the video above
                  everything, so it will hide these controls: if the picture appears there and
                  nowhere else, that is the answer, and leaving the screen and coming back restores
                  the HUD.
                </Text>

                <Text style={styles.note}>
                  {stream == null
                    ? 'Waiting for the first video reading.'
                    : stream.fps > 0
                      ? 'Video is reaching the phone. A black view now means the frames are being ' +
                        'decoded onto a surface that is not visible, not that the link is down.'
                      : cameras.length === 0
                        ? 'The aircraft has not reported a camera yet. A payload still starting up, ' +
                          'or an aircraft with no camera attached, looks like this.'
                        : 'No video is arriving on this camera. Try another index above; if none ' +
                          'carry frames the stream is not being sent at all.'}
                </Text>

                <ErrorNote message={stream?.error ?? null} />

                {/* Camera settings and flight preferences. Deliberately here rather than on the
                    HUD: these are set before a flight, not adjusted while watching the feed. */}
                {link.telemetry.flightControls ? (
                  <>
                    <Text style={styles.subhead}>Camera</Text>
                    <View style={styles.chips}>
                      {(['AUTO', 'ISO_100', 'ISO_200', 'ISO_400', 'ISO_800'] as const).map((iso) => (
                        <Pressable
                          key={iso}
                          onPress={() => void runFlight(iso, () => setIso(iso))}
                          style={styles.indexChip}>
                          <Text style={styles.indexChipText}>{iso.replace('ISO_', '')}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.note}>
                      ISO. Exposure compensation below, in thirds of a stop — DJI&rsquo;s own names,
                      so anything this camera rejects says so by name rather than failing silently.
                    </Text>
                    <View style={styles.chips}>
                      {(['N_2_0', 'N_1_0', 'N_0_0', 'P_1_0', 'P_2_0'] as const).map((ev) => (
                        <Pressable
                          key={ev}
                          onPress={() => void runFlight(ev, () => setExposureCompensation(ev))}
                          style={styles.indexChip}>
                          <Text style={styles.indexChipText}>
                            {ev.replace('N_', '−').replace('P_', '+').replace('_', '.')}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Mission planning. The plan is built here and drawn on the minimap; flying
                        it is a separate, armed action because it sends the aircraft away on its
                        own. */}
                    <Text style={styles.subhead}>Survey mission</Text>
                    <Text style={styles.note}>
                      A grid plot centred on the aircraft, flown row by row with a photo at every
                      cell centre. Rows alternate direction so it never crosses the plot empty.
                    </Text>
                    <View style={styles.chips}>
                      {([25, 50, 100] as const).map((m) => (
                        <Pressable
                          key={m}
                          onPress={() => setCellSize(m)}
                          style={[styles.indexChip, cellSize === m ? styles.indexChipOn : null]}>
                          <Text
                            style={[
                              styles.indexChipText,
                              cellSize === m ? styles.indexChipTextOn : null,
                            ]}>
                            {m} m cells
                          </Text>
                        </Pressable>
                      ))}
                      {([3, 5, 7] as const).map((n) => (
                        <Pressable
                          key={n}
                          onPress={() => setSpan(n)}
                          style={[styles.indexChip, span === n ? styles.indexChipOn : null]}>
                          <Text
                            style={[styles.indexChipText, span === n ? styles.indexChipTextOn : null]}>
                            {n}×{n}
                          </Text>
                        </Pressable>
                      ))}
                      {([30, 40, 60] as const).map((a) => (
                        <Pressable
                          key={a}
                          onPress={() => setMissionAltitude(a)}
                          style={[
                            styles.indexChip,
                            missionAltitude === a ? styles.indexChipOn : null,
                          ]}>
                          <Text
                            style={[
                              styles.indexChipText,
                              missionAltitude === a ? styles.indexChipTextOn : null,
                            ]}>
                            {a} m
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <RowGroup>
                      <Row
                        label="Waypoints"
                        value={plan ? `${plan.waypoints.length}` : 'needs a GPS fix'}
                      />
                      <Row
                        label="Route length"
                        value={plan ? formatDistance(plan.distanceMetres) : '—'}
                        last
                      />
                    </RowGroup>

                    <View style={styles.chips}>
                      <Pressable
                        onPress={() =>
                          armOrRun('Upload mission', () =>
                            uploadMission(plan?.waypoints ?? [], { speed: 5, shootPhotos: true }),
                          )
                        }
                        style={[
                          styles.indexChip,
                          armed === 'Upload mission' ? styles.indexChipArmed : null,
                        ]}>
                        <Text style={styles.indexChipText}>
                          {armed === 'Upload mission' ? 'Tap to confirm' : 'Upload to aircraft'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => armOrRun('Start mission', startMission)}
                        style={[
                          styles.indexChip,
                          armed === 'Start mission' ? styles.indexChipArmed : null,
                        ]}>
                        <Text style={styles.indexChipText}>
                          {armed === 'Start mission' ? 'Tap to confirm' : 'Start'}
                        </Text>
                      </Pressable>
                      {/* Stopping fires on one tap, like every other abort on this screen. */}
                      <Pressable
                        onPress={() => void runFlight('Stop mission', stopMission)}
                        style={styles.indexChip}>
                        <Text style={styles.indexChipText}>Stop</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.note}>
                      Upload is refused by aircraft DJI does not allow waypoint missions on — the
                      Mavic Mini among them, because it has no obstacle avoidance. The aircraft&rsquo;s
                      own words are shown if that happens. The plan itself, and the route on the
                      map, work on any aircraft.
                    </Text>

                    <Text style={styles.subhead}>Flight</Text>
                    <View style={styles.chips}>
                      <Pressable
                        onPress={() => void runFlight('Home point', setHomeHere)}
                        style={styles.indexChip}>
                        <Text style={styles.indexChipText}>Set home here</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void runFlight('Gimbal reset', resetGimbal)}
                        style={styles.indexChip}>
                        <Text style={styles.indexChipText}>Reset gimbal</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.note}>
                      Return altitude — how high an automatic return climbs before flying home. Set
                      it above the tallest thing between the aircraft and you.
                    </Text>
                    <View style={styles.chips}>
                      {([30, 50, 80, 120] as const).map((m) => (
                        <Pressable
                          key={m}
                          onPress={() => void runFlight(`RTH ${m} m`, () => setGoHomeAltitude(m))}
                          style={styles.indexChip}>
                          <Text style={styles.indexChipText}>{m} m</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}

                <View style={{ height: 12 }} />
                <RowGroup>
                  <Row
                    label="Save photos to"
                    value={project?.name ?? 'not chosen yet'}
                    right={
                      <Pressable onPress={() => setPickerOpen(true)} hitSlop={8}>
                        <Text style={styles.changeProject}>
                          {project ? 'Change' : 'Choose'}
                        </Text>
                      </Pressable>
                    }
                  />
                  <Row
                    label="Queue RC photos"
                    right={
                      <Switch
                        value={autoIngest}
                        onValueChange={setAutoIngest}
                        trackColor={{ true: C.accent, false: C.line85 }}
                      />
                    }
                    last
                  />
                </RowGroup>
                <Text style={styles.note}>
                  When on, a photo taken with the controller&rsquo;s own shutter is pulled off the
                  aircraft and queued as a survey, the same as one captured here.
                </Text>
              </>
            ) : null}

            {result ? <Text style={styles.ok}>{result}</Text> : null}
            {captureError ? <ErrorNote message={captureError} /> : null}

            {link.registrationError ? (
              <>
                <ErrorNote message={link.registrationError} />
                {/* Far and away the most common cause is no network on first run — the App Key is
                    validated against DJI's servers once and cached — so a retry is worth offering
                    rather than making the surveyor restart the app. */}
                <Button
                  title="Retry registration"
                  variant="outline"
                  onPress={() => void retryRegistration()}
                />
              </>
            ) : null}

            <Text style={styles.note}>
              Connect the remote controller by USB-C. Altitude is relative to the take-off point,
              not sea level.{link.health.sdkNote ? ` ${link.health.sdkNote}.` : ''}
            </Text>
          </ScrollView>
        </View>
      ) : null}

      <ProjectPicker
        visible={pickerOpen}
        onPick={onPickProject}
        onCancel={() => {
          // Backing out abandons the shot that was waiting on an answer; the pilot pressed cancel,
          // so queueing it anyway against some default would be the wrong reading of that.
          pendingCaptureRef.current = null;
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

/** One telemetry figure. Monospaced so a changing digit does not shift the ones beside it. */
function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  changeProject: { fontSize: 13, fontWeight: '600', color: C.accent, fontFamily: Fonts.sans },
  root: { flex: 1, backgroundColor: '#000' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
  },

  // ── left column ──────────────────────────────────────────────────────────────
  // Narrow on purpose. The minimap is a glance, not a map — at 30% of a landscape phone it covered
  // a third of the video, which is the thing the pilot is actually looking at.
  leftCol: { width: 176, gap: 8 },
  minimap: { height: 132 },
  flight: { gap: 6 },
  flightBtn: {
    paddingVertical: 9,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  // Armed and urgent states are deliberately loud: these move an aircraft.
  flightBtnArmed: { backgroundColor: 'rgba(176,32,32,0.85)' },
  flightBtnUrgent: { backgroundColor: C.warn },
  flightText: { color: '#fff', fontSize: 13, fontWeight: '600', fontFamily: Fonts.sans },
  flightCancel: { paddingVertical: 5, alignItems: 'center' },
  flightCancelText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: Fonts.sans },
  gimbalRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  gimbalBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  gimbalText: { color: '#fff', fontSize: 11, fontFamily: Fonts.mono },
  gimbalNow: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontFamily: Fonts.mono, textAlign: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 2 },
  backText: { color: '#fff', fontSize: 15, fontWeight: '600', fontFamily: Fonts.sans },

  // ── centre column ────────────────────────────────────────────────────────────
  centreCol: { flex: 1, justifyContent: 'space-between' },
  chipRow: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  chipWarn: { backgroundColor: 'rgba(160,103,0,0.75)' },
  chipRec: { backgroundColor: 'rgba(176,32,32,0.75)' },
  chipFault: { backgroundColor: 'rgba(176,32,32,0.8)' },
  chipText: { color: '#fff', fontSize: 11, fontFamily: Fonts.mono },
  recDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },

  telemetry: {
    flexDirection: 'row',
    gap: 18,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  stat: { gap: 1 },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 9, letterSpacing: 1, fontFamily: Fonts.mono },
  statValue: { color: '#fff', fontSize: 14, fontFamily: Fonts.mono },

  // ── right column ─────────────────────────────────────────────────────────────
  rightCol: { width: 104, alignItems: 'stretch', gap: 8 },
  hudButton: {
    paddingVertical: 9,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  hudButtonOn: { backgroundColor: C.accent },
  hudButtonRec: { backgroundColor: 'rgba(176,32,32,0.85)' },
  hudButtonText: { color: '#fff', fontSize: 13, fontWeight: '600', fontFamily: Fonts.sans },
  shutter: {
    paddingVertical: 16,
    borderRadius: Radius.md,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOff: { backgroundColor: 'rgba(0,0,0,0.55)' },
  shutterText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: Fonts.sans },

  // ── info panel ───────────────────────────────────────────────────────────────
  // A card rather than more HUD: these are rows of text to be read, not flight instruments, and
  // the app's own row styling is what the rest of the settings screens use.
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '52%',
    maxWidth: 460,
    backgroundColor: C.surface,
    borderRadius: Radius.md,
  },
  panelBody: { paddingHorizontal: 16, paddingBottom: 24 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  panelTitle: { fontSize: 17, fontWeight: '700', color: C.ink, fontFamily: Fonts.sans },
  panelClose: { fontSize: 14, color: C.accent, fontWeight: '600', fontFamily: Fonts.sans },
  note: { fontSize: 12, color: C.ink55, lineHeight: 18, marginTop: 8, fontFamily: Fonts.sans },
  bold: { fontWeight: '700', color: C.ink30 },
  crashBox: {
    maxHeight: 160,
    backgroundColor: C.dangerBg,
    borderRadius: Radius.md,
    padding: 10,
    marginBottom: 10,
  },
  crashText: { fontSize: 10, color: C.danger, fontFamily: Fonts.mono, lineHeight: 14 },
  subhead: { fontSize: 13, fontWeight: '600', color: C.ink, marginTop: 16, fontFamily: Fonts.sans },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  indexChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.line85,
  },
  indexChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  indexChipArmed: { backgroundColor: C.danger, borderColor: C.danger },
  indexChipText: { fontSize: 12, color: C.ink55, fontFamily: Fonts.mono },
  indexChipTextOn: { color: '#fff' },
  ok: {
    fontSize: 12,
    color: C.ok,
    fontFamily: Fonts.mono,
    backgroundColor: C.okBg,
    borderRadius: Radius.md,
    padding: 12,
    marginTop: 12,
  },
}));
