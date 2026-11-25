import type { FormField } from './types';

/**
 * Client-side validation of a project form (spec 1.3 / 2.3).
 *
 * The server validates on upload as well (`next/src/lib/validation.ts`), but by then the surveyor
 * may have left the site — a missing required field has to be caught while they are still standing
 * at the point. The rules here mirror the server's so nothing passes on the phone and then fails on
 * sync: required means present and not blank; number and integer are numeric; date parses; a
 * select value is one of its options.
 */

export type FormValues = Record<string, string | boolean>;

/* ── building a form ────────────────────────────────────────────────────── */

/** The field types the server's FormSchemaValidator accepts. A project with any other type is rejected on save. */
export const FIELD_TYPES = ['text', 'number', 'integer', 'boolean', 'date', 'select'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const TYPE_LABEL: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  integer: 'Whole number',
  boolean: 'Yes / no',
  date: 'Date',
  select: 'Choice',
};

/** The key the free-text note on every capture is stored under. A form field cannot use it. */
export const NOTE_KEY = 'catatan';

/** "Kondisi lokasi" -> "kondisi_lokasi". Keys are what end up in the survey's JSON. */
export function toKey(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Choice options as typed: one per line, or separated by commas or semicolons. Duplicates are dropped. */
export function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[\n,;]/)
    .map((o) => o.trim())
    .filter((o) => o && !seen.has(o) && (seen.add(o), true));
}

export function toFieldType(type: string): FieldType {
  const t = type.toLowerCase();
  if (t === 'string') return 'text';
  if (t === 'bool') return 'boolean';
  return (FIELD_TYPES as readonly string[]).includes(t) ? (t as FieldType) : 'text';
}

export interface FieldDraft {
  label: string;
  type: FieldType;
  required: boolean;
  /** Choice options as typed. */
  options: string;
}

/**
 * Turns one field typed into a field builder into a schema field, or explains why it can't be one.
 * The rules match saving a project: the label must yield a key, the key must be free in the form
 * and must not be the note's, and a choice field needs at least one option.
 */
export function draftToField(draft: FieldDraft, takenKeys: Iterable<string>): { field: FormField } | { error: string } {
  const label = draft.label.trim();
  if (!label) return { error: 'Give the field a name.' };
  const key = toKey(label);
  if (!key) return { error: 'The name needs at least one letter or digit.' };
  if (key === NOTE_KEY) return { error: '"Catatan" is the note every capture already has. Pick another name.' };
  if (new Set(takenKeys).has(key)) return { error: 'This form already has a field with that name.' };

  const field: FormField = { key, label, type: draft.type, required: draft.required };
  if (draft.type === 'select') {
    field.options = parseOptions(draft.options);
    if (!field.options.length) return { error: 'A choice field needs at least one option.' };
  }
  return { field };
}

/* ── filling a form ─────────────────────────────────────────────────────── */

export function fieldType(field: FormField): string {
  const t = field.type.toLowerCase();
  if (t === 'string') return 'text';
  if (t === 'bool') return 'boolean';
  return t;
}

/** A boolean always has a value — an untouched switch is "no", not "missing". */
export function isFilled(field: FormField, value: string | boolean | undefined): boolean {
  if (fieldType(field) === 'boolean') return true;
  return value !== undefined && String(value).trim() !== '';
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar-valid YYYY-MM-DD: 2026-02-30 matches the pattern but is not a date. */
export function isIsoDate(text: string): boolean {
  if (!DATE.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function todayIso(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The error for one field, or null when it is acceptable. */
export function fieldError(field: FormField, value: string | boolean | undefined): string | null {
  const type = fieldType(field);
  if (!isFilled(field, value)) return field.required ? 'Required' : null;
  if (type === 'boolean') return null;

  const text = String(value).trim();
  switch (type) {
    case 'number':
      return Number.isFinite(Number(text.replace(',', '.'))) ? null : 'Enter a number, e.g. 12.5';
    case 'integer':
      return /^-?\d+$/.test(text) ? null : 'Enter a whole number';
    case 'date':
      return isIsoDate(text) ? null : 'Use the format YYYY-MM-DD';
    case 'select':
      return field.options?.length && !field.options.includes(text) ? 'Pick one of the options' : null;
    default:
      return null;
  }
}

export function formErrors(fields: FormField[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const error = fieldError(field, values[field.key]);
    if (error) errors[field.key] = error;
  }
  return errors;
}

/** Required fields that still have no value — what the save button is waiting on. */
export function missingRequired(fields: FormField[], values: FormValues): FormField[] {
  return fields.filter((f) => f.required && !isFilled(f, values[f.key]));
}
