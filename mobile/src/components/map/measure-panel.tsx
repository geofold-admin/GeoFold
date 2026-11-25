import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import {
  Close,
  CrosshairIcon,
  FitIcon,
  GpsIcon,
  LineIcon,
  PointIcon,
  PolygonIcon,
  RedoIcon,
  UndoIcon,
} from '../icons';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import {
  AREA_UNITS,
  LENGTH_UNITS,
  distance,
  formatArea,
  formatLength,
  pathLength,
  ringArea,
  ringPerimeter,
  type AreaUnitSetting,
  type LengthUnitSetting,
  type Position,
} from '@/lib/geometry';
import type { GeometryKind } from '@/lib/gis';

/**
 * The measure & geometry tool's control card (spec 1.1).
 *
 * Three object types — a single point, an open polyline, a closed polygon — drawn by tapping the
 * map, or, for precision, by panning the map under the centre crosshair and adding the vertex there
 * ("+ Centre"), or by walking to it and adding the GPS position ("+ GPS"). A fingertip covers
 * several metres of ground at field zooms; the crosshair and GPS placements are how a vertex lands
 * where it is meant to.
 *
 * Length and area are live, in whichever unit the surveyor picks, and saving turns the shape into a
 * feature whose attribute row gains the computed length / area / perimeter fields automatically.
 */

const MODES: { key: GeometryKind; label: string; Icon: typeof PointIcon }[] = [
  { key: 'point', label: 'Point', Icon: PointIcon },
  { key: 'line', label: 'Line', Icon: LineIcon },
  { key: 'polygon', label: 'Polygon', Icon: PolygonIcon },
];

