import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chevron, LineIcon, PointIcon, PolygonIcon } from '@/components/icons';
import { Button, Empty, Field, FieldFrame, Header, useT } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { boundsOf, formatArea, formatLength, type Position } from '@/lib/geometry';
import { LAYER_COLORS, useGis } from '@/lib/gis';
import { useSettings } from '@/lib/settings';
import { requestMapFocus } from '@/lib/viewport';

/** One layer (spec 1.8): its name, colour and visibility, and the features filed in it. */
export default function LayerScreen() {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gis = useGis();
  const { settings } = useSettings();
  const layer = gis.layers.find((l) => l.id === id) ?? null;
  const [name, setName] = useState(layer?.name ?? '');

  const features = useMemo(
    () => gis.features.filter((f) => f.layerId === id).sort((a, b) => b.createdAt - a.createdAt),
    [gis.features, id],
  );

  if (!layer) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
        <Header title="Layer" onBack={() => router.back()} />
        <View style={{ padding: 20 }}>
          <Empty>This layer no longer exists.</Empty>
        </View>
      </View>
    );
  }

  const icon = { point: PointIcon, line: LineIcon, polygon: PolygonIcon };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <Header title="Layer" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          onBlur={() => name.trim() && gis.updateLayer(layer.id, { name: name.trim() })}
          onSubmitEditing={() => name.trim() && gis.updateLayer(layer.id, { name: name.trim() })}
          hint={layer.builtin ? 'A built-in category layer — it can be renamed and recoloured, not deleted.' : undefined}
        />

        <FieldFrame label="Colour">
          <View style={styles.swatches}>
            {LAYER_COLORS.map((color) => (
              <Pressable
                key={color}
                onPress={() => gis.updateLayer(layer.id, { color })}
                accessibilityLabel={`Colour ${color}`}
                style={[styles.swatch, { backgroundColor: color }, layer.color === color && styles.swatchActive]}
              />
            ))}
          </View>
        </FieldFrame>

        <View style={styles.visibleRow}>
          <Text style={[T.body, { flex: 1 }]}>Shown on the map</Text>
          <Switch
            value={layer.visible}
            onValueChange={(v) => gis.updateLayer(layer.id, { visible: v })}
            trackColor={{ true: C.accent, false: C.line85 }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.sectionHead}>
          <Text style={T.section}>Features</Text>
          <Text style={T.sub}>{features.length}</Text>
        </View>
        {features.length === 0 ? (
          <Text style={[T.sub, { marginBottom: 16 }]}>
            None yet. Draw one with the map’s measure tool, or import a shapefile into this layer.
          </Text>
        ) : (
          features.map((f) => {
            const Icon = icon[f.kind];
            const measure =
              f.kind === 'line'
                ? formatLength(Number(f.attributes.length_m ?? 0), settings.lengthUnit)
                : f.kind === 'polygon'
                  ? formatArea(Number(f.attributes.area_m2 ?? 0), settings.areaUnit)
                  : `${Number(f.attributes.lat ?? 0).toFixed(5)}, ${Number(f.attributes.lon ?? 0).toFixed(5)}`;
            return (
              <Pressable
                key={f.id}
                onPress={() => router.push(`/feature/${f.id}`)}
                style={({ pressed }) => [styles.featureRow, { opacity: pressed ? 0.6 : 1 }]}>
                <Icon color={layer.color} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={T.body} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text style={T.caption}>{measure}</Text>
                </View>
                <Chevron />
              </Pressable>
            );
          })
        )}

        <View style={{ gap: 10, marginTop: 18 }}>
          {features.length ? (
            <Button
              title="Show layer on map"
              variant="outline"
              onPress={() => {
                const b = boundsOf(features.flatMap((f) => f.coordinates as Position[]));
                if (b) requestMapFocus({ kind: 'bounds', bounds: b });
                if (!layer.visible) gis.updateLayer(layer.id, { visible: true });
                router.navigate('/(tabs)');
              }}
            />
          ) : null}
          {!layer.builtin ? (
            <Button
              title="Delete layer"
              variant="danger"
              onPress={() =>
                Alert.alert(
                  'Delete layer?',
                  features.length
                    ? `Its ${features.length} feature(s) move to "Umum" rather than being deleted.`
                    : 'The layer is empty.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        gis.deleteLayer(layer.id);
                        router.back();
                      },
                    },
                  ],
                )
              }
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: 'transparent' },
  swatchActive: { borderColor: C.ink },
  visibleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.line92,
    marginBottom: 18,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line92,
  },
}));
