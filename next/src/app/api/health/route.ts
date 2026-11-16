import { vpsAuthConfigured, vpsAuthFingerprint } from '@/lib/vps-auth'

// Public liveness probe (pre-warm target + Render health check), mirrors the .NET /health.
// `vpsAuth` says whether VPS request signing is configured and `vpsKey` is a short tag of the secret
// (never the secret): the VPS deploy checks both before it starts refusing unsigned requests.
export async function GET() {
  return Response.json({ status: 'ok', vpsAuth: vpsAuthConfigured(), vpsKey: vpsAuthFingerprint() })
}
