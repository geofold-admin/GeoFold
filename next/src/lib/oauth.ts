import type { Provider } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from './supabase/client'

/**
 * Social sign-in providers known to the app. A button only appears once its id is listed in
 * NEXT_PUBLIC_OAUTH_PROVIDERS — so you only show what you've actually enabled in the Supabase
 * dashboard (Authentication → Providers), and users never hit a button that errors.
 *
 * To turn one on: enable it in Supabase with its client id/secret, make sure the provider's own
 * console lists `https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect
 * URI, then add its id to NEXT_PUBLIC_OAUTH_PROVIDERS (comma-separated) and redeploy.
 */
const ALL_PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'apple', label: 'Apple' },
]

// Comma-separated list of which providers to show, e.g. "google". Defaults to none, so
// nothing appears until you've configured a provider and opted it in.
const enabled = (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

export const OAUTH_PROVIDERS = ALL_PROVIDERS.filter((p) => enabled.includes(p.id))

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

/**
 * Kicks off the OAuth redirect. Supabase sends the user to the provider, the provider
 * returns to Supabase, and Supabase redirects to our /auth/callback with a `?code`,
 * which the existing route handler exchanges for a session cookie.
 */
export async function signInWithProvider(provider: Provider, next = '/home') {
  const supabase = createSupabaseBrowserClient()
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      // Ask Google for a refresh token so long-lived sessions survive without re-consent.
      ...(provider === 'google'
        ? { queryParams: { access_type: 'offline', prompt: 'consent' } }
        : {}),
    },
  })

  if (error) throw error
}
