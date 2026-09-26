'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { DEMO_MODE } from '@/lib/demo'

export default function ResetPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (DEMO_MODE) { setReady(true); return }
    const supabase = createSupabaseBrowserClient()
    // The recovery link puts tokens in the URL; the client turns them into a session on load.
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setHasSession(!!s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (DEMO_MODE) { setError('Password reset is not available in demo mode.'); return }
    setBusy(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
      setTimeout(() => router.replace('/home'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  // The link only becomes a session once the recovery tokens are exchanged; until then, an expired
  // or already-used link leaves no session and the form would be pointless.
  const invalid = ready && !DEMO_MODE && !hasSession

  return (
    <div className="mk-login-shell">
      <div className="mk-login-top">
        <Link href="/" className="mk-wordmark">Geofold</Link>
      </div>

      <div className="mk-login-body">
        <div className="mk-card">
          <div className="mk-card-t">Choose a new password</div>
          <div className="mk-card-sub">
            {done
              ? 'Password updated. Signing you in…'
              : invalid
                ? 'This reset link is invalid or has expired.'
                : 'Enter a new password for your GeoFold account.'}
          </div>

          {error && <div className="mk-error">{error}</div>}

          {!done && (invalid ? (
            <div className="mk-card-foot" style={{ marginTop: 4 }}>
              <Link href="/login">Request a new reset link</Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="mk-card-fields">
                <div>
                  <label className="mk-label" htmlFor="password">New password</label>
                  <input
                    id="password"
                    type="password"
                    className="mk-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="mk-label" htmlFor="confirm">Confirm password</label>
                  <input
                    id="confirm"
                    type="password"
                    className="mk-input"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button type="submit" className="mk-submit" disabled={busy || !ready}>
                {busy ? 'Working…' : 'Update password'}
              </button>
            </form>
          ))}

          <div className="mk-card-foot">
            <Link href="/login">Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
