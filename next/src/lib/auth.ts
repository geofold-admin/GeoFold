import { createRemoteJWKSet, jwtVerify } from 'jose'
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from './supabase/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET

const claims = { issuer: `${SUPABASE_URL}/auth/v1`, audience: 'authenticated' }

// Cached across requests so key rotation is picked up without refetching JWKS on every call.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined
const remoteKeys = () =>
  (jwks ??= createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)))

/**
 * Verifies a Supabase access token under either signing mode, because a project can be on the
 * legacy HS256 shared secret or on asymmetric keys served from JWKS, and a mobile client has no
 * way to know which. HS256 is tried first when a secret is configured; otherwise — or when that
 * fails, which is what a project that has since rotated to asymmetric keys looks like — the token
 * is checked against JWKS.
 */
async function verifyBearer(token: string): Promise<Identity | null> {
  const identity = (payload: Record<string, unknown>): Identity | null =>
    typeof payload.sub === 'string'
      ? { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : null }
      : null

  if (JWT_SECRET?.trim()) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET), claims)
      return identity(payload)
    } catch {
      // fall through to JWKS
    }
  }

  try {
    const { payload } = await jwtVerify(token, remoteKeys(), claims)
    return identity(payload)
  } catch {
    return null
  }
}

/** A verified caller. `email` is absent on tokens that carry no email claim. */
export interface Identity {
  id: string
  email: string | null
}

/**
 * Resolves the caller's identity, or null. Accepts either an `Authorization: Bearer` token — the
 * mobile app, tests and any other API client — or the browser's Supabase cookie session.
 *
 * Most routes only need the id and should use `getUserId`. The email is here for checkout, which
 * passes it to the payment gateway so the gateway can send the receipt the FAQ promises.
 */
export async function getIdentity(req: Request): Promise<Identity | null> {
  const authz = req.headers.get('authorization')
  if (authz?.startsWith('Bearer ')) return verifyBearer(authz.slice(7))

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null
}

/** Resolves the caller's user id, or null. */
export async function getUserId(req: Request): Promise<string | null> {
  return (await getIdentity(req))?.id ?? null
}

export const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 })
