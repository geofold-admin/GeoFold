'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api-client'
import { useAuth } from '@/lib/AuthContext'
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n'
import { parseIpaymuDeadline } from '@/lib/ipaymu-time'
import { CheckoutModal, type Channel } from '@/components/CheckoutModal'
import { ArrowUpRight, Check, Loader2, Receipt, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'

/**
 * THE ACCOUNT PAGE — the ledger, and the reason the header has an account chip.
 *
 * WHO READS THIS. A signed-in buyer, usually right after paying, asking one of three questions:
 * did my payment go through, what have I paid for, and what do I do about the one that did not.
 * Everything on the page answers one of those, and nothing on it is decoration.
 *
 * WHY IT IS NOT THE SUBSCRIPTION PAGE. /subscription already exists inside the app shell and is
 * about the WORKSPACE — quota, storage, what the plan unlocks. This page is about MONEY: orders,
 * amounts, statuses and dates. Merging them would put a ledger in the middle of a quota screen,
 * which is where the subscription page's own audience (someone checking whether they can still
 * upload) would not look for it.
 *
 * WHY THE TABLE IS A TABLE. This is the one screen on the site where the reader is comparing rows
 * rather than reading prose: same columns, repeated. A list of cards would be prettier in a
 * screenshot and worse to scan — the status column is the whole point, and a column is what lets
 * the eye run down it. It degrades to stacked rows on a phone, where there is no column to run
 * down anyway.
 *
 * THE STATUS IS THE DATABASE'S, TRANSLATED HERE. 'pending' can be payable or lapsed depending on
 * the order's own window, so a pending row past its deadline is shown as expired rather than
 * pending — the same rule the checkout applies, so the two screens cannot disagree.
 */

interface PaymentRow {
  orderId: string
  provider: string
  method: string
  channel: string | null
  label: string | null
  amountIdr: number
  feeIdr: number
  totalIdr: number
  grantsDays: number
  status: string
  createdAtUtc: string
  settledAtUtc: string | null
  expiresAt: string | null
}

interface Offer {
  priceIdr: number
  priceLabel: string
  days: number
  storageLabel: string
}

const copy = {
  id: {
    title: 'Akun & pembayaran',
    lede: 'Riwayat transaksi akun GeoFold Anda. Setiap pembayaran yang berhasil menambah 30 hari Premium pada akun ini.',
    signIn: 'Masuk untuk melihat akun Anda',
    signInCta: 'Masuk',
    loading: 'Memuat riwayat pembayaran…',
    failed: 'Riwayat pembayaran tidak bisa dimuat.',
    retry: 'Coba lagi',
    empty: 'Belum ada pembayaran di akun ini.',
    emptyCta: 'Lihat paket',
    th: { order: 'Nomor pesanan', method: 'Metode', date: 'Tanggal', amount: 'Jumlah', status: 'Status' },
    paid: 'Berhasil',
    until: 'Berlaku sampai',
    none: '—',
    summaryTitle: 'Ringkasan',
    totalPaid: 'Total dibayar',
    orders: 'Pesanan berhasil',
    latest: 'Pembayaran terakhir',
    ctaTitle: 'Perpanjang Premium',
    ctaBody: 'Sekali bayar untuk 30 hari. Tidak ada perpanjangan otomatis.',
    cta: 'Perpanjang sekarang',
    pendingNote: 'Anda punya tagihan yang belum dibayar.',
    pendingCta: 'Bayar sekarang',
    /* The lapsed invoice. Its row is still 'pending' in the database and its own deadline has
       passed, so there is no code left to resume — but the buyer's intent ("I want to pay") is
       still valid, and the server supersedes the dead order and issues a live one. The copy has
       to say that, or the button reads like a retry of something that cannot work. */
    lapsedNote: 'Tagihan terakhir sudah kedaluwarsa.',
    lapsedCta: 'Buat kode baru',
    secured: 'Diproses oleh gateway pembayaran berizin di Indonesia',
    status: {
      settled: 'Berhasil',
      pending: 'Menunggu',
      expired: 'Kedaluwarsa',
      denied: 'Dibatalkan',
      refunded: 'Dikembalikan',
    } as Record<string, string>,
  },
  en: {
    title: 'Account & payments',
    lede: 'Your GeoFold account’s transaction history. Every successful payment adds 30 days of Premium to this account.',
    signIn: 'Sign in to see your account',
    signInCta: 'Sign in',
    loading: 'Loading payment history…',
    failed: 'Payment history could not be loaded.',
    retry: 'Try again',
    empty: 'No payments on this account yet.',
    emptyCta: 'See plans',
    th: { order: 'Order number', method: 'Method', date: 'Date', amount: 'Amount', status: 'Status' },
    paid: 'Paid',
    until: 'Valid until',
    none: '—',
    summaryTitle: 'Summary',
    totalPaid: 'Total paid',
    orders: 'Successful orders',
    latest: 'Last payment',
    ctaTitle: 'Extend Premium',
    ctaBody: 'One payment for 30 days. No auto-renewal.',
    cta: 'Extend now',
    pendingNote: 'You have an unpaid invoice.',
    pendingCta: 'Pay now',
    lapsedNote: 'Your last invoice has expired.',
    lapsedCta: 'Request a new code',
    secured: 'Processed by a licensed Indonesian payment gateway',
    status: {
      settled: 'Paid',
      pending: 'Pending',
      expired: 'Expired',
      denied: 'Cancelled',
      refunded: 'Refunded',
    } as Record<string, string>,
  },
} as const

function formatIdr(amount: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(amount))}`
}

function formatDateTime(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale === 'id' ? 'id-ID' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * The status a reader should see, which is not always the one in the column.
 *
 * A pending row stops being payable when its own window lapses — iPaymu's expiry, or a QRIS code's
 * own deadline — and no scheduler flips those rows. Showing "Menunggu" on an order that can no
 * longer be paid is the single most misleading thing this page could do, so the deadline is
 * checked on every read.
 *
 * The deadline is parsed as WIB (see `parseIpaymuDeadline`): iPaymu reports WIB with no offset,
 * and reading it as local time moved the deadline seven hours in the direction that kept a dead
 * code looking live — on the browser this is the buyer's own zone, so the error changed with
 * where they were sitting.
 */
function displayStatus(p: PaymentRow): string {
  if (p.status !== 'pending') return p.status
  if (!p.expiresAt) return p.status
  const deadline = parseIpaymuDeadline(p.expiresAt)
  if (Number.isFinite(deadline) && deadline - Date.now() < 0) return 'expired'
  return p.status
}

export default function AccountPage() {
  const { session, loading: authLoading } = useAuth()
  const [locale, setLocale] = useState<Locale>('id')
  const c = copy[locale]

  const [rows, setRows] = useState<PaymentRow[] | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  /* WHICH LANGUAGE. The page is behind the login and is not indexed, so there is nothing to gain
     from a server round-trip for its own strings — but it must not disagree with the chrome around
     it either. The header resolves the locale on the server and writes it to the `lang` attribute
     of the `.mk` wrapper, so this reads the cookie first and falls back to that attribute: the two
     then always agree, and the fallback is the server's answer rather than a guess. */
  useEffect(() => {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`))
    const cookie = match?.[1]
    if (cookie === 'id' || cookie === 'en') {
      setLocale(cookie)
      return
    }
    const fromMarkup = document.querySelector('.mk')?.getAttribute('lang')
    if (fromMarkup === 'id' || fromMarkup === 'en') setLocale(fromMarkup)
  }, [])

  const load = useCallback(() => {
    setFailed(false)
    api<{ payments: PaymentRow[]; offer: Offer }>('/api/payments/history')
      .then((res) => {
        setRows(res.payments ?? [])
        setOffer(res.offer ?? null)
      })
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    if (!session) return
    load()
  }, [session, load, attempt])

  const settled = useMemo(() => (rows ?? []).filter((r) => r.status === 'settled'), [rows])
  const totalPaid = useMemo(() => settled.reduce((sum, r) => sum + r.totalIdr, 0), [settled])
  const pending = useMemo(
    () => (rows ?? []).find((r) => displayStatus(r) === 'pending') ?? null,
    [rows],
  )
  /* THE LAPSED ONE. A row can be 'pending' in the database and past its own deadline at the same
     time — no scheduler flips those rows — so it needs its own slot. Without it the callout
     simply vanished and the buyer was left with a ledger line that said "Kedaluwarsa" and no way
     to act on the intent that brought them here. The server supersedes a dead order when the
     modal asks for a new one, so this is a real path, not a dead end dressed up as a button.

     ONLY rows that are STILL 'pending' in the database qualify. An order the gateway itself
     marked expired months ago is history, not a call to action, and offering "buat kode baru"
     against it would be selling an upgrade the buyer never asked for. */
  const lapsed = useMemo(
    () => (rows ?? []).find((r) => r.status === 'pending' && displayStatus(r) === 'expired') ?? null,
    [rows],
  )
  const latest = settled[0] ?? null

  /* The channel to resume, derived from whichever tagihan the callout is showing. The label is
     the human name ("QRIS", "BCA"); `channel` is the code the server validates. A row whose
     payload predates the channel field falls back to the method, which is enough for the server
     to find the order and decide whether it is still payable. */
  const resumeChannel = useMemo<Channel | null>(() => {
    const row = pending ?? lapsed
    if (!row) return null
    const method: Channel['method'] = row.method === 'va' ? 'va' : 'qris'
    return { method, channel: row.channel ?? (method === 'qris' ? 'mpm' : 'bca'), label: row.label ?? row.method.toUpperCase() }
  }, [pending, lapsed])

  /* The checkout popup, opened FROM THIS PAGE. The brief is explicit that payment happens in a
     popup on the page the buyer is already on, and a pending invoice is exactly the moment they
     are looking for it — sending them to /pricing to start over was the old behaviour, and it
     meant the order they already held was never the one they ended up paying. */
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  /* ---------- signed out ---------- */
  if (!authLoading && !session) {
    return (
      <main className="mk-acctpage">
        <section className="mk-section tight">
          <div className="mk-acctpage-inner">
            <div className="mk-acctpage-empty">
              <span className="mk-acctpage-icon" aria-hidden="true">
                <Receipt size={26} />
              </span>
              <h1>{c.title}</h1>
              <p>{c.signIn}</p>
              <Link href="/login?next=%2Faccount" className="mk-btn mk-btn-primary">
                {c.signInCta}
              </Link>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="mk-acctpage">
      <section className="mk-section">
        <div className="mk-acctpage-inner">
          <header className="mk-acctpage-head">
            <p className="mk-eyebrow">{c.summaryTitle}</p>
            <h1>{c.title}</h1>
            <p className="mk-lede">{c.lede}</p>
          </header>

          {/* THE SUMMARY STRIP. Three numbers a buyer actually looks for, and the first is the one
              they came for. Nothing here is derived from anything but the ledger below it. */}
          <div className="mk-acctpage-stats">
            <div className="mk-acctpage-stat">
              <span>{c.totalPaid}</span>
              <strong>{rows === null ? '—' : formatIdr(totalPaid)}</strong>
            </div>
            <div className="mk-acctpage-stat">
              <span>{c.orders}</span>
              <strong>{rows === null ? '—' : settled.length}</strong>
            </div>
            <div className="mk-acctpage-stat">
              <span>{c.latest}</span>
              <strong>{latest ? formatDateTime(latest.settledAtUtc ?? latest.createdAtUtc, locale) : c.none}</strong>
            </div>
          </div>

          {/* THE UNPAID ORDER, when there is one. It sits above the ledger because it is the only
              row on this page with an action attached to it. The button OPENS THE CHECKOUT HERE:
              it does not navigate, so the invoice the buyer already holds is the one the modal
              resumes, and if that invoice has lapsed the server issues a fresh one in its place. */}
          {pending && (
            <div className="mk-acctpage-callout">
              <div>
                <strong>{c.pendingNote}</strong>
                <span>
                  {pending.label ?? pending.method.toUpperCase()} · {formatIdr(pending.totalIdr)}
                  {pending.expiresAt ? ` · ${c.until} ${formatDateTime(pending.expiresAt, locale)}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="mk-btn mk-btn-primary"
                onClick={() => setCheckoutOpen(true)}
              >
                {c.pendingCta}
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* THE LAPSED ORDER. Its code is gone, so there is nothing to resume — but the buyer is
              here to pay, and the server will supersede the dead order when the modal asks for a
              new code. Same button, honest label. */}
          {!pending && lapsed && (
            <div className="mk-acctpage-callout is-lapsed">
              <div>
                <strong>{c.lapsedNote}</strong>
                <span>
                  {lapsed.label ?? lapsed.method.toUpperCase()} · {formatIdr(lapsed.totalIdr)}
                  {lapsed.expiresAt ? ` · ${formatDateTime(lapsed.expiresAt, locale)}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="mk-btn mk-btn-primary"
                onClick={() => setCheckoutOpen(true)}
              >
                {c.lapsedCta}
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}

          {authLoading || rows === null ? (
            failed ? (
              <div className="mk-acctpage-empty">
                <span className="mk-acctpage-icon" aria-hidden="true">
                  <RefreshCw size={24} />
                </span>
                <p>{c.failed}</p>
                <button type="button" className="mk-btn mk-btn-outline" onClick={() => setAttempt((n) => n + 1)}>
                  <RefreshCw size={14} aria-hidden="true" />
                  {c.retry}
                </button>
              </div>
            ) : (
              <div className="mk-acctpage-loading">
                <Loader2 size={22} className="mk-acctpage-spin" aria-hidden="true" />
                <span>{c.loading}</span>
              </div>
            )
          ) : rows.length === 0 ? (
            <div className="mk-acctpage-empty">
              <span className="mk-acctpage-icon" aria-hidden="true">
                <Wallet size={26} />
              </span>
              <p>{c.empty}</p>
              <Link href="/pricing" className="mk-btn mk-btn-outline">
                {c.emptyCta}
              </Link>
            </div>
          ) : (
            <div className="mk-ledger">
              <table className="mk-ledger-table">
                <thead>
                  <tr>
                    <th scope="col">{c.th.order}</th>
                    <th scope="col">{c.th.method}</th>
                    <th scope="col">{c.th.date}</th>
                    <th scope="col" className="num">{c.th.amount}</th>
                    <th scope="col">{c.th.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const state = displayStatus(p)
                    return (
                      <tr key={p.orderId} id={p.orderId}>
                        <td data-th={c.th.order}>
                          <code>{p.orderId}</code>
                        </td>
                        <td data-th={c.th.method}>{p.label ?? (p.method === 'va' ? 'VA' : 'QRIS')}</td>
                        <td data-th={c.th.date}>
                          {formatDateTime(p.settledAtUtc ?? p.createdAtUtc, locale)}
                        </td>
                        <td data-th={c.th.amount} className="num">
                          <strong>{formatIdr(p.totalIdr)}</strong>
                          {p.feeIdr > 0 && <span className="mk-ledger-fee">+{formatIdr(p.feeIdr)}</span>}
                        </td>
                        <td data-th={c.th.status}>
                          <span className={`mk-ledger-pill is-${state}`}>
                            {state === 'settled' && <Check size={12} aria-hidden="true" />}
                            {c.status[state] ?? state}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* THE ONE CONVERSION CONTROL ON THIS PAGE, and it is orange like every other page's.
              Hidden while a tagihan is on screen in either state: the callout above already
              carries the page's single orange control, and two of them side by side would break
              the one-marker rule the palette is built on. */}
          {!pending && !lapsed && (
            <div className="mk-acctpage-cta">
              <div>
                <strong>{c.ctaTitle}</strong>
                <span>{c.ctaBody}</span>
              </div>
              <button
                type="button"
                className="mk-btn mk-btn-primary"
                onClick={() => setCheckoutOpen(true)}
              >
                {offer?.priceLabel ?? c.cta}
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </div>
          )}

          <p className="mk-acctpage-note">
            <ShieldCheck size={13} aria-hidden="true" />
            {c.secured}
          </p>
        </div>
      </section>

      {/* The popup itself. Mounted here, on this page, exactly as the pricing page mounts it —
          payment never navigates away from where the buyer is standing.

          `resume` carries the channel of the tagihan that put the button on screen, so the modal
          opens on the code rather than on the channel picker: the buyer already chose QRIS or BCA
          once, and being asked again is being asked to re-order. */}
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        offerLabel={offer?.priceLabel ?? 'Rp 35.000'}
        storageLabel={offer?.storageLabel ?? '500 MB'}
        locale={locale}
        resume={resumeChannel}
      />
    </main>
  )
}
