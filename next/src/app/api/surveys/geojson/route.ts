import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getUserId, unauthorized } from '@/lib/auth'
import { getWorkspace, premiumActive } from '@/lib/quota'
import { quotaExceeded } from '@/lib/http'

// Premium-gated map feed, mirroring the .NET [Authorize(Policy = "PremiumOnly")] on this endpoint.
export async function GET(req: Request) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()

  // The map is a premium feature: free users can collect surveys but not view them on a map.
  //
  // Gated on `premiumActive` — which compares PremiumUntilUtc against now — and not on Plan/Status.
  // This route was the last reader of the model migration 002 retired, and Plan/Status carry no
  // expiry: `grantPremiumDays` sets Status='active' and nothing anywhere sets it back, so a single
  // payment or activation key bought the map *permanently*. Every other quota decision in the app
  // goes through premiumActive(); this one now does too.
  if (!premiumActive(await getWorkspace(userId)))
    return quotaExceeded('Viewing surveys on a map requires the Premium plan.')

  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  const minLat = url.searchParams.get('minLat')
  const minLng = url.searchParams.get('minLng')
  const maxLat = url.searchParams.get('maxLat')
  const maxLng = url.searchParams.get('maxLng')
  const limit = Math.min(10000, Math.max(1, Number(url.searchParams.get('limit') ?? 5000)))
  const hasBbox = minLat && minLng && maxLat && maxLng

  const rows = await sql<
    {
      id: string; projectId: string; status: string; capturedAtUtc: Date; syncedAtUtc: Date
      accuracyMeters: number | null; lng: number; lat: number; detailsJson: string | null; photoCount: number
    }[]
  >`
    SELECT s."Id" AS id, s."ProjectId" AS "projectId", s."Status" AS status,
           s."CapturedAtUtc" AS "capturedAtUtc", s."SyncedAtUtc" AS "syncedAtUtc",
           s."AccuracyMeters" AS "accuracyMeters",
           ST_X(s."Location"::geometry) AS lng, ST_Y(s."Location"::geometry) AS lat,
           s."Details"::text AS "detailsJson",
           (SELECT COUNT(*)::int FROM survey_photos p WHERE p."SurveyId" = s."Id") AS "photoCount"
    FROM surveys s
    WHERE s."UserId" = ${userId}
      ${projectId ? sql`AND s."ProjectId" = ${projectId}` : sql``}
      ${hasBbox ? sql`AND ST_Intersects(s."Location", ST_MakeEnvelope(${Number(minLng)}, ${Number(minLat)}, ${Number(maxLng)}, ${Number(maxLat)}, 4326)::geography)` : sql``}
    ORDER BY s."CapturedAtUtc" DESC
    LIMIT ${limit}`

  return NextResponse.json({
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: {
        id: r.id,
        projectId: r.projectId,
        status: r.status,
        capturedAtUtc: r.capturedAtUtc,
        syncedAtUtc: r.syncedAtUtc,
        accuracyMeters: r.accuracyMeters,
        photoCount: r.photoCount,
        detailsJson: r.detailsJson,
      },
    })),
  })
}
