import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Work_Sans } from 'next/font/google'
import '@/styles/marketing.css'
import '@/styles/home.css'
// Loaded last: re-skins the whole marketing site at the token layer. See the file header.
//
// This was '@/styles/overhaul.css' (the "Topographic" skin) until the Paper re-skin. That file is
// still on disk and still self-consistent: swapping this one line back restores the previous
// design in full, minus the landing page, whose markup was rebuilt around `pg-` components.
import '@/styles/paper.css'
// The corporate layer: one contour ground, cards instead of bands, the new palette's CTA rule.
// Loaded last so it wins against the skins above it. See the file header.
import '@/styles/corporate.css'
// ★ THE BLUEPRINT LAYER — 2026-09-29. The client's UI/UX proposal: a LIGHT technical ground,
// the hero as the one dark plate, square corners at 0px, and the four faces the brief names
// (Archivo / Barlow / Barlow Condensed / Space Mono) restored after the Inter re-skin.
//
// Loaded last so it re-points the token layer over every skin above it. It supersedes
// corporate.css's "Midnight" the same way that superseded "Paper": this one line is the whole
// switch, and commenting it out restores the previous design exactly.
//
// It also carries the `.mk-site` marker on the wrapper below, which is what scopes the light
// document ground (the phone's overscroll bounce) to THIS subtree without touching /login,
// /onboarding, /reset and the 404 — the four screens that keep the midnight ground.
import '@/styles/blueprint.css'
// The in-page checkout. Loaded here as well as in the app chrome because the pricing page is
// reachable signed-out, and the modal opens on top of the marketing site.
import '@/styles/checkout.css'
import { ADDRESS_ONE_LINE, BUSINESS, LEGAL, OPERATOR } from '@/lib/business'
import { chrome } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'
import { organizationJsonLd } from '@/lib/seo'
import { LogoLockup } from '@/components/Logo'
import { SiteGround } from '@/components/SiteGround'
import { MarketingNav } from './MarketingNav'
import { Motion } from './Motion'

/**
 * The marketing subtree is the part of the site that WANTS to be indexed.
 *
 * The root layout turns indexing off, because it is shared with the signed-in app and an app
 * screen in a search result is noise at best and a leaked form at worst. Every page under this
 * layout opts back in with its own title, description and canonical URL (see lib/seo). Setting it
 * here rather than on each page means a new marketing page is crawlable by existing, which is the
 * safe direction to fail in: a page nobody links to yet is harmless, while a page that silently
 * ships `noindex` is invisible and nobody finds out.
 */
