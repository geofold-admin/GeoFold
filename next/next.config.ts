import type { NextConfig } from 'next'

// Static security headers. The Content-Security-Policy is NOT here — it carries a
// per-request nonce and is set in src/proxy.ts instead.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The app genuinely needs camera + geolocation (capture); everything else is denied.
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  /* --------------------------------------------------------------------------------------------
     VARY: ACCEPT-LANGUAGE AND COOKIE.

     This site serves Indonesian and English from the SAME path, choosing per request from
     `Accept-Language` and the `geofold-lang` cookie (see lib/i18n.ts). If a shared cache stored
     one language and served it to the next reader, that reader would silently get the wrong
     language, and a crawler would see a page whose language does not match its request.

     HONEST STATUS, MEASURED. This header does NOT reach the client: Next.js sets its own `Vary`
     for the App Router (rsc, next-router-state-tree, and the two prefetch headers) after both the
     proxy and this config run, and that value wins. It was tried in proxy.ts first and here
     second; the served response carried Next's four entries and neither of ours both times.

     IT DOES NOT MATTER, and that is the actual finding. Every marketing page is served
     `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` — measured on six
     routes — because each one reads `headers()` and `cookies()` per request to resolve its
     language. `no-store` forbids any cache from storing the response, so there is nothing for a
     cache to serve wrongly. The header is kept as documentation of the dependency and as the
     correct value if these pages are ever made cacheable; the protection today is `no-store`.

     THE REAL TRADE-OFF, recorded rather than hidden: these pages are not cacheable at all, which
     is a cost paid on every request. Making them cacheable would mean moving the locale into the
     URL (/id, /en), which lib/i18n.ts deliberately avoids because the compliance pages are
     already indexed at their current paths and linked from a payment gateway's merchant record. */
  { key: 'Vary', value: 'Accept-Language, Cookie' },
]

const nextConfig: NextConfig = {
  // Don't advertise the framework/version to attackers.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig


