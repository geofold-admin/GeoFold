import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Chip, Field, FieldFrame, Sheet, useT } from '../ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import {
  formatArea,
  formatLength,
  pathLength,
  ringArea,
  ringPerimeter,
  type AreaUnitSetting,
  type LengthUnitSetting,
  type Position,
} from '@/lib/geometry';
import { LAYER_COLORS, useGis, type GeometryKind } from '@/lib/gis';
import type { ProjectResponse } from '@/lib/types';

/**
 * Saving a measured shape as a feature: name it, file it in a layer (spec 1.8) and, optionally, a
 * project. The geometry fields are shown here because they are written automatically — the
 * surveyor sees exactly what the attribute row will carry before committing it.
 */
export function FeatureSaveSheet({
  visible,
  kind,
  coordinates,
  projects,
  defaultProjectId,
  defaultLayerId,
  lengthUnit,
  areaUnit,
  onSaved,
  onCancel,
}: {
  visible: boolean;
  kind: GeometryKind;
  coordinates: Position[];
  projects: ProjectResponse[];
  defaultProjectId: string | null;
  defaultLayerId: string;
  lengthUnit: LengthUnitSetting;
  areaUnit: AreaUnitSetting;
  onSaved: (featureId: string, layerId: string) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const gis = useGis();

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [layerId, setLayerId] = useState(defaultLayerId);
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [newLayer, setNewLayer] = useState<string | null>(null);

  const measurements =
    kind === 'line'
      ? [['Length', formatLength(pathLength(coordinates), lengthUnit)]]
      : kind === 'polygon'
        ? [
            ['Area', formatArea(ringArea(coordinates), areaUnit)],
            ['Perimeter', formatLength(ringPerimeter(coordinates), lengthUnit)],
          ]
        : [['Position', coordinates[0] ? `${coordinates[0][1].toFixed(6)}, ${coordinates[0][0].toFixed(6)}` : '—']];

  const save = () => {
    let target = layerId;
    if (newLayer !== null && newLayer.trim()) {
      const color = LAYER_COLORS[gis.layers.length % LAYER_COLORS.length];
      target = gis.addLayer(newLayer.trim(), color).id;
    }
    const kindLabel = kind === 'point' ? 'Point' : kind === 'line' ? 'Line' : 'Polygon';
    const feature = gis.addFeature({
      kind,
      coordinates,
      layerId: target,
      projectId,
      name: name.trim() || `${kindLabel} ${new Date().toLocaleString()}`,
      attributes: notes.trim() ? { notes: notes.trim() } : {},
    });
    setName('');
    setNotes('');
    setNewLayer(null);
    onSaved(feature.id, target);
  };

  return (
    <Sheet visible={visible} onClose={onCancel} title={`Save ${kind === 'point' ? 'point' : kind === 'line' ? 'line' : 'polygon'}`}>
      <View style={styles.measureBox}>
        {measurements.map(([label, value]) => (
          <View key={label} style={styles.measureRow}>
            <Text style={styles.measureLabel}>{label}</Text>
            <Text style={styles.measureValue}>{value}</Text>
          </View>
        ))}
        <Text style={[T.caption, { marginTop: 6 }]}>
          {kind === 'point'
            ? 'Latitude and longitude are added to the attribute table automatically.'
            : kind === 'line'
              ? 'A length field (length_m) is added to the attribute table automatically.'
              : 'Area (area_m2) and perimeter (perim_m) fields are added to the attribute table automatically.'}
        </Text>
      </View>

      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Jl. Desa ruas 2" maxLength={120} />

      <FieldFrame label="Layer">
        <View style={styles.chips}>
          {gis.layers.map((layer) => {
            const active = newLayer === null && layer.id === layerId;
            return (
              <Pressable
                key={layer.id}
                onPress={() => {
                  setLayerId(layer.id);
                  setNewLayer(null);
                }}
                style={[styles.layerChip, active && { borderColor: layer.color, backgroundColor: C.bg95 }]}>
                <View style={[styles.swatch, { backgroundColor: layer.color }]} />
                <Text style={[styles.layerText, active && { color: C.ink, fontWeight: '600' }]}>{layer.name}</Text>
              </Pressable>
            );
          })}
          <Chip label="+ New layer" active={newLayer !== null} onPress={() => setNewLayer(newLayer === null ? '' : null)} small />
        </View>
        {newLayer !== null ? (
          <Field value={newLayer} onChangeText={setNewLayer} placeholder="Layer name, e.g. Saluran irigasi" autoFocus />
        ) : null}
      </FieldFrame>

      {projects.length ? (
        <FieldFrame label="Project" hint="Filed under a project, it is included in that project's shapefile export.">
          <View style={styles.chips}>
            <Chip label="None" active={projectId === null} onPress={() => setProjectId(null)} small />
            {projects.map((p) => (
              <Chip key={p.id} label={p.name} active={projectId === p.id} onPress={() => setProjectId(p.id)} small />
            ))}
          </View>
        </FieldFrame>
      ) : null}

      <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Condition, material, remarks…" />

      <View style={styles.buttons}>
        <Button title="Cancel" variant="outline" onPress={onCancel} style={{ flex: 1 }} />
        <Button
          title="Save feature"
          onPress={save}
          disabled={newLayer !== null && !newLayer.trim()}
          style={{ flex: 1.4 }}
        />
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((C) => ({
  measureBox: {
    backgroundColor: C.bg95,
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 14,
  },
  measureRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  measureLabel: { fontSize: 13, color: C.ink55, fontFamily: Fonts.sans },
  measureValue: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: Fonts.mono },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: C.line88,
  },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  layerText: { fontSize: 12, color: C.ink42, fontFamily: Fonts.sans },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 6 },
}));
