import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, ErrorNote, Loading } from '@/components/ui';
import { Fonts, Radius, makeStyles } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import type { ProjectResponse } from '@/lib/types';

/**
 * "Which project does this go to?" — asked before a drone photo is queued.
 *
 * The drone screen used to hardcode `projectId: 'drone-test'`, a project that exists on no
 * server, so every aerial survey queued against an id the sync would be rejected for. The photo
 * was downloaded and stored correctly and then had nowhere to land, which is exactly what
 * "I took a picture and it never showed up" looks like from the outside.
 *
 * The choice is remembered, because a pilot flying a block takes dozens of photos into the same
 * project and should be asked once, not once per shutter press.
 */

const LAST_PROJECT_KEY = 'geofold.drone.lastProject';

export interface PickedProject {
  id: string;
  name: string;
}

/** The remembered choice, or null. Read before opening so the picker can preselect. */
export async function lastProject(): Promise<PickedProject | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_PROJECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PickedProject;
    return parsed?.id && parsed?.name ? parsed : null;
  } catch {
    return null;
  }
}

export async function rememberProject(project: PickedProject): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_PROJECT_KEY, JSON.stringify(project));
  } catch {
    // Remembering is a convenience; failing to must not block a capture.
  }
}

export function ProjectPicker({
  visible,
  onPick,
  onCancel,
}: {
  visible: boolean;
  onPick: (project: PickedProject) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  // One settled load, tagged with the attempt it belongs to. Tagging rather than clearing means
  // the effect never has to set state synchronously — "still loading" is derived from the tag not
  // matching, so opening the sheet or retrying shows the spinner without a reset write.
  const [loaded, setLoaded] = useState<{
    attempt: number;
    projects: ProjectResponse[] | null;
    error: string | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const settled = visible && loaded?.attempt === attempt;
  const projects = settled ? loaded.projects : null;
  const error = settled ? loaded.error : null;

  const load = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    // Everything that writes state runs after the await, so nothing is set during the effect body.
    const run = async () => {
      try {
        const all = await api<ProjectResponse[]>('/api/projects');
        if (!cancelled) {
          setLoaded({ attempt, projects: all.filter((p) => !p.archivedAtUtc), error: null });
        }
      } catch (e) {
        if (!cancelled) {
          setLoaded({ attempt, projects: null, error: errorMessage(e, 'Could not load your projects.') });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [visible, attempt]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Simpan ke proyek mana?</Text>
          <Text style={styles.subtitle}>Foto drone akan masuk sebagai survei pada proyek ini.</Text>

          <ErrorNote message={error} />

          {projects === null && !error ? (
            <Loading label="Memuat proyek…" />
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {projects?.length === 0 ? (
                <Text style={styles.empty}>
                  Belum ada proyek. Buat satu di tab Projects terlebih dahulu.
                </Text>
              ) : (
                projects?.map((p) => (
                  <Pressable
                    key={p.id}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => onPick({ id: p.id, name: p.name })}>
                    <Text style={styles.rowName}>{p.name}</Text>
                    <Text style={styles.rowMeta}>{p.surveyCount} survei</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          )}

          <View style={styles.actions}>
            {error ? <Button title="Coba lagi" variant="outline" onPress={load} /> : null}
            <Button title="Batal" variant="subtle" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((C) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '80%',
    backgroundColor: C.surface,
    borderRadius: Radius.lg,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '700', color: C.ink, fontFamily: Fonts.sans },
  subtitle: { fontSize: 13, color: C.ink55, marginTop: 4, marginBottom: 14, fontFamily: Fonts.sans },
  list: { flexGrow: 0 },
  row: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.line90,
    marginBottom: 8,
  },
  rowPressed: { backgroundColor: C.bg95 },
  rowName: { fontSize: 15, fontWeight: '500', color: C.ink, fontFamily: Fonts.sans },
  rowMeta: { fontSize: 12, color: C.ink55, marginTop: 2, fontFamily: Fonts.sans },
  empty: { fontSize: 14, color: C.ink55, paddingVertical: 20, fontFamily: Fonts.sans },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'flex-end' },
}));
