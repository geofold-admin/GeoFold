import type { ProjectResponse, SubscriptionMe, SurveyDetail, SurveyFeatureCollection } from './types'

// Demo mode when Supabase isn't really configured: explore the whole UI with sample data, no
// backend or login. Turns off the moment a real anon key is set.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const DEMO_MODE = !url || url.includes('placeholder') || !anon || anon.includes('placeholder')

const projects: ProjectResponse[] = [
  { id: 'demo-sekadau', name: 'Sekadau', description: 'Survey jembatan & fasilitas desa',
    formSchema: JSON.stringify([
      { key: 'kondisi', label: 'Kondisi lokasi', type: 'text', required: true },
      { key: 'catatan', label: 'Catatan', type: 'text', required: false },
    ]), createdAtUtc: '2026-07-10T02:14:00Z', archivedAtUtc: null, surveyCount: 3 },
  { id: 'demo-sintang', name: 'Sintang', description: null, formSchema: '[]',
    createdAtUtc: '2026-07-12T06:40:00Z', archivedAtUtc: null, surveyCount: 1 },
]

const me: SubscriptionMe = {
  workspaceType: 'free', premiumActive: false, premiumUntilUtc: null, frozen: false,
  limits: { maxProjects: 3, photosPerProject: 20, dailySurveys: 30, dailyPhotos: 60, storageBytes: null },
  usage: { projects: 2, surveysToday: 4, photosToday: 7, storageBytes: 41_943_040 },
  offer: { priceIdr: 35000, priceLabel: 'Rp 35.000', days: 30, storageBytes: 5 * 1024 ** 3, storageLabel: '5 GB' },
}

const demoPhoto =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='190'>" +
  "<rect width='320' height='190' fill='%232c4a3b'/><rect y='150' width='320' height='40' fill='rgba(0,0,0,0.45)'/>" +
  "<text x='12' y='176' fill='%23eaede8' font-size='12' font-family='monospace'>-0.037622, 111.283981 · demo</text></svg>"

const geojson: SurveyFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [111.284, -0.0376] }, properties: { id: 's1', projectId: 'demo-sekadau', status: 'submitted', capturedAtUtc: '2026-07-15T02:41:00Z', syncedAtUtc: '2026-07-15T02:42:00Z', accuracyMeters: 6, photoCount: 1, detailsJson: '{"kondisi":"Jembatan kayu, perlu perbaikan"}' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [111.2905, -0.0331] }, properties: { id: 's2', projectId: 'demo-sekadau', status: 'submitted', capturedAtUtc: '2026-07-15T03:10:00Z', syncedAtUtc: '2026-07-15T03:11:00Z', accuracyMeters: 4, photoCount: 1, detailsJson: '{"kondisi":"Sumur umum, kondisi baik"}' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [111.2788, -0.0419] }, properties: { id: 's3', projectId: 'demo-sekadau', status: 'reviewed', capturedAtUtc: '2026-07-15T04:02:00Z', syncedAtUtc: '2026-07-15T04:03:00Z', accuracyMeters: 8, photoCount: 1, detailsJson: '{"kondisi":"Jalan berlubang"}' } },
  ],
}

function surveyDetail(id: string): SurveyDetail {
  const f = geojson.features.find((x) => x.properties.id === id) ?? geojson.features[0]
  return { id: f.properties.id, projectId: f.properties.projectId, latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0], accuracyMeters: f.properties.accuracyMeters, capturedAtUtc: f.properties.capturedAtUtc, syncedAtUtc: f.properties.syncedAtUtc, detailsJson: f.properties.detailsJson, status: f.properties.status, photos: [{ id: `${id}-p`, uploadStatus: 'uploaded', latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0], capturedAtUtc: f.properties.capturedAtUtc }] }
}

export function demoResponse<T>(path: string, options: RequestInit): T {
  const method = (options.method ?? 'GET').toUpperCase()
  const clean = path.split('?')[0]
  if (clean === '/api/projects' && method === 'GET') return projects as T
  if (clean === '/api/projects' && method === 'POST') { const b = JSON.parse(String(options.body ?? '{}')); return { id: 'demo-new', name: b.name, description: b.description ?? null, formSchema: b.formSchema ?? '[]', createdAtUtc: new Date().toISOString(), archivedAtUtc: null, surveyCount: 0 } as T }
  const pm = clean.match(/^\/api\/projects\/([^/]+)$/)
  if (pm && method === 'GET') return (projects.find((p) => p.id === pm[1]) ?? projects[0]) as T
  if (pm && method === 'PUT') return undefined as T
  if (clean === '/api/subscriptions/me') return me as T
  if (clean === '/api/profile' && method === 'GET') return { fullName: 'Demo Surveyor', whatsappNumber: '+6281234567890', domicile: 'Sekadau', gender: 'Laki-laki', occupation: 'Surveyor', completed: true } as T
  if (clean === '/api/profile' && method === 'PUT') return { ok: true } as T
  if (clean === '/api/surveys/geojson') return geojson as T
  if (clean === '/api/surveys' && method === 'GET') return geojson.features.map((f) => surveyDetail(f.properties.id)) as T
  const sm = clean.match(/^\/api\/surveys\/([^/]+)$/)
  if (sm && method === 'GET') return surveyDetail(sm[1]) as T
  // Repositioning a point: demo data is static, so echo the detail back. The map keeps the new
  // location optimistically in client state, which is what a real save would confirm.
  if (sm && method === 'PATCH') return surveyDetail(sm[1]) as T
  if (clean === '/api/surveys' && method === 'POST') return surveyDetail('s1') as T
  if (clean.endsWith('/initiate')) return { photoId: 'demo-p', uploadUrl: 'demo', storagePath: 'demo' } as T
  if (clean.endsWith('/url')) return { url: demoPhoto } as T
  return undefined as T
}
