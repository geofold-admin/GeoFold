import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Close } from '@/components/icons';
import { Button, Chip, ErrorNote, Field, Header, Loading, useT } from '@/components/ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import { ApiError, api, errorMessage } from '@/lib/api';
import { FIELD_TYPES, NOTE_KEY, TYPE_LABEL, parseOptions, toFieldType, toKey, type FieldType } from '@/lib/form';
import { FORM_TEMPLATES, type FormTemplate } from '@/lib/templates';
import { parseSchema, type FormField, type ProjectResponse } from '@/lib/types';

interface DraftField {
  id: number;
  label: string;
  type: FieldType;
  required: boolean;
  /** Select options as typed — one per line or comma separated. */
  options: string;
  /** Kept from an existing schema or a template so a key never changes under saved surveys. */
  key?: string;
}

function draftsFrom(fields: FormField[], startId: number): DraftField[] {
  return fields.map((f, i) => ({
    id: startId + i,
    label: f.label ?? f.key,
    type: toFieldType(f.type),
    required: !!f.required,
    options: (f.options ?? []).join(', '),
    key: f.key,
  }));
}

/**
 * Create a project — or, with `?id=`, edit one — and define the form every survey in it carries.
 *
 * The form is what the capture screen renders (spec 1.3): each field has a type (text, number,
 * whole number, yes/no, date, choice) and can be required, and the capture screen refuses to save
 * until every required field is filled (spec 2.3). A sectoral template (spec 1.9) can seed it.
 */
