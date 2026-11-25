import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chevron } from '@/components/icons';
import { ErrorNote, Hatch, Header, Loading, StatusPill, useT } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { formatAccuracy, formatCoords } from '@/lib/capture';
import { labeledValues, parseDetails } from '@/lib/details';
import { slugifyProject } from '@/lib/reference';
import { parseSchema, type ProjectResponse, type SurveyDetail } from '@/lib/types';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

/** Photo Detail from the design: the image with its burned-in stamp, then the metadata below. */
export default function SurveyDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  // `ref` is the survey's reference ("TESTI-001"), handed over by screens that have already
  // numbered the project's surveys. Numbering needs every survey in the project, so on its own this
  // screen can only name the project.
  const { id, ref } = useLocalSearchParams<{ id: string; ref?: string }>();

  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [photosResolved, setPhotosResolved] = useState(false);
  // Which of the point's photos is on show.
  const [page, setPage] = useState(0);
  const { width } = useWindowDimensions();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const detail = await api<SurveyDetail>(`/api/surveys/${id}`);
      setSurvey(detail);

      await api<ProjectResponse>(`/api/projects/${detail.projectId}`)
        .then(setProject)
        .catch(() => {});

      // Storage is private, so each photo needs its own short-lived signed URL.
      const entries = await Promise.all(
        detail.photos.map(async (photo) => {
          try {
            // Signed and short-lived, so a saved copy would be useless offline.
            const { url } = await api<{ url: string | null }>(
              `/api/surveys/${detail.id}/photos/${photo.id}/url`,
              { cache: 'none' },
            );
            return url ? ([photo.id, url] as const) : null;
          } catch {
            return null;
          }
        }),
      );
      setPhotoUrls(Object.fromEntries(entries.filter((e): e is readonly [string, string] => !!e)));
      setPhotosResolved(true);
    } catch (e) {
      setError(errorMessage(e, 'Could not load this survey.'));
    }
  }, [id]);

  useRefreshOnFocus(load);

  const values = useMemo(() => {
    if (!survey) return [];
    return labeledValues(parseDetails(survey.detailsJson), parseSchema(project?.formSchema));
  }, [survey, project]);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
        <Header title="Photo" onBack={() => router.back()} />
        <View style={{ padding: 20 }}>
          <ErrorNote message={error} />
        </View>
      </View>
    );
  }

  if (!survey) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
        <Header title="Photo" onBack={() => router.back()} />
        <Loading />
      </View>
    );
  }

  // In the order they were taken: the server lists a point's photos in no particular order.
  const photos = [...survey.photos].sort((a, b) => a.capturedAtUtc.localeCompare(b.capturedAtUtc));
  const heroHeight = Math.round((width * 3) / 4);
  const reference = ref || slugifyProject(project?.name ?? 'PROJECT');
  const captured = new Date(survey.capturedAtUtc);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <Header title="Photo" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={styles.hero}>
          {photos.length === 0 ? (
            <Hatch style={StyleSheet.absoluteFill}>
              <View style={styles.heroCenter}>
                <Text style={styles.heroLabel}>No photo on this survey</Text>
              </View>
            </Hatch>
          ) : (
            // One page per photo. A point with a single photo is one page that does not scroll.
            <ScrollView
              horizontal
              pagingEnabled
              scrollEnabled={photos.length > 1}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
              style={StyleSheet.absoluteFill}>
              {photos.map((photo) => {
                const url = photoUrls[photo.id];
                return url ? (
                  <Image
                    key={photo.id}
                    source={{ uri: url, cacheKey: photo.id }}
                    style={{ width, height: heroHeight }}
                    contentFit="cover"
                    transition={150}
                  />
                ) : (
                  <Hatch key={photo.id} style={{ width, height: heroHeight }}>
                    <View style={styles.heroCenter}>
                      <Text style={styles.heroLabel}>{photosResolved ? 'Photo unavailable' : 'Loading photo…'}</Text>
                    </View>
                  </Hatch>
                );
              })}
            </ScrollView>
          )}

          {photos.length > 1 ? (
            <View style={styles.pageCount} pointerEvents="none">
              <Text style={styles.pageCountText}>{`${Math.min(page, photos.length - 1) + 1} / ${photos.length}`}</Text>
            </View>
          ) : null}

          {/* Mirrors the stamp burned into the image, so the metadata reads the same on screen. */}
          <View style={styles.stamp} pointerEvents="none">
            <Text style={styles.stampPrimary}>
              {formatCoords(survey.latitude, survey.longitude)}
            </Text>
            <Text style={styles.stampSecondary}>
              {captured.toLocaleDateString()}, {captured.toLocaleTimeString()}
            </Text>
          </View>
        </View>

        <View style={{ padding: 20 }}>
          <View style={styles.titleRow}>
            <Text style={[styles.reference, { flex: 1 }]} numberOfLines={1}>
              {reference}
            </Text>
            <StatusPill status={survey.status === 'reviewed' ? 'reviewed' : 'submitted'} />
          </View>

          <Pressable
            onPress={() => router.push(`/project/${survey.projectId}`)}
            style={({ pressed }) => [styles.projectRow, { opacity: pressed ? 0.65 : 1 }]}>
            <Text style={[T.body, { flex: 1 }]} numberOfLines={1}>
              {project?.name ?? 'Project'}
            </Text>
            <Chevron />
          </Pressable>

          <Text style={[T.section, { marginBottom: 10 }]}>Position</Text>
          <Text style={T.mono}>{formatCoords(survey.latitude, survey.longitude)}</Text>
          {survey.accuracyMeters != null ? (
            <Text style={[T.caption, { marginTop: 4 }]}>
              Accuracy {formatAccuracy(survey.accuracyMeters)}
            </Text>
          ) : null}
          <Text style={[T.caption, { marginTop: 4 }]}>
            Synced {new Date(survey.syncedAtUtc).toLocaleString()}
          </Text>

          <Text style={[T.section, { marginTop: 24, marginBottom: 10 }]}>Description</Text>
          {values.length === 0 ? (
            <Text style={T.sub}>No field values were recorded.</Text>
          ) : (
            values.map((v) => (
              <View key={v.key} style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>{v.label}</Text>
                <Text style={T.body}>{v.value || '—'}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  hero: { width: '100%', aspectRatio: 4 / 3, backgroundColor: C.hatchA },
  heroCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  heroLabel: { fontFamily: Fonts.mono, fontSize: 12, color: C.hatchInk },
  pageCount: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pageCountText: { fontFamily: Fonts.mono, fontSize: 11, color: '#fff' },
  stamp: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  stampPrimary: { fontFamily: Fonts.mono, fontSize: 12, color: '#fff' },
  stampSecondary: { fontFamily: Fonts.mono, fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  // The reference is an identifier people copy into notebooks — monospaced, like it is everywhere else.
  reference: { fontSize: 17, fontWeight: '600', color: C.ink, fontFamily: Fonts.mono, letterSpacing: 0.3 },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.line90,
    borderRadius: Radius.lg,
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.ink62,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
    fontFamily: Fonts.sans,
  },
}));
