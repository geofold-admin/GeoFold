import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CaptureForm, type AddFieldOutcome } from '@/components/capture-form';
import { Close, PlusIcon, TorchIcon } from '@/components/icons';
import { SurveyMap, type SurveyMarker } from '@/components/survey-map';
import { Button, ErrorNote, Field, Loading, Toast } from '@/components/ui';
import { WatermarkedPhoto } from '@/components/watermarked-photo';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import {
  POOR_ACCURACY_M,
  buildDetails,
  fixQuality,
  formatAccuracy,
  formatCoords,
  lastValues,
  rememberValues,
  stampLines,
  watchFix,
  type Fix,
} from '@/lib/capture';
import { fieldType, formErrors, isFilled, missingRequired, type FormValues } from '@/lib/form';
import { DEV_BUILD_REQUIRED, getViewShot } from '@/lib/native';
import { addItem, discardPhoto, storePhoto } from '@/lib/outbox';
import { downscale, stageWidth, type RawPhoto } from '@/lib/photo';
import { addProjectFields, mergeFields, pendingFields } from '@/lib/project-fields';
import { useSync } from '@/lib/sync-context';
import { parseSchema, type FormField, type ProjectResponse } from '@/lib/types';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

const PREVIEW_WIDTH = 320;

/**
 * Photos one point can carry: the wide shot, the close-up, the nameplate, the other side. Capped
 * because each is stamped at full resolution in memory when the point is saved, and because every
 * photo counts against the plan's photo allowance.
 */
const MAX_PHOTOS = 4;

/** A fix this old at the shutter is the position of wherever the phone last saw the sky. */
const STALE_FIX_MS = 15_000;

/**
 * Zoom, as fractions of the lens's range — the camera reports no magnification to label them with,
 * so the steps are named by level rather than by a factor that would differ on every phone.
 */
const ZOOM_STEPS = [
  { value: 0, label: '1×' },
  { value: 0.2, label: 'Z2' },
  { value: 0.45, label: 'Z3' },
] as const;

/** A photo of the point, and when its shutter was pressed. */
type Shot = RawPhoto & { takenAt: number };

/** How long a save waits for a photo's stamping surface to finish drawing before going ahead anyway. */
const STAGE_WAIT_MS = 2500;

interface StageEntry {
  node: View | null;
  loaded: boolean;
}

/**
 * The surface `captureRef` snapshots for one photo: the photo at full resolution with the stamp
 * across it. It reports into `registry` under the photo's URI, along with whether its image has
 * drawn yet — a surface snapshotted before then comes out as the stamp on a blank frame, and a
 * photo added a moment before "Save" is exactly when that would happen.
 */
const Stage = memo(function Stage({
  photo,
  width,
  lines,
  registry,
}: {
  photo: RawPhoto;
  width: number;
  lines: string[];
  registry: Map<string, StageEntry>;
}) {
  const entry = useRef<StageEntry>({ node: null, loaded: false });
  useEffect(() => {
    const mine = entry.current;
    registry.set(photo.uri, mine);
    return () => {
      if (registry.get(photo.uri) === mine) registry.delete(photo.uri);
    };
  }, [photo.uri, registry]);

  return (
    // `collapsable={false}` stops Android optimising the container away before capture.
    <View
      ref={(node) => {
        entry.current.node = node;
      }}
      collapsable={false}>
      <WatermarkedPhoto
        uri={photo.uri}
        width={width}
        aspect={photo.height / photo.width}
        lines={lines}
        onLoad={() => {
          entry.current.loaded = true;
        }}
      />
    </View>
  );
});

