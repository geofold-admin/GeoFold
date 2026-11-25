import { Directory, File, Paths } from 'expo-file-system';

import { api } from './api';
import { utf8Encode } from './bytes';
import { parseDetails } from './details';
import type { Position } from './geometry';
import type { GisFeature, GisLayer } from './gis';
import type { OutboxItem } from './outbox';
import { buildReferences } from './reference';
import {
  groupShapefiles,
  readShapefileSet,
  writeShapefile,
  type AttributeValue,
  type ImportResult,
  type ShapeKind,
  type ShapeRecord,
} from './shapefile';
import type { TrackMeta, TrackPoint } from './tracker';
import type { ProjectResponse, SurveyDetail } from './types';
import { parseSchema } from './types';
import { unzip, zip, type ZipEntry } from './zip';

/**
 * A project's data in and out of the phone as shapefiles (spec 1.4) — the export that the backup
 * reminders (spec 3.2) ask for, and the import that brings existing GIS layers into the field.
 *
 * One package per project, every file WGS 84 with a UTF-8 `.cpg`:
 *   <project>_surveys        points — every capture, its reference, position, accuracy, form values
 *   <project>_<layer>_<kind> points / lines / polygons drawn or imported on the device, per layer
 *   <project>_tracks         lines — GPS logger routes filed under the project
 */

/** Every survey of a project, across as many 500-row pages as it takes. */
export async function fetchAllSurveys(projectId: string): Promise<SurveyDetail[]> {
  const all: SurveyDetail[] = [];
  for (let page = 1; page <= 100; page++) {
    const batch = await api<SurveyDetail[]>(`/api/surveys?projectId=${projectId}&pageSize=500&page=${page}`);
    all.push(...batch);
    if (batch.length < 500) break;
  }
  return all;
}

/** ASCII, filesystem-safe, short — file names travel through Windows, SAF and email. */
export function fileSlug(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .slice(0, 32) || 'project'
  );
}

export interface ExportInput {
  project: ProjectResponse;
  surveys: SurveyDetail[];
  pending: OutboxItem[];
  features: GisFeature[];
  layers: GisLayer[];
  tracks: { meta: TrackMeta; points: TrackPoint[] }[];
}

export interface ExportPackage {
  baseName: string;
  files: ZipEntry[];
  summary: { file: string; kind: ShapeKind; count: number }[];
}

