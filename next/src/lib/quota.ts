import sql from './db'

/**
 * Quota model per docs/migration-002-subscription.sql. Replaces the old free tier
 * (100 surveys/month + 500 MB storage are retired).
 *
 *   free    = FREE_PROJECTS projects, then +1 more every PROJECT_COOLDOWN_HOURS,
 *             FREE_PHOTOS_PER_PROJECT photos per project, plus daily caps on surveys
 *             captured and photos uploaded.
 *   premium = unlimited on every axis, while PremiumUntilUtc is in the future.
 *
 * ⚠️ TUNE THESE. The project/photo numbers come straight from the product decision in the
 * migration; the two DAILY caps were not specified, so these are sensible defaults — set them
 * to your real values before launch.
 */
const FREE_PROJECTS = 3
const PROJECT_COOLDOWN_HOURS = 24
const FREE_PHOTOS_PER_PROJECT = 20
const FREE_DAILY_SURVEYS = 30 // ⚠️ placeholder — confirm the real daily cap
const FREE_DAILY_PHOTOS = 60 // ⚠️ placeholder — confirm the real daily cap

export interface QuotaCheck {
  allowed: boolean
  message?: string
}

export interface Workspace {
  workspaceType: 'free' | 'premium'
  premiumUntilUtc: Date | null
  frozenAtUtc: Date | null
}

/** Roles that are never subject to a plan limit. */
const UNLIMITED_ROLES = new Set(['superadmin'])

// Far enough out that `premiumActive` is true for any practical lifetime of this deployment, but
// still a real date — the alternative is a null-means-forever special case threaded through every
// quota check, and this way superadmin travels the exact same code path as a paying customer.
const NEVER_EXPIRES = new Date('2999-12-31T00:00:00.000Z')

// Free users may have no subscriptions row at all (it is created on the first grant), so an
// absent row means a plain free workspace.
//
// This is the one chokepoint every quota decision passes through — projects, photos per project,
// the daily caps, and the survey map all resolve through here — so the superadmin exemption lives
// here and nowhere else. A role check scattered across the call sites would be a role check that
// is missing from one of them.
export async function getWorkspace(userId: string): Promise<Workspace | undefined> {
  const [row] = await sql<{
    WorkspaceType: string | null
    PremiumUntilUtc: Date | null
    FrozenAtUtc: Date | null
    Role: string | null
  }[]>`
    SELECT s."WorkspaceType", s."PremiumUntilUtc", s."FrozenAtUtc", p."Role"
    FROM profiles p
    LEFT JOIN subscriptions s ON s."UserId" = p."Id"
    WHERE p."Id" = ${userId}`

  if (row?.Role && UNLIMITED_ROLES.has(row.Role)) {
    return { workspaceType: 'premium', premiumUntilUtc: NEVER_EXPIRES, frozenAtUtc: null }
  }

  // No profile row, or a profile with no subscription — both are a plain free workspace.
  if (!row || !row.WorkspaceType) return undefined

  return {
    workspaceType: row.WorkspaceType === 'premium' ? 'premium' : 'free',
    premiumUntilUtc: row.PremiumUntilUtc,
    frozenAtUtc: row.FrozenAtUtc,
  }
}

export function premiumActive(w: Workspace | undefined): boolean {
  return !!w?.premiumUntilUtc && w.premiumUntilUtc.getTime() > Date.now()
}

/* ── counters ──────────────────────────────────────────────────────────────── */

