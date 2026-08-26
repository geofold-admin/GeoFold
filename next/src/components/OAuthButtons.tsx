'use client'

import { useState } from 'react'
import type { Provider } from '@supabase/supabase-js'
import { OAUTH_PROVIDERS, signInWithProvider } from '@/lib/oauth'

const icons: Record<string, React.ReactNode> = {
  google: (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1 .7-2.3 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  ),
  apple: (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M17.05 12.54c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.72-1.04-2.75-4.12zM14.6 4.6c.71-.87 1.19-2.07 1.06-3.27-1.02.04-2.26.68-3 1.55-.66.76-1.24 1.98-1.08 3.15 1.14.09 2.3-.58 3.02-1.43z" />
    </svg>
  ),
}

export function OAuthButtons({ next = '/home' }: { next?: string }) {
  const [busy, setBusy] = useState<Provider | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = async (provider: Provider) => {
    setError(null)
    setBusy(provider)
    try {
      await signInWithProvider(provider, next)
      // On success the browser navigates away; nothing to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start sign-in.')
      setBusy(null)
    }
  }

  // Nothing configured yet — render nothing (no stray "or" divider).
  if (OAUTH_PROVIDERS.length === 0) return null

  return (
    <div className="mk-oauth">
      {error && <div className="mk-error">{error}</div>}
      {OAUTH_PROVIDERS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className="mk-oauth-btn"
          onClick={() => start(id)}
          disabled={busy !== null}
        >
          {icons[id]}
          <span>{busy === id ? 'Redirecting…' : `Continue with ${label}`}</span>
        </button>
      ))}
      <div className="mk-or"><span>or</span></div>
    </div>
  )
}
