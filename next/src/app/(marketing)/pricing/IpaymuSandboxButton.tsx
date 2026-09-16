'use client'

import { useState } from 'react'

type Props = { label: string; loadingLabel: string; genericError: string }

/** Starts the public, sandbox-only verification journey. */
export function IpaymuSandboxButton({ label, loadingLabel, genericError }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/payments/ipaymu/verification-checkout', { method: 'POST' })
      const body = (await res.json().catch(() => null)) as { redirectUrl?: unknown; message?: unknown } | null
      if (!res.ok || typeof body?.redirectUrl !== 'string' || !body.redirectUrl) {
        throw new Error(typeof body?.message === 'string' ? body.message : genericError)
      }
      window.location.assign(body.redirectUrl)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : genericError)
      setBusy(false)
    }
  }

  return (
    <div className="mk-ipaymu-test-action">
      <button type="button" className="mk-btn mk-btn-outline" onClick={start} disabled={busy}>
        {busy ? loadingLabel : label}
      </button>
      {error && <p className="mk-ipaymu-test-error" role="alert">{error}</p>}
    </div>
  )
}
