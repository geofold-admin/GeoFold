import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getUserId } from '@/lib/auth'

/**
 * Public contact endpoint.
 *
 * Deliberately unauthenticated: the contact page is what a payment gateway's verification team,
 * and anyone who has not signed up yet, uses to reach a human. Submissions land in
 * `contact_messages`, which RLS keeps closed to the anon and authenticated roles — this route
 * writes over the direct Postgres connection.
 */

const MAX = { name: 120, email: 254, organization: 160, subject: 160, message: 4000 }

// Per-IP ceiling. Generous for a human, useless for a spam run.
const RATE_WINDOW_MINUTES = 60
const RATE_MAX_PER_WINDOW = 5

const clean = (v: unknown, limit: number) =>
  typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, limit) : ''

// Multi-line fields keep their line breaks; only runs of blank lines are collapsed.
const cleanMultiline = (v: unknown, limit: number) =>
  typeof v === 'string' ? v.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, limit) : ''

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

/**
 * Hashed so a support inbox never turns into an IP log.
 *
 * Returns null unless CONTACT_IP_SALT is set, and that is deliberate: an IPv4 address is a 32-bit
 * space, so an *unsalted* sha256 of one is reversible by brute force in seconds — it would be an
 * IP log wearing a hash, and the Privacy Policy says we do not keep one. Without a salt we would
 * rather lose the per-IP rate limit than store something we have told people we do not store.
 * The salt must be stable across instances or the limit resets on every cold start, so it is an
 * explicit secret rather than something generated at boot.
 */
function hashIp(req: Request): string | null {
  const salt = process.env.CONTACT_IP_SALT
  if (!salt) return null

  // On Vercel, x-vercel-forwarded-for is set by the platform and cannot be spoofed by the client.
  // A client-supplied x-forwarded-for can be, so it is the last resort — otherwise anyone could
  // sidestep the rate limit just by varying a header.
  const ip =
    req.headers.get('x-vercel-forwarded-for')?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (!ip) return null

  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const b = (body ?? {}) as Record<string, unknown>

  // Honeypot: a field hidden from people and irresistible to bots. Accept and drop, so the bot
  // sees success and does not retry with a different shape.
  if (clean(b.website, 200)) return NextResponse.json({ ok: true })

  const name = clean(b.name, MAX.name)
  const email = clean(b.email, MAX.email).toLowerCase()
  const organization = clean(b.organization, MAX.organization)
  const subject = clean(b.subject, MAX.subject)
  const message = cleanMultiline(b.message, MAX.message)

  const fields: string[] = []
  if (!name) fields.push('name')
  if (!email || !looksLikeEmail(email)) fields.push('email')
  if (message.length < 10) fields.push('message')
  if (fields.length) {
    return NextResponse.json({ error: 'invalid_input', fields }, { status: 400 })
  }

  const ipHash = hashIp(req)

  if (ipHash) {
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM contact_messages
      WHERE "IpHash" = ${ipHash}
        AND "CreatedAtUtc" > now() - ${`${RATE_WINDOW_MINUTES} minutes`}::interval`
    if (count >= RATE_MAX_PER_WINDOW) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Too many messages from this address. Try again later.' },
        { status: 429 },
      )
    }
  }

  // Signed-in senders are attributed; anonymous ones are not. Never a reason to reject.
  const userId = await getUserId(req).catch(() => null)

  const [row] = await sql<{ Id: string }[]>`
    INSERT INTO contact_messages
      ("Name", "Email", "Organization", "Subject", "Message", "UserId", "IpHash", "UserAgent")
    VALUES (
      ${name}, ${email}, ${organization || null}, ${subject || null}, ${message},
      ${userId}, ${ipHash}, ${clean(req.headers.get('user-agent'), 400) || null}
    )
    RETURNING "Id"`

  // The reference is what a sender quotes in a follow-up; short enough to read over the phone.
  return NextResponse.json({ ok: true, reference: row.Id.slice(0, 8).toUpperCase() })
}
