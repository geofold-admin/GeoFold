'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api-client'
import { DEMO_MODE } from '@/lib/demo'
import { useAuth } from '@/lib/AuthContext'
import { formatIdr } from '@/lib/pricing'
import type { Locale } from '@/lib/i18n'

/**
 * THE INVOICE PAGE — /invoice
 *
 * WHY IT EXISTS. The checkout is a modal that renders a QR or a virtual-account number inline.
 * That works while the buyer stays on the pricing page; it fails the moment they close the tab,
 * switch device, or want to check tomorrow whether the transfer landed. A payment is not a moment,
 * it is a state that lasts up to 24 hours, and a state needs an address. This page is that address,
 * and it is also where a buyer is sent when they try to start a second purchase while one is
 * still unpaid.
 *
 * WHAT IT IS NOT. It cannot grant premium. Settlement is decided by the gateway and applied by
 * `settleIpaymuOrder` through the callback or the sync route; this page polls the sync route and
 * reports what it finds. Nothing here is trusted for anything that matters.
 *
 * THE TWO ROLES IT PLAYS, and they are the same page:
 *   - `?order=GF-…`  — the buyer returned, or was redirected here. Shows that exact order.
 *   - no parameter   — shows the newest unpaid order, or an empty state offering a new one.
 *
 * LANGUAGE. Bilingual, like the checkout it replaces: the buyer is in the marketing site's
 * locale, and the last screen before money moves should be in the language they have been reading.
 */

type Copy = {
  meta: string
  eyebrow: string
  title: string
  lede: string
  loading: string
  noneTitle: string
  noneBody: string
  noneCta: string
  paidTitle: string
  paidBody: string
  paidCta: string
  expiredTitle: string
  expiredBody: string
  expiredCta: string
  deniedTitle: string
  deniedBody: string
  deniedCta: string
  scanTitle: string
  scanBody: string
  vaTitle: string
  vaBody: string
  hostedTitle: string
  hostedBody: string
  hostedCta: string
  copy: string
  copied: string
  qrFailed: string
  retry: string
  amount: string
  fee: string
  total: string
  expires: string
  created: string
  reference: string
  status: string
  statusPending: string
  statusActive: string
  statusPaid: string
  statusExpired: string
  statusDenied: string
  waiting: string
  waitingBody: string
  checkNow: string
  checking: string
  changeMethod: string
  changeMethodBody: string
  newInvoice: string
  newInvoiceBody: string
  newInvoiceCta: string
  cancel: string
  secured: string
  backHome: string
  errorTitle: string
}

