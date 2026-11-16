'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * OAuth callback handler (PKCE flow).
 *
 * Supabase redirects here with tokens in the URL fragment:
 *   /auth/callback#access_token=...&refresh_token=...&expires_in=...&type=bearer
 *
 * This page exchanges the fragment for a session cookie via supabase.auth.setSession(),
 * then redirects to the intended destination (from ?next= or /home).
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/home'

  useEffect(() => {
    const hash = window.location.hash
    if (!hash) {
      // No fragment — maybe it was a ?code flow (email link). Let the server route handle it.
      router.replace(next)
      return
    }

    // Parse fragment: #access_token=...&refresh_token=...&expires_in=...&type=bearer
    const params = new URLSearchParams(hash.slice(1))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    const expires_in = params.get('expires_in')
    const token_type = params.get('token_type')
    const error = params.get('error')
    const error_description = params.get('error_description')

    if (error) {
      console.error('OAuth error:', error, error_description)
      router.replace(`/login?error=${encodeURIComponent(error_description ?? error)}`)
      return
    }

    if (access_token && refresh_token && token_type === 'bearer') {
      const supabase = createSupabaseBrowserClient()

      supabase.auth.setSession({
        access_token,
        refresh_token,
      }).then(({ error }) => {
        if (error) {
          console.error('setSession error:', error)
          router.replace(`/login?error=${encodeURIComponent(error.message)}`)
        } else {
          // Session established — navigate to the intended page
          router.replace(next)
        }
      })
    } else {
      // Unexpected fragment format — fall through to next
      router.replace(next)
    }
  }, [router, next])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 18, marginBottom: 8 }}>Completing sign-in…</div>
        <div style={{ opacity: 0.6, fontSize: 13 }}>Please wait while we finish logging you in.</div>
      </div>
    </div>
  )
}