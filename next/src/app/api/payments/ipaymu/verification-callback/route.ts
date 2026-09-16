import { NextResponse } from 'next/server'
import { ipaymuConfig, verifyCallbackSignature } from '@/lib/ipaymu'

/** Acknowledge disposable GF-VERIFY sandbox orders without creating a GeoFold subscription. */
export async function POST(req: Request) {
  const cfg = ipaymuConfig()
  if (!cfg || cfg.isProduction) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  let payload: Record<string, unknown>
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      payload = (await req.json()) as Record<string, unknown>
    } else {
      payload = Object.fromEntries((await req.formData()).entries())
    }
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  const referenceId = String(payload.reference_id ?? payload.referenceId ?? '')
  if (!referenceId.startsWith('GF-VERIFY-')) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (!verifyCallbackSignature(cfg, payload, req.headers.get('x-signature') ?? '')) {
    console.warn('[ipaymu verification callback] invalid signature', { referenceId })
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  // There is no ledger write here: this endpoint exists only to complete iPaymu's sandbox test.
  return NextResponse.json({ status: 'OK' })
}
