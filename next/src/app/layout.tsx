import type { Metadata } from 'next'
import { Archivo, Barlow, Barlow_Condensed, Inter, Inter_Tight, Plus_Jakarta_Sans, Space_Mono } from 'next/font/google'
import './globals.css'
// THE 404'S SKINS ARE LOADED HERE, NOT IN not-found.tsx, AND THAT IS A BUG FIX.
//
// MEASURED on the built site: `/nonexistent-page-for-404` served only THREE stylesheets while the
// landing page served TEN. The page rendered its own markup — `class="mk mk-nf"`, the card, the
// heading — but none of the skin rules arrived, so:
//   · `--mk-ink` resolved to nothing, so `.mk-nf-heading`'s `color: var(--mk-ink)` was invalid
//     and the heading fell back to the app chrome's `--ink` (#111827) — dark ink on the dark
//     ground the page paints for itself. Measured 1.02:1, i.e. an invisible "This page does not
//     exist."
//   · `--mk-panel` resolved to nothing, so the card had no background.
// The cause is not the CSS and not the CSP (`style-src` allows `'self'`): Next.js 16 does not
// emit the stylesheet links imported by `not-found.tsx` when that file renders for an UNMATCHED
// URL. `_not-found/page_client-reference-manifest.js` in the build lists all ten files, so the
// CSS is built and known — the links just never reach the document's head.
//
// Moving the imports up to the root layout is the fix that does not depend on that behaviour:
// every route in the app renders inside this layout, so the stylesheets are in the head before
// any page decides what to draw. The 404 keeps its own file and its own markup; only where its
// CSS is imported from changed.
//
// The cost is that `/login`, `/onboarding` and `/reset` now receive these sheets too. That is
// safe by construction: every rule in minimal.css is scoped to `.mk.mk.mk-site`, and the
// `.mk-site` marker is only on the marketing wrapper, so the app screens match none of it.
// `verify-site.mjs` asserts exactly that, and it stays green.
import '@/styles/marketing.css'
import '@/styles/home.css'
import '@/styles/paper.css'
import '@/styles/corporate.css'
import '@/styles/blueprint.css'
import { Providers } from './providers'
import { BUSINESS } from '@/lib/business'

// The CSP in src/proxy.ts is nonce-based, and a nonce only exists per request — so every
// route must render dynamically. Static prerendering would bake in scripts with no nonce
// and the browser would then refuse to run them. Drop this only if the CSP drops the nonce.
export const dynamic = 'force-dynamic'

// Archivo stays for the marketing pages' headings; the app chrome runs on
// Barlow / Barlow Condensed, per the imported "Industry" design system.
const archivo = Archivo({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const barlow = Barlow({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const barlowCondensed = Barlow_Condensed({
  variable: '--font-cond',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

const spaceMono = Space_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '700'],
})

// The marketing site's own faces, added with the "Paper" re-skin. Inter Tight carries the display
// sizes (its tighter fitting is what makes a 300-weight headline hold together at 120px, where
// Inter proper opens up and reads as thin rather than large); Inter carries everything else.
// Archivo / Barlow / Barlow Condensed / Space Mono all stay: marketing.css, home.css and the
// whole (app) chrome still reference them, and this re-skin only layers over those.
//
// NOT named --font-display: globals.css already aliases that to Barlow Condensed for the app
// chrome, on :root, and wins the cascade over next/font's own variable class. A headline asking
// for --font-display silently renders in Barlow Condensed instead, at the right weight and size,
// which is a hard thing to see in a screenshot and an easy one to see in a computed style.
const interTight = Inter_Tight({
  variable: '--font-tight',
  subsets: ['latin'],
  weight: ['300', '400', '500'],
})

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

// THE CURRENT MARKETING BRIEF'S TWO FACES (Corporate Minimalist, 2026-09-29).
//
// The client's specification names exactly two: Plus Jakarta Sans for headings, Inter for body
// and data. Inter is already loaded above, so only this one is new.
//
// Plus Jakarta Sans is a geometric sans with a taller x-height and more open apertures than the
// Archivo it displaces, which is what the brief is buying: at 56px ExtraBold it reads as an
// institution rather than as a poster. The weights are the ones the brief's scale needs —
// 600 for section heads, 700 for the H1 and the price numerals, 800 reserved for the H1 so the
// ExtraBold it asks for is a real weight rather than a synthesised bold.
const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  /* THE BASE IS REQUIRED, and its absence was silent. Without it Next.js writes `og:image` as a
     relative path, and every social crawler drops the preview card — no error, no warning, just a
     bare link when someone shares a page. It also resolves the canonical URLs. */
  metadataBase: new URL(BUSINESS.site),
  title: 'GeoFold | Field GPS survey tool',
  description:
    'Turn a phone into a field survey kit: geo-tagged photos, offline capture, and every point on a map you can export and report from.',
  applicationName: 'GeoFold',
  /* The app chrome is behind a login, so it must never appear in a search result. Pages that DO
     want indexing override this through lib/seo's pageMetadata. */
  robots: { index: false, follow: false },
  openGraph: {
    title: 'GeoFold | Field GPS survey tool',
    description: 'Geo-tagged photos, offline capture, and every survey point on a map you can export.',
    type: 'website',
    siteName: 'GeoFold',
    url: BUSINESS.site,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'GeoFold: field surveys that never lose a point' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GeoFold | Field GPS survey tool',
    description: 'Geo-tagged photos, offline capture, and every survey point on a map you can export.',
    images: ['/og.png'],
  },
  /* iOS turns a phone number into a tappable link unless it is told not to. On a page where the
     number is part of a trust panel rather than a call button, that formatting is a distraction. */
  formatDetection: { telephone: false },
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${barlow.variable} ${barlowCondensed.variable} ${spaceMono.variable} ${interTight.variable} ${inter.variable} ${jakarta.variable}`}
      suppressHydrationWarning
    >
      {/* NO THEME SCRIPT, and no `data-theme` attribute. The site ships one theme now, so there is
          nothing to decide before paint: the palette in paper.css IS the design, and the ~90 lines
          of dark-mode overrides that used to answer to this attribute are gone with it. A visitor
          whose OS is set to dark gets the same site as everyone else, deliberately — this is a
          corporate identity, not a preference. */}
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
