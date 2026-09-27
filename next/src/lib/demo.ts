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

/* A placeholder QRIS code, drawn as an SVG data URL so it needs no network and no CSP exception.
   It is deliberately a REAL-looking finder-pattern grid rather than a grey box: the demo's job is
   to show the shape of the screen, and a blank square would hide whether the 220px plate, its
   border and its centring are right. It does not encode anything and cannot be scanned. */
const demoQr =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 25 25'>" +
  "<rect width='25' height='25' fill='white'/>" +
  "<g fill='%230A192F'>" +
  "<rect x='1' y='1' width='7' height='7'/><rect x='2' y='2' width='5' height='5' fill='white'/><rect x='3' y='3' width='3' height='3'/>" +
  "<rect x='17' y='1' width='7' height='7'/><rect x='18' y='2' width='5' height='5' fill='white'/><rect x='19' y='3' width='3' height='3'/>" +
  "<rect x='1' y='17' width='7' height='7'/><rect x='2' y='18' width='5' height='5' fill='white'/><rect x='3' y='19' width='3' height='3'/>" +
  "<rect x='10' y='1' width='1' height='1'/><rect x='12' y='1' width='1' height='1'/><rect x='14' y='2' width='1' height='1'/>" +
  "<rect x='9' y='3' width='1' height='1'/><rect x='11' y='4' width='1' height='1'/><rect x='13' y='4' width='1' height='1'/>" +
  "<rect x='10' y='5' width='1' height='1'/><rect x='15' y='5' width='1' height='1'/><rect x='9' y='6' width='1' height='1'/>" +
  "<rect x='12' y='6' width='1' height='1'/><rect x='14' y='7' width='1' height='1'/><rect x='10' y='8' width='1' height='1'/>" +
  "<rect x='1' y='10' width='1' height='1'/><rect x='3' y='10' width='1' height='1'/><rect x='5' y='11' width='1' height='1'/>" +
  "<rect x='2' y='12' width='1' height='1'/><rect x='4' y='13' width='1' height='1'/><rect x='6' y='13' width='1' height='1'/>" +
  "<rect x='1' y='14' width='1' height='1'/><rect x='3' y='15' width='1' height='1'/><rect x='5' y='16' width='1' height='1'/>" +
  "<rect x='9' y='9' width='1' height='1'/><rect x='11' y='9' width='1' height='1'/><rect x='13' y='10' width='1' height='1'/>" +
  "<rect x='10' y='11' width='1' height='1'/><rect x='12' y='11' width='1' height='1'/><rect x='14' y='12' width='1' height='1'/>" +
  "<rect x='9' y='13' width='1' height='1'/><rect x='11' y='13' width='1' height='1'/><rect x='13' y='14' width='1' height='1'/>" +
  "<rect x='10' y='15' width='1' height='1'/><rect x='12' y='15' width='1' height='1'/><rect x='15' y='15' width='1' height='1'/>" +
  "<rect x='17' y='9' width='1' height='1'/><rect x='19' y='10' width='1' height='1'/><rect x='21' y='9' width='1' height='1'/>" +
  "<rect x='23' y='10' width='1' height='1'/><rect x='18' y='12' width='1' height='1'/><rect x='20' y='13' width='1' height='1'/>" +
  "<rect x='22' y='12' width='1' height='1'/><rect x='17' y='14' width='1' height='1'/><rect x='19' y='15' width='1' height='1'/>" +
  "<rect x='21' y='14' width='1' height='1'/><rect x='23' y='15' width='1' height='1'/><rect x='18' y='17' width='1' height='1'/>" +
  "<rect x='20' y='18' width='1' height='1'/><rect x='22' y='17' width='1' height='1'/><rect x='19' y='19' width='1' height='1'/>" +
  "<rect x='21' y='20' width='1' height='1'/><rect x='23' y='19' width='1' height='1'/><rect x='17' y='21' width='1' height='1'/>" +
  "<rect x='18' y='23' width='1' height='1'/><rect x='20' y='22' width='1' height='1'/><rect x='22' y='23' width='1' height='1'/>" +
  "<rect x='9' y='17' width='1' height='1'/><rect x='11' y='18' width='1' height='1'/><rect x='13' y='17' width='1' height='1'/>" +
  "<rect x='10' y='19' width='1' height='1'/><rect x='12' y='20' width='1' height='1'/><rect x='14' y='19' width='1' height='1'/>" +
  "<rect x='9' y='21' width='1' height='1'/><rect x='11' y='22' width='1' height='1'/><rect x='13' y='23' width='1' height='1'/>" +
  "<rect x='15' y='20' width='1' height='1'/><rect x='16' y='22' width='1' height='1'/>" +
  "</g></svg>"

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

  /* ---- THE PAYMENT FLOW, SO THE CHECKOUT AND THE INVOICE CAN BE SEEN AT ALL ----
     These routes had no demo answer, so in demo mode the checkout modal's channel buttons produced
     an empty dialog (the request returned `undefined`) and /invoice had to hard-code its own
     sample. Both now answer from one place, and the sample order is the same object the invoice
     page shows, which is what makes the pair previewable — and testable — without a gateway. */
  if (clean === '/api/payments/ipaymu/direct' && method === 'POST') {
    const body = JSON.parse(String(options.body ?? '{}'))
    const isVa = body.method === 'va'
    const channel = String(body.channel ?? (isVa ? 'bca' : 'mpm'))
    const labels: Record<string, string> = { mpm: 'QRIS', bca: 'BCA', mandiri: 'Mandiri', bni: 'BNI', bri: 'BRI', permata: 'Permata' }
    return {
      orderId: 'DEMO-ORDER-0001',
      method: isVa ? 'va' : 'qris',
      channel,
      label: labels[channel] ?? channel.toUpperCase(),
      /* A demo QRIS payload the encoder route would normally draw. The invoice page points its
         <img> at that route when `qrUrl` is null, so a real string is what keeps the demo honest
         about which branch it is on. */
      paymentNo: isVa ? '8808 0812 3456 7890' : null,
      qrUrl: isVa ? null : demoQr,
      totalIdr: 35000,
      feeIdr: 0,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      amountIdr: 35000,
      grantsDays: 30,
    } as T
  }
  if (clean === '/api/payments/invoice' && method === 'GET') {
    return {
      invoice: {
        orderId: 'DEMO-ORDER-0001',
        status: 'pending',
        active: true,
        method: 'qris',
        channel: 'mpm',
        label: 'QRIS',
        paymentNo: null,
        qrUrl: demoQr,
        qrAvailable: true,
        hostedUrl: null,
        amountIdr: 35000,
        feeIdr: 0,
        totalIdr: 35000,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        createdAtUtc: new Date().toISOString(),
        grantsDays: 30,
      },
      offer: { priceIdr: 35000, priceLabel: 'Rp 35.000', days: 30, storageLabel: '500 MB' },
    } as T
  }
  if (clean === '/api/payments/ipaymu/sync' && method === 'POST') return { granted: false } as T
  if (clean === '/api/payments/ipaymu/qr') return { qr: demoQr } as T

  return undefined as T
}