async function countActiveProjects(userId: string): Promise<number> {
  const [r] = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c FROM projects WHERE "UserId" = ${userId} AND "ArchivedAtUtc" IS NULL`
  return r.c
}

// Hours since the newest active project was created, or null if the user has none.
async function hoursSinceNewestProject(userId: string): Promise<number | null> {
  const [r] = await sql<{ h: number | null }[]>`
    SELECT EXTRACT(EPOCH FROM (now() - MAX("CreatedAtUtc"))) / 3600 AS h
    FROM projects WHERE "UserId" = ${userId} AND "ArchivedAtUtc" IS NULL`
  return r.h == null ? null : Number(r.h)
}

// Non-failed photos across every survey in the given survey's project.
async function countPhotosInProject(userId: string, surveyId: string): Promise<number> {
  const [r] = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c
    FROM survey_photos sp
    JOIN surveys s ON s."Id" = sp."SurveyId"
    WHERE s."UserId" = ${userId}
      AND sp."UploadStatus" <> 'failed'
      AND s."ProjectId" = (SELECT "ProjectId" FROM surveys WHERE "Id" = ${surveyId})`
  return r.c
}

async function todayUsage(userId: string): Promise<{ surveys: number; photos: number }> {
  const [r] = await sql<{ s: number; p: number }[]>`
    SELECT COALESCE("SurveysCount", 0)::int AS s, COALESCE("PhotosCount", 0)::int AS p
    FROM usage_daily
    WHERE "UserId" = ${userId} AND "Day" = (now() AT TIME ZONE 'UTC')::date`
  return r ? { surveys: r.s, photos: r.p } : { surveys: 0, photos: 0 }
}

async function setFrozen(userId: string): Promise<void> {
  await sql`UPDATE subscriptions SET "FrozenAtUtc" = now() WHERE "UserId" = ${userId} AND "FrozenAtUtc" IS NULL`
}

async function clearFrozen(userId: string): Promise<void> {
  await sql`UPDATE subscriptions SET "FrozenAtUtc" = NULL WHERE "UserId" = ${userId} AND "FrozenAtUtc" IS NOT NULL`
}

const FROZEN_MESSAGE =
  'Your Premium plan has expired and this workspace is over the free limit, so it is read-only. ' +
  'Renew Premium, or archive projects back down to 3, to make changes again. ' +
  'Your data is safe and still exportable.'

/**
 * Freeze gate for writes. A workspace freezes only after Premium lapses *while over the free
 * project cap* — a plain free user is never frozen, they just meet the normal free limits below.
 * Reads/exports never call this. Recovers automatically on renewal or once back under the cap.
 */
async function checkFrozen(userId: string, w: Workspace | undefined): Promise<QuotaCheck> {
  if (!w || premiumActive(w)) {
    if (w?.frozenAtUtc) await clearFrozen(userId) // renewed → thaw
    return { allowed: true }
  }
  // Lapsed premium (or already flagged). Frozen while still over the free project ceiling.
  if (w.frozenAtUtc || w.workspaceType === 'premium') {
    const projects = await countActiveProjects(userId)
    if (projects > FREE_PROJECTS) {
      if (!w.frozenAtUtc) await setFrozen(userId)
      return { allowed: false, message: FROZEN_MESSAGE }
    }
    if (w.frozenAtUtc) await clearFrozen(userId) // back under the ceiling → thaw
  }
  return { allowed: true }
}

/* ── write checks ──────────────────────────────────────────────────────────── */

export async function checkProjectCreation(userId: string): Promise<QuotaCheck> {
  const w = await getWorkspace(userId)
  const frozen = await checkFrozen(userId, w)
  if (!frozen.allowed) return frozen
  if (premiumActive(w)) return { allowed: true }

  const count = await countActiveProjects(userId)
  if (count < FREE_PROJECTS) return { allowed: true }

  // Past the base allowance, the free plan grants one more project per cooldown window.
  const age = await hoursSinceNewestProject(userId)
  if (age == null || age >= PROJECT_COOLDOWN_HOURS) return { allowed: true }
  const wait = Math.ceil(PROJECT_COOLDOWN_HOURS - age)
  return {
    allowed: false,
    message: `Free plan: you can add another project in about ${wait}h (${FREE_PROJECTS} projects, then +1 every ${PROJECT_COOLDOWN_HOURS}h). Upgrade to Premium for unlimited projects.`,
  }
}

