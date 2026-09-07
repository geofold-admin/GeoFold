import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getUserId, unauthorized } from '@/lib/auth'
import { upsertSurvey } from '@/lib/surveys'

const MAX_BATCH = 200

// Drain a device's outbox. Items are applied independently so one rejected survey can't stop the
// rest of the batch from landing. Idempotent on the client id, so retries never duplicate.
export async function POST(req: Request) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const surveys = Array.isArray(body?.surveys) ? body.surveys : []
  if (surveys.length === 0) return NextResponse.json({ accepted: 0, rejected: 0, results: [] })
  if (surveys.length > MAX_BATCH)
    return NextResponse.json({ error: 'batch_too_large', message: `A push may contain at most ${MAX_BATCH} surveys.` }, { status: 400 })

  const results: { id: string; status: string; errors: string[] }[] = []
  for (const s of surveys) {
    // Independence has to be enforced here, not just intended. upsertSurvey returns a rejection for
    // anything it validates, but it *throws* for what it doesn't: a malformed uuid, an unparseable
    // capturedAtUtc, a null coordinate. Unguarded, one such row aborted the whole request with a
    // 500 — the exact opposite of what this loop exists to do. A device with one bad row in its
    // outbox would lose the batch path entirely on every attempt.
    try {
      if (!Number.isFinite(s?.latitude) || !Number.isFinite(s?.longitude) ||
          Math.abs(s.latitude) > 90 || Math.abs(s.longitude) > 180) {
        // Checked explicitly, matching POST /api/surveys, so the row comes back with a reason
        // instead of the generic message the catch below would give it.
        results.push({ id: s?.id, status: 'rejected', errors: ['Latitude or longitude is missing or out of range.'] })
        continue
      }

      const r = await upsertSurvey(userId, {
        id: s.id, projectId: s.projectId, latitude: s.latitude, longitude: s.longitude,
        accuracyMeters: s.accuracyMeters ?? null, capturedAtUtc: s.capturedAtUtc, detailsJson: s.detailsJson ?? null,
      })
      const errors = r.status === 'rejected' ? r.errors : r.status === 'quota_exceeded' ? [r.message] : []
      results.push({ id: s.id, status: r.status, errors })
    } catch (e) {
      // Logged, not returned: the message is a database error and belongs in the server's logs, not
      // in a field client's error banner. The client retries this row on the per-item path anyway,
      // which is where a real validation message would come from.
      console.error('sync/surveys: survey %s failed', s?.id, e)
      results.push({ id: s?.id, status: 'rejected', errors: ['The server could not store this survey.'] })
    }
  }

  const accepted = results.filter((r) => r.status === 'created' || r.status === 'updated').length
  return NextResponse.json({ accepted, rejected: results.length - accepted, results })
}

// Changes since the client's cursor, ordered by server sync time so a client can't skip rows by
// backdating its own timestamps.
export async function GET(req: Request) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()

  const url = new URL(req.url)
  const since = url.searchParams.get('since')
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? 500)))

  const rows = await sql<{ syncedAtUtc: Date }[] & Record<string, unknown>[]>`
    SELECT s."Id" AS id, s."ProjectId" AS "projectId",
           ST_Y(s."Location"::geometry) AS latitude, ST_X(s."Location"::geometry) AS longitude,
           s."AccuracyMeters" AS "accuracyMeters", s."CapturedAtUtc" AS "capturedAtUtc",
           s."SyncedAtUtc" AS "syncedAtUtc", s."Details"::text AS "detailsJson", s."Status" AS status,
           COALESCE((SELECT json_agg(json_build_object(
             'id', p."Id", 'uploadStatus', p."UploadStatus",
             'latitude', ST_Y(p."Location"::geometry), 'longitude', ST_X(p."Location"::geometry),
             'capturedAtUtc', p."CapturedAtUtc"))
             FROM survey_photos p WHERE p."SurveyId" = s."Id"), '[]') AS photos
    FROM surveys s
    WHERE s."UserId" = ${userId} ${since ? sql`AND s."SyncedAtUtc" > ${new Date(since)}` : sql``}
    ORDER BY s."SyncedAtUtc" ASC
    LIMIT ${limit}`

  const cursor = rows.length ? rows[rows.length - 1].syncedAtUtc : since
  return NextResponse.json({ surveys: rows, cursor, hasMore: rows.length === limit })
}