export default function NewProjectScreen() {
  const styles = useStyles();
  const C = useColors();
  const T = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const editing = !!editId;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<DraftField[]>([]);
  const [nextId, setNextId] = useState(1);
  const [template, setTemplate] = useState<string | null>(null);
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editId) return;
    api<ProjectResponse>(`/api/projects/${editId}`)
      .then((p) => {
        setName(p.name);
        setDescription(p.description ?? '');
        const drafts = draftsFrom(parseSchema(p.formSchema), 1);
        setFields(drafts);
        setNextId(drafts.length + 1);
      })
      .catch((e) => setError(errorMessage(e, 'Could not load the project.')))
      .finally(() => setLoading(false));
  }, [editId]);

  const addField = () => {
    setFields((p) => [...p, { id: nextId, label: '', type: 'text', required: false, options: '' }]);
    setNextId((n) => n + 1);
  };
  const update = (id: number, patch: Partial<DraftField>) =>
    setFields((p) => p.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id: number) => setFields((p) => p.filter((f) => f.id !== id));
  const move = (id: number, delta: -1 | 1) =>
    setFields((p) => {
      const i = p.findIndex((f) => f.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const applyTemplate = (t: FormTemplate) => {
    const apply = () => {
      const drafts = draftsFrom(t.fields, nextId);
      setFields(drafts);
      setNextId(nextId + drafts.length);
      setTemplate(t.id);
      if (!description.trim()) setDescription(`${t.sector} — ${t.name}`);
    };
    if (fields.some((f) => f.label.trim())) {
      Alert.alert('Replace the form?', `The fields so far will be replaced with the "${t.name}" template.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: apply },
      ]);
    } else {
      apply();
    }
  };

  const save = async () => {
    setError(null);

    const named = fields.filter((f) => f.label.trim());
    const schema: FormField[] = named.map((f) => {
      const field: FormField = {
        key: f.key || toKey(f.label),
        label: f.label.trim(),
        type: f.type,
        required: f.required,
      };
      if (f.type === 'select') field.options = parseOptions(f.options);
      return field;
    });

    const keys = schema.map((f) => f.key);
    if (keys.some((k) => !k)) {
      setError('Every field label needs at least one letter or digit.');
      return;
    }
    if (new Set(keys).size !== keys.length) {
      setError('Two fields resolve to the same key. Give them more distinct labels.');
      return;
    }
    if (keys.includes(NOTE_KEY)) {
      setError('"Catatan" is the built-in note on every capture. Pick another label for this field.');
      return;
    }
    const emptyChoice = schema.find((f) => f.type === 'select' && !f.options?.length);
    if (emptyChoice) {
      setError(`"${emptyChoice.label}" is a choice field — give it at least one option.`);
      return;
    }

    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        formSchema: JSON.stringify(schema),
      };
      if (editing) await api(`/api/projects/${editId}`, { method: 'PUT', body });
      else await api('/api/projects', { method: 'POST', body });
      router.back();
    } catch (e) {
      // A quota refusal is a plan limit, not a bug — say so in the words the server used.
      setError(
        e instanceof ApiError && e.isQuota
          ? e.message
          : errorMessage(e, editing ? 'Could not save the project.' : 'Could not create the project.'),
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
        <Header title="Edit project" onBack={() => router.back()} />
        <Loading />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.surface, paddingTop: insets.top }}>
      <Header title={editing ? 'Edit project' : 'New project'} onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled">
        <ErrorNote message={error} />

        <Field
          label="Name"
          required
          value={name}
          onChangeText={setName}
          placeholder="Riverside Dr Culvert Inspection"
          maxLength={200}
        />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="What this project covers"
        />

        {!editing ? (
          <>
            <Text style={[T.section, { marginTop: 12, marginBottom: 6 }]}>Start from a template</Text>
            <Text style={[T.sub, { marginBottom: 12 }]}>
              Standard survey forms by sector. Every field stays editable below.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templates}>
              {FORM_TEMPLATES.map((t) => {
                const active = template === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => applyTemplate(t)}
                    style={[styles.template, active && { borderColor: C.accent, backgroundColor: C.accentTint }]}>
                    <Text style={[styles.templateSector, active && { color: C.accentText }]}>{t.sector}</Text>
                    <Text style={styles.templateName} numberOfLines={2}>
                      {t.name}
                    </Text>
                    <Text style={styles.templateMeta}>{`${t.fields.length} fields`}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        <Text style={[T.section, { marginTop: 18, marginBottom: 6 }]}>Capture form</Text>
        <Text style={[T.sub, { marginBottom: 16 }]}>
          Fields the surveyor fills in for every point. A note field is always included, so leave
          this empty for a photo-and-position survey.
        </Text>

        {fields.map((field, index) => (
          <View key={field.id} style={styles.fieldCard}>
            <View style={styles.fieldHead}>
              <View style={{ flex: 1 }}>
                <Field
                  label={`Field ${index + 1}`}
                  value={field.label}
                  onChangeText={(v) => update(field.id, { label: v, key: editing ? field.key : undefined })}
                  placeholder="Kondisi lokasi"
                />
              </View>
              <View style={styles.fieldTools}>
                <Pressable onPress={() => move(field.id, -1)} hitSlop={6} style={styles.iconBtn} accessibilityLabel="Move up" disabled={index === 0}>
                  <Text style={[styles.arrow, index === 0 && { opacity: 0.3 }]}>↑</Text>
                </Pressable>
                <Pressable
                  onPress={() => move(field.id, 1)}
                  hitSlop={6}
                  style={styles.iconBtn}
                  accessibilityLabel="Move down"
                  disabled={index === fields.length - 1}>
                  <Text style={[styles.arrow, index === fields.length - 1 && { opacity: 0.3 }]}>↓</Text>
                </Pressable>
                <Pressable onPress={() => remove(field.id)} hitSlop={6} style={styles.iconBtn} accessibilityLabel="Remove field">
                  <Close color={C.ink62} size={12} />
                </Pressable>
              </View>
            </View>

            <Text style={[T.sub, { marginBottom: 8 }]}>Type</Text>
            <View style={styles.types}>
              {FIELD_TYPES.map((type) => (
                <Chip
                  key={type}
                  label={TYPE_LABEL[type]}
                  active={field.type === type}
                  onPress={() => update(field.id, { type })}
                  small
                />
              ))}
            </View>

            {field.type === 'select' ? (
              <View style={{ marginTop: 12 }}>
                <Field
                  label="Options"
                  value={field.options}
                  onChangeText={(v) => update(field.id, { options: v })}
                  placeholder="Baik, Rusak ringan, Rusak berat"
                  hint="Separate options with commas or new lines."
                  multiline
                />
                {parseOptions(field.options).length ? (
                  <View style={styles.optionPreview}>
                    {parseOptions(field.options).map((o) => (
                      <View key={o} style={styles.optionChip}>
                        <Text style={styles.optionText}>{o}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.requiredRow}>
              <View style={{ flex: 1 }}>
                <Text style={T.body}>Required</Text>
                <Text style={T.caption}>The capture cannot be saved until this is filled.</Text>
              </View>
              <Switch
                value={field.required}
                onValueChange={(v) => update(field.id, { required: v })}
                trackColor={{ true: C.accent, false: C.line85 }}
                thumbColor="#fff"
              />
            </View>

            {field.label.trim() ? (
              <Text style={styles.keyHint}>key: {field.key || toKey(field.label)}</Text>
            ) : null}
          </View>
        ))}

        <Button title="Add field" variant="outline" onPress={addField} style={{ marginBottom: 24 }} />

        <Button
          title={busy ? (editing ? 'Saving…' : 'Creating…') : editing ? 'Save changes' : 'Create project'}
          onPress={save}
          busy={busy}
          disabled={!name.trim() || busy}
        />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  templates: { gap: 10, paddingRight: 20, paddingBottom: 4 },
  template: {
    width: 150,
    borderWidth: 1.5,
    borderColor: C.line90,
    borderRadius: Radius.lg,
    padding: 12,
    gap: 4,
  },
  templateSector: {
    fontSize: 11,
    fontWeight: '600',
    color: C.ink55,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontFamily: Fonts.sans,
  },
  templateName: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: Fonts.sans },
  templateMeta: { fontSize: 12, color: C.ink55, fontFamily: Fonts.sans },

  fieldCard: {
    borderWidth: 1,
    borderColor: C.line90,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 14,
  },
  fieldHead: { flexDirection: 'row', gap: 6 },
  fieldTools: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  iconBtn: { width: 30, height: 40, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 17, color: C.ink46, fontFamily: Fonts.sans },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  optionPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4 },
  optionChip: { backgroundColor: C.bg95, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  optionText: { fontSize: 12, color: C.ink42, fontFamily: Fonts.sans },
  requiredRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 12 },
  keyHint: { fontSize: 11, color: C.ink62, marginTop: 8, fontFamily: Fonts.mono },
}));