export async function checkSurveyCreation(userId: string): Promise<QuotaCheck> {
  const w = await getWorkspace(userId)
  const frozen = await checkFrozen(userId, w)
  if (!frozen.allowed) return frozen
  if (premiumActive(w)) return { allowed: true }

  const { surveys } = await todayUsage(userId)
  if (surveys >= FREE_DAILY_SURVEYS) {
    return {
      allowed: false,
      message: `Daily limit reached — ${surveys}/${FREE_DAILY_SURVEYS} surveys captured today. It resets at 00:00 UTC, or upgrade to Premium for no daily limit.`,
    }
  }
  return { allowed: true }
}

export async function checkPhotoUpload(userId: string, surveyId: string): Promise<QuotaCheck> {
  const w = await getWorkspace(userId)
  const frozen = await checkFrozen(userId, w)
  if (!frozen.allowed) return frozen
  if (premiumActive(w)) return { allowed: true }

  const inProject = await countPhotosInProject(userId, surveyId)
  if (inProject >= FREE_PHOTOS_PER_PROJECT) {
    return {
      allowed: false,
      message: `This project has reached the free limit of ${FREE_PHOTOS_PER_PROJECT} photos. Upgrade to Premium for unlimited photos per project.`,
    }
  }

  const { photos } = await todayUsage(userId)
  if (photos >= FREE_DAILY_PHOTOS) {
    return {
      allowed: false,
      message: `Daily limit reached — ${photos}/${FREE_DAILY_PHOTOS} photos uploaded today. It resets at 00:00 UTC, or upgrade to Premium for no daily limit.`,
    }
  }
  return { allowed: true }
}

/* ── counter increments (called on successful writes) ──────────────────────── */

async function bumpUsage(userId: string, surveys: number, photos: number): Promise<void> {
  await sql`
    INSERT INTO usage_daily ("UserId", "Day", "SurveysCount", "PhotosCount")
    VALUES (${userId}, (now() AT TIME ZONE 'UTC')::date, ${surveys}, ${photos})
    ON CONFLICT ("UserId", "Day") DO UPDATE SET
      "SurveysCount" = usage_daily."SurveysCount" + ${surveys},
      "PhotosCount"  = usage_daily."PhotosCount"  + ${photos}`
}

export const recordSurveyCreated = (userId: string) => bumpUsage(userId, 1, 0)
export const recordPhotoUploaded = (userId: string) => bumpUsage(userId, 0, 1)

/* ── summary for GET /api/subscriptions/me ─────────────────────────────────── */

export interface WorkspaceSummary {
  workspaceType: 'free' | 'premium'
  premiumActive: boolean
  premiumUntilUtc: string | null
  frozen: boolean
  limits: {
    maxProjects: number | null
    photosPerProject: number | null
    dailySurveys: number | null
    dailyPhotos: number | null
  }
  usage: { projects: number; surveysToday: number; photosToday: number }
}

export async function getWorkspaceSummary(userId: string): Promise<WorkspaceSummary> {
  const w = await getWorkspace(userId)
  const active = premiumActive(w)
  const [projects, usage] = await Promise.all([countActiveProjects(userId), todayUsage(userId)])
  return {
    workspaceType: w?.workspaceType ?? 'free',
    premiumActive: active,
    premiumUntilUtc: w?.premiumUntilUtc ? w.premiumUntilUtc.toISOString() : null,
    // A lapsed-premium workspace that's still over the free project cap is read-only. Compute it
    // from live state (not just the lazily-set flag) so the banner is right before any write.
    frozen: !active && w?.workspaceType === 'premium' && (!!w.frozenAtUtc || projects > FREE_PROJECTS),
    limits: active
      ? { maxProjects: null, photosPerProject: null, dailySurveys: null, dailyPhotos: null }
      : { maxProjects: FREE_PROJECTS, photosPerProject: FREE_PHOTOS_PER_PROJECT, dailySurveys: FREE_DAILY_SURVEYS, dailyPhotos: FREE_DAILY_PHOTOS },
    usage: { projects, surveysToday: usage.surveys, photosToday: usage.photos },
  }
}
