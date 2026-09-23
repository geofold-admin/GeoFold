'use client'

import { useState, useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/AuthContext'
import { api } from '@/lib/api-client'
import { Check, X, ExternalLink, Loader2, Sparkles, ShieldCheck } from 'lucide-react'

interface CheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  offerLabel?: string
  storageLabel?: string
}

export function CheckoutModal({
  isOpen,
  onClose,
  offerLabel = 'Rp 35.000',
  storageLabel = '500 MB',
}: CheckoutModalProps) {
  const { session } = useAuth()
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  // Payment states: 'idle' | 'initiating' | 'waiting' | 'success' | 'error'
  const [payState, setPayState] = useState<'idle' | 'initiating' | 'waiting' | 'success' | 'error'>('idle')
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Clear polling on unmount or close
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  // Polling for payment settlement
  useEffect(() => {
    if (payState !== 'waiting') {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    const checkSettlement = async () => {
      try {
        const syncRes = await api<{ granted: boolean }>('/api/payments/ipaymu/sync', { method: 'POST' })
        if (syncRes.granted) {
          setPayState('success')
          if (pollRef.current) clearInterval(pollRef.current)
          return
        }

        const meRes = await api<{ premiumActive: boolean }>('/api/subscriptions/me')
        if (meRes.premiumActive) {
          setPayState('success')
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch {
        // network retry
      }
    }

    pollRef.current = setInterval(checkSettlement, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [payState])

  if (!isOpen) return null

  // Auth submission
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
      setAuthError(err instanceof Error ? err.message : 'Autentikasi gagal. Coba lagi.')
    } finally {
      setAuthLoading(false)
    }
  }

  // Google OAuth
  const handleGoogleAuth = async () => {
    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${location.origin}/pricing` },
      })
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Google login gagal.')
    }
  }

  // Start payment checkout
  const handleStartPayment = async () => {
    setPayState('initiating')
    setErrorMessage(null)

    try {
      const res = await api<{ redirectUrl: string; orderId: string }>('/api/payments/checkout', {
        method: 'POST',
      })

      setPaymentUrl(res.redirectUrl)
      setOrderId(res.orderId)
      setPayState('waiting')

      // Open iPaymu in a popup window right in front of user
      const popup = window.open(
        res.redirectUrl,
        'ipaymu_checkout_window',
        'width=540,height=780,menubar=no,toolbar=no,location=no,status=no',
      )

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        // Popup was blocked by browser; user will click the direct link
      }
    } catch (err: unknown) {
      console.error('Checkout error:', err)
      setPayState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Gagal membuka pembayaran iPaymu.')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: '#161917',
          color: '#f4f4f0',
          borderRadius: '14px',
          border: '1px solid #2d332e',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #262c28',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 145, 77, 0.15)',
                color: '#ff914d',
              }}
            >
              <Sparkles size={16} />
            </span>
            <span style={{ fontWeight: 700, fontSize: '17px', letterSpacing: '-0.01em' }}>
              GeoFold Pro
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b968f',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px' }}>
          {/* STEP 1: Need Auth */}
          {!session && (
            <div>
              <p style={{ margin: '0 0 16px', color: '#9fa8a2', fontSize: '14px', lineHeight: 1.5 }}>
                Masuk atau buat akun untuk mengaktifkan langganan Pro Anda.
              </p>

              <button
                type="button"
                onClick={handleGoogleAuth}
                style={{
                  width: '100%',
                  padding: '11px',
                  backgroundColor: '#222824',
                  color: '#fff',
                  border: '1px solid #333d36',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  marginBottom: '16px',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.1 8.9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7s.1-1.9.4-2.7L1.6 6.4C.6 8.4 0 10.6 0 12s.6 3.6 1.6 5.6l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5.1L1.6 16.1C3.5 19.9 7.4 23 12 23z"
                  />
                </svg>
                Lanjutkan dengan Google
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  margin: '16px 0',
                  gap: '10px',
                  color: '#657169',
                  fontSize: '12px',
                }}
              >
                <div style={{ flex: 1, height: '1px', backgroundColor: '#2b332d' }} />
                <span>atau email</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#2b332d' }} />
              </div>

              <div style={{ display: 'flex', gap: '4px', marginBottom: '14px' }}>
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: authMode === 'login' ? '#272e29' : 'transparent',
                    color: authMode === 'login' ? '#ff914d' : '#8b968f',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Masuk
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: authMode === 'signup' ? '#272e29' : 'transparent',
                    color: authMode === 'signup' ? '#ff914d' : '#8b968f',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Daftar
                </button>
              </div>

              <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    padding: '11px 14px',
                    backgroundColor: '#1b201d',
                    border: '1px solid #333d36',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                  }}
                />
                <input
                  type="password"
                  required
                  placeholder="Kata Sandi"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    padding: '11px 14px',
                    backgroundColor: '#1b201d',
                    border: '1px solid #333d36',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                  }}
                />

                {authError && (
                  <p style={{ color: '#ff6b6b', fontSize: '13px', margin: '4px 0 0' }}>{authError}</p>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  style={{
                    marginTop: '8px',
                    padding: '12px',
                    backgroundColor: '#ff914d',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  {authLoading && <Loader2 size={16} className="spin" />}
                  {authMode === 'login' ? 'Masuk & Lanjut Pembayaran' : 'Daftar & Lanjut Pembayaran'}
                </button>
              </form>
            </div>
          )}

          {/* STEP 2: Authenticated & Ready to Pay */}
          {session && payState === 'idle' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: '#1d231f',
                  borderRadius: '8px',
                  border: '1px solid #2b332d',
                  marginBottom: '18px',
                  fontSize: '13px',
                }}
              >
                <span style={{ color: '#8b968f' }}>Akun:</span>
                <span style={{ fontWeight: 600, color: '#e0eae3' }}>{session.user.email}</span>
              </div>

              {/* Offer Details */}
              <div
                style={{
                  padding: '18px',
                  backgroundColor: '#1c221e',
                  border: '1px solid #2c352f',
                  borderRadius: '10px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>Paket 30 Hari</span>
                  <span style={{ fontSize: '22px', fontWeight: 700, color: '#ff914d' }}>{offerLabel}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#c5d1c9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={16} color="#ff914d" />
                    <span>Penyimpanan Cloud <strong>{storageLabel}</strong> (Otomatis WebP)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={16} color="#ff914d" />
                    <span>Proyek, survei dan foto tanpa batas</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={16} color="#ff914d" />
                    <span>Peta survei satelit & jalan + grid kuadrat</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={16} color="#ff914d" />
                    <span>Sekali bayar, tanpa perpanjangan otomatis</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#8b968f', marginBottom: '18px' }}>
                <ShieldCheck size={15} color="#58a6ff" />
                <span>QRIS, VA Bank (BCA, Mandiri, BNI, BRI), E-Wallet, Kartu Kredit</span>
              </div>

              <button
                type="button"
                onClick={handleStartPayment}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: '#ff914d',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '15px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(255, 145, 77, 0.3)',
                }}
              >
                Bayar Sekarang — {offerLabel}
              </button>
            </div>
          )}

          {/* STEP 3: Initiating payment */}
          {payState === 'initiating' && (
            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
              <Loader2 size={36} color="#ff914d" className="spin" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 6px' }}>Menyiapkan Pembayaran...</h3>
              <p style={{ color: '#8b968f', fontSize: '13px', margin: 0 }}>Menghubungkan ke gateway pembayaran iPaymu.</p>
            </div>
          )}

          {/* STEP 4: Waiting for settlement */}
          {payState === 'waiting' && (
            <div style={{ textAlign: 'center', padding: '16px 8px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 145, 77, 0.12)',
                  color: '#ff914d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <Loader2 size={24} className="spin" />
              </div>

              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px' }}>Menunggu Pembayaran</h3>
              <p style={{ color: '#9fa8a2', fontSize: '13.5px', lineHeight: 1.5, margin: '0 0 20px' }}>
                Jendela pembayaran iPaymu telah dibuka. Selesaikan pembayaran Anda menggunakan QRIS, Virtual Account, atau E-Wallet.
              </p>

              {paymentUrl && (
                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 18px',
                    backgroundColor: '#232a25',
                    color: '#ff914d',
                    border: '1px solid #364239',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    marginBottom: '16px',
                  }}
                >
                  Buka Ulang Halaman Pembayaran <ExternalLink size={14} />
                </a>
              )}

              {orderId && (
                <div style={{ fontSize: '12px', color: '#68736c', marginTop: '12px' }}>
                  ID Referensi: <span style={{ fontFamily: 'monospace', color: '#8b968f' }}>{orderId}</span>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: Success */}
          {payState === 'success' && (
            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(52, 199, 89, 0.15)',
                  color: '#34c759',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <Check size={30} strokeWidth={2.5} />
              </div>

              <h3 style={{ fontSize: '19px', fontWeight: 700, margin: '0 0 8px', color: '#fff' }}>
                Pembayaran Berhasil!
              </h3>
              <p style={{ color: '#9fa8a2', fontSize: '14px', lineHeight: 1.5, margin: '0 0 20px' }}>
                Selamat! Akun Anda kini aktif sebagai <strong>GeoFold Pro</strong> selama 30 hari dengan kuota penyimpanan <strong>{storageLabel}</strong>.
              </p>

              <button
                type="button"
                onClick={() => {
                  onClose()
                  window.location.reload()
                }}
                style={{
                  width: '100%',
                  padding: '13px',
                  backgroundColor: '#ff914d',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Selesai
              </button>
            </div>
          )}

          {/* STEP 6: Error */}
          {payState === 'error' && (
            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 107, 107, 0.15)',
                  color: '#ff6b6b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <X size={26} />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 600, margin: '0 0 8px' }}>Gagal Memproses</h3>
              <p style={{ color: '#ff6b6b', fontSize: '13px', margin: '0 0 20px' }}>
                {errorMessage || 'Terjadi kesalahan saat memulai pembayaran.'}
              </p>
              <button
                type="button"
                onClick={() => setPayState('idle')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#272e29',
                  color: '#fff',
                  border: '1px solid #3a453d',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Coba Lagi
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
