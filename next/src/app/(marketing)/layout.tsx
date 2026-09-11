import type { ReactNode } from 'react'
import Link from 'next/link'
import { Work_Sans } from 'next/font/google'
import '@/styles/marketing.css'
import '@/styles/home.css'
// Loaded last: re-skins the whole marketing site at the token layer. See the file header.
//
// This was '@/styles/overhaul.css' (the "Topographic" skin) until the Paper re-skin. That file is
// still on disk and still self-consistent — swapping this one line back restores the previous
// design in full, minus the landing page, whose markup was rebuilt around `pg-` components.
import '@/styles/paper.css'
import { ADDRESS_ONE_LINE, BUSINESS, OPERATOR } from '@/lib/business'
import { chrome } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'
import { MarketingNav } from './MarketingNav'

// Body face for the marketing site. Headings stay on Archivo (--font-sans), which
// the root layout already loads.
const workSans = Work_Sans({
  variable: '--font-work',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  const c = chrome[locale]

  return (
    /*
     * `lang` goes on this wrapper rather than on <html>. The root layout is shared with the
     * signed-in app, which is English-only, so flipping the document language from a marketing
     * cookie would mislabel every screen behind the login as Indonesian — telling a screen
     * reader to pronounce English UI with Indonesian phonetics. Scoping it here is valid HTML
     * and describes exactly the subtree that actually changes language.
     */
    <div className={`mk ${workSans.variable}`} lang={locale}>
      <MarketingNav locale={locale} />
      {children}
      {/* The Legal and Help columns are load-bearing: a payment gateway verifying this merchant
          looks for FAQ, Terms, Refund Policy and Contact reachable from every page. Keep all four
          linked here. */}
      <footer className="mk-footer">
        <div>
          <div className="mk-footer-brand">Geofold</div>
          <div className="mk-copy">
            © {new Date().getFullYear()} {OPERATOR}. {c.footer.rights}
            <br />
            {ADDRESS_ONE_LINE}
            <br />
            <a href={`mailto:${BUSINESS.email.general}`}>{BUSINESS.email.general}</a> ·{' '}
            <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>
          </div>
        </div>
        <div className="mk-footer-cols">
          <div className="mk-footer-col">
            <span>{c.footer.product}</span>
            <Link href="/product">{c.footer.features}</Link>
            <Link href="/pricing">{c.footer.pricing}</Link>
            <Link href="/download">{c.footer.download}</Link>
          </div>
          <div className="mk-footer-col">
            <span>{c.footer.company}</span>
            <Link href="/about">{c.footer.about}</Link>
            <Link href="/contact">{c.footer.contact}</Link>
          </div>
          <div className="mk-footer-col">
            <span>{c.footer.account}</span>
            <Link href="/login">{c.footer.login}</Link>
          </div>
          <div className="mk-footer-col">
            <span>{c.footer.help}</span>
            <Link href="/faq">{c.footer.faq}</Link>
            <Link href="/support">{c.footer.support}</Link>
            <Link href="/contact">{c.footer.contact}</Link>
          </div>
          <div className="mk-footer-col">
            <span>{c.footer.legal}</span>
            {/* This used to stay "Syarat & Ketentuan" in both languages, on the theory that a
                verifier looks for that exact title. It was wrong: a verifier reading the site in
                Indonesian still sees the Indonesian name, and one reading in English was getting a
                single stray Indonesian word in an otherwise English footer with no way to tell it
                was a link to the terms. The document is identified by its URL, not by the footer
                label, and /terms still opens on the Indonesian text for an Indonesian reader. */}
            <Link href="/terms">{c.footer.terms}</Link>
            <Link href="/refund-policy">{c.footer.refund}</Link>
            <Link href="/privacy">{c.footer.privacy}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
