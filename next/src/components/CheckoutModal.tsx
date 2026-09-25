'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/AuthContext'
import { api } from '@/lib/api-client'
import type { Locale } from '@/lib/i18n'
import { Check, X, Copy, Loader2, Sparkles, ShieldCheck, RefreshCw, AlertCircle } from 'lucide-react'

/**
 * The in-page checkout.
 *
 * WHAT CHANGED AND WHY. This used to open iPaymu's hosted checkout in a popup window: the buyer
 * left geofold.sayba.id, landed on a differently-branded page, and had to find the way back. For
 * a small one-off purchase that is the step where people give up, and a popup is the easiest
 * thing in the world for a browser to block. It now calls iPaymu's Direct Payment endpoint
 * (`/api/payments/ipaymu/direct`) and renders the QR image or the virtual-account number HERE,
 * inside the modal, on our own page. The buyer never navigates away, and there is no popup to
 * block.
 *
 * WHAT DID NOT CHANGE. Settlement is still decided by the gateway, not by this component. The
 * modal polls `/api/payments/ipaymu/sync`, which asks iPaymu directly with the merchant API key
 * and only grants premium when the transaction comes back paid. Nothing here can unlock premium,
 * and closing the modal early loses nothing — the payment is live at the gateway and the
 * callback will settle it regardless.
 *
 * LANGUAGE. The modal is the last thing a buyer reads before sending money, so it follows the
 * marketing site's locale rather than being Indonesian-only. Every string is in the table below.
 */

type Copy = {
  title: string
  signInPrompt: string
  google: string
  orEmail: string
  signIn: string
  signUp: string
  email: string
  password: string
  signInCta: string
  signUpCta: string
  account: string
  plan: string
  planBody: string
  features: string[]
  channelsNote: string
  chooseChannel: string
  payNow: string
  preparing: string
  preparingBody: string
  qrisTitle: string
  qrisBody: string
  vaTitle: string
  vaBody: string
  copy: string
  copied: string
  amount: string
  adminFee: string
  total: string
  expires: string
  waiting: string
  waitingBody: string
  checkNow: string
  checking: string
  successTitle: string
  successBody: string
  done: string
  errorTitle: string
  retry: string
  newCode: string
  secured: string
  refLabel: string
}