const copy: Record<Locale, Copy> = {
  id: {
    meta: 'Tagihan',
    eyebrow: 'Tagihan',
    title: 'Selesaikan pembayaran Anda',
    lede: 'Halaman ini menyimpan tagihan Anda. Bisa dibuka kapan saja, dari perangkat mana saja, sampai pembayaran selesai.',
    loading: 'Memuat tagihan…',
    noneTitle: 'Tidak ada tagihan yang menunggu',
    noneBody: 'Semua tagihan Anda sudah selesai. Kalau ingin membuka fitur Premium, buat tagihan baru di halaman harga.',
    noneCta: 'Lihat paket Premium',
    paidTitle: 'Pembayaran sudah diterima',
    paidBody: 'Akun Anda aktif sebagai GeoFold Premium. Semua batas sudah terbuka.',
    paidCta: 'Buka portal',
    expiredTitle: 'Tagihan ini sudah kedaluwarsa',
    expiredBody: 'Batas waktunya sudah lewat, jadi kode pembayaran ini tidak bisa dipakai lagi. Buat tagihan baru untuk melanjutkan.',
    expiredCta: 'Buat tagihan baru',
    deniedTitle: 'Tagihan ini sudah dibatalkan',
    deniedBody: 'Tagihan ini diganti oleh tagihan yang lebih baru, jadi kode lama tidak berlaku. Kalau sudah terlanjur membayar yang lama, hubungi kami dengan nomor referensinya.',
    deniedCta: 'Buat tagihan baru',
    scanTitle: 'Pindai kode QRIS ini',
    scanBody: 'Buka aplikasi bank atau dompet digital Anda, pilih QRIS, lalu pindai kode di atas. Nominal sudah terisi otomatis.',
    vaTitle: 'Bayar ke nomor virtual account ini',
    vaBody: 'Masukkan nomor di atas lewat m-banking, ATM, atau aplikasi bank Anda. Nominal harus sama persis.',
    hostedTitle: 'Lanjutkan di halaman pembayaran',
    hostedBody: 'Tagihan ini diproses lewat halaman aman penyedia pembayaran. Tekan tombol di bawah untuk membukanya.',
    hostedCta: 'Buka halaman pembayaran',
    copy: 'Salin',
    copied: 'Tersalin',
    qrFailed: 'Kode QR gagal dimuat.',
    retry: 'Coba lagi',
    amount: 'Jumlah',
    fee: 'Biaya layanan',
    total: 'Total bayar',
    expires: 'Berlaku sampai',
    created: 'Dibuat',
    reference: 'Nomor referensi',
    status: 'Status',
    statusPending: 'Menunggu pembayaran',
    statusActive: 'Siap dibayar',
    statusPaid: 'Sudah dibayar',
    statusExpired: 'Kedaluwarsa',
    statusDenied: 'Dibatalkan',
    waiting: 'Menunggu pembayaran Anda',
    waitingBody: 'Halaman ini memperbarui sendiri begitu pembayaran masuk. Anda boleh membiarkannya terbuka atau menutupnya dan kembali nanti.',
    checkNow: 'Cek status sekarang',
    checking: 'Memeriksa…',
    changeMethod: 'Ganti metode pembayaran',
    changeMethodBody: 'Pilih metode lain. Tagihan yang sekarang akan diganti, jadi kode lama tidak bisa dipakai lagi.',
    newInvoice: 'Buat tagihan baru',
    newInvoiceBody: 'Tagihan ini sudah tidak bisa dibayar. Membuat tagihan baru akan menggantikannya.',
    newInvoiceCta: 'Buat tagihan baru',
    cancel: 'Batal',
    secured: 'Diproses oleh gateway pembayaran berizin di Indonesia',
    backHome: 'Kembali ke beranda',
    errorTitle: 'Tagihan tidak bisa dimuat',
  },
  en: {
    meta: 'Invoice',
    eyebrow: 'Invoice',
    title: 'Finish your payment',
    lede: 'This page holds your invoice. Open it any time, from any device, until the payment is done.',
    loading: 'Loading your invoice…',
    noneTitle: 'No invoice is waiting',
    noneBody: 'Every invoice on this account is settled. To open Premium, start a new one from the pricing page.',
    noneCta: 'See the Premium plan',
    paidTitle: 'Payment received',
    paidBody: 'Your account is now GeoFold Premium. Every limit is lifted.',
    paidCta: 'Open the portal',
    expiredTitle: 'This invoice has expired',
    expiredBody: 'Its payment window has passed, so this code can no longer be used. Create a new invoice to continue.',
    expiredCta: 'Create a new invoice',
    deniedTitle: 'This invoice was cancelled',
    deniedBody: 'A newer invoice replaced this one, so the old code no longer works. If you already paid the old one, contact us with its reference number.',
    deniedCta: 'Create a new invoice',
    scanTitle: 'Scan this QRIS code',
    scanBody: 'Open your banking or e-wallet app, choose QRIS, then scan the code above. The amount is filled in for you.',
    vaTitle: 'Pay to this virtual account number',
    vaBody: 'Enter the number above in your banking app, ATM or m-banking. The amount must match exactly.',
    hostedTitle: 'Continue on the payment page',
    hostedBody: "This invoice is processed through the payment provider's secure page. Use the button below to open it.",
    hostedCta: 'Open the payment page',
    copy: 'Copy',
    copied: 'Copied',
    qrFailed: 'The QR code could not be loaded.',
    retry: 'Try again',
    amount: 'Amount',
    fee: 'Service fee',
    total: 'Total to pay',
    expires: 'Valid until',
    created: 'Created',
    reference: 'Reference number',
    status: 'Status',
    statusPending: 'Waiting for payment',
    statusActive: 'Ready to pay',
    statusPaid: 'Paid',
    statusExpired: 'Expired',
    statusDenied: 'Cancelled',
    waiting: 'Waiting for your payment',
    waitingBody: 'This page updates itself the moment your payment lands. Leave it open, or close it and come back later.',
    checkNow: 'Check status now',
    checking: 'Checking…',
    changeMethod: 'Change payment method',
    changeMethodBody: 'Pick another method. Your current invoice is replaced, so the old code stops working.',
    newInvoice: 'Create a new invoice',
    newInvoiceBody: 'This invoice can no longer be paid. Creating a new one replaces it.',
    newInvoiceCta: 'Create a new invoice',
    cancel: 'Cancel',
    secured: 'Processed by a licensed Indonesian payment gateway',
    backHome: 'Back to home',
    errorTitle: 'The invoice could not be loaded',
  },
}

