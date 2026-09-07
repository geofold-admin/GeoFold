'use client'

import { useEffect, useState } from 'react'

/**
 * Hand-off page between the browser and the mobile app, after a social sign-in.
 *
 * The mobile app used to give Supabase its own `geofold*://auth/callback` scheme directly. That
 * works when the system opens the auth page in a Custom Tab the app controls — but not when it
 * does not. On MIUI (and any device with no default browser set) the page opens in an ordinary
 * browser tab instead, and when that tab redirects to a custom scheme the browser hands the URL to
 * the app and is left sitting on a dead page. The sign-in has in fact succeeded, and the customer
 * is looking at a 404.
 *
 * So Supabase is now pointed here instead — an ordinary https page on our own domain, which no
 * browser can fail to render — and this page forwards to the app. Whatever happens, the last thing
 * anyone sees is ours: either the app opens, or this page explains itself and offers a button.
 */

/**
 * Schemes this page is willing to redirect to.
 *
 * Fixed list, deliberately. `scheme` arrives in the query string, which anyone can write, and
 * forwarding to an arbitrary one would turn this into an open redirect that launches any app on
 * the device with a URL of the attacker's choosing — carrying, in this flow, a live auth code.
 */
const ALLOWED_SCHEMES = ['geofold', 'geofolddrone', 'geofolddronev4'] as const

function targetFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search)
  const scheme = params.get('scheme') ?? ''
  if (!(ALLOWED_SCHEMES as readonly string[]).includes(scheme)) return null

  // Everything except our own routing parameter is forwarded untouched: PKCE returns `?code=`,
  // the implicit flow returns tokens in the `#fragment`, and an error comes back as either.
  params.delete('scheme')
  const query = params.toString()
  const hash = window.location.hash.replace(/^#/, '')

  return `${scheme}://auth/callback${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`
}

export default function AuthHandoffPage() {
  const [target, setTarget] = useState<string | null>(null)
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    const url = targetFromLocation()
    setTarget(url)
    if (!url) return

    // `replace`, not `assign`: going Back should not re-fire the hand-off with a code that has
    // already been redeemed.
    window.location.replace(url)

    // If the app does not come to the foreground, the page is still here — say so rather than
    // leaving a spinner running forever.
    const timer = setTimeout(() => setStalled(true), 2500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="legal" style={{ textAlign: 'center', paddingTop: 96 }}>
      <h1 style={{ fontSize: 22 }}>Membuka aplikasi GeoFold…</h1>

      {target === null ? (
        <p>
          Tautan ini tidak lengkap, jadi kami tidak tahu aplikasi mana yang harus dibuka. Tutup
          halaman ini dan coba masuk lagi dari aplikasi.
          <br />
          <span style={{ opacity: 0.7 }}>
            This link is incomplete, so we cannot tell which app to open. Close this page and sign
            in again from the app.
          </span>
        </p>
      ) : (
        <>
          <p>
            Anda sudah berhasil masuk. Halaman ini hanya mengembalikan Anda ke aplikasi.
            <br />
            <span style={{ opacity: 0.7 }}>
              You are signed in. This page only hands you back to the app.
            </span>
          </p>

          {stalled && (
            <p>
              <a href={target} style={{ fontWeight: 600 }}>
                Buka aplikasi GeoFold / Open the GeoFold app
              </a>
              <br />
              <span style={{ opacity: 0.7, fontSize: 13 }}>
                Aplikasi tidak terbuka sendiri? Ketuk tautan di atas, lalu tutup tab ini.
              </span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
