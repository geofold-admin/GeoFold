import type { Metadata } from 'next'
import Link from 'next/link'
import { BUSINESS } from '@/lib/business'

export const metadata: Metadata = {
  title: 'Support — Geofold',
  description: 'Help with field capture, syncing, exports and your Geofold subscription.',
}

const topics = [
  {
    q: 'My surveys are stuck as "pending"',
    a: 'Pending means the point is saved on the device but has not reached the server yet — nothing is lost. Capture works fully offline by design. Open Capture and tap "Sync now" once you have signal. If it still will not clear, sign out and back in: an expired session blocks the upload.',
  },
  {
    q: 'The photo uploaded but the point is missing',
    a: 'The survey row and its photo upload separately. The row lands first, so a missing point usually means the survey itself was rejected — check that the project still exists and that its form fields are filled in.',
  },
  {
    q: 'GPS accuracy is poor, or there is no GPS at all',
    a: 'Accuracy (±m) is recorded with every point so bad fixes stay visible instead of being silently trusted. On a desktop browser there is often no usable GPS — use "Enter manually" on the Capture screen to type decimal-degree coordinates instead.',
  },
  {
    q: 'I hit a limit and cannot capture',
    a: 'Free workspaces have a project limit, a per-project photo limit and daily caps on captures and uploads. Existing data always stays readable. Redeem an activation key or upgrade to lift the limits.',
  },
  {
    q: 'Export opens as gibberish in Excel',
    a: 'Use the .xlsx export rather than CSV when your data contains commas or non-Latin characters. The xlsx export also embeds the photos into the spreadsheet rows.',
  },
  {
    q: 'The mobile app cannot reach the server',
    a: 'The app needs the server origin configured. On a phone, "localhost" means the phone itself — it must point at your machine’s LAN address or the deployed URL.',
  },
]

export default function SupportPage() {
  return (
    <>
      <div className="mk-hero pad-b-sm">
        <span className="mk-eyebrow">Support</span>
        <h1 style={{ maxWidth: 640 }}>Get unstuck.</h1>
        <p className="mk-lede" style={{ maxWidth: 520 }}>
          Common issues from the field, and how to reach a human when the answer isn&apos;t here.
        </p>
      </div>

      <div className="mk-section tight">
        <div className="mk-faq">
          <h2>Troubleshooting</h2>
          <div className="mk-faq-list">
            {topics.map(({ q, a }) => (
              <div key={q}>
                <div className="mk-faq-q">{q}</div>
                <div className="mk-faq-a">{a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mk-section tight" style={{ borderTop: '1px solid var(--mk-line)' }}>
        <div className="mk-inner">
          <h2 className="mk-centered-h2">Still stuck?</h2>
          <div className="mk-meta-grid">
            <div className="mk-meta">
              <div className="mk-meta-t">Technical support</div>
              <div className="mk-meta-b">
                <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a> — include the survey reference (e.g. KAMPUNG-DURIAN-001) if it is about a specific point.
              </div>
            </div>
            <div className="mk-meta">
              <div className="mk-meta-t">Billing &amp; activation keys</div>
              <div className="mk-meta-b">
                <a href={`mailto:${BUSINESS.email.billing}`}>{BUSINESS.email.billing}</a> — for redemption problems, quote the key prefix, never the full key. Refunds follow the <Link href="/refund-policy">Refund Policy</Link>.
              </div>
            </div>
            <div className="mk-meta">
              <div className="mk-meta-t">Everything else</div>
              <div className="mk-meta-b">
                See the <Link href="/faq">FAQ</Link>, or use the <Link href="/contact">contact form</Link>. We usually reply within a business day.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
