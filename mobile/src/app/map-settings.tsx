import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MarkerIcon } from '@/components/marker-icon';
import { Button, Chip, ErrorNote, FieldFrame, Header, SwitchRow, RowGroup, useT } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { AREA_UNITS, LENGTH_UNITS } from '@/lib/geometry';
import { labelSources } from '@/lib/labels';
import { deleteMarkerImage, pickMarkerImage } from '@/lib/marker-image';
import { MARKER_ICONS, labelFieldFor, markerFor, useSettings, type MarkerStyle } from '@/lib/settings';
import { parseSchema, type ProjectResponse } from '@/lib/types';

const MARKER_COLORS = ['#0070bb', '#e5484d', '#e07b24', '#c9a100', '#2e9b4f', '#0f9d9a', '#8a5cd6', '#d6336c', '#1f2937', '#ffffff'];
const TEXT_COLORS = ['#10171c', '#ffffff', '#0070bb', '#e5484d', '#e07b24', '#2e9b4f', '#ffd60a'];
const BOX_COLORS: (string | null)[] = [null, '#ffffffd9', '#10171ccc', '#fff3bfe6', '#dff1ffe6'];
const SIZES = [10, 11, 12, 14, 16];

/**
 * How survey points are drawn (spec 1.2 / 1.6): the marker — from the built-in library in any
 * colour, or an uploaded picture — and the label printed beside each point: which column of the
 * survey it shows, its text colour, its outline and its background box.
 *
 * With `?projectId=` the marker and the label column are that project's own; without, they are the
 * defaults every project without its own uses. Label styling and units are always app-wide.
 */
