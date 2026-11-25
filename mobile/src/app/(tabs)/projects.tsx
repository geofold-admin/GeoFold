import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CaptureSheet } from '@/components/capture-sheet';
import { CameraGlyph, Chevron, PlusIcon } from '@/components/icons';
import { ReminderBanner } from '@/components/reminder-banner';
import { Chip, Empty, ErrorNote, Loading, ProjectAvatar, StatusPill, useT, TabTitle } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { parseSchema, type ProjectResponse } from '@/lib/types';
import { useSync } from '@/lib/sync-context';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

type Filter = 'all' | 'active' | 'empty';

export default function ProjectsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const { online } = useSync();

  const [projects, setProjects] = useState<ProjectResponse[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProjects(await api<ProjectResponse[]>('/api/projects'));
    } catch (e) {
      setError(errorMessage(e, 'Could not load projects.'));
    }
  }, []);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const list = projects ?? [];
    if (filter === 'active') return list.filter((p) => p.surveyCount > 0);
    if (filter === 'empty') return list.filter((p) => p.surveyCount === 0);
    return list;
  }, [projects, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 20 }}>
        <TabTitle
          title="Projects"
          subtitle={
            projects
              ? `${projects.length} assigned to you${online ? '' : ' · offline, saved copy'}`
              : error
                ? undefined
                : 'Loading…'
          }
        />
        <View style={styles.chips}>
          {(
            [
              ['all', 'All'],
              ['active', 'Started'],
              ['empty', 'Not started'],
            ] as const
          ).map(([key, label]) => (
            <Chip key={key} label={label} active={filter === key} onPress={() => setFilter(key)} />
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <ErrorNote message={error} />
        <ReminderBanner onExport={() => router.push('/project/data?mode=export')} />

        {projects === null ? (
          error ? null : <Loading />
        ) : filtered.length === 0 ? (
          <Empty>
            {projects.length === 0
              ? 'No projects yet. Create one to start capturing.'
              : 'Nothing matches that filter.'}
          </Empty>
        ) : (
          filtered.map((p) => {
            const fields = parseSchema(p.formSchema);
            return (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/project/${p.id}`)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.65 : 1 }]}>
                <ProjectAvatar name={p.name} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  {/* The status rides on the title line, so the chevron can sit centred on the
                      row the way it does on every other list in the app. */}
                  <View style={styles.titleLine}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <StatusPill
                      status={p.surveyCount > 0 ? 'submitted' : 'none'}
                      label={p.surveyCount > 0 ? 'In progress' : 'Not started'}
                    />
                  </View>
                  <Text style={styles.address} numberOfLines={1}>
                    {p.description ?? 'No description'}
                  </Text>
                  <Text style={T.caption} numberOfLines={1}>
                    {new Date(p.createdAtUtc).toLocaleDateString()} · {p.surveyCount} survey
                    {p.surveyCount === 1 ? '' : 's'} ·{' '}
                    {fields.length === 0
                      ? 'no custom fields'
                      : `${fields.length} field${fields.length === 1 ? '' : 's'}`}
                  </Text>
                </View>
                <Chevron />
              </Pressable>
            );
          })
        )}

        <Pressable
          onPress={() => router.push('/project/new')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.newProject, { opacity: pressed ? 0.7 : 1 }]}>
          <PlusIcon color={C.accentText} />
          <Text style={styles.newProjectText}>New project</Text>
        </Pressable>
      </ScrollView>

      <Pressable
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Capture a survey photo"
        style={({ pressed }) => [styles.fab, { bottom: 20, opacity: pressed ? 0.9 : 1 }]}>
        <CameraGlyph size={26} />
      </Pressable>

      <CaptureSheet
        visible={sheetOpen}
        projects={projects ?? []}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  chips: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
  },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: Fonts.sans },
  address: { fontSize: 13, color: C.ink55, marginBottom: 4, fontFamily: Fonts.sans },
  // Dashed like the empty state: an open slot for the next project, not a stray link.
  newProject: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line85,
    borderRadius: Radius.lg,
  },
  newProjectText: { fontSize: 15, fontWeight: '500', color: C.accentText, fontFamily: Fonts.sans },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
}));
