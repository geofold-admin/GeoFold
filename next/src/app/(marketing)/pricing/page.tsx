import type { Metadata } from 'next'
import Link from 'next/link'
import { PREMIUM_DAYS, PREMIUM_PRICE_LABEL } from '@/lib/pricing'
import { CheckIcon } from '../icons'

export const metadata: Metadata = {
  title: 'Pricing — Geofold',
  description: 'Start free with three projects. Go Premium for unlimited projects, photos and the survey map.',
}

// Read from lib/pricing, which is also what the checkout charges — a price quoted here that
// disagrees with what a customer is actually billed is a consumer-protection problem, so this page
// must never hold its own copy of the number. Change it via PREMIUM_PRICE_IDR / PREMIUM_DAYS.
const PREMIUM_PRICE = PREMIUM_PRICE_LABEL
const PREMIUM_PERIOD = ` / ${PREMIUM_DAYS} hari`

// Free tier, per docs/migration-002-subscription.sql: 3 projects, +1 project per 24h,
// 20 photos per project, plus daily caps on surveys captured and photos uploaded.
const free = [
  'Up to 3 projects (+1 more every 24h)',
  '20 photos per project',
  'Daily capture & upload limits',
  'Offline capture with auto-sync',
  'CSV & Excel (photos embedded) export',
]
const premium = [
  'Unlimited projects, surveys & photos',
  'No daily limits',
  'Survey map view (satellite & street)',
  'Priority support',
]
const enterprise = [
  'SSO & role-based access',
  'Direct ArcGIS Online integration',
  'Dedicated onboarding',
  'SLA-backed support',
]

const faqs = [
  {
    q: 'How do I upgrade to Premium?',
    a: 'Upgrade from inside the app — pay by QRIS through Midtrans, or redeem an activation key. Premium takes effect immediately and runs until its expiry date.',
  },
  {
    q: 'What happens when Premium expires?',
    a: 'Your data is never touched. If your workspace is over the free limits when Premium lapses it is frozen — you can still read and export everything, and new captures resume once you renew or come back under the free limits.',
  },
  {
    q: 'Who owns the survey data?',
    a: 'You do, always. Export or delete your full project data at any time, on any plan.',
  },
  {
    q: 'Do you support other GIS platforms?',
    a: 'GeoJSON and CSV exports work with most GIS software; Enterprise adds direct ArcGIS Online sync.',
  },
]

export default function PricingPage() {
  return (
    <>
      <div className="mk-hero pad-b-sm">
        <span className="mk-eyebrow">Pricing</span>
        <h1 style={{ maxWidth: 700 }}>Plans for every survey team.</h1>
        <p className="mk-lede" style={{ maxWidth: 520 }}>
          Start free with three projects. Go Premium when you&apos;re ready to put the whole team in the field.
        </p>
      </div>

      <div style={{ padding: '0 var(--mk-pad) 72px' }}>
        <div className="mk-plans">
          <div className="mk-plan">
            <div className="mk-plan-name">Free</div>
            <div className="mk-plan-for">For small pilot projects</div>
            <div className="mk-plan-price">Rp 0</div>
            <ul className="mk-plan-list">
              {free.map((f) => <li key={f}><CheckIcon /><span>{f}</span></li>)}
            </ul>
            <Link href="/login" className="mk-plan-cta">Get started</Link>
          </div>

          <div className="mk-plan featured">
            <div className="mk-plan-flag">Most popular</div>
            <div className="mk-plan-name">Premium</div>
            <div className="mk-plan-for">For active field teams</div>
            <div className="mk-plan-price tight">{PREMIUM_PRICE}<small>{PREMIUM_PERIOD}</small></div>
            <div className="mk-plan-note">one-off payment — no auto-renewal</div>
            <ul className="mk-plan-list">
              {premium.map((f) => <li key={f}><CheckIcon stroke="#f6f4ee" /><span>{f}</span></li>)}
            </ul>
            <Link href="/login" className="mk-plan-cta solid">Go Premium</Link>
          </div>

          <div className="mk-plan">
            <div className="mk-plan-name">Enterprise</div>
            <div className="mk-plan-for">For agencies &amp; large programs</div>
            <div className="mk-plan-price">Custom</div>
            <ul className="mk-plan-list">
              {enterprise.map((f) => <li key={f}><CheckIcon /><span>{f}</span></li>)}
            </ul>
            <Link href="/contact" className="mk-plan-cta">Talk to sales</Link>
          </div>
        </div>
      </div>

      <div className="mk-section tight" style={{ borderTop: '1px solid var(--mk-line)' }}>
        <div className="mk-faq">
          <h2>Common questions</h2>
          <div className="mk-faq-list">
            {faqs.map(({ q, a }) => (
              <div key={q}>
                <div className="mk-faq-q">{q}</div>
                <div className="mk-faq-a">{a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
