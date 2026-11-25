import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Chevron } from './icons';
import { ProjectAvatar, Sheet, useT } from './ui';
import { Fonts, makeStyles } from '@/constants/theme';
import type { ProjectResponse } from '@/lib/types';

/**
 * "Capture for which job?" — the design's bottom sheet, over GeoFold's projects. Picking one
 * carries its id into the capture flow, which is what the survey gets filed against.
 *
 * Built on the shared `Sheet`, so it has the same scrim, corners and safe-area handling as every
 * other sheet in the app rather than a copy of them.
 */
export function CaptureSheet({
  visible,
  projects,
  onClose,
}: {
  visible: boolean;
  projects: ProjectResponse[];
  onClose: () => void;
}) {
  const router = useRouter();
  const styles = useStyles();
  const T = useT();

  const choose = (id: string) => {
    onClose();
    router.push(`/capture?projectId=${id}`);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Capture for which project?" maxHeight={360}>
      {projects.length === 0 ? (
        <Text style={[T.sub, { paddingVertical: 12 }]}>
          No projects yet. Create one on the Projects tab first.
        </Text>
      ) : (
        projects.map((p, i) => (
          <Pressable
            key={p.id}
            onPress={() => choose(p.id)}
            accessibilityRole="button"
            accessibilityLabel={`Capture for ${p.name}`}
            style={({ pressed }) => [
              styles.row,
              i === projects.length - 1 ? { borderBottomWidth: 0 } : null,
              { opacity: pressed ? 0.6 : 1 },
            ]}>
            <ProjectAvatar name={p.name} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={T.caption} numberOfLines={1}>
                {[p.description, `${p.surveyCount} survey${p.surveyCount === 1 ? '' : 's'}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Chevron />
          </Pressable>
        ))
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((C) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
  },
  name: { fontSize: 15, fontWeight: '500', color: C.ink, marginBottom: 2, fontFamily: Fonts.sans },
}));
