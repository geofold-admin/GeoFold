'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { api } from '@/lib/api-client'
import type { Locale } from '@/lib/i18n'
import { ChevronDown, LogOut, Receipt, Wallet } from 'lucide-react'

/**
 * THE ACCOUNT MENU — the signed-in corner of the header.
 *
 * WHAT IT IS FOR. Once a buyer is signed in, the header's "Portal" link is the wrong affordance:
 * it offers a door to somewhere they already are, and it says nothing about the thing they most
 * often come back to check, which is whether their payment landed. This replaces it with the
 * pattern every CRM and enterprise console uses — the account chip in the top-right corner, with
 * the ledger one click away.
 *
 * WHY THE LEDGER IS FETCHED, NOT ASSUMED. The menu could print the premium flag from the
 * subscription summary, and it would be right most of the time. It would also be silent about the
 * case that actually generates support: a payment that is still pending, or one that lapsed. The
 * three most recent rows come from the same endpoint /account reads, so the two can never
 * disagree, and the menu answers "did it go through" with the record rather than with a summary.
 *
 * WHY IT CLOSES ON ROUTE CHANGE AND ON ESCAPE. Same three bugs the mobile panel had, and the same
 * three fixes: a panel left open over the page it just navigated to reads as the tap having done
 * nothing, a panel with no Escape path strands a keyboard user inside it, and a panel that does
 * not close on an outside press sits on top of the page the reader is trying to use.
 *
 * IT RENDERS NOTHING WHEN SIGNED OUT. Not a disabled chip, not a placeholder — the header's
 * signed-out state is the Portal link, and that is the marketing site's own affordance. A menu
 * that appears and then says "sign in to see this" is a worse version of a link that just says it.
 */

interface PaymentRow {
  orderId: string
  method: string
  channel: string | null
  label: string | null
  amountIdr: number
  totalIdr: number
  status: string
  createdAtUtc: string
  settledAtUtc: string | null
}

const copy = {
  id: {
    account: 'Akun',
    history: 'Riwayat pembayaran',
    all: 'Lihat semua',
    signOut: 'Keluar',
    empty: 'Belum ada pembayaran.',
    loading: 'Memuat riwayat…',
    failed: 'Riwayat tidak bisa dimuat.',
    status: {
      settled: 'Berhasil',
      pending: 'Menunggu',
      expired: 'Kedaluwarsa',
      denied: 'Dibatalkan',
      refunded: 'Dikembalikan',
    } as Record<string, string>,
  },
  en: {
    account: 'Account',
    history: 'Payment history',
    all: 'View all',
    signOut: 'Sign out',
    empty: 'No payments yet.',
    loading: 'Loading history…',
    failed: 'History could not be loaded.',
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

function formatDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function AccountMenu({ locale }: { locale: Locale }) {
  const { session } = useAuth()
  const c = copy[locale]

  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<PaymentRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const email = session?.user?.email ?? ''

  /* Fetch once, when the menu is first opened — not on mount. The header renders on every page of
     the marketing site, and a request fired on every page load for a panel most readers never open
     is a request that costs a database round-trip for nothing. Once it has loaded it is kept, so
     reopening the menu is instant. */
  useEffect(() => {
    if (!open || rows !== null || failed) return
    let cancelled = false
    api<{ payments: PaymentRow[] }>('/api/payments/history?limit=3')
      .then((res) => {
        if (!cancelled) setRows(res.payments ?? [])
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, rows, failed])

  /* Escape closes and returns focus to the chip, so a keyboard user is never left with focus
     inside a panel that no longer exists. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  /* A press anywhere outside closes it. `pointerdown` rather than `click` so it fires before the
     link under the finger navigates. */
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  /* Signing out is a client-side action in demo mode and a Supabase call otherwise. Both end with
     the menu gone, because `session` becomes null and this component renders nothing. */
  const signOut = async () => {
    setOpen(false)
    if (session && typeof window !== 'undefined' && window.sessionStorage.getItem('geofold-demo') === '1') {
      window.sessionStorage.removeItem('geofold-demo')
      window.location.href = '/'
      return
    }
    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
    await createSupabaseBrowserClient().auth.signOut()
    window.location.href = '/'
  }

  /* Signed out: the header keeps its own Portal link. Nothing renders here. */
  if (!session) return null

  const initial = (email.trim()[0] ?? '?').toUpperCase()

  return (
    <div className="mk-acct" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="mk-acct-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mk-acct-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="mk-acct-label">
          <span className="mk-acct-name">{email.split('@')[0]}</span>
          <span className="mk-acct-cap">{c.account}</span>
        </span>
        <ChevronDown size={14} className="mk-acct-caret" aria-hidden="true" />
      </button>

      {/* `hidden` rather than only a class, so it leaves the accessibility tree and the tab order
          when closed even if a stylesheet fails to load. */}
      <div className="mk-acct-panel" role="menu" hidden={!open}>
        <div className="mk-acct-head">
          <span className="mk-acct-avatar lg" aria-hidden="true">
            {initial}
          </span>
          <span className="mk-acct-id">
            <strong>{email.split('@')[0]}</strong>
            <span>{email}</span>
          </span>
        </div>

        <div className="mk-acct-sec">
          <span className="mk-acct-sec-title">
            <Receipt size={13} aria-hidden="true" />
            {c.history}
          </span>

          {rows === null && !failed && <p className="mk-acct-note">{c.loading}</p>}
          {failed && <p className="mk-acct-note">{c.failed}</p>}
          {rows !== null && rows.length === 0 && <p className="mk-acct-note">{c.empty}</p>}

          {rows !== null && rows.length > 0 && (
            <ul className="mk-acct-list">
              {rows.map((p) => (
                <li key={p.orderId}>
                  <Link href={`/account#${encodeURIComponent(p.orderId)}`} role="menuitem" onClick={() => setOpen(false)}>
                    <span className="mk-acct-row">
                      <span className="mk-acct-row-top">
                        <span className="mk-acct-row-label">{p.label ?? (p.method === 'va' ? 'VA' : 'QRIS')}</span>
                        <span className={`mk-acct-pill is-${p.status}`}>{c.status[p.status] ?? p.status}</span>
                      </span>
                      <span className="mk-acct-row-bot">
                        <span>{formatDate(p.settledAtUtc ?? p.createdAtUtc, locale)}</span>
                        <strong>{formatIdr(p.totalIdr)}</strong>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mk-acct-foot">
          <Link href="/account" className="mk-acct-all" role="menuitem" onClick={() => setOpen(false)}>
            <Wallet size={14} aria-hidden="true" />
            {c.all}
          </Link>
          <button type="button" className="mk-acct-out" role="menuitem" onClick={signOut}>
            <LogOut size={14} aria-hidden="true" />
            {c.signOut}
          </button>
        </div>
      </div>
    </div>
  )
}
