import type {
  ProjectResponse,
  SubscriptionMe,
  SurveyDetail,
  SurveyFeatureCollection,
} from './types';

/**
 * Demo mode's backend: an in-memory store that behaves like the real API for the length of a
 * session.
 *
 * It has to actually hold writes. A demo that accepts a new project and then shows the same two
 * samples doesn't demonstrate the app, it looks broken — which is exactly how it read before this
 * was mutable. Everything resets on reload, which is the honest limit of a demo.
 */

let projects: ProjectResponse[] = [
  {
    id: 'demo-sekadau',
    name: 'Sekadau',
    description: 'Survey jembatan & fasilitas desa',
    formSchema: JSON.stringify([
      { key: 'kondisi', label: 'Kondisi lokasi', type: 'text', required: true },
      { key: 'berbahaya', label: 'Area berbahaya', type: 'boolean' },
    ]),
    createdAtUtc: '2026-07-10T02:14:00Z',
    archivedAtUtc: null,
    surveyCount: 0,
  },
  {
    id: 'demo-sintang',
    name: 'Sintang',
    description: null,
    formSchema: '[]',
    createdAtUtc: '2026-07-12T06:40:00Z',
    archivedAtUtc: null,
    surveyCount: 0,
  },
];

let surveys: SurveyDetail[] = [
  {
    id: 's1',
    projectId: 'demo-sekadau',
    latitude: -0.0376,
    longitude: 111.284,
    accuracyMeters: 6,
    capturedAtUtc: '2026-07-15T02:41:00Z',
    syncedAtUtc: '2026-07-15T02:42:00Z',
    detailsJson: '{"kondisi":"Jembatan kayu, perlu perbaikan","berbahaya":true}',
    status: 'submitted',
    photos: [
      {
        id: 's1-p0',
        uploadStatus: 'uploaded',
        latitude: -0.0376,
        longitude: 111.284,
        capturedAtUtc: '2026-07-15T02:41:00Z',
      },
    ],
  },
  {
    id: 's2',
    projectId: 'demo-sekadau',
    latitude: -0.0331,
    longitude: 111.2905,
    accuracyMeters: 4,
    capturedAtUtc: '2026-07-15T03:10:00Z',
    syncedAtUtc: '2026-07-15T03:11:00Z',
    detailsJson: '{"kondisi":"Sumur umum, kondisi baik"}',
    status: 'submitted',
    photos: [],
  },
  {
    id: 's3',
    projectId: 'demo-sekadau',
    latitude: -0.0419,
    longitude: 111.2788,
    accuracyMeters: 8,
    capturedAtUtc: '2026-07-15T04:02:00Z',
    syncedAtUtc: '2026-07-15T04:03:00Z',
    detailsJson: '{"kondisi":"Jalan berlubang","catatan":"Butuh penanganan segera"}',
    status: 'reviewed',
    photos: [],
  },
  {
    id: 's4',
    projectId: 'demo-sintang',
    latitude: 0.0854,
    longitude: 111.4985,
    accuracyMeters: 11,
    capturedAtUtc: '2026-07-16T01:20:00Z',
    syncedAtUtc: '2026-07-16T01:21:00Z',
    detailsJson: '{"catatan":"Titik awal ruas jalan"}',
    status: 'submitted',
    photos: [],
  },
];

const countFor = (projectId: string) => surveys.filter((s) => s.projectId === projectId).length;

const withCounts = (): ProjectResponse[] =>
  projects.map((p) => ({ ...p, surveyCount: countFor(p.id) }));

function subscription(): SubscriptionMe {
  return {
    workspaceType: 'free',
    premiumActive: false,
    premiumUntilUtc: null,
    frozen: false,
    limits: { maxProjects: 3, photosPerProject: 20, dailySurveys: 30, dailyPhotos: 60 },
    usage: {
      projects: projects.length,
      surveysToday: Math.min(surveys.length, 4),
      photosToday: Math.min(surveys.length, 7),
    },
  };
}

function geojson(): SurveyFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: surveys.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
      properties: {
        id: s.id,
        projectId: s.projectId,
        status: s.status,
        capturedAtUtc: s.capturedAtUtc,
        syncedAtUtc: s.syncedAtUtc,
        accuracyMeters: s.accuracyMeters,
        photoCount: s.photos.length,
        detailsJson: s.detailsJson,
      },
    })),
  };
}

function createProject(body: Record<string, unknown>): ProjectResponse {
  const created: ProjectResponse = {
    id: `demo-${Date.now()}`,
    name: String(body.name ?? 'Untitled project'),
    description: (body.description as string | null) ?? null,
    formSchema: String(body.formSchema ?? '[]'),
    createdAtUtc: new Date().toISOString(),
    archivedAtUtc: null,
    surveyCount: 0,
  };
  projects = [created, ...projects];
  return created;
}

function upsertSurvey(body: Record<string, unknown>): SurveyDetail {
  const now = new Date().toISOString();
  const survey: SurveyDetail = {
    id: String(body.id),
    projectId: String(body.projectId),
    latitude: Number(body.latitude),
    longitude: Number(body.longitude),
    accuracyMeters: body.accuracyMeters == null ? null : Number(body.accuracyMeters),
    capturedAtUtc: String(body.capturedAtUtc ?? now),
    syncedAtUtc: now,
    detailsJson: (body.detailsJson as string | null) ?? null,
    status: 'submitted',
    photos: [],
  };
  surveys = [survey, ...surveys.filter((s) => s.id !== survey.id)];
  return survey;
}

export function demoResponse<T>(path: string, method: string, body?: unknown): T {
  const [clean, search = ''] = path.split('?');
  const payload = (body ?? {}) as Record<string, unknown>;
  // The real endpoint filters by projectId; without this the demo hands every screen every
  // survey, which shows up as one project claiming another project's points.
  const projectFilter = new URLSearchParams(search).get('projectId');

  if (clean === '/api/projects') {
    if (method === 'POST') return createProject(payload) as T;
    return withCounts() as T;
  }

  const projectMatch = clean.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && method === 'PUT') {
    // Editing a project, and fields added to its form from the capture screen.
    projects = projects.map((p) =>
      p.id === projectMatch[1]
        ? {
            ...p,
            name: String(payload.name ?? p.name),
            description: (payload.description as string | null | undefined) ?? null,
            formSchema: String(payload.formSchema ?? p.formSchema),
          }
        : p,
    );
    return withCounts().find((p) => p.id === projectMatch[1]) as T;
  }
  if (projectMatch && method === 'GET') {
    return (withCounts().find((p) => p.id === projectMatch[1]) ?? withCounts()[0]) as T;
  }

  if (clean === '/api/subscriptions/me') return subscription() as T;
  if (clean === '/api/surveys/geojson') {
    const fc = geojson();
    return (projectFilter
      ? { ...fc, features: fc.features.filter((f) => f.properties.projectId === projectFilter) }
      : fc) as T;
  }

  if (clean === '/api/surveys') {
    if (method === 'POST') return upsertSurvey(payload) as T;
    return (projectFilter ? surveys.filter((s) => s.projectId === projectFilter) : surveys) as T;
  }

  const surveyMatch = clean.match(/^\/api\/surveys\/([^/]+)$/);
  if (surveyMatch && method === 'GET') {
    return (surveys.find((s) => s.id === surveyMatch[1]) ?? surveys[0]) as T;
  }

  if (clean.endsWith('/initiate')) {
    return { photoId: 'demo-photo', uploadUrl: 'demo://upload', storagePath: 'demo' } as T;
  }
  if (clean.endsWith('/url')) return { url: null } as T;

  return undefined as T;
}
