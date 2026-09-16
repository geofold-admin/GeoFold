import { NextResponse } from 'next/server'
/**
 * Retired: this endpoint accepted a single shared secret and could write subscription rows
 * directly. Real money now enters through the dedicated, provider-verified iPaymu and Midtrans
 * webhooks, which verify a gateway transaction before granting Premium.
 */
export async function POST() {
  return NextResponse.json({ error: 'webhook_retired' }, { status: 410 })
}
