-- Migration 005 — make profiles."Role" mean something, and add a superadmin.
--
-- The column has existed since the .NET schema but nothing ever read it: `ensureProfile` writes
-- 'surveyor' on first use and no code branched on it. This adds the first role that does anything.
--
-- The enforcement lives in next/src/lib/quota.ts::getWorkspace, which is the single chokepoint
-- every quota decision passes through — project count, photos per project, the daily capture and
-- upload caps, and the premium-gated survey map. A superadmin resolves to a premium workspace with
-- a far-future expiry, so it travels the same code path as a paying customer rather than needing a
-- special case at each call site.
--
-- There is deliberately no admin UI and no cross-account access: superadmin lifts *limits*, it
-- does not grant sight of other users' surveys. Row ownership is still enforced everywhere.

-- Grant. Replace the address; there is no way to do this from inside the app on purpose.
UPDATE public.profiles p
SET "Role" = 'superadmin'
FROM auth.users u
WHERE u.id = p."Id"
  AND u.email = 'gakaridase@gmail.com';

-- Revoke, when needed:
--   UPDATE public.profiles p SET "Role" = 'surveyor'
--   FROM auth.users u WHERE u.id = p."Id" AND u.email = '<address>';

-- Who currently holds it:
--   SELECT u.email, p."Role" FROM public.profiles p
--   JOIN auth.users u ON u.id = p."Id" WHERE p."Role" <> 'surveyor';