interface Invoice {
  orderId: string
  status: string
  active: boolean
  method: string
  channel: string | null
  label: string | null
  paymentNo: string | null
  qrUrl: string | null
  qrAvailable: boolean
  hostedUrl: string | null
  amountIdr: number
  feeIdr: number
  totalIdr: number
  expiresAt: string | null
  createdAtUtc: string
  grantsDays: number
}

interface InvoiceResponse {
  invoice: Invoice | null
  offer: { priceIdr: number; priceLabel: string; days: number; storageLabel: string }
}

const CHANNELS: Array<{ method: 'qris' | 'va'; channel: string; label: string }> = [
  { method: 'qris', channel: 'mpm', label: 'QRIS' },
  { method: 'va', channel: 'bca', label: 'BCA' },
  { method: 'va', channel: 'mandiri', label: 'Mandiri' },
  { method: 'va', channel: 'bni', label: 'BNI' },
  { method: 'va', channel: 'bri', label: 'BRI' },
  { method: 'va', channel: 'permata', label: 'Permata' },
]

export default function InvoicePage() {
  /* `useSearchParams` needs a Suspense boundary during prerendering. The fallback is the same
     loading line the page shows while it fetches, so the boundary is invisible. */
  return (
    <Suspense
      fallback={
        <div className="mk-inv-shell">
          <div className="mk-inv-body">
            <p className="mk-inv-loading">
              <Loader2 size={18} className="mk-inv-spin" aria-hidden="true" />
              Loading…
            </p>
          </div>
        </div>
      }
    >
      <InvoicePageInner />
    </Suspense>
  )
}

