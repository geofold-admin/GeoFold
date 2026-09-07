-- Migration 004 — public contact form storage.
--
-- Backs POST /api/contact, which the marketing site's contact page submits to. The page has to be
-- a real, working channel rather than a mailto: link: a payment gateway's verification team submits
-- the form to check it, and anyone without a configured mail client had no way to reach us at all.
--
-- STATUS: applied 2026-09-07 to the live project `vdyuoqtoimtpienoqznc` (recorded in
-- supabase_migrations), and also to the retired `nkqjbxlliuodbxiymatc`. Nothing to do unless you
-- are standing up a new project.
--
-- To apply elsewhere: `node next/scripts/apply-sql.js docs/migration-004-contact.sql`, which reads
-- the app's own DB_* and prints the project ref before running — check that ref. There are two
-- GeoFold Supabase projects and applying schema to the wrong one is silent; see TODO.md.

CREATE TABLE IF NOT EXISTS public.contact_messages (
  "Id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name"         text        NOT NULL,
  "Email"        text        NOT NULL,
  "Organization" text,
  "Subject"      text,
  "Message"      text        NOT NULL,
  -- Set when a signed-in user submits; null for anonymous visitors.
  "UserId"       uuid,
  -- sha256(salt + ip). Rate limiting only; never displayed, never joined to a person.
  "IpHash"       text,
  "UserAgent"    text,
  "Status"       text        NOT NULL DEFAULT 'new',
  "HandledAtUtc" timestamptz,
  "CreatedAtUtc" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_messages_status_check CHECK ("Status" IN ('new', 'read', 'replied', 'spam'))
);

-- Newest first, which is the only way this is ever read.
CREATE INDEX IF NOT EXISTS contact_messages_created_idx
  ON public.contact_messages ("CreatedAtUtc" DESC);

-- Backs the per-IP rate limit: count recent rows for one hash.
CREATE INDEX IF NOT EXISTS contact_messages_iphash_created_idx
  ON public.contact_messages ("IpHash", "CreatedAtUtc" DESC);

-- RLS on with NO policies: the anon and authenticated roles must not read or write this table.
-- The API route reaches it over the direct Postgres connection (lib/db.ts), which is not subject
-- to RLS, so the endpoint keeps working while the table stays invisible to every client key.
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- ...and take away the API grants as well, so RLS is not the only thing protecting this data.
--
-- CREATE TABLE in `public` inherits Supabase's default privileges, which grant anon and
-- authenticated full DML on every new table. RLS alone does hold — a probe with the public anon
-- key returns `[]` and inserts are refused — but every other application table in this schema has
-- no grants to those roles at all, because the app reaches Postgres over a direct connection and
-- never uses PostgREST. Matching that means a future permissive policy, or an accidental
-- DISABLE ROW LEVEL SECURITY, cannot expose the names, emails and message bodies stored here.
REVOKE ALL ON TABLE public.contact_messages FROM anon;
REVOKE ALL ON TABLE public.contact_messages FROM authenticated;

COMMENT ON TABLE public.contact_messages IS
  'Public contact-form submissions. Written only by the server (direct Postgres connection). Not reachable through PostgREST: no grants to anon/authenticated, and RLS is enabled with no policies.';