const copy: Record<Locale, Copy> = {
  id: {
    title: 'GeoFold Premium',
    signInPrompt: 'Masuk atau buat akun untuk mengaktifkan Premium di akun Anda.',
    google: 'Lanjutkan dengan Google',
    orEmail: 'atau pakai email',
    signIn: 'Masuk',
    signUp: 'Daftar',
    email: 'Email',
    password: 'Kata sandi',
    signInCta: 'Masuk & lanjut bayar',
    signUpCta: 'Daftar & lanjut bayar',
    account: 'Akun',
    plan: 'Paket 30 hari',
    planBody: 'Sekali bayar. Tidak ada perpanjangan otomatis.',
    features: [
      'Proyek, survei, dan foto tanpa batas',
      'Peta survei satelit & jalan + grid kuadrat',
      'Tanpa batas harian pengambilan & unggah',
    ],
    channelsNote: 'QRIS, virtual account bank, dan dompet digital. Pembayaran selesai di halaman ini.',
    chooseChannel: 'Pilih metode pembayaran',
    payNow: 'Bayar sekarang',
    preparing: 'Menyiapkan pembayaran…',
    preparingBody: 'Menghubungi gateway pembayaran untuk membuat kode Anda.',
    qrisTitle: 'Pindai kode QRIS ini',
    qrisBody: 'Buka aplikasi bank atau dompet digital Anda, pilih QRIS, lalu pindai kode di atas. Nominal sudah terisi otomatis.',
    vaTitle: 'Bayar ke nomor virtual account ini',
    vaBody: 'Masukkan nomor di atas lewat m-banking, ATM, atau aplikasi bank Anda. Nominal harus sama persis.',
    copy: 'Salin',
    copied: 'Tersalin',
    amount: 'Jumlah',
    adminFee: 'Biaya layanan',
    total: 'Total bayar',
    expires: 'Berlaku sampai',
    waiting: 'Menunggu pembayaran Anda',
    waitingBody: 'Halaman ini akan otomatis memperbarui begitu pembayaran Anda masuk. Anda boleh membiarkannya terbuka.',
    checkNow: 'Cek status sekarang',
    checking: 'Memeriksa…',
    successTitle: 'Pembayaran berhasil',
    successBody: 'Akun Anda kini aktif sebagai GeoFold Premium. Semua batas sudah terbuka.',
    done: 'Selesai',
    errorTitle: 'Pembayaran gagal diproses',
    retry: 'Coba lagi',
    newCode: 'Minta kode baru',
    secured: 'Diproses oleh gateway pembayaran berizin di Indonesia',
    refLabel: 'Nomor referensi',
  },
  en: {
    title: 'GeoFold Premium',
    signInPrompt: 'Sign in or create an account to activate Premium on your account.',
    google: 'Continue with Google',
    orEmail: 'or use email',
    signIn: 'Sign in',
    signUp: 'Sign up',
    email: 'Email',
    password: 'Password',
    signInCta: 'Sign in & continue to payment',
    signUpCta: 'Sign up & continue to payment',
    account: 'Account',
    plan: '30-day plan',
    planBody: 'One payment. No auto-renewal.',
    features: [
      'Unlimited projects, surveys and photos',
      'Satellite & street survey map + quadrat grid',
      'No daily capture or upload limits',
    ],
    channelsNote: 'QRIS, bank virtual accounts and e-wallets. Payment completes on this page.',
    chooseChannel: 'Choose a payment method',
    payNow: 'Pay now',
    preparing: 'Preparing your payment…',
    preparingBody: 'Contacting the payment gateway to create your code.',
    qrisTitle: 'Scan this QRIS code',
    qrisBody: 'Open your banking or e-wallet app, choose QRIS, then scan the code above. The amount is filled in for you.',
    vaTitle: 'Pay to this virtual account number',
    vaBody: 'Enter the number above in your banking app, ATM or m-banking. The amount must match exactly.',
    copy: 'Copy',
    copied: 'Copied',
    amount: 'Amount',
    adminFee: 'Service fee',
    total: 'Total to pay',
    expires: 'Valid until',
    waiting: 'Waiting for your payment',
    waitingBody: 'This page updates by itself the moment your payment lands. You can leave it open.',
    checkNow: 'Check status now',
    checking: 'Checking…',
    successTitle: 'Payment successful',
    successBody: 'Your account is now GeoFold Premium. Every limit is lifted.',
    done: 'Done',
    errorTitle: 'The payment could not be started',
    retry: 'Try again',
    newCode: 'Request a new code',
    secured: 'Processed by a licensed Indonesian payment gateway',
    refLabel: 'Reference number',
  },
}

/** What the direct-payment route returns. */
interface Instructions {
  orderId: string
  method: 'qris' | 'va'
  channel: string
  label: string
  paymentNo: string | null
  qrUrl: string | null
  totalIdr: number
  feeIdr: number
  expiresAt: string | null
  amountIdr: number
  grantsDays: number
}

interface Channel {
  method: 'qris' | 'va'
  channel: string
  label: string
}

interface CheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  offerLabel?: string
  storageLabel?: string
  /** The marketing locale, so the last screen before payment is in the buyer's language. */
  locale?: Locale
}

const DEFAULT_CHANNELS: Channel[] = [
  { method: 'qris', channel: 'mpm', label: 'QRIS' },
  { method: 'va', channel: 'bca', label: 'BCA' },
  { method: 'va', channel: 'mandiri', label: 'Mandiri' },
  { method: 'va', channel: 'bni', label: 'BNI' },
  { method: 'va', channel: 'bri', label: 'BRI' },
  { method: 'va', channel: 'permata', label: 'Permata' },
]

