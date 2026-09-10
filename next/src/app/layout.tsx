import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Archivo, Barlow, Barlow_Condensed, Inter, Inter_Tight, Space_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

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

export const metadata: Metadata = {
  title: 'GeoFold — Field GPS survey tool',
  description: 'Turn a phone into a field survey kit: geo-tagged photos, offline capture, and every point on a map you can export and report from.',
  openGraph: {
    title: 'GeoFold — Field GPS survey tool',
    description: 'Geo-tagged photos, offline capture, and every survey point on a map you can export.',
    type: 'website',
  },
}

// Set the initial theme before paint to avoid a flash: honour a saved choice, else the OS setting.
const themeScript = `(function(){try{var t=localStorage.getItem('geofold-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Matches the 'nonce-…' in the CSP the proxy set for this request.
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html
      lang="en"
      className={`${archivo.variable} ${barlow.variable} ${barlowCondensed.variable} ${spaceMono.variable} ${interTight.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* suppressHydrationWarning: browsers blank out the nonce attribute in the DOM once
            the CSP has been applied, so the client always sees "" where the server sent a value. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