export const metadata: Metadata = {
  robots: { index: true, follow: true },
}

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
 * payment gateway verifies is a bad trade: the file can move, and the licence to redistribute
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
     * cookie would mislabel every screen behind the login as Indonesian: telling a screen
     * reader to pronounce English UI with Indonesian phonetics. Scoping it here is valid HTML
     * and describes exactly the subtree that actually changes language.
     */
    <div className={`mk mk-site ${workSans.variable}`} lang={locale}>
      {/* The Organization node. Emitted once per page, from the same constants the footer's trust
          panel renders, so the machine-readable facts and the printed ones cannot disagree.
          See lib/seo.ts for why there is no aggregateRating here. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- JSON-LD is inert data, and Next has no
        // first-class way to emit it; the value is serialised from our own constants, never input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd(locale)) }}
      />
      {/* Scroll progress hairline. Pinned to the very top of the viewport, above the nav's own
          sticky layer, and driven by Motion.tsx. aria-hidden: it is decoration, and a progress
          readout that a screen reader announced on every scroll would be unusable. */}
      <div className="mk-progress" data-scroll-progress aria-hidden="true">
        <span />
      </div>
      <MarketingNav locale={locale} />
      {/* THE ONE GROUND. A single contour field, fixed to the viewport, behind every page in this
          subtree — the same background at every scroll position and on every page. It replaces
          four per-section effects (the hero's graticule, the how-it-works contours, the argument
          band's magnet lines, the closing grid) so that sections are no longer coloured bands but
          cards sitting on one continuous ground. See SiteGround.tsx. */}
      <SiteGround />
      {/* The motion system, mounted once for the whole marketing site. It was inside the landing
          page, which meant every effect it owns existed on `/` and nowhere else: the other ten
          pages had a progress bar that never filled and a nav that never condensed. See the
          header comment in Motion.tsx for why a layout needs the pathname dependency. */}
      <Motion />
      {children}
      {/* The Legal and Help columns are load-bearing: a payment gateway verifying this merchant
          looks for FAQ, Terms, Refund Policy and Contact reachable from every page. Keep all four
          linked here. */}
      <footer className="mk-footer">
        {/* ONE ROW. The footer used to be two stacked sections: a brand-and-links band, then a
            separate trust band holding the NIB, the KBLI and the OSS mark. Measured on a 1440px
            page, that second band was the bulk of a 411px footer, and it read as a second footer
            bolted to the bottom of the first.

            It is now a single grid row: brand, four link columns, and the legalitas column
            answering "is this a real registered business?" from where it belongs, beside the
            navigation rather than underneath it. Under the row there is one hairline and one line
            carrying the copyright, the address and the two contact links.

            Nothing was dropped to achieve the reduction. Every link that was here is still here,
            every registration number is still here, and the OSS mark still links out. The saving
            comes from putting the two bands side by side instead of one after the other. */}
        <div className="mk-footer-main">
          <div className="mk-footer-brand-block">
            <div className="mk-footer-brand">
              <LogoLockup size={24} />
            </div>
            {/* The blurb IS the parent link. It used to be a paragraph here and a separate
                "A product of SAYBA ARC" anchor in the trust column, so the footer said SAYBA ARC
                three times (blurb, parent link, copyright line) and the reader saw a duplicate.
                Making the sentence itself the outbound link keeps every fact and every href while
                removing the repetition: one statement, one link, in the column whose whole job is
                to say who makes this. */}
            <a
              className="mk-footer-blurb"
              href={LEGAL.parent.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {c.seal.parentNote}
              <span className="mk-parent-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          </div>

          <nav className="mk-footer-col" aria-labelledby="mk-f-product">
            <span id="mk-f-product">{c.footer.product}</span>
            <Link href="/product">{c.footer.features}</Link>
            <Link href="/pricing">{c.footer.pricing}</Link>
            <Link href="/download">{c.footer.download}</Link>
          </nav>
          <nav className="mk-footer-col" aria-labelledby="mk-f-company">
            <span id="mk-f-company">{c.footer.company}</span>
            <Link href="/about">{c.footer.about}</Link>
            <Link href="/contact">{c.footer.contact}</Link>
            <Link href="/login">{c.footer.login}</Link>
          </nav>
          <nav className="mk-footer-col" aria-labelledby="mk-f-help">
            <span id="mk-f-help">{c.footer.help}</span>
            <Link href="/faq">{c.footer.faq}</Link>
            <Link href="/support">{c.footer.support}</Link>
          </nav>
          <nav className="mk-footer-col" aria-labelledby="mk-f-legal">
            <span id="mk-f-legal">{c.footer.legal}</span>
            {/* This used to stay "Syarat & Ketentuan" in both languages, on the theory that a
                verifier looks for that exact title. It was wrong: a verifier reading the site in
                Indonesian still sees the Indonesian name, and one reading in English was getting a
                single stray Indonesian word in an otherwise English footer with no way to tell it
                was a link to the terms. The document is identified by its URL, not by the footer
                label, and /terms still opens on the Indonesian text for an Indonesian reader. */}
            <Link href="/terms">{c.footer.terms}</Link>
            <Link href="/refund-policy">{c.footer.refund}</Link>
            <Link href="/privacy">{c.footer.privacy}</Link>
          </nav>

          {/*
            THE TRUST COLUMN.
            The seal answers "is this a real registered business?": a NIB, the KBLI it trades
            under, and the OSS system that issued it. A payment gateway's verification team looks
            for exactly this, and a buyer deciding whether to send money looks for it too. The
            numbers come from lib/business.ts so no page can drift out of step with another.

            The parent line answers "who is behind this?", and it is deliberately a link, not a
            credit. SAYBA ARC is the entity that holds the NIB, so the two read as one statement:
            this is a SAYBA ARC product, and SAYBA ARC is registered. The wording is "A product of"
            / "Produk dari" rather than "Part of", because a product of a company is unambiguous in
            both languages while "part of" reads in Indonesian as a department of it.
          */}
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
            {/* TWO THINGS WERE REMOVED HERE, and both were the client's call.
                1. The "A product of SAYBA ARC" anchor: the brand column's own sentence says this
                   in full and is itself the link now, so the footer stated it three times.
                2. The note explaining what a NIB is: it restated the NIB row and the OSS chip
                   directly above it. The column keeps what only it can say — the numbers and the
                   chip that verifies them — and a verifier needs nothing explained. */}
          </section>
        </div>

        {/* One hairline, one line. The copyright, the registered address and both contact links
            live here now rather than in the brand column, which is what lets the row above stay a
            row. */}
        <div className="mk-footer-bar">
          <span className="mk-footer-copy">
            © {new Date().getFullYear()} {OPERATOR}. {c.footer.rights}
          </span>
          <span className="mk-footer-addr">{ADDRESS_ONE_LINE}</span>
          <a href={`mailto:${BUSINESS.email.general}`}>{BUSINESS.email.general}</a>
          <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>
        </div>
      </footer>
    </div>
  )
}
