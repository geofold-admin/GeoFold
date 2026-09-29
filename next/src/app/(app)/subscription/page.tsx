'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api-client'
import { DEMO_MODE } from '@/lib/demo'
import { formatBytes, formatIdr } from '@/lib/pricing'
import { parseIpaymuDeadline } from '@/lib/ipaymu-time'
import type { SubscriptionMe } from '@/lib/types'
import { CheckoutModal, type Channel } from '@/components/CheckoutModal'

/**
 * One row of the buyer's payment history, as /api/payments/history returns it.
 *
 * Only the fields the resume callout needs are declared. The route also carries provider, fee and
 * the settlement timestamp; none of them changes whether the order is still payable.
 */
interface PaymentRow {
  orderId: string
  method: string
  channel: string | null
  label: string | null
  totalIdr: number
  status: string
  createdAtUtc: string
  settledAtUtc: string | null
  expiresAt: string | null
}

/**
 * Is this row an attempt the buyer can STILL pay?
 *
 * A pending row is not automatically a live one — the same distinction the checkout and the
 * account ledger draw. The order's own deadline is the authority: a QRIS code that has lapsed, or
 * a row past the reservation window, is history, not a tagihan to resume. A row with no deadline
 * at all is a virtual account, which iPaymu leaves open for hours; the server re-checks it before
 * handing anything back, so treating it as live here cannot strand the buyer on a dead code.
 *
 * The deadline is parsed as WIB by `parseIpaymuDeadline` for the reason set out there: iPaymu
 * reports WIB with no offset, and reading it as local time moved the deadline seven hours in the
 * direction that kept a dead code looking live.
 */
function isOutstanding(p: PaymentRow): boolean {
  if (p.status !== 'pending') return false
  if (!p.expiresAt) return true
  const deadline = parseIpaymuDeadline(p.expiresAt)
  return !Number.isFinite(deadline) || deadline - Date.now() > 0
}

/** An iPaymu deadline, in the buyer's locale. Parsed as WIB, not as the browser's own zone. */
function formatDeadline(value: string): string {
  const ms = parseIpaymuDeadline(value)
  const date = new Date(Number.isFinite(ms) ? ms : value)
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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
  /* The buyer's own payment rows, from the same endpoint the account ledger reads. The
     subscription screen is where a buyer who wants to pay comes back to, so it has to know about
     the order they already hold — otherwise "Upgrade" here starts a second invoice or, worse,
     hides the one that is still payable. */
  const [payments, setPayments] = useState<PaymentRow[] | null>(null)

  const loadMe = useCallback(
    () =>
      api<SubscriptionMe>('/api/subscriptions/me')
        .then(setMe)
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.')),
    [],
  )

  const loadHistory = useCallback(
    () =>
      api<{ payments: PaymentRow[] }>('/api/payments/history')
        .then((res) => setPayments(res.payments ?? []))
        // The ledger is an enhancement on this screen, not the page's reason to exist: a failure
        // here must not take the plan and quota readout down with it.
        .catch(() => setPayments([])),
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
      await Promise.all([loadMe(), loadHistory()])
    }
    void run()
  }, [loadMe, loadHistory])

  /*
   * THE OUTSTANDING ORDER, when there is one.
   *
   * The newest still-payable attempt the buyer owns. A row can be 'pending' in the database and
   * past its own deadline at the same time — no scheduler flips those rows — so payability is
   * decided by the row's own window (`isOutstanding`), the same rule the checkout and the account
   * ledger apply, and the two screens cannot disagree about which order is live.
   */
  const outstanding = useMemo<PaymentRow | null>(
    () => (payments ?? []).find(isOutstanding) ?? null,
    [payments],
  )

  /* The channel to resume, derived from the outstanding row. The label is the human name ("QRIS",
     "BCA"); `channel` is the code the server validates. A row whose payload predates the channel
     field falls back to the method, which is enough for the server to find the order and decide
     whether it is still payable. */
  const resumeChannel = useMemo<Channel | null>(() => {
    if (!outstanding) return null
    const method: Channel['method'] = outstanding.method === 'va' ? 'va' : 'qris'
    return {
      method,
      channel: outstanding.channel ?? (method === 'qris' ? 'mpm' : 'bca'),
      label: outstanding.label ?? outstanding.method.toUpperCase(),
    }
  }, [outstanding])

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
      {!me.premiumActive && (
        <GoPremium
          offer={me.offer}
          onGranted={loadMe}
          outstanding={outstanding}
          resume={resumeChannel}
        />
      )}
    </div>
  )
}

// `offer` comes from the server rather than from lib/pricing, because the price lives in a
// server-only env var: imported here it would fall back to the default and could quote a figure
// the checkout does not charge.
function GoPremium({
  offer,
  onGranted,
  outstanding,
  resume,
}: {
  offer: SubscriptionMe['offer']
  onGranted: () => Promise<unknown>
  /** The buyer's newest still-payable iPaymu attempt, or null when they hold none. */
  outstanding: PaymentRow | null
  /** That attempt's channel, so the popup resumes its code instead of asking them to re-order. */
  resume: Channel | null
}) {
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
        {outstanding
          ? `Lanjutkan pembayaran: ${formatIdr(outstanding.totalIdr)}`
          : `Upgrade ke Premium: ${offer.priceLabel}`}
      </button>
      <p className="hint" style={{ marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
        {offer.days} hari, semua fitur, penyimpanan {offer.storageLabel}. Bisa QRIS, transfer bank / VA,
        dompet digital, kartu, dan gerai ritel.
      </p>

      {/* THE OUTSTANDING INVOICE, WHEN THE BUYER STILL HOLDS ONE.
          Without this the subscription screen was the one place a live order went missing: the
          buyer pressed "Upgrade" here, the modal asked them to pick a channel again, and the order
          they had already created was never the one they ended up paying. The row comes from the
          same history endpoint the account ledger reads, so this screen and /account agree on
          which attempt is live — and the deadline is shown in WIB, the zone iPaymu reported it in,
          rather than in whatever zone the browser happens to sit in. */}
      {outstanding && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            border: '1px solid var(--line)',
            background: 'var(--accent-soft)',
          }}
        >
          <strong style={{ fontSize: 13 }}>Anda punya tagihan yang belum dibayar.</strong>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            {outstanding.label ?? (outstanding.method === 'va' ? 'VA' : 'QRIS')} · {formatIdr(outstanding.totalIdr)}
            {outstanding.expiresAt ? ` · berlaku sampai ${formatDeadline(outstanding.expiresAt)}` : ''}
          </p>
        </div>
      )}

      {msg && (
        <p className={msg.ok ? undefined : 'error'} style={{ marginTop: 10, marginBottom: 0, color: msg.ok ? 'var(--spruce-ink)' : undefined }}>
          {msg.text}
        </p>
      )}

      {/* THE POPUP. Same component the pricing page opens, so the QR, the virtual account, the
          polling and the resume-an-unpaid-order behaviour are one implementation, not two.

          `resume` carries the outstanding order's channel when the buyer holds a still-payable
          tagihan, so the modal opens on the code rather than on the channel picker: they already
          chose QRIS or BCA once, and being asked again is being asked to re-order. With no
          outstanding order it is null and the modal behaves exactly as before. */}
      <CheckoutModal
        isOpen={open}
        onClose={() => setOpen(false)}
        offerLabel={offer.priceLabel}
        storageLabel={offer.storageLabel}
        locale="id"
        resume={resume}
      />
    </div>
  )
}
