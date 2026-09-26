'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api-client'
import { DEMO_MODE } from '@/lib/demo'
import { formatBytes } from '@/lib/pricing'
import type { SubscriptionMe } from '@/lib/types'

function Meter({
  label,
  used,
  limit,
  unit = '',
  format,
}: {
  label: string
  used: number
  limit: number | null
  unit?: string
  /** Renders the raw numbers for display. Storage passes formatBytes; counts need nothing. */
  format?: (n: number) => string
}) {
  const unlimited = limit === null
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100))
  const near = pct >= 90
  const show = (n: number) => (format ? format(n) : `${n}${unit}`)
  return (
    <div className={`meter${near ? ' warn' : ''}`}>
      <div className="row" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{label}</span>
        <span className="hint" style={{ fontFamily: 'var(--font-mono)' }}>
          {show(used)} {unlimited ? '· unlimited' : `/ ${show(limit)}`}
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
    // Coming back from the gateway's hosted page, the callback may be delayed. Ask the server to
    // reconcile this user's pending payments first, so a completed payment shows as Premium on the
    // page the customer is already looking at rather than after a support email.
    const returningFromCheckout =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('order')

    const run = async () => {
      if (returningFromCheckout && !DEMO_MODE) {
        await api('/api/payments/ipaymu/sync', { method: 'POST' }).catch(() => {
          // Reconciling is best-effort; the plan state below is loaded either way.
        })
      }
      await loadMe()
    }
    void run()
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
        <div className="card-title">Usage</div>
        <Meter label="Projects" used={me.usage.projects} limit={me.limits.maxProjects} />
        <Meter label="Surveys today" used={me.usage.surveysToday} limit={me.limits.dailySurveys} />
        <Meter label="Photos today" used={me.usage.photosToday} limit={me.limits.dailyPhotos} />
        <Meter
          label="Cloud storage"
          used={me.usage.storageBytes}
          limit={me.limits.storageBytes}
          format={formatBytes}
        />
        {me.limits.photosPerProject != null && (
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>Up to {me.limits.photosPerProject} photos per project on the free plan.</p>
        )}
      </div>
      {!me.premiumActive && <GoPremium offer={me.offer} onGranted={loadMe} />}
    </div>
  )
}

// `offer` comes from the server rather than from lib/pricing, because the price lives in a
// server-only env var: imported here it would fall back to the default and could quote a figure
// the checkout does not charge.
function GoPremium({ offer, onGranted }: { offer: SubscriptionMe['offer']; onGranted: () => Promise<unknown> }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<null | 'redeem' | 'pay'>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // The redeem/pay endpoints are live-only; the demo client has no handlers for them.
  if (DEMO_MODE) {
    return (
      <div className="card">
        <div className="card-title">Go Premium</div>
        <p className="hint" style={{ margin: 0 }}>Upgrades run through the live app. They are disabled in this sample-data demo.</p>
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
      // Off to the gateway's hosted page, which lists every channel enabled on the merchant
      // account. Which gateway that is (iPaymu or Midtrans) is the server's choice, not ours.
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
        {busy === 'pay' ? 'Membuka pembayaran…' : `Upgrade ke Premium: ${offer.priceLabel}`}
      </button>
      <p className="hint" style={{ marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
        {offer.days} hari, semua fitur, penyimpanan {offer.storageLabel}. Bisa QRIS, transfer bank / VA,
        dompet digital, kartu, dan gerai ritel.
      </p>

      {msg && (
        <p className={msg.ok ? undefined : 'error'} style={{ marginTop: 10, marginBottom: 0, color: msg.ok ? 'var(--spruce-ink)' : undefined }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