function InvoicePageInner() {
  const { locale } = useLocaleFromCookie()
  const c = copy[locale]
  const params = useSearchParams()
  const router = useRouter()
  const { session, loading: authLoading } = useAuth()

  const orderParam = params.get('order')

  const [data, setData] = useState<InvoiceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrFailed, setQrFailed] = useState(false)
  const [qrAttempt, setQrAttempt] = useState(0)
  const [switching, setSwitching] = useState(false)
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [justPaid, setJustPaid] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  /* Sign-in is required: an invoice belongs to an account. The redirect keeps the order in the
     URL, so a buyer who follows a link from their email lands back on the right invoice after
     signing in rather than on an empty page. */
  useEffect(() => {
    if (!authLoading && !session) {
      const next = orderParam ? `/invoice?order=${encodeURIComponent(orderParam)}` : '/invoice'
      router.replace(`/login?next=${encodeURIComponent(next)}`)
    }
  }, [authLoading, session, router, orderParam])

  const load = useCallback(async () => {
    try {
      const qs = orderParam ? `?order=${encodeURIComponent(orderParam)}` : ''
      const res = await api<InvoiceResponse>(`/api/payments/invoice${qs}`)
      setData(res)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.')
    }
  }, [orderParam])

  useEffect(() => {
    if (authLoading || !session) return
    /* Coming back from a hosted checkout page, or landing here with an order id, is exactly the
       moment to reconcile: the callback may be delayed by minutes, and asking the gateway
       directly turns that into a page refresh instead of a support email. Best effort — the
       invoice loads either way. */
    const run = async () => {
      if (orderParam && !DEMO_MODE) {
        await api('/api/payments/ipaymu/sync', { method: 'POST' }).catch(() => {})
      }
      await load()
    }
    void run()
  }, [authLoading, session, orderParam, load])

  /* Poll while there is something to wait for. 4s matches the checkout modal: fast enough that a
     completed transfer feels immediate, slow enough not to hammer the gateway. */
  useEffect(() => {
    const inv = data?.invoice
    if (!inv || !inv.active) {
      stopPolling()
      return
    }
    const check = async () => {
      try {
        const sync = await api<{ granted: boolean }>('/api/payments/ipaymu/sync', { method: 'POST' })
        if (sync.granted) {
          setJustPaid(true)
          await load()
          stopPolling()
          return
        }
        /* Not granted yet: the order may still have been settled by a callback between polls, so
           the row is re-read rather than assumed unchanged. */
        await load()
      } catch {
        /* A dropped poll is not a failure; the next tick tries again. */
      }
    }
    pollRef.current = setInterval(check, 4000)
    return stopPolling
  }, [data?.invoice, load, stopPolling])

  const checkNow = async () => {
    setChecking(true)
    try {
      const sync = await api<{ granted: boolean }>('/api/payments/ipaymu/sync', { method: 'POST' })
      if (sync.granted) setJustPaid(true)
      await load()
    } catch {
      /* stays on the current view */
    } finally {
      setChecking(false)
    }
  }

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Clipboard denied — the number is on screen and selectable, which is the fallback. */
    }
  }

  /* Change method = replace the order. `supersede` is what tells the route this is deliberate:
     without it the route would send us back here with the same invoice. */
  const changeMethod = async (chosen: { method: 'qris' | 'va'; channel: string }) => {
    setSwitching(true)
    setActionError(null)
    try {
      const res = await api<{ orderId: string }>('/api/payments/ipaymu/direct', {
        method: 'POST',
        body: JSON.stringify({ ...chosen, supersede: true }),
      })
      setJustPaid(false)
      setQrFailed(false)
      setQrAttempt(0)
      router.replace(`/invoice?order=${encodeURIComponent(res.orderId)}`)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not change the method.')
    } finally {
      setSwitching(false)
    }
  }

  const newInvoice = async (chosen: { method: 'qris' | 'va'; channel: string }) => {
    setCreating(true)
    setActionError(null)
    try {
      const res = await api<{ orderId: string }>('/api/payments/ipaymu/direct', {
        method: 'POST',
        body: JSON.stringify({ ...chosen, supersede: true }),
      })
      setJustPaid(false)
      setQrFailed(false)
      setQrAttempt(0)
      router.replace(`/invoice?order=${encodeURIComponent(res.orderId)}`)
      await load()
    } catch (e) {
      /* The one error worth naming: an unpaid invoice already exists, so the buyer is sent to it
         rather than shown a raw message. No order id needed — /invoice with no parameter resolves
         to the newest unpaid order, which is exactly the one that blocked this request. */
      if (e instanceof ApiError && e.code === 'invoice_pending') {
        router.replace('/invoice')
        return
      }
      setActionError(e instanceof Error ? e.message : 'Could not create a new invoice.')
    } finally {
      setCreating(false)
    }
  }

  if (authLoading || (!data && !error)) {
    return (
      <div className="mk-inv-shell">
        <div className="mk-inv-body">
          <p className="mk-inv-loading">
            <Loader2 size={18} className="mk-inv-spin" aria-hidden="true" />
            {c.loading}
          </p>
        </div>
      </div>
    )
  }

  const inv = data?.invoice ?? null
  const paid = inv?.status === 'settled' || justPaid
  const dead = inv ? !inv.active && inv.status === 'pending' : false

  return (
    <div className="mk-inv-shell">
      <div className="mk-inv-body">
        <header className="mk-inv-head">
          <p className="mk-eyebrow">{c.eyebrow}</p>
          <h1>{paid ? c.paidTitle : dead ? c.expiredTitle : inv?.status === 'denied' ? c.deniedTitle : c.title}</h1>
          <p className="mk-lede">
            {paid ? c.paidBody : dead ? c.expiredBody : inv?.status === 'denied' ? c.deniedBody : c.lede}
          </p>
        </header>

        {error && (
          <div className="mk-inv-card">
            <p className="mk-error" role="alert">
              <AlertCircle size={15} aria-hidden="true" />
              {error}
            </p>
          </div>
        )}

        {/* ---------- settled ---------- */}
        {paid && (
          <div className="mk-inv-card mk-inv-card--paid">
            <span className="mk-inv-tick" aria-hidden="true">
              <Check size={26} strokeWidth={2.5} />
            </span>
            <p className="mk-inv-paid-body">{c.paidBody}</p>
            <Link href="/home" className="mk-btn mk-btn-primary mk-inv-full">
              {c.paidCta}
            </Link>
            {inv && (
              <dl className="mk-inv-sums">
                <div>
                  <dt>{c.reference}</dt>
                  <dd>
                    <code>{inv.orderId}</code>
                  </dd>
                </div>
              </dl>
            )}
          </div>
        )}

        {/* ---------- nothing outstanding ---------- */}
        {!inv && !error && (
          <div className="mk-inv-card">
            <h2 className="mk-inv-card-title">{c.noneTitle}</h2>
            <p className="mk-inv-card-body">{c.noneBody}</p>
            <Link href="/pricing" className="mk-btn mk-btn-primary mk-inv-full">
              {c.noneCta}
            </Link>
          </div>
        )}

        {/* ---------- the invoice ---------- */}
        {inv && !paid && (
          <>
            <div className="mk-inv-card">
              <div className="mk-inv-status-row">
                <span className={`mk-inv-pill${inv.active ? ' is-active' : ' is-dead'}`}>
                  {inv.active ? <Clock size={13} aria-hidden="true" /> : <AlertCircle size={13} aria-hidden="true" />}
                  {inv.active ? c.statusActive : inv.status === 'denied' ? c.statusDenied : c.statusExpired}
                </span>
                <span className="mk-inv-ref">
                  {c.reference} <code>{inv.orderId}</code>
                </span>
              </div>

              {inv.active && inv.method === 'qris' && inv.qrAvailable && (
                <div className="mk-inv-pay">
                  <h2 className="mk-inv-pay-title">{c.scanTitle}</h2>
                  <p className="mk-inv-pay-body">{c.scanBody}</p>
                  {!qrFailed ? (
                    <div className="mk-inv-qr">
                      {/* eslint-disable-next-line @next/next/no-img-element -- gateway-hosted PNG on
                          an allowlisted host or our own encoder route; next/image would proxy it
                          through the optimizer for no benefit, and the CSP already restricts it. */}
                      <img
                        key={qrAttempt}
                        src={inv.qrUrl ?? `/api/payments/ipaymu/qr?order=${encodeURIComponent(inv.orderId)}`}
                        alt={`QRIS code, ${formatIdr(inv.totalIdr)}`}
                        width={240}
                        height={240}
                        onError={() => setQrFailed(true)}
                      />
                    </div>
                  ) : (
                    <div className="mk-inv-value">
                      <code>{c.qrFailed}</code>
                      <button
                        type="button"
                        onClick={() => {
                          setQrFailed(false)
                          setQrAttempt((n) => n + 1)
                        }}
                      >
                        <RefreshCw size={14} aria-hidden="true" />
                        {c.retry}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {inv.active && inv.method === 'va' && inv.paymentNo && (
                <div className="mk-inv-pay">
                  <h2 className="mk-inv-pay-title">{c.vaTitle}</h2>
                  <p className="mk-inv-pay-body">{c.vaBody}</p>
                  <div className="mk-inv-value">
                    <code>{inv.paymentNo}</code>
                    <button type="button" onClick={() => copyValue(inv.paymentNo!)}>
                      <Copy size={14} aria-hidden="true" />
                      {copied ? c.copied : c.copy}
                    </button>
                  </div>
                </div>
              )}

              {inv.active && inv.hostedUrl && (
                <div className="mk-inv-pay">
                  <h2 className="mk-inv-pay-title">{c.hostedTitle}</h2>
                  <p className="mk-inv-pay-body">{c.hostedBody}</p>
                  <a href={inv.hostedUrl} className="mk-btn mk-btn-primary mk-inv-full" rel="noopener">
                    {c.hostedCta}
                  </a>
                </div>
              )}

              <dl className="mk-inv-sums">
                <div>
                  <dt>{c.amount}</dt>
                  <dd>{formatIdr(inv.amountIdr)}</dd>
                </div>
                {inv.feeIdr > 0 && (
                  <div>
                    <dt>{c.fee}</dt>
                    <dd>{formatIdr(inv.feeIdr)}</dd>
                  </div>
                )}
                <div className="total">
                  <dt>{c.total}</dt>
                  <dd>{formatIdr(inv.totalIdr || inv.amountIdr)}</dd>
                </div>
                {inv.expiresAt && inv.active && (
                  <div>
                    <dt>{c.expires}</dt>
                    <dd>{formatDateTime(inv.expiresAt, locale)}</dd>
                  </div>
                )}
                <div>
                  <dt>{c.created}</dt>
                  <dd>{formatDateTime(inv.createdAtUtc, locale)}</dd>
                </div>
              </dl>

              {inv.active && (
                <div className="mk-inv-waiting">
                  <Loader2 size={15} className="mk-inv-spin" aria-hidden="true" />
                  <div>
                    <strong>{c.waiting}</strong>
                    <span>{c.waitingBody}</span>
                  </div>
                </div>
              )}

              {inv.active && (
                <button type="button" className="mk-inv-ghost" onClick={checkNow} disabled={checking}>
                  {checking ? <Loader2 size={14} className="mk-inv-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                  {checking ? c.checking : c.checkNow}
                </button>
              )}
            </div>

            {/* ---------- replace the invoice ---------- */}
            <div className="mk-inv-card">
              <h2 className="mk-inv-card-title">{inv.active ? c.changeMethod : c.newInvoice}</h2>
              <p className="mk-inv-card-body">{inv.active ? c.changeMethodBody : c.newInvoiceBody}</p>
              <div className="mk-inv-channels">
                {CHANNELS.map((ch) => {
                  const isCurrent = inv.active && inv.channel === ch.channel
                  return (
                    <button
                      key={`${ch.method}-${ch.channel}`}
                      type="button"
                      className="mk-inv-channel"
                      disabled={switching || creating || isCurrent}
                      onClick={() => (inv.active ? changeMethod(ch) : newInvoice(ch))}
                    >
                      {ch.label}
                      {isCurrent && <Check size={13} aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
              {actionError && (
                <p className="mk-error" role="alert">
                  <AlertCircle size={15} aria-hidden="true" />
                  {actionError}
                </p>
              )}
            </div>
          </>
        )}

        <p className="mk-inv-secured">
          <ShieldCheck size={13} aria-hidden="true" />
          {c.secured}
        </p>

        <p className="mk-inv-back">
          <Link href="/">
            <ArrowLeft size={14} aria-hidden="true" />
            {c.backHome}
          </Link>
        </p>
      </div>
    </div>
  )
}

/**
 * A date the buyer can read.
 *
 * The gateway returns ISO strings and the page used to print them straight out, so the invoice
 * said "Valid until 2026-09-28T04:05:32.919Z" — correct, and useless to someone standing at a
 * cashier deciding whether they still have time. Both dates on this page now go through here, and
 * the locale is the one the rest of the page is written in.
 */
function formatDateTime(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale === 'id' ? 'id-ID' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * The marketing locale, read on the client.
 *
 * The rest of the marketing site resolves this on the server (see lib/i18n.server) and passes it
 * down as a prop. This page cannot: it is client-only by nature — it polls, it copies to the
 * clipboard, it holds the invoice in state — and a client component cannot await a cookie. The
 * cookie is read here instead, defaulting to the same DEFAULT_LOCALE the server uses, so the
 * worst case is the default language on the first frame.
 */
function useLocaleFromCookie(): { locale: Locale } {
  const [locale, setLocale] = useState<Locale>('en')
  useEffect(() => {
    const match = /(?:^|;\s*)geofold-lang=(id|en)/.exec(document.cookie)
    if (match) setLocale(match[1] as Locale)
  }, [])
  return { locale }
}
