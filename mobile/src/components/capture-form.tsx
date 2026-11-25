import { useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { PlusIcon } from './icons';
import { Button, Chip, Field, FieldFrame, Input, useT } from './ui';
import { Fonts, Radius, makeStyles, useColors } from '@/constants/theme';
import {
  FIELD_TYPES,
  NOTE_KEY,
  TYPE_LABEL,
  draftToField,
  fieldError,
  fieldType,
  parseOptions,
  todayIso,
  type FieldDraft,
  type FormValues,
} from '@/lib/form';
import { FORM_TEMPLATES, type FormTemplate } from '@/lib/templates';
import type { FormField } from '@/lib/types';

/** 'saved': the project's form on the server has the change. 'queued': it waits on this phone for a connection. */
export type AddFieldOutcome = 'saved' | 'queued';

const EMPTY_DRAFT: FieldDraft = { label: '', type: 'text', required: false, options: '' };

/**
 * A project's capture form, rendered from its schema (spec 1.3).
 *
 * Each type gets a control that suits it rather than a bare text box: choices as chips, yes/no as
 * a switch, a date with a one-tap "Today", numbers with a numeric keypad. Errors show next to each
 * field once it has been touched, or on every field after a save attempt, so the surveyor sees what
 * is missing where it is missing (spec 2.3).
 *
 * With `onAddFields`, the surveyor can also shape the project's form from here, with the same
 * options as creating a project: a new field of any type, a standard set from a sectoral template,
 * and one more option on a choice field. This is for when the site shows something the form didn't
 * anticipate. Reordering and removing fields stay in the project editor, behind `onEditForm`.
 */
export function CaptureForm({
  fields,
  values,
  onChange,
  note,
  onNoteChange,
  showAllErrors,
  touched,
  onTouch,
  onAddFields,
  onEditForm,
  onRepeatLast,
}: {
  fields: FormField[];
  values: FormValues;
  onChange: (key: string, value: string | boolean) => void;
  note: string;
  onNoteChange: (v: string) => void;
  showAllErrors: boolean;
  touched: Record<string, boolean>;
  onTouch: (key: string) => void;
  onAddFields?: (fields: FormField[]) => Promise<AddFieldOutcome>;
  /** Opens the project's form editor, where fields can be renamed, reordered and removed. */
  onEditForm?: () => void;
  /** Present when the last capture in this project left values worth carrying to this one. */
  onRepeatLast?: () => void;
}) {
  const styles = useStyles();
  const C = useColors();
  const T = useT();

  const [mode, setMode] = useState<'idle' | 'field' | 'template'>('idle');
  const [draft, setDraft] = useState<FieldDraft>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  // The choice field a new option is being typed for, and the option so far.
  const [optionFor, setOptionFor] = useState<string | null>(null);
  const [optionText, setOptionText] = useState('');
  const [optionError, setOptionError] = useState<string | null>(null);

  const patch = (next: Partial<FieldDraft>) => {
    setDraft((d) => ({ ...d, ...next }));
    setDraftError(null);
  };

  const closeBuilder = () => {
    setMode('idle');
    setDraft(EMPTY_DRAFT);
    setDraftError(null);
  };

  const closeOption = () => {
    setOptionFor(null);
    setOptionText('');
    setOptionError(null);
  };

  const submitField = async () => {
    if (!onAddFields || adding) return;
    const result = draftToField(draft, [...fields.map((f) => f.key), NOTE_KEY]);
    if ('error' in result) {
      setDraftError(result.error);
      return;
    }
    setAdding(true);
    try {
      const outcome = await onAddFields([result.field]);
      const name = result.field.label ?? result.field.key;
      setAdded(
        outcome === 'saved'
          ? `"${name}" is now part of this project's form.`
          : `"${name}" added. It joins the project's form when you're back online.`,
      );
      closeBuilder();
    } finally {
      setAdding(false);
    }
  };

  const submitTemplate = (template: FormTemplate) => {
    if (!onAddFields || adding) return;
    // A key the form already uses keeps its own field: two forms can both say "kondisi" and mean
    // different lists, and overwriting the project's would rewrite what its saved captures mean.
    const taken = new Set([...fields.map((f) => f.key), NOTE_KEY]);
    const fresh = template.fields.filter((f) => !taken.has(f.key));
    if (!fresh.length) {
      setAdded(`This form already has every field of "${template.name}".`);
      closeBuilder();
      return;
    }
    const skipped = template.fields.length - fresh.length;
    const apply = async () => {
      setAdding(true);
      try {
        const outcome = await onAddFields(fresh);
        const count = `${fresh.length} field${fresh.length === 1 ? '' : 's'} from "${template.name}"`;
        setAdded(
          outcome === 'saved'
            ? `${count} added to this project's form.`
            : `${count} added. They join the project's form when you're back online.`,
        );
        closeBuilder();
      } finally {
        setAdding(false);
      }
    };
    Alert.alert(
      `Add "${template.name}"?`,
      `${fresh.map((f) => f.label ?? f.key).join(', ')}.` +
        (skipped ? `\n\n${skipped} field${skipped === 1 ? '' : 's'} this form already has will be left as they are.` : '') +
        '\n\nEvery capture in this project will ask for them.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add fields', onPress: () => void apply() },
      ],
    );
  };

  const submitOption = async (field: FormField) => {
    if (!onAddFields || adding) return;
    const option = optionText.trim();
    if (!option) {
      setOptionError('Type the option first.');
      return;
    }
    // Commas and line breaks separate options wherever a list of them is typed, so one here would
    // split into two the next time the form is edited.
    if (/[,;\n]/.test(option)) {
      setOptionError('An option cannot contain a comma or a semicolon.');
      return;
    }
    const known = (field.options ?? []).find((o) => o.toLowerCase() === option.toLowerCase());
    if (known) {
      // Already on the list, perhaps scrolled out of sight: choose it rather than refuse.
      onTouch(field.key);
      onChange(field.key, known);
      closeOption();
      return;
    }
    setAdding(true);
    try {
      // Only the new option travels; merging keeps the field's own definition and list.
      await onAddFields([{ ...field, options: [option] }]);
      onTouch(field.key);
      onChange(field.key, option);
      closeOption();
    } finally {
      setAdding(false);
    }
  };

  const options = draft.type === 'select' ? parseOptions(draft.options) : [];

  return (
    <View>
      {onRepeatLast ? (
        <Pressable
          onPress={onRepeatLast}
          accessibilityRole="button"
          style={({ pressed }) => [styles.repeat, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={styles.repeatText}>Same as the last point</Text>
          <Text style={styles.repeatHint}>Fills the form with the previous capture&apos;s values</Text>
        </Pressable>
      ) : null}

      {fields.map((field) => {
        const type = fieldType(field);
        const label = field.label ?? field.key;
        const value = values[field.key];
        const error = showAllErrors || touched[field.key] ? fieldError(field, value) : null;

        if (type === 'boolean') {
          return (
            <View key={field.key} style={styles.switchRow}>
              <Text style={[T.body, { flex: 1 }]}>
                {label}
                {field.required ? <Text style={{ color: C.danger }}> *</Text> : null}
              </Text>
              <Text style={styles.switchValue}>{value ? 'Ya' : 'Tidak'}</Text>
              <Switch
                value={Boolean(value)}
                onValueChange={(v) => onChange(field.key, v)}
                trackColor={{ true: C.accent, false: C.line85 }}
                thumbColor="#fff"
              />
            </View>
          );
        }

        if (type === 'select' && field.options?.length) {
          const typing = optionFor === field.key;
          return (
            <FieldFrame key={field.key} label={label} required={field.required} error={error}>
              <View style={styles.options}>
                {field.options.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    small
                    active={value === option}
                    onPress={() => {
                      onTouch(field.key);
                      // Tapping the chosen option again clears it — a choice must be undoable.
                      onChange(field.key, value === option ? '' : option);
                    }}
                  />
                ))}
                {onAddFields && !typing ? (
                  <Pressable
                    onPress={() => {
                      setOptionFor(field.key);
                      setOptionText('');
                      setOptionError(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Add an option to ${label}`}
                    style={({ pressed }) => [styles.otherChip, { opacity: pressed ? 0.7 : 1 }]}>
                    <PlusIcon color={C.accentText} size={10} />
                    <Text style={styles.otherText}>Other</Text>
                  </Pressable>
                ) : null}
              </View>
              {typing ? (
                <View style={styles.optionAdder}>
                  <View style={styles.optionRow}>
                    <Input
                      value={optionText}
                      onChangeText={(v) => {
                        setOptionText(v);
                        setOptionError(null);
                      }}
                      placeholder="New option"
                      autoFocus
                      maxLength={60}
                      returnKeyType="done"
                      onSubmitEditing={() => void submitOption(field)}
                      style={{ flex: 1 }}
                    />
                    <Button title="Add" size="sm" busy={adding} onPress={() => void submitOption(field)} />
                  </View>
                  <View style={styles.optionFoot}>
                    <Text style={[styles.optionHint, optionError ? { color: C.danger } : null]}>
                      {optionError ?? 'Added to the list for every capture in this project.'}
                    </Text>
                    <Pressable onPress={closeOption} hitSlop={8} accessibilityRole="button">
                      <Text style={styles.optionCancel}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </FieldFrame>
          );
        }

        if (type === 'date') {
          return (
            <View key={field.key}>
              <Field
                label={label}
                required={field.required}
                value={String(value ?? '')}
                onChangeText={(v) => onChange(field.key, v)}
                onBlur={() => onTouch(field.key)}
                keyboardType="numbers-and-punctuation"
                placeholder="YYYY-MM-DD"
                error={error}
              />
              <Pressable
                onPress={() => {
                  onTouch(field.key);
                  onChange(field.key, todayIso());
                }}
                style={styles.today}
                hitSlop={6}>
                <Text style={styles.todayText}>Today</Text>
              </Pressable>
            </View>
          );
        }

        return (
          <Field
            key={field.key}
            label={label}
            required={field.required}
            value={String(value ?? '')}
            onChangeText={(v) => onChange(field.key, v)}
            onBlur={() => onTouch(field.key)}
            keyboardType={type === 'number' ? 'decimal-pad' : type === 'integer' ? 'number-pad' : 'default'}
            error={error}
          />
        );
      })}

      {added ? <Text style={styles.addedNote}>{added}</Text> : null}

      {onAddFields && mode === 'field' ? (
        <View style={styles.builder}>
          <Text style={styles.builderTitle}>New field</Text>
          <Text style={[T.caption, { marginBottom: 12, lineHeight: 17 }]}>
            {"Added to this project's form, so every capture in the project asks for it."}
          </Text>
          <Field
            label="Name"
            value={draft.label}
            onChangeText={(label) => patch({ label })}
            placeholder="Kedalaman (m)"
            autoFocus
            maxLength={80}
          />
          <Text style={[T.sub, { marginBottom: 8 }]}>Type</Text>
          <View style={styles.options}>
            {FIELD_TYPES.map((type) => (
              <Chip key={type} label={TYPE_LABEL[type]} small active={draft.type === type} onPress={() => patch({ type })} />
            ))}
          </View>
          {draft.type === 'select' ? (
            <View style={{ marginTop: 12 }}>
              <Field
                label="Options"
                value={draft.options}
                onChangeText={(v) => patch({ options: v })}
                placeholder="Baik, Rusak ringan, Rusak berat"
                hint={
                  options.length
                    ? `${options.length} option${options.length === 1 ? '' : 's'}: ${options.join(' · ')}`
                    : 'Separate options with commas or new lines.'
                }
                multiline
              />
            </View>
          ) : null}
          <View style={styles.requiredRow}>
            <View style={{ flex: 1 }}>
              <Text style={T.body}>Required</Text>
              <Text style={T.caption}>{"A capture can't be saved until it's filled."}</Text>
            </View>
            <Switch
              value={draft.required}
              onValueChange={(required) => patch({ required })}
              trackColor={{ true: C.accent, false: C.line85 }}
              thumbColor="#fff"
            />
          </View>
          {draftError ? <Text style={styles.builderError}>{draftError}</Text> : null}
          <View style={styles.builderActions}>
            <Button title="Cancel" variant="outline" size="sm" onPress={closeBuilder} style={{ flex: 1 }} />
            <Button title="Add field" size="sm" busy={adding} onPress={() => void submitField()} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}

      {onAddFields && mode === 'template' ? (
        <View style={styles.builder}>
          <Text style={styles.builderTitle}>Add from a template</Text>
          <Text style={[T.caption, { marginBottom: 12, lineHeight: 17 }]}>
            Standard survey forms by sector. The fields join the ones this project already has.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.templates}>
            {FORM_TEMPLATES.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => submitTemplate(t)}
                disabled={adding}
                accessibilityRole="button"
                accessibilityLabel={`Add the ${t.name} template`}
                style={({ pressed }) => [styles.template, { opacity: pressed || adding ? 0.6 : 1 }]}>
                <Text style={styles.templateSector}>{t.sector}</Text>
                <Text style={styles.templateName} numberOfLines={2}>
                  {t.name}
                </Text>
                <Text style={styles.templateMeta}>{`${t.fields.length} fields`}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.builderActions}>
            <Button title="Cancel" variant="outline" size="sm" onPress={closeBuilder} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}

      {onAddFields && mode === 'idle' ? (
        <View style={styles.addBlock}>
          <View style={styles.addRow}>
            <Pressable
              onPress={() => {
                setAdded(null);
                setMode('field');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addField, { opacity: pressed ? 0.7 : 1 }]}>
              <PlusIcon color={C.accentText} size={14} />
              <Text style={styles.addFieldText}>Add a field</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setAdded(null);
                setMode('template');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addField, { opacity: pressed ? 0.7 : 1 }]}>
              <PlusIcon color={C.accentText} size={14} />
              <Text style={styles.addFieldText}>From template</Text>
            </Pressable>
          </View>
          {onEditForm && fields.length > 0 ? (
            <Pressable onPress={onEditForm} hitSlop={6} accessibilityRole="button" style={styles.editForm}>
              <Text style={styles.editFormText}>Rename, reorder or remove fields</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Field
        label="Catatan"
        value={note}
        onChangeText={onNoteChange}
        multiline
        placeholder="Deskripsi lokasi / kondisi / keterangan…"
      />
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    paddingVertical: 4,
  },
  switchValue: { fontSize: 13, color: C.ink55, fontFamily: Fonts.sans },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  today: {
    position: 'absolute',
    right: 10,
    top: 30,
    backgroundColor: C.bg95,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  todayText: { fontSize: 12, fontWeight: '600', color: C.accentText, fontFamily: Fonts.sans },

  repeat: {
    backgroundColor: C.accentTint,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  repeatText: { fontSize: 14, fontWeight: '600', color: C.accentText, fontFamily: Fonts.sans },
  repeatHint: { fontSize: 12, color: C.accentText, opacity: 0.8, marginTop: 2, fontFamily: Fonts.sans },

  // Dashed like "Add a field": a slot that isn't on the list yet, set apart from the real options.
  otherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line80,
    borderRadius: Radius.pill,
  },
  otherText: { fontSize: 12, fontWeight: '500', color: C.accentText, fontFamily: Fonts.sans },
  optionAdder: { marginTop: 10 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionFoot: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 6 },
  optionHint: { flex: 1, fontSize: 12, color: C.ink55, fontFamily: Fonts.sans },
  optionCancel: { fontSize: 12, fontWeight: '600', color: C.accentText, fontFamily: Fonts.sans },

  // Dashed like "New project": an open slot in the form, not a stray link.
  addBlock: { marginBottom: 14 },
  addRow: { flexDirection: 'row', gap: 8 },
  addField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line85,
    borderRadius: Radius.md,
  },
  addFieldText: { fontSize: 14, fontWeight: '500', color: C.accentText, fontFamily: Fonts.sans },
  editForm: { alignSelf: 'center', paddingTop: 10 },
  editFormText: { fontSize: 12, fontWeight: '500', color: C.ink55, fontFamily: Fonts.sans, textDecorationLine: 'underline' },
  addedNote: { fontSize: 12, color: C.ok, marginBottom: 10, fontFamily: Fonts.sans },

  builder: {
    borderWidth: 1,
    borderColor: C.line90,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 14,
    backgroundColor: C.raised,
  },
  builderTitle: { fontSize: 15, fontWeight: '600', color: C.ink, marginBottom: 2, fontFamily: Fonts.sans },
  builderError: { fontSize: 12, color: C.danger, marginTop: 10, fontFamily: Fonts.sans },
  builderActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  requiredRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 12 },

  templates: { gap: 8, paddingRight: 4 },
  template: {
    width: 140,
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
}));
