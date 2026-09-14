import { NextResponse } from 'next/server'
import { getUserId, unauthorized } from '@/lib/auth'
import { getWorkspaceSummary } from '@/lib/quota'
import {
  PREMIUM_DAYS,
  PREMIUM_PRICE_IDR,
  PREMIUM_PRICE_LABEL,
  PREMIUM_STORAGE_BYTES,
  PREMIUM_STORAGE_LABEL,
} from '@/lib/pricing'

export async function GET(req: Request) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()

  const summary = await getWorkspaceSummary(userId)

  // The offer travels with the summary so the subscription page can print what the checkout will
  // actually charge. The page is a client component, and `PREMIUM_PRICE_IDR` comes from a
  // server-only env var — imported directly into the browser bundle it would silently fall back to
  // the default and quote a price the server does not charge.
  return NextResponse.json({
    ...summary,
    offer: {
      priceIdr: PREMIUM_PRICE_IDR,
      priceLabel: PREMIUM_PRICE_LABEL,
      days: PREMIUM_DAYS,
      storageBytes: PREMIUM_STORAGE_BYTES,
      storageLabel: PREMIUM_STORAGE_LABEL,
    },
  })
}
