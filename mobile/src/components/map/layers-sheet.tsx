import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { Chevron, EyeIcon, PlusIcon } from '../icons';
import { Button, Field, Sheet, useT } from '../ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { LAYER_COLORS, useGis } from '@/lib/gis';
import { useTracker } from '@/lib/tracker';

/**
 * Everything drawn on the map, as layers that can be switched on and off (spec 1.8): the survey
 * points, the category layers (Jalan, Bangunan, Vegetasi, Umum, plus any the surveyor adds), GPS
 * tracks, georeferenced map overlays and offline MBTiles basemaps.
 */
export function LayersSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const router = useRouter();
  const gis = useGis();
  const tracker = useTracker();
  const [adding, setAdding] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of gis.features) map.set(f.layerId, (map.get(f.layerId) ?? 0) + 1);
    return map;
  }, [gis.features]);

  const go = (href: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(href);
  };

  const toggle = (value: boolean, onChange: (v: boolean) => void, label: string) => (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: C.accent, false: C.line85 }}
      thumbColor="#fff"
      accessibilityLabel={label}
    />
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Layers" maxHeight={600}>
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={[styles.swatch, { backgroundColor: C.accent, borderRadius: 7 }]} />
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Survey points</Text>
            <Text style={styles.rowDetail}>Captured photos and their positions</Text>
          </View>
          {toggle(gis.surveysVisible, gis.setSurveysVisible, 'Show survey points')}
        </View>
        <Pressable onPress={() => go('/map-settings')} style={styles.linkRow}>
          <Text style={T.link}>Marker & label style</Text>
          <Chevron color={C.accentText} />
        </Pressable>
      </View>

      <Text style={styles.section}>Feature layers</Text>
      <View style={styles.group}>
        {gis.layers.map((layer, i) => (
          <View key={layer.id} style={[styles.row, i === gis.layers.length - 1 && !adding ? styles.last : null]}>
            <Pressable onPress={() => go(`/layer/${layer.id}`)} style={styles.rowMain} accessibilityRole="button">
              <View style={[styles.swatch, { backgroundColor: layer.color }]} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{layer.name}</Text>
                <Text style={styles.rowDetail}>
                  {(counts.get(layer.id) ?? 0) === 1 ? '1 feature' : `${counts.get(layer.id) ?? 0} features`}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => gis.updateLayer(layer.id, { visible: !layer.visible })}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
              style={styles.eye}>
              <EyeIcon off={!layer.visible} color={layer.visible ? C.ink30 : C.ink62} />
            </Pressable>
          </View>
        ))}
        {adding !== null ? (
          <View style={[styles.addBox]}>
            <Field value={adding} onChangeText={setAdding} placeholder="New layer name" autoFocus />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Cancel" variant="outline" size="sm" onPress={() => setAdding(null)} style={{ flex: 1 }} />
              <Button
                title="Add layer"
                size="sm"
                disabled={!adding.trim()}
                onPress={() => {
                  gis.addLayer(adding.trim(), LAYER_COLORS[gis.layers.length % LAYER_COLORS.length]);
                  setAdding(null);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setAdding('')} style={styles.linkRow}>
            <PlusIcon color={C.accentText} size={13} />
            <Text style={T.link}>New layer</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.section}>GPS tracks</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={[styles.swatch, { backgroundColor: '#e5484d', height: 4, borderRadius: 2 }]} />
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Recorded routes</Text>
            <Text style={styles.rowDetail}>
              {tracker.recording ? 'Recording now' : `${tracker.tracks.length} saved`}
            </Text>
          </View>
          {toggle(gis.tracksVisible, gis.setTracksVisible, 'Show GPS tracks')}
        </View>
        <Pressable onPress={() => go('/tracks')} style={styles.linkRow}>
          <Text style={T.link}>GPS logger</Text>
          <Chevron color={C.accentText} />
        </Pressable>
      </View>

      <Text style={styles.section}>Map overlays</Text>
      <View style={styles.group}>
        {gis.overlays.length === 0 ? (
          <View style={styles.row}>
            <Text style={[T.sub, { flex: 1 }]}>No georeferenced maps yet — PDF, PNG or JPEG.</Text>
          </View>
        ) : (
          gis.overlays.map((o) => (
            <View key={o.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {o.name}
                </Text>
                <Text style={styles.rowDetail}>{`${Math.round(o.opacity * 100)}% opacity`}</Text>
              </View>
              {toggle(o.visible, (v) => gis.updateOverlay(o.id, { visible: v }), `Show ${o.name}`)}
            </View>
          ))
        )}
        <Pressable onPress={() => go('/overlays')} style={styles.linkRow}>
          <Text style={T.link}>Add or manage overlays</Text>
          <Chevron color={C.accentText} />
        </Pressable>
      </View>

      <Text style={styles.section}>Offline basemaps</Text>
      <View style={[styles.group, { marginBottom: 8 }]}>
        {gis.basemaps.map((b) => (
          <View key={b.id} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {b.name}
              </Text>
              <Text style={styles.rowDetail}>MBTiles</Text>
            </View>
            {toggle(b.visible, (v) => gis.updateBasemap(b.id, { visible: v }), `Show ${b.name}`)}
          </View>
        ))}
        <Pressable onPress={() => go('/offline')} style={styles.linkRow}>
          <Text style={T.link}>Offline maps</Text>
          <Chevron color={C.accentText} />
        </Pressable>
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((C) => ({
  section: {
    fontSize: 12,
    fontWeight: '600',
    color: C.ink55,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
    fontFamily: Fonts.sans,
  },
  group: { borderWidth: 1, borderColor: C.line90, borderRadius: Radius.xl, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
  },
  last: { borderBottomWidth: 0 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15, color: C.ink, fontFamily: Fonts.sans },
  rowDetail: { fontSize: 12, color: C.ink55, marginTop: 1, fontFamily: Fonts.sans },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  eye: { padding: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  addBox: { padding: 12, borderTopWidth: 1, borderTopColor: C.line92 },
}));
