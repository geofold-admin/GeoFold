'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/AuthContext'
import { DEMO_MODE } from '@/lib/demo'
import { OAuthButtons } from '@/components/OAuthButtons'

type Mode = 'login' | 'signup' | 'forgot'

const titles: Record<Mode, string> = {
  login: 'Geofold Portal',
  signup: 'Create your account',
  forgot: 'Reset your password',
}

const subtitles: Record<Mode, string> = {
  login: 'Sign in to access your survey dashboard.',
  signup: 'Set up an account to start collecting survey points.',
  forgot: "Enter your email and we'll send a reset link.",
}

export default function LoginPage() {
  const { session, loading, enterDemo } = useAuth()
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* WHERE THE VISITOR GOES AFTER SIGNING IN.
     `/home` unless the URL asks for somewhere else, which is what `?next=` is for: the invoice
     page sends a signed-out buyer here with the invoice it was trying to open, so signing in
     lands them back on that invoice rather than on the dashboard they did not ask for.
     The value is validated before use — it must be a same-site path starting with a single `/`,
     so a crafted link cannot turn the sign-in page into an open redirect (`//evil.example` is a
     protocol-relative URL and would leave the site, and `/\evil.example` is treated the same way
     by several browsers). Anything that fails the check falls back to `/home`. */
  const nextPath = useMemo(() => {
    if (typeof window === 'undefined') return '/home'
    const raw = new URLSearchParams(window.location.search).get('next')
    if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/home'
    return raw
  }, [])

  useEffect(() => {
    if (!loading && session) router.replace(nextPath)
  }, [loading, session, router, nextPath])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'link_expired') {
      setError('That link has expired or was already used. Enter your details to try again.')
    }
  }, [])

  if (loading || session) {
    return <div className="mk-login-shell"><div className="mk-login-body">Loading…</div></div>
  }

  const switchMode = (m: Mode) => { setMode(m); setError(null); setNotice(null) }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (DEMO_MODE) {
      enterDemo() // no real backend configured yet — any credentials continue into the sample data
      return
    }
    setBusy(true)
    try {
      const supabase = createSupabaseBrowserClient()
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        })
        if (error) throw error
        if (!data.session) setNotice('Almost there. Check your email for a confirmation link to finish signing up.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback?next=/reset`,
        })
        if (error) throw error
        setNotice('If that email has an account, a password reset link is on its way.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mk-login-shell">
      <div className="mk-login-top">
        <Link href="/" className="mk-wordmark">Geofold</Link>
      </div>

      <div className="mk-login-body">
        <div className="mk-card">
          <div className="mk-card-t">{titles[mode]}</div>
          <div className="mk-card-sub">
            {DEMO_MODE ? 'Demo mode: enter anything to explore with sample data.' : subtitles[mode]}
          </div>

          {error && <div className="mk-error">{error}</div>}
          {notice && <div className="mk-note">{notice}</div>}

          {/* Social sign-in isn't meaningful in demo mode, or on the reset-password step. */}
          {!DEMO_MODE && mode !== 'forgot' && <OAuthButtons />}

          <form onSubmit={submit}>
            <div className="mk-card-fields">
              <div>
                <label className="mk-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className="mk-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              {mode !== 'forgot' && (
                <div>
                  <label className="mk-label" htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    className="mk-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </div>
              )}
            </div>

            <button type="submit" className="mk-submit" disabled={busy}>
              {busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Sign up' : 'Send reset link'}
            </button>
          </form>

          <div className="mk-card-foot">
            {mode === 'forgot' ? (
              <a href="#" onClick={(e) => { e.preventDefault(); switchMode('login') }}>Back to sign in</a>
            ) : (
              <>
                {mode === 'login' && !DEMO_MODE && (
                  <>
                    <a href="#" onClick={(e) => { e.preventDefault(); switchMode('forgot') }}>Forgot password?</a>
                    {' · '}
                  </>
                )}
                <a href="#" onClick={(e) => { e.preventDefault(); switchMode(mode === 'login' ? 'signup' : 'login') }}>
                  {mode === 'login' ? 'Need access?' : 'Already have an account?'}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
