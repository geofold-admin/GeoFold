'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api-client'
import { DEMO_MODE } from '@/lib/demo'
import type { SubscriptionMe } from '@/lib/types'

function Meter({ label, used, limit, unit = '' }: { label: string; used: number; limit: number | null; unit?: string }) {
  const unlimited = limit === null
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100))
  const near = pct >= 90
  return (
    <div className={`meter${near ? ' warn' : ''}`}>
      <div className="row" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{label}</span>
        <span className="hint" style={{ fontFamily: 'var(--font-mono)' }}>
          {used}{unit} {unlimited ? '· unlimited' : `/ ${limit}${unit}`}
        </span>
      </div>
      <div className="bar"><span style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

export default function SubscriptionPage() {
  const [me, setMe] = useState<SubscriptionMe | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadMe = useCallback(
    () =>
      api<SubscriptionMe>('/api/subscriptions/me')
        .then(setMe)
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.')),
    [],
  )

  useEffect(() => {
    void loadMe()
  }, [loadMe])

  if (error) return <p className="error">{error}</p>
  if (!me) return <p className="muted">Loading…</p>

  return (
    <div>
      <div className="page-head">
        <h1>Subscription</h1>
        <p>Your plan and how much of it you&apos;re using.</p>
      </div>
      <div className="card">
        <div className="row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="pill">{me.workspaceType}</span>
            <span className="hint">{me.premiumActive ? 'Premium' : 'Free plan'}</span>
          </div>
          <span style={{ fontSize: 14, color: me.premiumActive ? 'var(--spruce-ink)' : 'var(--ink-3)', fontWeight: 500 }}>
            {me.premiumActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        {me.premiumActive && me.premiumUntilUtc && (
          <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>Premium until {new Date(me.premiumUntilUtc).toLocaleDateString()}</p>
        )}
        {me.frozen && (
          <p className="error" style={{ marginTop: 8, marginBottom: 0 }}>
            Premium has expired and this workspace is over the free limit, so it is read-only. Renew Premium, or archive projects down to {me.limits.maxProjects}, to make changes again. Your data stays safe and exportable.
          </p>
        )}
      </div>
      <div className="card">
        <div className="card-title">Usage today</div>
        <Meter label="Projects" used={me.usage.projects} limit={me.limits.maxProjects} />
        <Meter label="Surveys today" used={me.usage.surveysToday} limit={me.limits.dailySurveys} />
        <Meter label="Photos today" used={me.usage.photosToday} limit={me.limits.dailyPhotos} />
        {me.limits.photosPerProject != null && (
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>Up to {me.limits.photosPerProject} photos per project on the free plan.</p>
        )}
      </div>
      {!me.premiumActive && <GoPremium onGranted={loadMe} />}
    </div>
  )
}

function GoPremium({ onGranted }: { onGranted: () => Promise<unknown> }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<null | 'redeem' | 'pay'>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // The redeem/pay endpoints are live-only; the demo client has no handlers for them.
  if (DEMO_MODE) {
    return (
      <div className="card">
        <div className="card-title">Go Premium</div>
        <p className="hint" style={{ margin: 0 }}>Upgrades run through the live app — they are disabled in this sample-data demo.</p>
      </div>
    )
  }

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setBusy('redeem')
    try {
      const r = await api<{ premiumUntilUtc: string }>('/api/subscriptions/redeem', {
        method: 'POST',
        body: JSON.stringify({ key }),
      })
      setKey('')
      setMsg({ ok: true, text: `Premium activated until ${new Date(r.premiumUntilUtc).toLocaleDateString()}.` })
      await onGranted()
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not redeem that key.' })
    } finally {
      setBusy(null)
    }
  }

  const startCheckout = async () => {
    setMsg(null)
    setBusy('pay')
    try {
      const r = await api<{ redirectUrl: string }>('/api/payments/checkout', { method: 'POST' })
      // Redirect to Midtrans Snap — the hosted page listing every payment method you've enabled.
      window.location.href = r.redirectUrl
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Gagal memulai pembayaran.' })
      setBusy(null)
    }
  }

  return (
    <div className="card">
      <div className="card-title">Go Premium</div>

      <form onSubmit={redeem} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Activation key"
          style={{ flex: 1, minWidth: 180 }}
        />
        <button type="submit" disabled={busy !== null || !key.trim()}>
          {busy === 'redeem' ? 'Redeeming…' : 'Redeem'}
        </button>
      </form>

      <div className="hint" style={{ margin: '14px 0 10px', textAlign: 'center' }}>or</div>

      <button type="button" onClick={startCheckout} disabled={busy !== null} style={{ width: '100%' }}>
        {busy === 'pay' ? 'Membuka pembayaran…' : 'Upgrade ke Premium'}
      </button>
      <p className="hint" style={{ marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
        Bisa kartu, transfer bank / VA, GoPay, ShopeePay, QRIS, dan lainnya.
      </p>

      {msg && (
        <p className={msg.ok ? undefined : 'error'} style={{ marginTop: 10, marginBottom: 0, color: msg.ok ? 'var(--spruce-ink)' : undefined }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