export function CheckoutModal({
  isOpen,
  onClose,
  offerLabel = 'Rp 35.000',
  storageLabel = '500 MB',
  locale = 'id',
}: CheckoutModalProps) {
  const c = copy[locale]
  const { session } = useAuth()

  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  type PayState = 'idle' | 'initiating' | 'awaiting' | 'success' | 'error'
  const [payState, setPayState] = useState<PayState>('idle')
  const [instructions, setInstructions] = useState<Instructions | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [channel, setChannel] = useState<Channel>(DEFAULT_CHANNELS[0])

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  /* The modal is a fresh start every time it opens: a stale QR from a previous attempt is worse
     than no QR, because the buyer may scan it and pay against an expired invoice. */
  useEffect(() => {
    if (!isOpen) {
      stopPolling()
      setPayState('idle')
      setInstructions(null)
      setErrorMessage(null)
      setCopied(false)
      setChecking(false)
    }
  }, [isOpen, stopPolling])

  useEffect(() => stopPolling, [stopPolling])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  /* ---- settlement polling ----
     The sync route asks iPaymu directly with the merchant key; it is the only thing that can
     grant premium. Polling here just turns "the callback arrived" into "the page noticed". */
  useEffect(() => {
    if (payState !== 'awaiting') {
      stopPolling()
      return
    }

    const check = async () => {
      try {
        const sync = await api<{ granted: boolean }>('/api/payments/ipaymu/sync', { method: 'POST' })
        if (sync.granted) {
          setPayState('success')
          stopPolling()
          return
        }
        const me = await api<{ premiumActive: boolean }>('/api/subscriptions/me')
        if (me.premiumActive) {
          setPayState('success')
          stopPolling()
        }
      } catch {
        /* A dropped poll is not a failure — the next tick tries again. */
      }
    }

    pollRef.current = setInterval(check, 4000)
    return stopPolling
  }, [payState, stopPolling])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        })
        if (error) throw error
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : locale === 'id' ? 'Autentikasi gagal. Coba lagi.' : 'Authentication failed. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleGoogleAuth = async () => {
    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${location.origin}/pricing` },
      })
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : locale === 'id' ? 'Masuk dengan Google gagal.' : 'Google sign-in failed.')
    }
  }

  const handleStart = async (chosen: Channel) => {
    setChannel(chosen)
    setPayState('initiating')
    setErrorMessage(null)
    try {
      const res = await api<Instructions>('/api/payments/ipaymu/direct', {
        method: 'POST',
        body: JSON.stringify({ method: chosen.method, channel: chosen.channel }),
      })
      setInstructions(res)
      setPayState('awaiting')
    } catch (err: unknown) {
      setPayState('error')
      setErrorMessage(
        err instanceof Error ? err.message : locale === 'id' ? 'Gagal menyiapkan pembayaran.' : 'Could not start the payment.',
      )
    }
  }

  const handleManualCheck = async () => {
    setChecking(true)
    try {
      const sync = await api<{ granted: boolean }>('/api/payments/ipaymu/sync', { method: 'POST' })
      if (sync.granted) setPayState('success')
    } catch {
      /* stays on the waiting screen; the interval keeps trying */
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

  if (!isOpen) return null

  const total = instructions ? (instructions.totalIdr || instructions.amountIdr) : null
  const fee = instructions?.feeIdr ?? 0

  return (
    <div className="gf-ck-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="gf-ck" role="dialog" aria-modal="true" aria-label={c.title}>
        <header className="gf-ck-head">
          <span className="gf-ck-mark" aria-hidden="true">
            <Sparkles size={15} />
          </span>
          <span className="gf-ck-title">{c.title}</span>
          <button type="button" className="gf-ck-close" onClick={onClose} aria-label={locale === 'id' ? 'Tutup' : 'Close'}>
            <X size={18} />
          </button>
        </header>

        <div className="gf-ck-body">
          {/* ---------- 1. not signed in ---------- */}
          {!session && (
            <div className="gf-ck-stack">
              <p className="gf-ck-lede">{c.signInPrompt}</p>

              <button type="button" className="gf-ck-oauth" onClick={handleGoogleAuth}>
                <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.1 8.9 5 12 5z" />
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
                  <path fill="#FBBC05" d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7s.1-1.9.4-2.7L1.6 6.4C.6 8.4 0 10.6 0 12s.6 3.6 1.6 5.6l3.7-2.9z" />
                  <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5.1L1.6 16.1C3.5 19.9 7.4 23 12 23z" />
                </svg>
                {c.google}
              </button>

              <div className="gf-ck-divider">
                <span>{c.orEmail}</span>
              </div>

              <div className="gf-ck-tabs" role="group">
                {(['login', 'signup'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAuthMode(m)}
                    aria-pressed={authMode === m}
                    className={authMode === m ? 'on' : undefined}
                  >
                    {m === 'login' ? c.signIn : c.signUp}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAuth} className="gf-ck-form">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={c.email}
                  aria-label={c.email}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  type="password"
                  required
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={c.password}
                  aria-label={c.password}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {authError && (
                  <p className="gf-ck-error" role="alert">
                    <AlertCircle size={14} aria-hidden="true" />
                    {authError}
                  </p>
                )}
                <button type="submit" className="gf-ck-primary" disabled={authLoading}>
                  {authLoading && <Loader2 size={15} className="gf-ck-spin" aria-hidden="true" />}
                  {authMode === 'login' ? c.signInCta : c.signUpCta}
                </button>
              </form>
            </div>
          )}

          {/* ---------- 2. signed in, pick a channel ---------- */}
          {session && payState === 'idle' && (
            <div className="gf-ck-stack">
              <div className="gf-ck-account">
                <span>{c.account}</span>
                <strong>{session.user.email}</strong>
              </div>

              <div className="gf-ck-offer">
                <div className="gf-ck-offer-top">
                  <span className="gf-ck-offer-name">{c.plan}</span>
                  <span className="gf-ck-offer-price">{offerLabel}</span>
                </div>
                <ul className="gf-ck-features">
                  {c.features.map((f) => (
                    <li key={f}>
                      <Check size={14} aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                  <li>
                    <Check size={14} aria-hidden="true" />
                    {locale === 'id' ? (
                      <>Penyimpanan cloud <strong>{storageLabel}</strong></>
                    ) : (
                      <><strong>{storageLabel}</strong> of cloud storage</>
                    )}
                  </li>
                </ul>
                <p className="gf-ck-offer-note">{c.planBody}</p>
              </div>

              <div className="gf-ck-channels">
                <p className="gf-ck-label">{c.chooseChannel}</p>
                <div className="gf-ck-channel-grid">
                  {DEFAULT_CHANNELS.map((ch) => (
                    <button
                      key={`${ch.method}-${ch.channel}`}
                      type="button"
                      className="gf-ck-channel"
                      onClick={() => handleStart(ch)}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
                <p className="gf-ck-hint">
                  <ShieldCheck size={13} aria-hidden="true" />
                  {c.channelsNote}
                </p>
              </div>
            </div>
          )}

          {/* ---------- 3. preparing ---------- */}
          {payState === 'initiating' && (
            <div className="gf-ck-center">
              <Loader2 size={30} className="gf-ck-spin" aria-hidden="true" />
              <h3>{c.preparing}</h3>
              <p>{c.preparingBody}</p>
            </div>
          )}

          {/* ---------- 4. waiting: the QR or the VA number ---------- */}
          {payState === 'awaiting' && instructions && (
            <div className="gf-ck-stack">
              <div className="gf-ck-pay-head">
                <h3>{instructions.method === 'qris' ? c.qrisTitle : c.vaTitle}</h3>
                <p>{instructions.method === 'qris' ? c.qrisBody : c.vaBody}</p>
              </div>

              {instructions.method === 'qris' && instructions.qrUrl && (
                <div className="gf-ck-qr">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the source is a
                      gateway-hosted PNG on an allowlisted host, not a local asset; next/image
                      would proxy it through the optimizer and the CSP already restricts it. */}
                  <img src={instructions.qrUrl} alt={instructions.label} width={220} height={220} />
                </div>
              )}

              {/* A QRIS response with no image still carries the raw payload, which every banking
                  app can accept as a pasted string. Better than a blank box. */}
              {instructions.method === 'qris' && !instructions.qrUrl && instructions.paymentNo && (
                <div className="gf-ck-value">
                  <code>{instructions.paymentNo}</code>
                  <button type="button" onClick={() => copyValue(instructions.paymentNo!)}>
                    <Copy size={14} aria-hidden="true" />
                    {copied ? c.copied : c.copy}
                  </button>
                </div>
              )}

              {instructions.method === 'va' && instructions.paymentNo && (
                <div className="gf-ck-value">
                  <code>{instructions.paymentNo}</code>
                  <button type="button" onClick={() => copyValue(instructions.paymentNo!)}>
                    <Copy size={14} aria-hidden="true" />
                    {copied ? c.copied : c.copy}
                  </button>
                </div>
              )}

              <dl className="gf-ck-sums">
                <div>
                  <dt>{c.amount}</dt>
                  <dd>{formatIdr(instructions.amountIdr)}</dd>
                </div>
                {fee > 0 && (
                  <div>
                    <dt>{c.adminFee}</dt>
                    <dd>{formatIdr(fee)}</dd>
                  </div>
                )}
                <div className="total">
                  <dt>{c.total}</dt>
                  <dd>{formatIdr(total ?? instructions.amountIdr)}</dd>
                </div>
                {instructions.expiresAt && (
                  <div>
                    <dt>{c.expires}</dt>
                    <dd>{instructions.expiresAt}</dd>
                  </div>
                )}
              </dl>

              <div className="gf-ck-waiting">
                <Loader2 size={15} className="gf-ck-spin" aria-hidden="true" />
                <div>
                  <strong>{c.waiting}</strong>
                  <span>{c.waitingBody}</span>
                </div>
              </div>

              <button type="button" className="gf-ck-ghost" onClick={handleManualCheck} disabled={checking}>
                {checking ? <Loader2 size={14} className="gf-ck-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                {checking ? c.checking : c.checkNow}
              </button>

              <p className="gf-ck-ref">
                {c.refLabel}: <code>{instructions.orderId}</code>
              </p>
            </div>
          )}

          {/* ---------- 5. settled ---------- */}
          {payState === 'success' && (
            <div className="gf-ck-center">
              <span className="gf-ck-tick" aria-hidden="true">
                <Check size={26} strokeWidth={2.5} />
              </span>
              <h3>{c.successTitle}</h3>
              <p>{c.successBody}</p>
              <button
                type="button"
                className="gf-ck-primary"
                onClick={() => {
                  onClose()
                  window.location.reload()
                }}
              >
                {c.done}
              </button>
            </div>
          )}

          {/* ---------- 6. failed ---------- */}
          {payState === 'error' && (
            <div className="gf-ck-center">
              <span className="gf-ck-cross" aria-hidden="true">
                <X size={24} />
              </span>
              <h3>{c.errorTitle}</h3>
              <p className="gf-ck-error-text">{errorMessage}</p>
              <div className="gf-ck-error-actions">
                <button type="button" className="gf-ck-primary" onClick={() => handleStart(channel)}>
                  {c.retry}
                </button>
                <button type="button" className="gf-ck-ghost" onClick={() => setPayState('idle')}>
                  {c.newCode}
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="gf-ck-foot">
          <ShieldCheck size={13} aria-hidden="true" />
          {c.secured}
        </footer>
      </div>
    </div>
  )
}

/** "35000" → "Rp 35.000". Indonesian grouping; rupiah has no subunit in practice. */
function formatIdr(amount: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(amount))}`
}
