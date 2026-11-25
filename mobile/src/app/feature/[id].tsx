import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Close, PlusIcon } from '@/components/icons';
import { Button, Chip, Empty, Field, FieldFrame, Header, Input, useT } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { api } from '@/lib/api';
import { boundsOf, formatArea, formatLength } from '@/lib/geometry';
import { isGeometryAttribute, useGis, type AttributeValue } from '@/lib/gis';
import { useSettings } from '@/lib/settings';
import type { ProjectResponse } from '@/lib/types';
import { requestMapFocus } from '@/lib/viewport';

interface Row {
  id: number;
  key: string;
  value: string;
}

/** Text from the editor back into the attribute's natural type, so exports keep numeric columns. */
function typed(value: string): AttributeValue {
  const t = value.trim();
  if (t === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
  return t;
}

/**
 * A feature's attribute row (spec 1.1 / 1.8). The geometry fields — written automatically when the
 * shape is saved — are shown in the surveyor's chosen units and are not editable; everything else
 * is, and new columns can be added. Layer and project can be changed here too.
 */
export default function FeatureScreen() {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gis = useGis();
  const { settings } = useSettings();
  const feature = gis.features.find((f) => f.id === id) ?? null;

  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [name, setName] = useState(feature?.name ?? '');
  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(feature?.attributes ?? {})
      .filter(([k]) => !isGeometryAttribute(k))
      .map(([key, value], i) => ({ id: i, key, value: value === null || value === undefined ? '' : String(value) })),
  );
  const [nextId, setNextId] = useState(rows.length);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api<ProjectResponse[]>('/api/projects')
      .then(setProjects)
      .catch(() => {});
  }, []);

  if (!feature) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
        <Header title="Feature" onBack={() => router.back()} />
        <View style={{ padding: 20 }}>
          <Empty>This feature no longer exists on this device.</Empty>
        </View>
      </View>
    );
  }

  const a = feature.attributes;
  const geometry: [string, string][] =
    feature.kind === 'line'
      ? [['Length', formatLength(Number(a.length_m ?? 0), settings.lengthUnit)]]
      : feature.kind === 'polygon'
        ? [
            ['Area', formatArea(Number(a.area_m2 ?? 0), settings.areaUnit)],
            ['Perimeter', formatLength(Number(a.perim_m ?? 0), settings.lengthUnit)],
          ]
        : [
            ['Latitude', Number(a.lat ?? 0).toFixed(7)],
            ['Longitude', Number(a.lon ?? 0).toFixed(7)],
          ];

  const save = () => {
    const keys = rows.map((r) => r.key.trim()).filter(Boolean);
    if (new Set(keys).size !== keys.length) {
      Alert.alert('Duplicate column', 'Two attributes have the same name. Rename one of them.');
      return;
    }
    if (keys.some(isGeometryAttribute)) {
      Alert.alert('Reserved name', 'length_m, area_m2, perim_m, lat and lon are computed from the shape. Use another name.');
      return;
    }
    const attributes: Record<string, AttributeValue> = {};
    for (const r of rows) if (r.key.trim()) attributes[r.key.trim()] = typed(r.value);
    gis.updateFeature(feature.id, { name: name.trim() || feature.name, attributes });
    setDirty(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <Header
        title="Feature attributes"
        onBack={() => router.back()}
        right={
          dirty ? (
            <Pressable onPress={save} hitSlop={8} style={{ paddingHorizontal: 8 }}>
              <Text style={T.link}>Save</Text>
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Field
          label="Name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            setDirty(true);
          }}
        />

        <View style={styles.geoBox}>
          <Text style={styles.geoTitle}>
            {feature.kind === 'point' ? 'Point' : feature.kind === 'line' ? 'Line' : 'Polygon'}
            {` · ${feature.coordinates.length} vertex${feature.coordinates.length === 1 ? '' : 'es'}`}
          </Text>
          {geometry.map(([label, value]) => (
            <View key={label} style={styles.geoRow}>
              <Text style={T.sub}>{label}</Text>
              <Text style={styles.geoValue}>{value}</Text>
            </View>
          ))}
          <Text style={[T.caption, { marginTop: 6 }]}>Computed from the shape and kept up to date automatically.</Text>
        </View>

        <FieldFrame label="Layer">
          <View style={styles.chips}>
            {gis.layers.map((l) => (
              <Chip key={l.id} label={l.name} small active={feature.layerId === l.id} onPress={() => gis.updateFeature(feature.id, { layerId: l.id })} />
            ))}
          </View>
        </FieldFrame>

        <FieldFrame label="Project">
          <View style={styles.chips}>
            <Chip label="None" small active={feature.projectId === null} onPress={() => gis.updateFeature(feature.id, { projectId: null })} />
            {projects.map((p) => (
              <Chip key={p.id} label={p.name} small active={feature.projectId === p.id} onPress={() => gis.updateFeature(feature.id, { projectId: p.id })} />
            ))}
          </View>
        </FieldFrame>

        <Text style={[T.section, { marginTop: 6, marginBottom: 10 }]}>Attributes</Text>
        {rows.length === 0 ? <Text style={[T.sub, { marginBottom: 12 }]}>No attributes yet.</Text> : null}
        {rows.map((r) => (
          <View key={r.id} style={styles.attrRow}>
            <Input
              value={r.key}
              onChangeText={(v) => {
                setRows((p) => p.map((x) => (x.id === r.id ? { ...x, key: v } : x)));
                setDirty(true);
              }}
              placeholder="column"
              autoCapitalize="none"
              style={styles.attrKey}
            />
            <Input
              value={r.value}
              onChangeText={(v) => {
                setRows((p) => p.map((x) => (x.id === r.id ? { ...x, value: v } : x)));
                setDirty(true);
              }}
              placeholder="value"
              style={styles.attrValue}
            />
            <Pressable
              onPress={() => {
                setRows((p) => p.filter((x) => x.id !== r.id));
                setDirty(true);
              }}
              hitSlop={8}
              style={styles.attrRemove}
              accessibilityLabel={`Remove ${r.key}`}>
              <Close color={C.ink62} size={11} />
            </Pressable>
          </View>
        ))}
        <Pressable
          onPress={() => {
            setRows((p) => [...p, { id: nextId, key: '', value: '' }]);
            setNextId((n) => n + 1);
          }}
          style={styles.addRow}>
          <PlusIcon color={C.accentText} size={13} />
          <Text style={T.link}>Add attribute</Text>
        </Pressable>

        {dirty ? <Button title="Save changes" onPress={save} style={{ marginTop: 8 }} /> : null}

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <Button
            title="Show on map"
            variant="outline"
            style={{ flex: 1 }}
            onPress={() => {
              const b = boundsOf(feature.coordinates);
              if (b) requestMapFocus({ kind: 'bounds', bounds: b });
              router.navigate('/(tabs)');
            }}
          />
          <Button
            title="Delete"
            variant="danger"
            style={{ flex: 1 }}
            onPress={() =>
              Alert.alert('Delete feature?', `"${feature.name}" will be removed from this device.`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    gis.deleteFeature(feature.id);
                    router.back();
                  },
                },
              ])
            }
          />
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  geoBox: { backgroundColor: C.bg95, borderRadius: Radius.md, padding: 14, marginBottom: 16 },
  geoTitle: { fontSize: 13, fontWeight: '600', color: C.ink, marginBottom: 6, fontFamily: Fonts.sans },
  geoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  geoValue: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: Fonts.mono },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  attrRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  attrKey: { flex: 1, paddingVertical: 10, fontFamily: Fonts.mono, fontSize: 13 },
  attrValue: { flex: 1.4, paddingVertical: 10 },
  attrRemove: { width: 28, height: 40, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
}));