function formValue(type: string, value: unknown): AttributeValue {
  if (value === null || value === undefined || value === '') return null;
  const t = type.toLowerCase();
  if ((t === 'number' || t === 'integer') && typeof value === 'number') return value;
  if ((t === 'boolean' || t === 'bool') && typeof value === 'boolean') return value;
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function buildExport(input: ExportInput): ExportPackage {
  const { project } = input;
  const slug = fileSlug(project.name);
  const fields = parseSchema(project.formSchema);
  const references = buildReferences(input.surveys, () => project.name);
  const files: ZipEntry[] = [];
  const summary: ExportPackage['summary'] = [];

  const add = (name: string, kind: ShapeKind, records: ShapeRecord[]) => {
    if (!records.length) return;
    const written = writeShapefile(kind, records);
    for (const ext of ['shp', 'shx', 'dbf', 'prj', 'cpg'] as const) files.push({ name: `${name}.${ext}`, data: written[ext] });
    summary.push({ file: name, kind, count: records.length });
  };

  // Survey points: the form's own columns, in the form's order, after the fixed ones.
  const surveyRecord = (
    s: { id: string; latitude: number; longitude: number; accuracyMeters: number | null; capturedAtUtc: string; detailsJson: string | null },
    status: string,
    ref: string | null,
    photos: number,
  ): ShapeRecord => {
    const details = parseDetails(s.detailsJson);
    const attributes: Record<string, AttributeValue> = {
      ref,
      status,
      captured: s.capturedAtUtc,
      lat: s.latitude,
      lon: s.longitude,
      acc_m: s.accuracyMeters,
      photos,
      catatan: typeof details.catatan === 'string' ? details.catatan : null,
    };
    for (const f of fields) attributes[f.key] = formValue(f.type, details[f.key]);
    attributes.survey_id = s.id;
    return { parts: [[[s.longitude, s.latitude]]], attributes };
  };
  add(`${slug}_surveys`, 'point', [
    ...input.surveys.map((s) => surveyRecord(s, s.status || 'synced', references.get(s.id) ?? null, s.photos.length)),
    ...input.pending.map((i) => surveyRecord(i, 'pending', null, (i.photoUri ? 1 : 0) + (i.extraPhotos?.length ?? 0))),
  ]);

  // Device features, one shapefile per layer and geometry type.
  for (const layer of input.layers) {
    const inLayer = input.features.filter((f) => f.layerId === layer.id);
    for (const kind of ['point', 'line', 'polygon'] as const) {
      const records = inLayer
        .filter((f) => f.kind === kind)
        .map<ShapeRecord>((f) => ({
          parts: kind === 'point' ? [[f.coordinates[0]]] : [f.coordinates as Position[]],
          attributes: { name: f.name, layer: layer.name, created: new Date(f.createdAt).toISOString(), ...f.attributes },
        }));
      const kindName = kind === 'point' ? 'points' : kind === 'line' ? 'lines' : 'polygons';
      add(`${slug}_${fileSlug(layer.name)}_${kindName}`, kind, records);
    }
  }

  add(
    `${slug}_tracks`,
    'line',
    input.tracks
      .filter((t) => t.points.length >= 2)
      .map((t) => ({
        parts: [t.points.map((p) => [p[0], p[1]] as Position)],
        attributes: {
          name: t.meta.name,
          started: new Date(t.meta.startedAt).toISOString(),
          ended: t.meta.endedAt ? new Date(t.meta.endedAt).toISOString() : null,
          points: t.points.length,
          dist_m: t.meta.distanceM,
        },
      })),
  );

  const generated = new Date();
  files.push({
    name: 'README.txt',
    data: utf8Encode(
      [
        `GeoFold export — ${project.name}`,
        `Generated ${generated.toISOString()}`,
        '',
        'Coordinate system: WGS 84 (EPSG:4326), longitude/latitude in degrees. Text encoding: UTF-8.',
        '',
        ...summary.map((s) => `${s.file}  (${s.kind}, ${s.count} record${s.count === 1 ? '' : 's'})`),
        '',
        'Survey photos are not included; they stay on the server and are exported from the web portal.',
      ].join('\r\n'),
    ),
  });

  return { baseName: `${slug}_${generated.toISOString().slice(0, 10)}`, files, summary };
}

/** Writes the package to the cache as a zip and returns its file. */
export function writeZip(pkg: ExportPackage): File {
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `${pkg.baseName}.zip`);
  if (file.exists) file.delete();
  file.create();
  file.write(zip(pkg.files));
  return file;
}

/**
 * Writes the shapefile parts straight into a folder the surveyor picks — usable from QGIS on a
 * laptop over USB without unzipping. Every part goes as application/octet-stream: given a text MIME
 * type, Android's storage provider would append ".txt" and turn `x.prj` into `x.prj.txt`.
 */
export async function saveToFolder(pkg: ExportPackage): Promise<{ folder: string; count: number } | null> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return null; // cancelled
  }
  for (const entry of pkg.files) {
    const file = dir.createFile(entry.name, 'application/octet-stream');
    file.write(entry.data);
  }
  return { folder: decodeURIComponent(dir.uri.split('/').pop() ?? dir.uri), count: pkg.files.length };
}

/* ── import ─────────────────────────────────────────────────────────────── */

export interface PickedImport {
  results: ImportResult[];
  /** Files that were picked but are not part of any shapefile. */
  ignored: string[];
}

/**
 * Lets the surveyor pick a zipped shapefile, or the `.shp` with its sidecars, and reads every
 * shapefile found. Returns null when the picker is cancelled.
 */
export async function pickShapefiles(): Promise<PickedImport | null> {
  const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: '*/*' });
  if (picked.canceled || !picked.result?.length) return null;

  const entries: ZipEntry[] = [];
  const ignored: string[] = [];
  for (const file of picked.result) {
    const name = file.name;
    const data = await file.bytes();
    if (/\.zip$/i.test(name)) entries.push(...unzip(data));
    else if (/\.(shp|dbf|prj|cpg|shx)$/i.test(name)) entries.push({ name, data });
    else ignored.push(name);
  }

  const sets = groupShapefiles(entries);
  if (!sets.length) {
    throw new Error('No shapefile found. Pick a .zip containing one, or select the .shp together with its .dbf and .prj.');
  }
  return { results: sets.map(readShapefileSet), ignored };
}

/** The attribute most likely to be a feature's name, for labelling imported features. */
export function guessNameField(result: ImportResult): string | null {
  const keys = Object.keys(result.features[0]?.attributes ?? {});
  const preferred = keys.find((k) => /^(name|nama|nm|label|keterangan|ket|desc|namobj)$/i.test(k));
  if (preferred) return preferred;
  return keys.find((k) => result.features.some((f) => typeof f.attributes[k] === 'string')) ?? null;
}