export function MeasurePanel({
  mode,
  onModeChange,
  points,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onFit,
  onAddCenter,
  onAddGps,
  gpsBusy,
  onSave,
  onClose,
  lengthUnit,
  areaUnit,
  onLengthUnit,
  onAreaUnit,
  bottom,
}: {
  mode: GeometryKind;
  onModeChange: (mode: GeometryKind) => void;
  points: Position[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onFit: () => void;
  onAddCenter: () => void;
  onAddGps: () => void;
  gpsBusy: boolean;
  onSave: () => void;
  onClose: () => void;
  lengthUnit: LengthUnitSetting;
  areaUnit: AreaUnitSetting;
  onLengthUnit: (u: LengthUnitSetting) => void;
  onAreaUnit: (u: AreaUnitSetting) => void;
  bottom: number;
}) {
  const styles = useStyles();
  const C = useColors();

  const needed = mode === 'point' ? 1 : mode === 'line' ? 2 : 3;
  const ready = points.length >= needed;

  let primary: string;
  let secondary: string;
  if (mode === 'point') {
    const p = points[points.length - 1];
    primary = p ? `${p[1].toFixed(6)}, ${p[0].toFixed(6)}` : 'Place a point';
    secondary = p ? 'Latitude, longitude' : 'Tap the map, or use + Centre / + GPS';
  } else if (mode === 'line') {
    primary = points.length >= 2 ? formatLength(pathLength(points), lengthUnit) : 'Draw a line';
    const n = points.length;
    secondary =
      n >= 2
        ? `${n} vertices · last leg ${formatLength(distance(points[n - 2], points[n - 1]), lengthUnit)}`
        : n === 1
          ? 'Add the next vertex'
          : 'Tap the map or a survey pin. Hold a corner to drag it';
  } else {
    primary = points.length >= 3 ? formatArea(ringArea(points), areaUnit) : 'Draw a polygon';
    secondary =
      points.length >= 3
        ? `Perimeter ${formatLength(ringPerimeter(points), lengthUnit)} · ${points.length} vertices`
        : points.length === 0
          ? 'Tap survey pins or the map. Hold a corner to drag it'
          : `${points.length} of at least 3 vertices`;
  }

  const units =
    mode === 'polygon'
      ? AREA_UNITS.map((u) => ({ ...u, active: u.key === areaUnit, pick: () => onAreaUnit(u.key) }))
      : mode === 'line'
        ? LENGTH_UNITS.map((u) => ({ ...u, active: u.key === lengthUnit, pick: () => onLengthUnit(u.key) }))
        : [];

  const tool = (label: string, icon: ReactNode, onPress: () => void, disabled = false) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tool, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}>
      {icon}
      <Text style={styles.toolLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.card, { bottom }]}>
      <View style={styles.headRow}>
        <View style={styles.modes}>
          {MODES.map(({ key, label, Icon }) => {
            const active = key === mode;
            return (
              <Pressable
                key={key}
                onPress={() => onModeChange(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.mode, active && { backgroundColor: C.accent }]}>
                <Icon color={active ? '#fff' : C.ink46} size={15} />
                <Text style={[styles.modeText, active && { color: '#fff' }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close measure tool" style={styles.close}>
          <Close color={C.ink55} size={12} />
        </Pressable>
      </View>

      <View style={styles.readoutRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.primary} numberOfLines={1}>
            {primary}
          </Text>
          <Text style={styles.secondary} numberOfLines={1}>
            {secondary}
          </Text>
        </View>
      </View>

      {units.length ? (
        <View style={styles.unitRow}>
          <Text style={styles.unitLabel}>{mode === 'polygon' ? 'Area in' : 'Length in'}</Text>
          {units.map((u) => (
            <Pressable
              key={u.key}
              onPress={u.pick}
              accessibilityRole="button"
              accessibilityState={{ selected: u.active }}
              style={[styles.unit, u.active && { backgroundColor: C.accent }]}>
              <Text style={[styles.unitText, u.active && { color: '#fff' }]}>{u.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tools}>
          {tool('Undo', <UndoIcon color={C.ink30} />, onUndo, !canUndo)}
          {tool('Redo', <RedoIcon color={C.ink30} />, onRedo, !canRedo)}
          {tool('Centre', <CrosshairIcon color={C.ink30} size={18} />, onAddCenter)}
          {tool('GPS', gpsBusy ? <ActivityIndicator size="small" color={C.accentText} /> : <GpsIcon color={C.ink30} />, onAddGps, gpsBusy)}
          {tool('Fit', <FitIcon color={C.ink30} />, onFit, points.length === 0)}
          {tool('Clear', <Close color={C.ink30} size={13} />, onClear, points.length === 0)}
        </ScrollView>
        <Pressable
          onPress={onSave}
          disabled={!ready}
          accessibilityRole="button"
          style={({ pressed }) => [styles.save, { opacity: !ready ? 0.4 : pressed ? 0.85 : 1 }]}>
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: C.raised,
    borderRadius: Radius.lg,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 4,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modes: { flex: 1, flexDirection: 'row', gap: 4, backgroundColor: C.bg95, borderRadius: Radius.md, padding: 3 },
  mode: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 8,
  },
  modeText: { fontSize: 12, fontWeight: '600', color: C.ink46, fontFamily: Fonts.sans },
  close: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

  readoutRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 4 },
  primary: { fontSize: 20, fontWeight: '700', color: C.ink, fontFamily: Fonts.mono },
  secondary: { fontSize: 12, color: C.ink55, marginTop: 2, fontFamily: Fonts.sans },

  unitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 4 },
  unitLabel: { fontSize: 11, color: C.ink55, marginRight: 2, fontFamily: Fonts.sans },
  unit: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, backgroundColor: C.bg95 },
  unitText: { fontSize: 11, fontWeight: '600', color: C.ink46, fontFamily: Fonts.sans },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.line92,
    paddingTop: 6,
  },
  tools: { gap: 2, paddingRight: 6 },
  tool: { alignItems: 'center', justifyContent: 'center', width: 48, height: 46, gap: 3 },
  toolLabel: { fontSize: 10, color: C.ink55, fontFamily: Fonts.sans },
  save: {
    backgroundColor: C.accent,
    borderRadius: Radius.md,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginLeft: 6,
  },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '600', fontFamily: Fonts.sans },
}));
