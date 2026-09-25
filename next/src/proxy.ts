import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Next.js 16: Middleware is renamed to Proxy; the exported function must be named `proxy`.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const isDev = process.env.NODE_ENV === 'development'

/**
 * Per-request CSP.
 *
 * script-src uses a fresh nonce + 'strict-dynamic' and deliberately has NO 'unsafe-inline':
 * that is the directive that actually stops XSS, and Next.js attaches the nonce to its own
 * framework/bundle/inline scripts automatically once it sees it in this header.
 *
 * style-src keeps 'unsafe-inline' on purpose. A nonce does not authorise inline *style
 * attributes*, and this codebase renders a lot of `style={{…}}` props. Dropping it would
 * need every inline style refactored into a stylesheet first. Style injection is a far
 * weaker vector than script injection, so this is the accepted residual risk.
 */
function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // blob:/data: are needed for camera capture previews before upload.
    // arcgisonline serves the Esri satellite basemap + its place-name overlay (see MapView).
    // api(.sandbox).midtrans.com serves the QRIS payment QR image on the subscription page.
    // *.ipaymu.com + storage.googleapis.com serve the QRIS image returned by iPaymu's Direct
    // Payment endpoint, which the in-page checkout modal renders. Both hosts are required: the
    // QR is a URL to iPaymu's own storage, not an inline data URI, and without them the modal
    // shows a broken image with no error anywhere.
    "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org https://server.arcgisonline.com https://api.midtrans.com https://api.sandbox.midtrans.com https://*.ipaymu.com https://storage.googleapis.com",
    "font-src 'self' data:",
    // wss: for Supabase realtime; the OAuth redirect itself is a top-level navigation, not a fetch.
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const withCsp = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp)
    return res
  }

  // Skip the session refresh (and its network call) when Supabase isn't really configured yet.
  if (!anon || anon.includes('placeholder')) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }))
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request: { headers: requestHeaders } })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // Refreshes the auth token and rewrites cookies so Server Components see a valid session.
  await supabase.auth.getUser()
  return withCsp(response)
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