async function stageFor(registry: Map<string, StageEntry>, uri: string): Promise<View> {
  const deadline = Date.now() + STAGE_WAIT_MS;
  for (;;) {
    const entry = registry.get(uri);
    if (entry?.node && (entry.loaded || Date.now() >= deadline)) return entry.node;
    if (Date.now() >= deadline) throw new Error('A photo was not ready to be stamped. Try again.');
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
}

// Module constants rather than literals in the tree: the picker map plots nothing and has no
// markers to press, and a fresh `[]`/`() => {}` each render would churn the native map's props.
const NO_MARKERS: SurveyMarker[] = [];
const IGNORE_MARKER_PRESS = () => {};

/**
 * The design's capture flow — live viewfinder, then review — over GeoFold's real pipeline: a
 * high-accuracy fix, the coordinates burned into the JPEG, and the result queued in the offline
 * outbox.
 *
 * The project's form (spec 1.3) is there from the moment the camera opens: a panel over the
 * viewfinder that the surveyor can fill before or after the shot, and the same values carry into
 * the review step. Saving is refused until every required field holds a valid value (spec 2.3) —
 * the server validates too, but on sync, which can be hours later and far from the point.
 *
 * A point is the unit of work, not a photo: it can carry several photos, it takes its position from
 * the moment of the first shutter, and "Save & next" keeps the camera up for the next one — a
 * surveyor walks a line of forty culverts, not forty separate errands.
 */
export default function CaptureScreen() {
  const styles = useStyles();
  const C = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const { refresh, syncNow } = useSync();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  // One off-screen stage per photo, by URI; `captureRef` snapshots each in turn when the point is saved.
  const [stages] = useState(() => new Map<string, StageEntry>());

  const [project, setProject] = useState<ProjectResponse | null>(null);
  // `live` follows the phone for as long as the screen is up. `fix` is the reading the point is
  // saved with: frozen at the first shutter, so reviewing, typing and adding photos don't drag the
  // point along as the surveyor shifts about.
  const [live, setLive] = useState<Fix | null>(null);
  const liveRef = useRef<Fix | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [watchRound, setWatchRound] = useState(0);
  const [photos, setPhotos] = useState<Shot[]>([]);
  const [selected, setSelected] = useState(0);
  // The viewfinder is up again to add a photo to (or replace one on) a point already in review.
  const [adding, setAdding] = useState(false);
  // When the first photo of the point was taken. This, not the fix's own clock, is the capture time.
  const [shotAt, setShotAt] = useState(0);
  const [torch, setTorch] = useState(false);
  const [zoomStep, setZoomStep] = useState(0);
  const [values, setValues] = useState<FormValues>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [note, setNote] = useState('');
  // Null until the surveyor opens or hides it themselves. Until then the panel starts open when the
  // project has fields to fill, and folded away when it has only the note.
  const [formOpen, setFormOpen] = useState<boolean | null>(null);
  // Fields added to the form from this screen, including ones still waiting on this phone from an
  // earlier capture made offline.
  const [added, setAdded] = useState<FormField[]>(() => (projectId ? pendingFields(projectId) : []));
  // What the form held at the last point saved in this project, offered back as "same as the last".
  const [previous, setPrevious] = useState<FormValues | null>(() => (projectId ? lastValues(projectId) : null));
  const [savedCount, setSavedCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapScrolling, setMapScrolling] = useState(false);
  // Under canopy or on a device with no GPS lock, the surveyor can type the coordinates instead —
  // the same escape hatch the web capture screen offers. A typed fix records no accuracy.
  const [manual, setManual] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  // Where the picker map is centered — set once when manual entry opens, not on every tap/keystroke,
  // so placing the crosshair doesn't keep flying the camera back to wherever was just picked.
  const [pickerCenter, setPickerCenter] = useState<Fix | null>(null);

  // Stable identity: this is the map's `onPress`, and handing it a new function on every render
  // would push a new prop down to the native map on every keystroke and every touch.
  const pickFromMap = useCallback((coords: { latitude: number; longitude: number }) => {
    setManualLat(coords.latitude.toFixed(6));
    setManualLng(coords.longitude.toFixed(6));
  }, []);

  const setValue = useCallback((key: string, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);
  const touch = useCallback((key: string) => {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const stagePixels = useMemo(() => stageWidth(), []);
  const canStamp = useMemo(() => getViewShot() !== null, []);
  const fields = useMemo(() => mergeFields(parseSchema(project?.formSchema), added), [project, added]);

  const errors = useMemo(() => formErrors(fields, values), [fields, values]);
  const missing = useMemo(() => missingRequired(fields, values), [fields, values]);
  const invalidCount = Object.keys(errors).length;
  const requiredFields = fields.filter((f) => f.required);
  const requiredFilled = requiredFields.filter((f) => isFilled(f, values[f.key])).length;

  const manualFix = useMemo<Fix | null>(() => {
    if (!manual) return null;
    const lat = Number(manualLat.trim());
    const lng = Number(manualLng.trim());
    const ok =
      manualLat.trim() !== '' && manualLng.trim() !== '' &&
      Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    return ok ? { latitude: lat, longitude: lng, accuracy: null, timestamp: shotAt } : null;
  }, [manual, manualLat, manualLng, shotAt]);

  // The frozen reading once there is one; until then whatever the phone reports now. A photo taken
  // before the first lock picks its position up as soon as the lock arrives.
  const gpsFix = fix ?? live;
  // GPS by default; a valid manual entry takes over. Everything downstream — the stamp, the save
  // guard, the button — reads this rather than the raw GPS fix.
  const effectiveFix = manual ? manualFix : gpsFix;

  const lines = useMemo(
    () =>
      effectiveFix
        ? [...stampLines({ ...effectiveFix, timestamp: shotAt || effectiveFix.timestamp }), project?.name ?? ''].filter(Boolean)
        : [],
    [effectiveFix, project, shotAt],
  );

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    try {
      const loaded = await api<ProjectResponse>(`/api/projects/${projectId}`)
        // A project never opened on this phone has no saved copy of its own to show offline. The
        // saved project list carries its form too.
        .catch(async (e) => {
          const listed = (await api<ProjectResponse[]>('/api/projects').catch(() => [])).find((p) => p.id === projectId);
          if (listed) return listed;
          throw e;
        });
      setProject(loaded);
    } catch (e) {
      setError(errorMessage(e, 'Could not load the project for this capture.'));
    }
  }, [projectId]);

  // On focus rather than once on mount: the form editor opens over this screen, and the form has
  // to be the edited one when the surveyor comes back to it.
  useRefreshOnFocus(loadProject);

  const addFields = useCallback(
    async (next: FormField[]): Promise<AddFieldOutcome> => {
      if (!projectId) return 'queued';
      // The change shows in the form at once, whether or not the server can be reached.
      setAdded((prev) => mergeFields(prev, next));
      const updated = await addProjectFields(projectId, next);
      if (!updated) return 'queued';
      setProject(updated);
      return 'saved';
    },
    [projectId],
  );

  // The position is followed for as long as the screen is up. Deferred a tick so the camera
  // preview paints first instead of waiting behind the permission prompt and the first lock.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let gone = false;
    const timer = setTimeout(() => {
      watchFix(
        (next) => {
          liveRef.current = next;
          setLive(next);
          setGpsError(null);
        },
        (e) => setGpsError(e.message),
      )
        .then((unsubscribe) => {
          if (gone) unsubscribe();
          else stop = unsubscribe;
        })
        .catch((e) => setGpsError(errorMessage(e, 'Could not get a location fix.')));
    }, 0);
    return () => {
      gone = true;
      clearTimeout(timer);
      stop?.();
    };
  }, [watchRound]);

  // Ask once on arrival rather than making the surveyor tap through a permission wall first.
  // Deferred a tick because the request updates hook state, which must not happen during commit.
  useEffect(() => {
    if (!permission || permission.granted || !permission.canAskAgain) return;
    const timer = setTimeout(() => void requestPermission(), 0);
    return () => clearTimeout(timer);
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const shutter = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.9, exif: false });
      if (!shot) throw new Error('The camera returned no image.');
      const photo = await downscale({ uri: shot.uri, width: shot.width, height: shot.height });
      // The first photo fixes where and when the point is. Further photos are of the same point,
      // taken from a step to the side, and must not move it.
      const takenAt = Date.now();
      if (photos.length === 0) {
        setFix(liveRef.current);
        setShotAt(takenAt);
      }
      setSelected(photos.length);
      setPhotos([...photos, { ...photo, takenAt }]);
      setAdding(false);
      setTorch(false);
    } catch (e) {
      setError(errorMessage(e, 'Could not take the photo.'));
    } finally {
      setBusy(false);
    }
  };

  /** Drops one photo. Dropping the only one is a retake: the point starts again from the viewfinder. */
  const removePhoto = (index: number) => {
    const next = photos.filter((_, i) => i !== index);
    setPhotos(next);
    setSelected(Math.max(0, Math.min(index, next.length - 1)));
    if (next.length === 0) {
      setFix(null);
      setShotAt(0);
      setAdding(false);
    }
  };

  const repeatLast = () => {
    if (!previous) return;
    const next: FormValues = {};
    for (const field of fields) {
      const value = previous[field.key];
      if (value === undefined) continue;
      // A choice the list no longer has would only come back as an error under the field.
      if (fieldType(field) === 'select' && field.options?.length && !field.options.includes(String(value))) continue;
      next[field.key] = value;
    }
    setValues((prev) => ({ ...prev, ...next }));
  };

  const startNextPoint = () => {
    setPhotos([]);
    setSelected(0);
    setAdding(false);
    setFix(null);
    setShotAt(0);
    setValues({});
    setTouched({});
    setShowAllErrors(false);
    setNote('');
    setManual(false);
    setManualLat('');
    setManualLng('');
    setZoomStep(0);
    setError(null);
  };

  const store = async (thenNext: boolean) => {
    if (!photos.length || !effectiveFix || !projectId) return;
    const viewShot = getViewShot();
    if (!viewShot) return;

    setBusy(true);
    setError(null);
    const stored: { id: string; uri: string; capturedAtUtc: string }[] = [];
    let queued = false;
    try {
      const surveyId = randomUUID();

      for (const photo of photos) {
        const stage = await stageFor(stages, photo.uri);
        const id = randomUUID();
        const stampedUri = await viewShot.captureRef(stage, { format: 'jpg', quality: 0.85, result: 'tmpfile' });
        stored.push({ id, uri: await storePhoto(stampedUri, id), capturedAtUtc: new Date(photo.takenAt).toISOString() });
      }

      const details = buildDetails(fields, values);
      if (note.trim()) details.catatan = note.trim();

      await addItem({
        id: surveyId,
        projectId,
        projectName: project?.name ?? '',
        latitude: effectiveFix.latitude,
        longitude: effectiveFix.longitude,
        accuracyMeters: effectiveFix.accuracy,
        capturedAtUtc: new Date(shotAt || effectiveFix.timestamp).toISOString(),
        detailsJson: JSON.stringify(details),
        photoId: stored[0].id,
        photoUri: stored[0].uri,
        ...(stored.length > 1 ? { extraPhotos: stored.slice(1) } : null),
        status: 'pending',
        createdAt: Date.now(),
      });
      queued = true;

      rememberValues(projectId, values);
      await refresh();
      void syncNow();

      if (thenNext) {
        const count = savedCount + 1;
        setSavedCount(count);
        setPrevious(lastValues(projectId));
        startNextPoint();
        setToast(`Point saved · ${count} this session`);
      } else {
        router.back();
      }
    } catch (e) {
      // Stamped copies of a point that never reached the queue belong to nothing, and a second try
      // makes its own. Once it is queued they are the queue's, whatever failed afterwards.
      if (!queued) for (const photo of stored) discardPhoto(photo.uri);
      setError(errorMessage(e, 'Could not save the survey.'));
    } finally {
      setBusy(false);
    }
  };

  // Android's back, while this screen is the one on show. A point in review is unsaved work — two
  // photos and a filled form — and the back gesture sits where a thumb rests on the way to "Save".
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (adding) {
          setAdding(false);
          return true;
        }
        if (photos.length === 0) return false;
        Alert.alert('Discard this point?', 'The photo and what you filled in have not been saved.', [
          { text: 'Keep', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
        ]);
        return true;
      });
      return () => subscription.remove();
    }, [adding, photos.length, router]),
  );

  const save = (thenNext: boolean) => {
    if (!photos.length || !effectiveFix || !projectId || busy) return;

    if (!getViewShot()) {
      // Uploading an unstamped photo would quietly strip the evidence the coordinates provide.
      setError(`A survey cannot be saved without stamping the photo. ${DEV_BUILD_REQUIRED}`);
      return;
    }
    if (invalidCount > 0) {
      // Every problem is shown in place, under its field; the note above the buttons sums it up.
      setShowAllErrors(true);
      setError(
        missing.length
          ? `Fill in the required field${missing.length === 1 ? '' : 's'}: ${missing.map((f) => f.label ?? f.key).join(', ')}.`
          : 'Some fields have values in the wrong format — see the notes under them.',
      );
      return;
    }
    // A point that may be tens of metres off is still the surveyor's call — under canopy there may
    // be nothing better to wait for — but it has to be a call, not something noticed at the desk.
    if (!manual && fixQuality(effectiveFix.accuracy) === 'poor') {
      Alert.alert(
        'Low GPS accuracy',
        `This position is only good to ${formatAccuracy(effectiveFix.accuracy)}. The point may be drawn that far from where you are standing.`,
        [
          { text: 'Go back', style: 'cancel' },
          { text: 'Save anyway', onPress: () => void store(thenNext) },
        ],
      );
      return;
    }
    void store(thenNext);
  };

  const formEmpty = !fields.some((f) => fieldType(f) !== 'boolean' && isFilled(f, values[f.key])) &&
    !Object.values(values).some((v) => v === true);
  const canRepeat = !!previous && formEmpty && fields.some((f) => previous[f.key] !== undefined);

  const form = (
    <CaptureForm
      fields={fields}
      values={values}
      onChange={setValue}
      note={note}
      onNoteChange={setNote}
      showAllErrors={showAllErrors}
      touched={touched}
      onTouch={touch}
      onAddFields={projectId ? addFields : undefined}
      onEditForm={projectId ? () => router.push(`/project/new?id=${projectId}`) : undefined}
      onRepeatLast={canRepeat ? repeatLast : undefined}
    />
  );

  const panelOpen = formOpen ?? (fields.length > 0 && !adding);
  const formSummary = requiredFields.length
    ? `${requiredFilled}/${requiredFields.length} required`
    : fields.length
      ? `${fields.length} field${fields.length === 1 ? '' : 's'}`
      : null;

  const qualityColor = { good: '#4ade80', fair: '#fbbf24', poor: '#f87171', unknown: 'rgba(255,255,255,0.5)' };

  /* ── review ─────────────────────────────────────────────────────────── */

  if (photos.length > 0 && !adding) {
    const photo = photos[Math.min(selected, photos.length - 1)];
    const quality = fixQuality(gpsFix?.accuracy ?? null);
    const fixAge = fix && shotAt ? shotAt - fix.timestamp : 0;
    // Worth offering only when it would improve the point: the phone has kept listening since the
    // shutter, and a lock that was ±40 m then is often ±5 m by the time the form is filled.
    const better =
      !manual && fix && live && live.accuracy != null &&
      (fix.accuracy == null || live.accuracy <= fix.accuracy - 2 || fixAge > STALE_FIX_MS) &&
      live.timestamp !== fix.timestamp
        ? live
        : null;

    return (
      <KeyboardAvoidingView
        style={[styles.dark, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.reviewBar}>
          <Text style={styles.reviewTitle}>
            {photos.length > 1 ? `Review point · photo ${selected + 1} of ${photos.length}` : 'Review point'}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!mapScrolling}
        >
          <View style={styles.previewWrap}>
            <WatermarkedPhoto uri={photo.uri} width={PREVIEW_WIDTH} aspect={photo.height / photo.width} lines={lines} />
          </View>

          {/* Every photo of the point, and the slot for one more. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
            keyboardShouldPersistTaps="handled">
            {photos.map((p, i) => (
              <View key={p.uri}>
                <Pressable
                  onPress={() => setSelected(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Photo ${i + 1}`}
                  accessibilityState={{ selected: i === selected }}
                  style={[styles.thumb, i === selected ? styles.thumbSelected : null]}>
                  <Image source={{ uri: p.uri }} style={styles.thumbImage} />
                </Pressable>
                {photos.length > 1 ? (
                  <Pressable
                    onPress={() => removePhoto(i)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${i + 1}`}
                    style={styles.thumbRemove}>
                    <Close size={8} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <Pressable
                onPress={() => setAdding(true)}
                accessibilityRole="button"
                accessibilityLabel="Add another photo of this point"
                style={({ pressed }) => [styles.thumb, styles.thumbAdd, { opacity: pressed ? 0.7 : 1 }]}>
                <PlusIcon color="#fff" size={14} />
                <Text style={styles.thumbAddText}>Photo</Text>
              </Pressable>
            ) : null}
          </ScrollView>

          <View style={styles.form}>
            {!canStamp ? (
              <ErrorNote message={`Saving is unavailable. ${DEV_BUILD_REQUIRED}`} />
            ) : null}

            {/* Location: the GPS fix from the moment of the shutter, or manual entry when GPS is unusable. */}
            <View style={styles.locationBlock}>
              <View style={styles.locationHead}>
                <Text style={styles.locationLabel}>Location</Text>
                <Pressable
                  onPress={() => {
                    const next = !manual;
                    if (next) setPickerCenter(manualFix ?? gpsFix ?? null);
                    setManual(next);
                  }}
                  hitSlop={6}>
                  <Text style={styles.locationToggle}>{manual ? 'Use GPS' : 'Enter manually'}</Text>
                </Pressable>
              </View>

              {manual ? (
                <>
                  <View style={styles.coordRow}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Latitude"
                        value={manualLat}
                        onChangeText={setManualLat}
                        keyboardType="numbers-and-punctuation"
                        placeholder="-0.037622"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Longitude"
                        value={manualLng}
                        onChangeText={setManualLng}
                        keyboardType="numbers-and-punctuation"
                        placeholder="111.283981"
                      />
                    </View>
                  </View>
                  <Text style={styles.locationHint}>
                    {manualFix
                      ? 'Entered manually — no accuracy recorded.'
                      : 'Decimal degrees. Latitude -90 to 90, longitude -180 to 180.'}
                  </Text>
                  <Text style={styles.locationHint}>Or tap the map below to pick a location:</Text>
                  <View
                    style={styles.mapPicker}
                    onTouchStart={() => setMapScrolling(true)}
                    onTouchEnd={() => setMapScrolling(false)}
                    onTouchCancel={() => setMapScrolling(false)}
                  >
                    <SurveyMap
                      markers={NO_MARKERS}
                      camera={pickerCenter ? { coordinates: pickerCenter, zoom: 16 } : undefined}
                      onMarkerPress={IGNORE_MARKER_PRESS}
                      onMapPress={pickFromMap}
                      pickMode
                      pickedLocation={manualFix}
                    />
                  </View>
                </>
              ) : gpsFix ? (
                <>
                  <View style={styles.locationLine}>
                    <View style={[styles.qualityDot, { backgroundColor: { good: C.ok, fair: C.warn, poor: C.danger, unknown: C.ink62 }[quality] }]} />
                    <Text style={styles.locationValue}>
                      {`${formatCoords(gpsFix.latitude, gpsFix.longitude)} ${formatAccuracy(gpsFix.accuracy)}`.trim()}
                    </Text>
                  </View>
                  {quality === 'poor' ? (
                    <Text style={[styles.locationHint, { color: C.danger, marginTop: 4 }]}>
                      {`Low accuracy — the point may be up to ${Math.round(gpsFix.accuracy ?? POOR_ACCURACY_M)} m off.`}
                    </Text>
                  ) : null}
                  {fixAge > STALE_FIX_MS ? (
                    <Text style={[styles.locationHint, { color: C.warn, marginTop: 4 }]}>
                      {`GPS had not updated for ${Math.round(fixAge / 1000)} s when the photo was taken.`}
                    </Text>
                  ) : null}
                  {better ? (
                    <Pressable onPress={() => setFix(better)} hitSlop={6} style={{ marginTop: 8 }} accessibilityRole="button">
                      <Text style={styles.locationToggle}>
                        {`Still at the point? Use the current fix (${formatAccuracy(better.accuracy)})`}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <Text style={styles.locationHint}>{gpsError ?? 'Getting a location fix…'}</Text>
              )}
            </View>

            {form}
          </View>
        </ScrollView>

        <View style={[styles.reviewActions, { paddingBottom: insets.bottom + 22 }]}>
          {/* Here rather than at the top of the form: this is where the surveyor's thumb just was,
              and the form above may be scrolled a screen away from its first line. */}
          <ErrorNote message={error} />
          {requiredFields.length > 0 ? (
            <Text style={[styles.requiredNote, requiredFilled < requiredFields.length && styles.requiredNoteWarn]}>
              {requiredFilled < requiredFields.length
                ? `${requiredFields.length - requiredFilled} of ${requiredFields.length} required fields still empty — saving is blocked until they are filled.`
                : 'All required fields are filled.'}
            </Text>
          ) : null}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                // Retaking replaces the photo on show; with others kept, the viewfinder comes back
                // as "add a photo" so backing out of it returns here rather than losing the point.
                const keep = photos.length > 1;
                removePhoto(selected);
                if (keep) setAdding(true);
              }}
              disabled={busy}
              style={({ pressed }) => [styles.retake, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={styles.retakeText}>Retake</Text>
            </Pressable>
            <Button
              title="Save & next"
              variant="outline"
              onPress={() => save(true)}
              disabled={!effectiveFix || !canStamp || busy}
              style={{ flex: 1.4, paddingHorizontal: 6 }}
            />
            <Button
              title={busy ? 'Saving…' : invalidCount > 0 && showAllErrors ? `${invalidCount} to fix` : 'Save'}
              onPress={() => save(false)}
              busy={busy}
              disabled={!effectiveFix || !canStamp}
              style={[{ flex: 1, paddingHorizontal: 6 }, invalidCount > 0 ? styles.blockedButton : null]}
            />
          </View>
        </View>

        {/*
          The surfaces `captureRef` snapshots, one per photo. Parked far off-screen rather than
          hidden with opacity, because a zero-opacity view snapshots as blank on some Android
          devices.
        */}
        {effectiveFix ? (
          <View style={styles.stage} pointerEvents="none">
            {photos.map((p) => (
              <Stage key={p.uri} photo={p} width={stagePixels} lines={lines} registry={stages} />
            ))}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    );
  }

  /* ── viewfinder ─────────────────────────────────────────────────────── */

  const liveQuality = fixQuality(live?.accuracy ?? null);

  return (
    <KeyboardAvoidingView style={styles.dark} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {permission?.granted ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          zoom={ZOOM_STEPS[zoomStep].value}
        />
      ) : (
        <View style={styles.permission}>
          {permission ? (
            <>
              <Text style={styles.permissionText}>
                GeoFold needs the camera to photograph the survey point.
              </Text>
              <Button title="Grant camera access" onPress={() => void requestPermission()} />
            </>
          ) : (
            <Loading />
          )}
        </View>
      )}

      {/* Rule-of-thirds guides, inset like the design. */}
      <View style={styles.guides} pointerEvents="none">
        <View style={[styles.vLine, { left: '33.3%' }]} />
        <View style={[styles.vLine, { left: '66.6%' }]} />
        <View style={[styles.hLine, { top: '33.3%' }]} />
        <View style={[styles.hLine, { top: '66.6%' }]} />
      </View>

      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={[styles.topBar, { paddingTop: insets.top + 14 }]}>
        <Pressable
          onPress={() => (adding ? setAdding(false) : router.back())}
          style={styles.closeButton}
          hitSlop={8}
          accessibilityLabel={adding ? 'Back to the review' : 'Close camera'}>
          <Close />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {adding ? `Photo ${photos.length + 1} of this point` : (project?.name ?? 'Capture')}
        </Text>
        {/* Balances the close button, and counts the points saved without leaving the camera. */}
        <View style={styles.sessionCount}>
          {savedCount > 0 && !adding ? <Text style={styles.sessionCountText}>{savedCount}</Text> : null}
        </View>
      </LinearGradient>

      {/* Up top, clear of the form panel at the bottom. */}
      <Pressable
        style={[styles.coordBox, { top: insets.top + 64 }]}
        disabled={!gpsError}
        onPress={() => {
          setGpsError(null);
          setWatchRound((n) => n + 1);
        }}
        accessibilityLabel={gpsError ? 'Retry the GPS fix' : undefined}>
        {adding && gpsFix ? (
          <>
            <Text style={styles.coordPrimary}>{formatCoords(gpsFix.latitude, gpsFix.longitude)}</Text>
            <Text style={styles.coordSecondary}>Position of this point · kept from the first photo</Text>
          </>
        ) : live ? (
          <>
            <Text style={styles.coordPrimary}>{formatCoords(live.latitude, live.longitude)}</Text>
            <View style={styles.coordLine}>
              <View style={[styles.qualityDot, { backgroundColor: qualityColor[liveQuality] }]} />
              <Text style={styles.coordSecondary}>
                {`${formatAccuracy(live.accuracy)} GPS · live`.trim()}
                {liveQuality === 'poor' ? ' · low accuracy, wait if you can' : ''}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.coordSecondary}>
            {gpsError ? `${gpsError} Tap to retry.` : 'Getting a location fix…'}
          </Text>
        )}
      </Pressable>

      {error ? (
        <View style={[styles.errorFloat, { top: insets.top + 124 }]}>
          <ErrorNote message={error} />
        </View>
      ) : null}

      {/* The project's form, live over the viewfinder. It is always reachable, even for a project
          with no fields yet, because fields can be added from inside it. */}
      {panelOpen ? (
        <View style={[styles.formPanel, { bottom: insets.bottom + 124 }]}>
          <Pressable onPress={() => setFormOpen(false)} style={styles.formHead} accessibilityRole="button">
            <Text style={styles.formTitle}>{formSummary ? `Form · ${formSummary}` : 'Note and fields'}</Text>
            <Text style={styles.formToggle}>Hide</Text>
          </Pressable>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 6 }}>
            {form}
          </ScrollView>
        </View>
      ) : (
        <Pressable
          onPress={() => setFormOpen(true)}
          style={[styles.formPill, { bottom: insets.bottom + 128 }]}
          accessibilityRole="button">
          <Text style={styles.formPillText}>
            {requiredFields.length
              ? `Form · ${formSummary} — tap to fill`
              : fields.length
                ? 'Form — tap to fill'
                : 'Add a note or a field'}
          </Text>
        </Pressable>
      )}

      <Toast text={toast} />

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)']}
        style={[styles.shutterBar, { paddingBottom: insets.bottom + 26 }]}>
        <Pressable
          onPress={() => setTorch((on) => !on)}
          disabled={!permission?.granted}
          style={[styles.shutterSide, torch ? styles.shutterSideOn : null]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ selected: torch }}
          accessibilityLabel={torch ? 'Turn the torch off' : 'Turn the torch on'}>
          <TorchIcon color={torch ? '#15181c' : '#fff'} />
        </Pressable>
        <Pressable
          onPress={shutter}
          disabled={busy || !permission?.granted}
          style={styles.shutterRing}
          accessibilityLabel="Take photo">
          <View style={[styles.shutterCore, busy ? { opacity: 0.5 } : null]} />
        </Pressable>
        <Pressable
          onPress={() => setZoomStep((step) => (step + 1) % ZOOM_STEPS.length)}
          disabled={!permission?.granted}
          style={[styles.shutterSide, zoomStep > 0 ? styles.shutterSideOn : null]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Zoom, level ${zoomStep + 1} of ${ZOOM_STEPS.length}`}>
          <Text style={[styles.zoomText, zoomStep > 0 ? { color: '#15181c' } : null]}>{ZOOM_STEPS[zoomStep].label}</Text>
        </Pressable>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((C) => ({
  dark: { flex: 1, backgroundColor: '#15181c' },

  guides: { position: 'absolute', top: 24, left: 24, right: 24, bottom: 24 },
  vLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  hLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
    paddingHorizontal: 8,
    fontFamily: Fonts.sans,
  },
  sessionCount: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  sessionCountText: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: C.accent,
    borderRadius: Radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
    fontFamily: Fonts.sans,
  },

  coordBox: {
    position: 'absolute',
    left: 12,
    maxWidth: '88%',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  coordPrimary: { fontFamily: Fonts.mono, fontSize: 12, color: '#fff' },
  coordSecondary: { fontFamily: Fonts.mono, fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  coordLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qualityDot: { width: 8, height: 8, borderRadius: 4 },
  errorFloat: { position: 'absolute', left: 16, right: 16 },

  formPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    maxHeight: '46%',
    backgroundColor: C.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingTop: 4,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  formHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
    marginBottom: 10,
  },
  formTitle: { fontSize: 13, fontWeight: '600', color: C.ink, fontFamily: Fonts.sans },
  formToggle: { fontSize: 13, fontWeight: '600', color: C.accentText, fontFamily: Fonts.sans },
  formPill: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  formPillText: { color: '#fff', fontSize: 13, fontWeight: '500', fontFamily: Fonts.sans },

  shutterBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 18,
  },
  shutterSide: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterSideOn: { backgroundColor: '#fff', borderColor: '#fff' },
  zoomText: { fontSize: 13, fontWeight: '600', color: '#fff', fontFamily: Fonts.sans },
  shutterRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },

  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  permissionText: { color: '#fff', fontSize: 15, textAlign: 'center', fontFamily: Fonts.sans },

  reviewBar: { paddingVertical: 14, alignItems: 'center' },
  reviewTitle: { fontSize: 13, fontWeight: '500', color: '#fff', fontFamily: Fonts.sans },
  previewWrap: { alignItems: 'center', paddingBottom: 12 },

  strip: { flexGrow: 1, justifyContent: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 18 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  thumbSelected: { borderColor: '#fff' },
  thumbImage: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbAdd: {
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  thumbAddText: { fontSize: 10, fontWeight: '500', color: '#fff', fontFamily: Fonts.sans },

  form: {
    backgroundColor: C.surface,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    padding: 20,
    minHeight: 240,
  },

  locationBlock: { marginBottom: 14 },
  locationHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  locationLabel: { fontSize: 13, color: C.ink55, fontFamily: Fonts.sans },
  locationToggle: { fontSize: 13, fontWeight: '500', color: C.accentText, fontFamily: Fonts.sans },
  locationLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationValue: { fontSize: 13, color: C.ink30, fontFamily: Fonts.mono },
  locationHint: { fontSize: 12, color: C.ink55, fontFamily: Fonts.sans },
  coordRow: { flexDirection: 'row', gap: 10 },
  mapPicker: {
    height: 220,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: C.line90,
  },
  reviewActions: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.line92,
  },
  requiredNote: { fontSize: 12, color: C.ok, marginBottom: 10, fontFamily: Fonts.sans },
  requiredNoteWarn: { color: C.danger },
  actionRow: { flexDirection: 'row', gap: 10 },
  blockedButton: { backgroundColor: C.ink55, borderColor: C.ink55 },
  retake: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: C.line88,
  },
  retakeText: { fontSize: 15, fontWeight: '500', color: C.ink30, fontFamily: Fonts.sans },

  stage: { position: 'absolute', left: -10000, top: 0 },
}));
