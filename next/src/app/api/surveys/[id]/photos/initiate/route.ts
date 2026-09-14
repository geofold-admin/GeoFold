import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getUserId, unauthorized } from '@/lib/auth'
import { checkPhotoUpload } from '@/lib/quota'
import { createUploadUrl } from '@/lib/storage'
import { quotaExceeded } from '@/lib/http'

const MAX_BYTES = 20 * 1024 * 1024
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req)
  if (!userId) return unauthorized()
  const { id: surveyId } = await params
  const b = await req.json()

  const ext = TYPES[b?.contentType]
  if (!ext) return NextResponse.json({ error: 'unsupported_content_type', message: 'Photos must be JPEG, PNG or WebP.' }, { status: 400 })
  if (!b?.sizeBytes || b.sizeBytes <= 0 || b.sizeBytes > MAX_BYTES)
    return NextResponse.json({ error: 'invalid_size', message: `A photo must be 1 byte to ${MAX_BYTES / 1048576} MB.` }, { status: 400 })

  const [survey] = await sql<{ x: number }[]>`SELECT 1 AS x FROM surveys WHERE "Id" = ${surveyId} AND "UserId" = ${userId}`
  if (!survey) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Path is built only from ids we control plus a whitelisted extension; the client file name is
  // deliberately ignored so it can't contain "../" and escape the user's folder.
  const storagePath = `${userId}/${surveyId}/${b.id}.${ext}`

  const [existing] = await sql<{ StoragePath: string }[]>`SELECT "StoragePath" FROM survey_photos WHERE "Id" = ${b.id}`
  const path = existing?.StoragePath ?? storagePath

  if (!existing) {
    // Free plan caps photos per project and per UTC day; premium lifts those but is bounded by
    // its storage ceiling, so the declared size goes in and is counted before the URL is issued.
    const quota = await checkPhotoUpload(userId, surveyId, Number(b.sizeBytes))
    if (!quota.allowed) return quotaExceeded(quota.message)

    await sql`
      INSERT INTO survey_photos ("Id","SurveyId","StoragePath","Location","CapturedAtUtc","SizeBytes","UploadStatus")
      VALUES (${b.id}, ${surveyId}, ${storagePath},
        ST_SetSRID(ST_MakePoint(${b.longitude}, ${b.latitude}), 4326)::geography,
        ${b.capturedAtUtc}, ${b.sizeBytes}, 'pending')`
  }

  const uploadUrl = await createUploadUrl(path)
  return NextResponse.json({ photoId: b.id, uploadUrl, storagePath: path })
}
