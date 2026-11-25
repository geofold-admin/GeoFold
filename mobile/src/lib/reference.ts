import type { SurveyDetail } from './types';

// A short, readable code per survey — "KAMPUNG-DURIAN-001" — numbered by capture order within a
// project. Shown in Records instead of the UUID. Port of `next/src/lib/reference.ts`, and it must
// stay in step with it: the same survey has to carry the same reference on phone and on desktop.

export function slugifyProject(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug || 'PROJECT';
}

/** Only the fields the numbering needs, so a map feature or an outbox item can be numbered too. */
type Referenceable = Pick<SurveyDetail, 'id' | 'projectId' | 'capturedAtUtc'>;

export function buildReferences(
  surveys: Referenceable[],
  projectName: (id: string) => string,
): Map<string, string> {
  const byProject = new Map<string, Referenceable[]>();
  for (const survey of surveys) {
    const bucket = byProject.get(survey.projectId) ?? [];
    bucket.push(survey);
    byProject.set(survey.projectId, bucket);
  }

  const references = new Map<string, string>();
  for (const [projectId, bucket] of byProject) {
    const slug = slugifyProject(projectName(projectId));
    [...bucket]
      .sort((a, b) => a.capturedAtUtc.localeCompare(b.capturedAtUtc))
      .forEach((survey, index) =>
        references.set(survey.id, `${slug}-${String(index + 1).padStart(3, '0')}`),
      );
  }

  return references;
}
