import { ApiError, api } from './api';
import { readJsonSync, writeJsonSync } from './kv';
import { parseSchema, type FormField, type ProjectResponse } from './types';

/**
 * Fields added to a project's form from the capture screen, out in the field.
 *
 * A new field is written to the phone first and sent to the project afterwards, so adding one never
 * needs a signal. Offline, it appears at once on every capture in that project on this phone. At
 * the next sync it joins the project's form, which every device, the web portal and the exports
 * read. Values captured in the meantime are stored under the field's key either way. The server
 * keeps keys that are outside a project's schema, so nothing is lost if the surveys sync before
 * the field does.
 */

const KEY = 'pending-fields';

/** Project id → fields added on this phone that the server's copy of the form does not have yet. */
type Store = Record<string, FormField[]>;

function read(): Store {
  return readJsonSync<Store>(KEY) ?? {};
}

function write(store: Store): void {
  writeJsonSync(KEY, store);
}

export function pendingFields(projectId: string): FormField[] {
  return read()[projectId] ?? [];
}

/**
 * The project's own fields in their order, followed by any added on this phone that it doesn't have
 * yet. A choice field both sides know keeps the project's definition and gains whatever options the
 * phone added to it — the site had a case the list didn't cover — after the project's own.
 */
export function mergeFields(schema: FormField[], extra: FormField[]): FormField[] {
  const out = [...schema];
  const index = new Map(out.map((f, i) => [f.key, i]));
  for (const field of extra) {
    const at = index.get(field.key);
    if (at === undefined) {
      index.set(field.key, out.length);
      out.push(field);
      continue;
    }
    const known = out[at];
    if (!isChoice(known) || !isChoice(field)) continue;
    const options = known.options ?? [];
    const fresh = (field.options ?? []).filter((o) => !options.includes(o));
    if (fresh.length) out[at] = { ...known, options: [...options, ...fresh] };
  }
  return out;
}

const isChoice = (field: FormField) => field.type.toLowerCase() === 'select';

/** True when merging changed anything — a field more, or an option more on a field. */
function differs(a: FormField[], b: FormField[]): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/**
 * Adds `fields` to the project's form — one from the field builder, several from a template, or an
 * existing choice field carrying a new option. Resolves to the updated project once the server has
 * them, or to null while they wait on this phone for a connection.
 */
export async function addProjectFields(projectId: string, fields: FormField[]): Promise<ProjectResponse | null> {
  const store = read();
  store[projectId] = mergeFields(store[projectId] ?? [], fields);
  write(store);
  try {
    return await pushProject(projectId);
  } catch {
    return null;
  }
}

/** Sends every waiting field to its project. The sync loop runs this whenever there is a connection. */
export async function pushPendingFields(): Promise<void> {
  for (const projectId of Object.keys(read())) {
    try {
      await pushProject(projectId);
    } catch {
      // Still queued; the next sync tries again.
    }
  }
}

function forget(projectId: string, keys: Set<string>): void {
  const store = read();
  const left = (store[projectId] ?? []).filter((f) => !keys.has(f.key));
  if (left.length) store[projectId] = left;
  else delete store[projectId];
  write(store);
}

async function pushProject(projectId: string): Promise<ProjectResponse | null> {
  const waiting = pendingFields(projectId);
  if (!waiting.length) return null;
  const sent = new Set(waiting.map((f) => f.key));

  let project: ProjectResponse;
  try {
    // Always the server's current form, never the copy saved on the phone. Merging into a stale
    // copy would restore fields that someone has removed since.
    project = await api<ProjectResponse>(`/api/projects/${projectId}`, { cache: 'none' });
  } catch (e) {
    // The project is gone, so there is no form to add the fields to. Their values stay on the surveys.
    if (e instanceof ApiError && e.status === 404) forget(projectId, sent);
    throw e;
  }

  const schema = parseSchema(project.formSchema);
  const merged = mergeFields(schema, waiting);
  const updated =
    differs(merged, schema)
      ? await api<ProjectResponse>(`/api/projects/${projectId}`, {
          method: 'PUT',
          body: { name: project.name, description: project.description, formSchema: JSON.stringify(merged) },
        })
      : project;

  // Forget only the fields that were sent; one added while this was in flight stays queued.
  forget(projectId, sent);
  // Refresh the copies the capture screen reads offline, so the new field is in them too.
  void api(`/api/projects/${projectId}`).catch(() => {});
  void api('/api/projects').catch(() => {});
  return updated;
}