export default function MapSettingsScreen() {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const { settings, update, updateLabels, setProjectMarker } = useSettings();

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api<ProjectResponse>(`/api/projects/${projectId}`)
      .then(setProject)
      .catch((e) => setError(errorMessage(e, 'Could not load the project.')));
  }, [projectId]);

  const ownMarker = projectId ? settings.projectMarkers[projectId] : undefined;
  const marker = markerFor(settings, projectId);
  const fields = useMemo(() => parseSchema(project?.formSchema), [project]);
  const sources = labelSources(fields);
  const labelField = labelFieldFor(settings, projectId);

  const setMarker = (next: MarkerStyle) => {
    // A replaced uploaded picture is deleted, unless another scope still points at it.
    const previous = projectId ? ownMarker : settings.marker;
    if (previous?.kind === 'image' && (next.kind !== 'image' || next.uri !== previous.uri)) {
      const others = [
        ...(projectId ? [settings.marker] : []),
        ...Object.entries(settings.projectMarkers)
          .filter(([pid]) => pid !== projectId)
          .map(([, m]) => m),
      ];
      if (!others.some((m) => m.kind === 'image' && m.uri === previous.uri)) deleteMarkerImage(previous.uri);
    }
    if (projectId) setProjectMarker(projectId, next);
    else update({ marker: next });
  };

  const setLabelField = (key: string) => {
    if (projectId) updateLabels({ projectFields: { ...settings.labels.projectFields, [projectId]: key } });
    else updateLabels({ field: key });
  };

  const upload = async () => {
    setError(null);
    try {
      const uri = await pickMarkerImage();
      if (uri) setMarker({ kind: 'image', uri });
    } catch (e) {
      setError(errorMessage(e, 'Could not use that picture.'));
    }
  };

  const color = marker.kind === 'icon' ? marker.color : C.accent;
  const labels = settings.labels;
  const sampleLabel = sources.find((s) => s.key === labelField)?.label ?? 'Label';

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <Header title={projectId ? `Map style · ${project?.name ?? 'project'}` : 'Map style'} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <ErrorNote message={error} />

        {/* Live preview over both kinds of ground the map has. */}
        <View style={styles.previewRow}>
          {(['light', 'dark'] as const).map((ground) => (
            <View key={ground} style={[styles.preview, ground === 'dark' ? styles.previewDark : styles.previewLight]}>
              <View style={styles.previewPin}>
                <MarkerIcon style={marker} size={32} />
                {labels.enabled ? (
                  <View style={[styles.previewBox, labels.boxColor ? { backgroundColor: labels.boxColor } : null]}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: labels.textColor,
                        fontSize: labels.size,
                        textShadowColor: labels.haloColor,
                        textShadowRadius: 2.5,
                        textShadowOffset: { width: 0, height: 0 },
                        fontFamily: Fonts.sans,
                      }}>
                      {labelField === 'reference' ? 'DESA-001' : sampleLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        <Text style={[T.section, { marginBottom: 4 }]}>Marker</Text>
        <Text style={[T.sub, { marginBottom: 12 }]}>
          {projectId
            ? ownMarker
              ? "This project's own marker."
              : 'Using the default marker — pick one below to give this project its own.'
            : 'Used for every project that has no marker of its own.'}
        </Text>

        <View style={styles.iconGrid}>
          {MARKER_ICONS.map((icon) => {
            const active = marker.kind === 'icon' && marker.icon === icon;
            return (
              <Pressable
                key={icon}
                onPress={() => setMarker({ kind: 'icon', icon, color })}
                accessibilityLabel={`${icon} marker`}
                style={[styles.iconCell, active && { borderColor: C.accent, backgroundColor: C.accentTint }]}>
                <MarkerIcon style={{ kind: 'icon', icon, color }} size={28} />
              </Pressable>
            );
          })}
        </View>

        {marker.kind === 'icon' ? (
          <FieldFrame label="Colour">
            <View style={styles.swatches}>
              {MARKER_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setMarker({ ...marker, color: c })}
                  accessibilityLabel={`Colour ${c}`}
                  style={[styles.swatch, { backgroundColor: c }, marker.color === c && styles.swatchActive]}
                />
              ))}
            </View>
          </FieldFrame>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
          <Button title={marker.kind === 'image' ? 'Replace picture' : 'Upload a picture'} variant="outline" onPress={() => void upload()} style={{ flex: 1 }} size="sm" />
          {projectId && ownMarker ? (
            <Button
              title="Use default"
              variant="subtle"
              size="sm"
              style={{ flex: 1 }}
              onPress={() => {
                if (ownMarker.kind === 'image') deleteMarkerImage(ownMarker.uri);
                setProjectMarker(projectId, null);
              }}
            />
          ) : null}
        </View>

        <Text style={[T.section, { marginBottom: 10 }]}>Labels</Text>
        <RowGroup>
          <SwitchRow
            label="Show labels beside points"
            detail="Drawn once the map is zoomed in close enough to show individual pins."
            value={labels.enabled}
            onValueChange={(v) => updateLabels({ enabled: v })}
            last
          />
        </RowGroup>
        <View style={{ height: 14 }} />

        <FieldFrame
          label={projectId ? 'Label shows (this project)' : 'Label shows (default)'}
          hint={projectId ? undefined : "A project's own form fields can be chosen from that project's map style."}>
          <View style={styles.chips}>
            {sources.map((s) => (
              <Chip key={s.key} label={s.label} small active={labelField === s.key} onPress={() => setLabelField(s.key)} />
            ))}
          </View>
        </FieldFrame>

        <FieldFrame label="Text colour">
          <View style={styles.swatches}>
            {TEXT_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => updateLabels({ textColor: c })}
                style={[styles.swatch, { backgroundColor: c }, labels.textColor === c && styles.swatchActive]}
              />
            ))}
          </View>
        </FieldFrame>

        <FieldFrame label="Outline">
          <View style={styles.swatches}>
            {TEXT_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => updateLabels({ haloColor: c })}
                style={[styles.swatch, { backgroundColor: c }, labels.haloColor === c && styles.swatchActive]}
              />
            ))}
          </View>
        </FieldFrame>

        <FieldFrame label="Background box">
          <View style={styles.swatches}>
            {BOX_COLORS.map((c) => (
              <Pressable
                key={c ?? 'none'}
                onPress={() => updateLabels({ boxColor: c })}
                accessibilityLabel={c ? `Box ${c}` : 'No box'}
                style={[
                  styles.swatch,
                  c ? { backgroundColor: c } : styles.swatchNone,
                  labels.boxColor === c && styles.swatchActive,
                ]}>
                {c ? null : <Text style={styles.noneText}>none</Text>}
              </Pressable>
            ))}
          </View>
        </FieldFrame>

        <FieldFrame label="Text size">
          <View style={styles.chips}>
            {SIZES.map((s) => (
              <Chip key={s} label={`${s}`} small active={labels.size === s} onPress={() => updateLabels({ size: s })} />
            ))}
          </View>
        </FieldFrame>

        <Text style={[T.section, { marginTop: 10, marginBottom: 10 }]}>Measurement units</Text>
        <FieldFrame label="Distance">
          <View style={styles.chips}>
            {LENGTH_UNITS.map((u) => (
              <Chip key={u.key} label={u.label} small active={settings.lengthUnit === u.key} onPress={() => update({ lengthUnit: u.key })} />
            ))}
          </View>
        </FieldFrame>
        <FieldFrame label="Area">
          <View style={styles.chips}>
            {AREA_UNITS.map((u) => (
              <Chip key={u.key} label={u.label} small active={settings.areaUnit === u.key} onPress={() => update({ areaUnit: u.key })} />
            ))}
          </View>
        </FieldFrame>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  previewRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  preview: { flex: 1, height: 92, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  previewLight: { backgroundColor: '#e4edef' },
  previewDark: { backgroundColor: '#2f3b2c' },
  previewPin: { flexDirection: 'row', alignItems: 'center' },
  previewBox: { marginLeft: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, maxWidth: 110 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  iconCell: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: C.line90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: { borderWidth: 3, borderColor: C.accentText },
  swatchNone: { backgroundColor: C.surface, borderStyle: 'dashed' },
  noneText: { fontSize: 8, color: C.ink55, fontFamily: Fonts.sans },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
}));
