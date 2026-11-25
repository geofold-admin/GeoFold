import { detailText, parseDetails } from './details';
import { LABEL_BUILTINS } from './settings';
import type { FormField } from './types';

/**
 * Point labels (spec 1.6): which column of a survey is printed beside its marker.
 *
 * A label source is either one of the built-ins (reference, date, project, note) or a project form
 * field, written `field:<key>` — the GIS idea of "label features by attribute X".
 */

export interface LabelSubject {
  id: string;
  projectId: string;
  capturedAtUtc: string;
  detailsJson: string | null;
}

export function labelText(
  source: string,
  subject: LabelSubject,
  context: { reference?: string | null; projectName: string },
): string | null {
  switch (source) {
    case 'reference':
      return context.reference ?? null;
    case 'date':
      return new Date(subject.capturedAtUtc).toLocaleDateString();
    case 'time':
      return new Date(subject.capturedAtUtc).toLocaleString();
    case 'project':
      return context.projectName;
    case 'catatan': {
      const v = parseDetails(subject.detailsJson).catatan;
      return v == null || v === '' ? null : detailText(v);
    }
    default: {
      if (!source.startsWith('field:')) return null;
      const v = parseDetails(subject.detailsJson)[source.slice(6)];
      return v == null || v === '' ? null : detailText(v);
    }
  }
}

/** Every label source on offer for a project: the built-ins, then that project's form fields. */
export function labelSources(fields: FormField[]): { key: string; label: string }[] {
  return [
    ...LABEL_BUILTINS.map((b) => ({ key: b.key, label: b.label })),
    ...fields.map((f) => ({ key: `field:${f.key}`, label: f.label ?? f.key })),
  ];
}

export function labelSourceName(source: string, fields: FormField[]): string {
  return labelSources(fields).find((s) => s.key === source)?.label ?? source.replace(/^field:/, '');
}
