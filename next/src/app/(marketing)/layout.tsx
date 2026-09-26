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
// The in-page checkout. Loaded here as well as in the app chrome because the pricing page is
// reachable signed-out, and the modal opens on top of the marketing site.
import '@/styles/checkout.css'
import { ADDRESS_ONE_LINE, BUSINESS, LEGAL, OPERATOR } from '@/lib/business'
import { chrome } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'
import { LogoLockup } from '@/components/Logo'
import { MarketingNav } from './MarketingNav'

// Body face for the marketing site. Headings stay on Archivo (--font-sans), which
// the root layout already loads.
const workSans = Work_Sans({
  variable: '--font-work',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

/**
 * The OSS mark, drawn rather than linked.
 *
 * The real logo belongs to BKPM and shipping a hotlinked copy of a government mark on a page a
 * payment gateway verifies is a bad trade — the file can move, and the licence to redistribute
 * it is not ours. This is a neutral plate that says the same thing in the same place: this
 * number is an OSS registration. The link beside it goes to the checker where the number can be
 * looked up, which is what a verifier actually needs.
 */
function OssMark() {
  return (
    <span className="mk-seal-oss-mark" aria-hidden="true">
      OSS
    </span>
  )
}

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
      {/* Scroll progress hairline. Pinned to the very top of the viewport, above the nav's own
          sticky layer, and driven by Motion.tsx. aria-hidden: it is decoration, and a progress
          readout that a screen reader announced on every scroll would be unusable. */}
      <div className="mk-progress" data-scroll-progress aria-hidden="true">
        <span />
      </div>
      <MarketingNav locale={locale} />
      {children}
      {/* The Legal and Help columns are load-bearing: a payment gateway verifying this merchant
          looks for FAQ, Terms, Refund Policy and Contact reachable from every page. Keep all four
          linked here. */}
      <footer className="mk-footer">
        <div className="mk-footer-main">
          <div className="mk-footer-brand-block">
            <div className="mk-footer-brand">
              <LogoLockup size={24} />
            </div>
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
        </div>

        {/*
          THE TRUST BLOCK.
          Two things sit side by side here and they answer two different questions.

          The seal answers "is this a real registered business?" — a NIB, the KBLI it trades
          under, and the OSS system that issued it. A payment gateway's verification team looks
          for exactly this, and a buyer deciding whether to send money looks for it too. The
          numbers come from lib/business.ts so no page can drift out of step with another.

          The parent line answers "who is behind this?" — and it is deliberately a link, not a
          credit. SAYBA ARC is the entity that holds the NIB, so the two blocks read as one
          statement: this is a SAYBA ARC product, and SAYBA ARC is registered. The wording is
          "A product of" / "Produk dari" rather than "Part of", because a product of a company is
          unambiguous in both languages while "part of" reads in Indonesian as a department of it.
        */}
        <div className="mk-footer-legal">
          <section className="mk-seal" aria-labelledby="mk-seal-heading">
            <h2 id="mk-seal-heading" className="mk-seal-heading">
              {c.seal.heading}
            </h2>
            <p className="mk-seal-entity">
              <strong>{c.seal.entity}</strong>
              <span aria-hidden="true"> · </span>
              <span className="mk-seal-scale">{c.seal.scale}</span>
            </p>
            <dl className="mk-seal-rows">
              <div>
                <dt>{c.seal.nib}</dt>
                <dd>{LEGAL.nib}</dd>
              </div>
              <div>
                <dt>{c.seal.kbli}</dt>
                <dd>
                  {LEGAL.kbli}
                  <span className="mk-seal-kbli-label">{LEGAL.kbliLabel[locale]}</span>
                </dd>
              </div>
            </dl>
            <a className="mk-seal-oss" href={LEGAL.ossUrl} target="_blank" rel="noopener noreferrer">
              <OssMark />
              <span>{c.seal.oss}</span>
            </a>
            <p className="mk-seal-note">{c.seal.ossNote}</p>
          </section>

          <section className="mk-parent" aria-labelledby="mk-parent-heading">
            <h2 id="mk-parent-heading" className="mk-seal-heading">
              {c.seal.parentPre}
            </h2>
            <a className="mk-parent-link" href={LEGAL.parent.url} target="_blank" rel="noopener noreferrer">
              {LEGAL.parent.name}
              <span className="mk-parent-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
            <p className="mk-seal-note">{c.seal.parentNote}</p>
          </section>
        </div>
      </footer>
    </div>
  )
}
