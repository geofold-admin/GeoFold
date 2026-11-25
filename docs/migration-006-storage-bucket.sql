-- Migration 006 — the survey photo storage bucket.
--
-- APPLIED 2026-09-07 to the live project `vdyuoqtoimtpienoqznc`.
--
-- WHY THIS EXISTS AS A MIGRATION: `storage.buckets` was completely empty on the live project.
-- Almost certainly lost in the August move — the schema was recreated in the new project, the
-- bucket was not — and nothing in the app says so out loud. The failure looked like two unrelated
-- bugs:
--
--   1. "request failed 500" on sync. POST /api/surveys/[id]/photos/initiate wrote the
--      survey_photos row, then `createUploadUrl` (lib/storage.ts) asked Storage to sign an upload
--      into a bucket that did not exist, got a 404 back, and threw. The route turned that into a
--      500 and the app reported the sync as failed.
--   2. "photo unavailable" in the gallery. The row was left at UploadStatus='pending' with no
--      object behind it, so there was nothing to sign a download URL for.
--
-- One cause, two symptoms, and no Postgres error anywhere to point at it — the whole failure lives
-- in the Storage API, above the database.
--
-- The bucket name must match SUPABASE_STORAGE_BUCKET in the deployment environment; `lib/storage.ts`
-- falls back to 'survey-photos' when that variable is unset.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'survey-photos',
  'survey-photos',
  -- private. The app never serves these directly: the server signs short-lived URLs with the
  -- service-role key for both upload and download, which bypasses RLS. No storage policies are
  -- added deliberately, so the anon key cannot reach these objects at all. The privacy policy
  -- promises "a private bucket served through short-lived signed links" — this is what makes that
  -- statement true rather than aspirational.
  false,
  -- 5 MB. Headroom over the 1 MB ceiling both clients enforce (mobile lib/photo.ts, web
  -- lib/capture.ts), so a photo that slips slightly past the client target still uploads, while a
  -- runaway file cannot.
  5242880,
  -- Every producer emits JPEG and both clients set this Content-Type explicitly. A signed upload
  -- URL is handed to a client, so constraining what can be written through it is worth having.
  array['image/jpeg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Verify:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets;
--   select "UploadStatus", count(*) from public.survey_photos group by 1;
