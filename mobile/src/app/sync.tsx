import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chevron, Cloud } from '@/components/icons';
import { Button, Card, Header, StatusPill, useT } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { api } from '@/lib/api';
import { formatAccuracy, formatCoords } from '@/lib/capture';
import { API_BASE_URL, DEMO_MODE } from '@/lib/config';
import { labeledValues, parseDetails } from '@/lib/details';
import { itemPhotos, removeItem, type OutboxItem } from '@/lib/outbox';
import { useSync } from '@/lib/sync-context';
import { parseSchema, type FormField, type ProjectResponse } from '@/lib/types';

export default function SyncScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const { items, pending, failed, syncing, online, syncNow, refresh } = useSync();
  // The capture opened to check what it holds before it leaves the phone.
  const [open, setOpen] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<Record<string, FormField[]>>({});

  const target = DEMO_MODE ? 'sample data (no server)' : API_BASE_URL.replace(/^https?:\/\//, '');

  // Forms, so an opened capture reads "Kondisi: Rusak" rather than "kondisi: Rusak". The saved
  // copy of the project list answers this offline, which is when the queue is longest.
  useEffect(() => {
    api<ProjectResponse[]>('/api/projects')
      .then((projects) => setSchemas(Object.fromEntries(projects.map((p) => [p.id, parseSchema(p.formSchema)]))))
      .catch(() => {});
  }, []);

  // Newest first: the capture a surveyor wants to check is the one they just took.
  const queue = useMemo(() => [...items].sort((a, b) => b.createdAt - a.createdAt), [items]);

  const discard = (item: OutboxItem) => {
    const count = itemPhotos(item).length;
    Alert.alert(
      'Discard this capture?',
      `It has not been uploaded, so the point${count ? ` and its ${count === 1 ? 'photo' : `${count} photos`}` : ''} will be gone for good.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setOpen(null);
            void removeItem(item.id).then(refresh);
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <Header title="Sync & backup" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <Card style={{ marginBottom: 24 }}>
          <View style={styles.connected}>
            <View style={styles.cloudBadge}>
              <Cloud color={C.accent} />
            </View>
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text style={styles.connectedTitle}>
                {online ? 'Connected to GeoFold' : 'Offline'}
              </Text>
              <Text style={T.caption} numberOfLines={1}>
                {target}
              </Text>
            </View>
          </View>

          <Text style={[T.caption, { marginBottom: 14 }]}>
            {pending === 0
              ? 'Everything on this device has been uploaded.'
              : `${pending} capture${pending === 1 ? '' : 's'} waiting${failed > 0 ? ` · ${failed} failed` : ''}`}
          </Text>

          <Button
            title={syncing ? 'Syncing…' : 'Sync now'}
            onPress={() => void syncNow()}
            busy={syncing}
            disabled={pending === 0 || !online}
          />
        </Card>

        <Text style={[T.section, { marginBottom: 12 }]}>Pending uploads · {pending}</Text>

        {queue.length === 0 ? (
          <Text style={T.sub}>Nothing queued.</Text>
        ) : (
          queue.map((item) => {
            const photos = itemPhotos(item);
            const expanded = open === item.id;
            const values = expanded
              ? labeledValues(parseDetails(item.detailsJson), schemas[item.projectId] ?? []).filter((v) => v.value !== '')
              : [];
            return (
              <View key={item.id} style={styles.entry}>
                <Pressable
                  onPress={() => setOpen(expanded ? null : item.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${item.projectName}, captured ${new Date(item.capturedAtUtc).toLocaleString()}`}
                  style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
                  {photos.length ? (
                    <View>
                      <Image source={{ uri: photos[0].uri }} style={styles.thumb} contentFit="cover" />
                      {photos.length > 1 ? (
                        <View style={styles.thumbCount}>
                          <Text style={styles.thumbCountText}>{photos.length}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: C.bg95 }]} />
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.projectName}
                    </Text>
                    <Text style={T.caption} numberOfLines={1}>
                      {new Date(item.capturedAtUtc).toLocaleString()}
                    </Text>
                    {item.error && !expanded ? (
                      <Text style={[T.caption, { color: C.danger }]} numberOfLines={2}>
                        {item.error}
                      </Text>
                    ) : null}
                  </View>
                  <StatusPill
                    status={item.status === 'error' ? 'failed' : item.status === 'syncing' ? 'syncing' : 'pending'}
                  />
                  <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
                    <Chevron />
                  </View>
                </Pressable>

                {expanded ? (
                  <View style={styles.detail}>
                    {photos.length ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {photos.map((photo) => (
                          <Image key={photo.id} source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
                        ))}
                      </ScrollView>
                    ) : null}

                    <Text style={[T.mono, { marginTop: photos.length ? 12 : 0 }]}>
                      {`${formatCoords(item.latitude, item.longitude)} ${formatAccuracy(item.accuracyMeters)}`.trim()}
                    </Text>

                    {values.length ? (
                      <View style={{ marginTop: 12, gap: 8 }}>
                        {values.map((v) => (
                          <View key={v.key}>
                            <Text style={styles.fieldLabel}>{v.label}</Text>
                            <Text style={T.body}>{v.value}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={[T.caption, { marginTop: 10 }]}>No field values were recorded.</Text>
                    )}

                    {item.error ? (
                      <Text style={[T.caption, { color: C.danger, marginTop: 12, lineHeight: 17 }]}>{item.error}</Text>
                    ) : null}

                    <View style={styles.detailActions}>
                      {item.status === 'error' ? (
                        <Button title="Retry" size="sm" variant="outline" onPress={() => void syncNow()} style={{ flex: 1 }} />
                      ) : null}
                      <Button
                        title="Discard"
                        size="sm"
                        variant="danger"
                        // Mid-upload the server may already hold the point; discarding then would
                        // leave it there with no photo and nothing on the phone to say why.
                        disabled={item.status === 'syncing'}
                        onPress={() => discard(item)}
                        style={{ flex: 1 }}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        <Text style={[T.caption, { marginTop: 24, lineHeight: 19 }]}>
          Photos are captured offline and queued automatically. Nothing leaves your device until it
          is synced. Tap a capture to check it, or to discard one taken by mistake.
        </Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  connected: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  cloudBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedTitle: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: Fonts.sans },
  entry: { borderBottomWidth: 1, borderBottomColor: C.line92 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  thumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: C.hatchA },
  thumbCount: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.surface,
  },
  thumbCountText: { fontSize: 10, fontWeight: '600', color: C.surface, fontFamily: Fonts.sans },
  rowTitle: { fontSize: 14, color: C.ink, marginBottom: 2, fontFamily: Fonts.sans },
  detail: { paddingBottom: 16 },
  photo: { width: 132, height: 132, borderRadius: Radius.md, backgroundColor: C.hatchA },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.ink62,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
    fontFamily: Fonts.sans,
  },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
}));
