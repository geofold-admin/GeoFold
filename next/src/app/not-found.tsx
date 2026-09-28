import Link from 'next/link'
import { Work_Sans } from 'next/font/google'
import '@/styles/marketing.css'
import '@/styles/home.css'
import '@/styles/paper.css'
import '@/styles/corporate.css'
// Blueprint: the client's palette, four typefaces, 0px corners. This page is a `.mk-nf` shell —
// one of the four that keep the dark ground — and blueprint.css restates that dark set for it
// (see its section 11). Without this import the 404 keeps a 20px card radius while every other
// panel on the site is square, which is exactly the kind of one-screen-out-of-step the client's
// "sudut tajam untuk panel" instruction is about.
import '@/styles/blueprint.css'
import { LogoLockup } from '@/components/Logo'
import { chrome } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'

/**
 * THE 404.
 *
 * WHY THIS FILE EXISTS AT ALL. Until now the site had no `not-found.tsx`, so every dead URL fell
 * through to Next's built-in 404: `404` and "This page could not be found." centred on the
 * framework's own white sheet, with no nav, no brand and no way back. On a site whose whole
 * surface is the midnight ground, that page was the one white screen a visitor could reach — and
 * the easiest one to reach by accident, because a stale link, a truncated share URL and a typo all
 * land on it. Measured on the deployed site: `background:#fff` on `/security`.
 *
 * WHY IT LOADS THE SKINS ITSELF. This sits in the root of the app router, so it renders OUTSIDE
 * the (marketing) layout — that layout's nav, ground and footer are not above it, and neither are
 * its stylesheets. The import list below is deliberately the same one the marketing layout uses,
 * so the palette, the `.mk` tokens and the corporate layer are all present and the page is drawn
 * from the same variables as every other page rather than from hard-coded colours that would drift
 * the moment the palette moves.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No `SiteGround` canvas: this is a dead end, and spinning up a
 * full-viewport WebGL program for the one page a visitor is trying to leave is the wrong trade.
 * The flat ground is the same colour, so the page still belongs to the site.
 *
 * THE LINKS ARE THE POINT. A 404 has exactly one job: get the visitor back to something real. The
 * four destinations below are the ones a lost visitor is actually looking for — the product, the
 * price, the app, and a human. They are taken from the same `chrome` dictionary the nav uses, so
 * the labels cannot disagree with the header a visitor just left.
 */
export const metadata = {
  title: 'Page not found | GeoFold',
  robots: { index: false, follow: true },
}

// The marketing body face, loaded here for the same reason the skins are: this route renders
// outside the (marketing) layout, so `--font-work` would otherwise be undefined and the page
// would fall back to the system stack while every other page uses Work Sans.
const workSans = Work_Sans({
  variable: '--font-work',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export default async function NotFound() {
  const locale = await getLocale()
  const c = chrome[locale]
  const t = {
    id: {
      code: '404',
      heading: 'Halaman ini tidak ada.',
      body: 'Tautannya mungkin sudah lama, salah ketik, atau halamannya sudah dipindahkan. Tidak ada data yang hilang — yang Anda cari tinggal di salah satu tempat di bawah ini.',
      home: 'Kembali ke beranda',
    },
    en: {
      code: '404',
      heading: 'This page does not exist.',
      body: 'The link may be old, mistyped, or the page may have moved. Nothing is lost — what you were looking for is most likely one of these.',
      home: 'Back to home',
    },
  }[locale]

  return (
    <div className={`mk mk-nf ${workSans.variable}`} lang={locale}>
      <header className="mk-nf-bar">
        <Link href="/" className="mk-nf-brand" aria-label="GeoFold">
          <LogoLockup size={24} />
        </Link>
      </header>

      <main className="mk-nf-main">
        <div className="mk-nf-card">
          <p className="mk-nf-code" aria-hidden="true">
            {t.code}
          </p>
          <h1 className="mk-nf-heading">{t.heading}</h1>
          <p className="mk-nf-body">{t.body}</p>
          <div className="mk-nf-actions">
            <Link href="/" className="mk-btn mk-btn-primary">
              {t.home}
            </Link>
            <Link href="/contact" className="mk-btn mk-btn-outline">
              {c.footer.contact}
            </Link>
          </div>
          <nav className="mk-nf-links" aria-label={c.a11y.nav}>
            <Link href="/product">{c.nav.product}</Link>
            <Link href="/pricing">{c.nav.pricing}</Link>
            <Link href="/download">{c.nav.download}</Link>
            <Link href="/faq">{c.nav.faq}</Link>
            <Link href="/login">{c.nav.portal}</Link>
          </nav>
        </div>
      </main>
    </div>
  )
}
