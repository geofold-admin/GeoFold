import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getUserId, unauthorized } from '@/lib/auth'
import { upsertSurvey, withPhotoUrls } from '@/lib/surveys'
import { quotaExceeded } from '@/lib/http'

export async function GET(req: Request) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()

  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get('pageSize') ?? 100)))

  const rows = await sql`
    SELECT s."Id" AS id, s."ProjectId" AS "projectId",
           ST_Y(s."Location"::geometry) AS latitude, ST_X(s."Location"::geometry) AS longitude,
           s."AccuracyMeters" AS "accuracyMeters", s."CapturedAtUtc" AS "capturedAtUtc",
           s."SyncedAtUtc" AS "syncedAtUtc", s."Details"::text AS "detailsJson", s."Status" AS status,
           COALESCE((SELECT json_agg(json_build_object(
             'id', p."Id", 'uploadStatus', p."UploadStatus", 'storagePath', p."StoragePath",
             'latitude', ST_Y(p."Location"::geometry), 'longitude', ST_X(p."Location"::geometry),
             'capturedAtUtc', p."CapturedAtUtc")
             -- Oldest first, so photos[0] is the point's first photo and not an arbitrary row.
             ORDER BY p."CapturedAtUtc", p."Id")
             FROM survey_photos p WHERE p."SurveyId" = s."Id"), '[]') AS photos
    FROM surveys s
    WHERE s."UserId" = ${userId} ${projectId ? sql`AND s."ProjectId" = ${projectId}` : sql``}
    ORDER BY s."CapturedAtUtc" DESC
    OFFSET ${(page - 1) * pageSize} LIMIT ${pageSize}`

  return NextResponse.json(await withPhotoUrls(rows as unknown as { photos: unknown[] }[]))
}

export async function POST(req: Request) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()

  const b = await req.json()
  if (Math.abs(b?.latitude) > 90 || Math.abs(b?.longitude) > 180) {
    return NextResponse.json({ error: 'invalid_coordinates' }, { status: 400 })
  }

  const result = await upsertSurvey(userId, {
    id: b.id,
    projectId: b.projectId,
    latitude: b.latitude,
    longitude: b.longitude,
    accuracyMeters: b.accuracyMeters ?? null,
    capturedAtUtc: b.capturedAtUtc,
    detailsJson: b.detailsJson ?? null,
  })

  switch (result.status) {
    case 'created':
      return NextResponse.json(result.survey, { status: 201 })
    case 'updated':
      return NextResponse.json(result.survey)
    case 'quota_exceeded':
      return quotaExceeded(result.message)
    case 'forbidden':
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    default:
      return NextResponse.json({ error: 'invalid_survey', errors: result.errors }, { status: 400 })
  }
}
