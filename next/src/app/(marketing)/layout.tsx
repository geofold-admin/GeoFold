import type { ReactNode } from 'react'
import Link from 'next/link'
import { Work_Sans } from 'next/font/google'
import '@/styles/marketing.css'
import '@/styles/home.css'
// Loaded last: re-skins the whole marketing site at the token layer. See the file header.
import '@/styles/overhaul.css'
import { ADDRESS_ONE_LINE, BUSINESS, OPERATOR } from '@/lib/business'
import { MarketingNav } from './MarketingNav'

// Body face for the marketing site. Headings stay on Archivo (--font-sans), which
// the root layout already loads.
const workSans = Work_Sans({
  variable: '--font-work',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`mk ${workSans.variable}`}>
      <MarketingNav />
      {children}
      {/* The Legal and Help columns are load-bearing: a payment gateway verifying this merchant
          looks for FAQ, Terms, Refund Policy and Contact reachable from every page. Keep all four
          linked here. */}
      <footer className="mk-footer">
        <div>
          <div className="mk-footer-brand">Geofold</div>
          <div className="mk-copy">
            © {new Date().getFullYear()} {OPERATOR}. All rights reserved.
            <br />
            {ADDRESS_ONE_LINE}
            <br />
            <a href={`mailto:${BUSINESS.email.general}`}>{BUSINESS.email.general}</a> ·{' '}
            <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>
          </div>
        </div>
        <div className="mk-footer-cols">
          <div className="mk-footer-col">
            <span>Product</span>
            <Link href="/product">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/download">Download app</Link>
          </div>
          <div className="mk-footer-col">
            <span>Company</span>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
          </div>
          <div className="mk-footer-col">
            <span>Account</span>
            <Link href="/login">Portal login</Link>
          </div>
          <div className="mk-footer-col">
            <span>Help</span>
            <Link href="/faq">FAQ</Link>
            <Link href="/support">Support</Link>
            <Link href="/contact">Contact</Link>
          </div>
          <div className="mk-footer-col">
            <span>Legal</span>
            <Link href="/terms">Syarat &amp; Ketentuan</Link>
            <Link href="/refund-policy">Refund Policy</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
