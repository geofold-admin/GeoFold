'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api-client'
import { DEMO_MODE } from '@/lib/demo'
import { formatBytes } from '@/lib/pricing'
import type { SubscriptionMe } from '@/lib/types'
import { CheckoutModal } from '@/components/CheckoutModal'

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
  const [busy, setBusy] = useState<null | 'redeem'>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  /* The checkout popup. Mounted here rather than only on the marketing page because this is the
     app's own upgrade screen: the buyer pressed "Upgrade" in the signed-in portal, and the modal
     that answers is the same one /pricing opens, so the two flows cannot drift apart. */
  const [open, setOpen] = useState(false)

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
    /*
     * THE CHECKOUT IS A POPUP, ON THIS PAGE.
     *
     * It used to do two things: look for an unpaid invoice and, if one existed, navigate to a
     * standalone /invoice page; otherwise hand the buyer to the gateway's hosted page in the same
     * tab. Both are gone. Payment now happens in the modal the marketing site already uses — the
     * same one that draws the QR or the virtual-account number inline, polls for settlement and
     * resumes an unpaid order instead of starting a second one. One flow, one screen, and the
     * buyer never leaves the app to pay.
     */
    setOpen(true)
  }

  return (
    <div className="card">
      <div className="card-title">Go Premium</div>

      {DEMO_MODE ? (
        /* Key redemption is a real database write and has no demo handler, so the form is replaced
           by a line saying so. The CHECKOUT below is not: /api/payments/ipaymu/direct answers in
           demo mode, so the popup is fully previewable — QR and virtual account both. */
        <p className="hint" style={{ margin: '0 0 14px' }}>
          Key redemption runs against the live database, so it is disabled in this sample-data demo.
        </p>
      ) : (
        <>
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
        </>
      )}

      <button type="button" onClick={startCheckout} style={{ width: '100%' }}>
        {`Upgrade ke Premium: ${offer.priceLabel}`}
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

      {/* THE POPUP. Same component the pricing page opens, so the QR, the virtual account, the
          polling and the resume-an-unpaid-order behaviour are one implementation, not two. */}
      <CheckoutModal
        isOpen={open}
        onClose={() => setOpen(false)}
        offerLabel={offer.priceLabel}
        storageLabel={offer.storageLabel}
        locale="id"
      />
    </div>
  )
}
