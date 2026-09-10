import type { Metadata } from 'next'
import Link from 'next/link'
import { ADDRESS_ONE_LINE, BUSINESS, OPERATOR } from '@/lib/business'
import type { Locale } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'
import { ContactForm } from './ContactForm'

/*
 * TWO KINDS OF TEXT ON THIS PAGE, AND THEY BEHAVE DIFFERENTLY.
 *
 * The prose — heading, lede, the note under the table, the aside — follows the visitor's
 * language like the rest of the site.
 *
 * The business identity table does NOT. Its row labels stay dual ("Nama usaha / Business name")
 * and the hours and response time keep showing both languages at once. That block is the
 * merchant record: a payment gateway's verification team, and an Indonesian consumer-protection
 * reader, both have to be able to find the operator's legal name, address, phone and hours
 * without changing a setting or clicking anything. Making it depend on a cookie means half the
 * record is missing for whoever is looking — which is exactly the failure the LangSwitch on
 * /terms was built to avoid. Duplication in that table is the feature.
 */

type Copy = {
  meta: { title: string; description: string }
  eyebrow: string
  h1: string
  lede: string
  identity: string
  labels: {
    name: string
    address: string
    email: string
    phone: string
    hours: string
    npwp: string
    response: string
  }
  operatorOf: string
  supportPrefix: string
  responseValue: string
  note: { before: string; refund: string; mid: string; faq: string; after: string }
  aside: {
    tech: { t: string; b: string }
    billing: { t: string; b: string }
    phone: { t: string }
    address: { t: string }
  }
}

const copy: Record<Locale, Copy> = {
  id: {
    meta: {
      title: 'Kontak — GeoFold',
      description: `Hubungi ${OPERATOR}: email ${BUSINESS.email.general}, telepon ${BUSINESS.phone}, alamat ${ADDRESS_ONE_LINE}.`,
    },
    eyebrow: 'Kontak',
    h1: 'Hubungi kami.',
    lede: `Pertanyaan tentang proyek, harga, pembayaran, atau pengembalian dana — kami menjawab dalam ${BUSINESS.responseTime.id}.`,
    identity: 'Identitas usaha / Business details',
    labels: {
      name: 'Nama usaha / Business name',
      address: 'Alamat usaha / Address',
      email: 'Email',
      phone: 'Nomor telepon / Phone',
      hours: 'Jam operasional / Hours',
      npwp: 'NPWP',
      response: 'Waktu tanggapan / Response time',
    },
    operatorOf: 'Pengelola layanan',
    supportPrefix: 'Dukungan / support: ',
    responseValue: `${BUSINESS.responseTime.id} / within ${BUSINESS.responseTime.en}`,
    note: {
      before: 'Untuk permintaan pengembalian dana, ikuti langkah pada ',
      refund: 'Kebijakan Pengembalian Dana',
      mid: '. Untuk pertanyaan umum, lihat ',
      faq: 'FAQ',
      after: ' terlebih dahulu — sebagian besar jawaban ada di sana.',
    },
    aside: {
      tech: {
        t: 'Dukungan teknis',
        b: 'Sertakan referensi survei (mis. KAMPUNG-DURIAN-001) bila menyangkut satu titik tertentu.',
      },
      billing: {
        t: 'Pembayaran & refund',
        b: 'Sertakan order ID, tanggal, jumlah, dan metode pembayaran.',
      },
      phone: { t: 'Telepon / WhatsApp' },
      address: { t: 'Alamat' },
    },
  },

  en: {
    meta: {
      title: 'Contact — GeoFold',
      description: `Contact ${OPERATOR}: email ${BUSINESS.email.general}, phone ${BUSINESS.phone}, address ${ADDRESS_ONE_LINE}.`,
    },
    eyebrow: 'Contact',
    h1: 'Get in touch.',
    lede: `Questions about a project, pricing, payment or a refund — we reply within ${BUSINESS.responseTime.en}.`,
    identity: 'Identitas usaha / Business details',
    labels: {
      name: 'Nama usaha / Business name',
      address: 'Alamat usaha / Address',
      email: 'Email',
      phone: 'Nomor telepon / Phone',
      hours: 'Jam operasional / Hours',
      npwp: 'NPWP',
      response: 'Waktu tanggapan / Response time',
    },
    operatorOf: 'Operator of',
    supportPrefix: 'Dukungan / support: ',
    responseValue: `${BUSINESS.responseTime.id} / within ${BUSINESS.responseTime.en}`,
    note: {
      before: 'For a refund request, follow the steps in the ',
      refund: 'Refund Policy',
      mid: '. For general questions, check the ',
      faq: 'FAQ',
      after: ' first — most answers are there.',
    },
    aside: {
      tech: {
        t: 'Technical support',
        b: 'Include the survey reference (e.g. KAMPUNG-DURIAN-001) if it is about one specific point.',
      },
      billing: {
        t: 'Billing & refunds',
        b: 'Include the order ID, date, amount and payment method.',
      },
      phone: { t: 'Phone / WhatsApp' },
      address: { t: 'Address' },
    },
  },
}

const { address } = BUSINESS

export async function generateMetadata(): Promise<Metadata> {
  const c = copy[await getLocale()]
  return { title: c.meta.title, description: c.meta.description }
}

export default async function ContactPage() {
  const locale = await getLocale()
  const c = copy[locale]

  return (
    <>
      <div className="mk-hero pad-b-sm">
        <span className="mk-eyebrow">{c.eyebrow}</span>
        <h1 style={{ maxWidth: 640 }}>{c.h1}</h1>
        <p className="mk-lede" style={{ maxWidth: 560 }}>
          {c.lede}
        </p>
      </div>

      {/* The identity block. Everything a payment gateway, a customer or a regulator needs to
          establish who is behind the service, in one place, above the fold, with no interaction —
          and in both languages regardless of which one the visitor is browsing in. See the file
          header for why this one block does not follow the locale. */}
      <div className="mk-section tight" style={{ paddingTop: 0 }}>
        <div className="mk-doc">
          <h2>{c.identity}</h2>
          <dl className="mk-rows">
            <div className="mk-row">
              <dt>{c.labels.name}</dt>
              <dd>
                <strong>{OPERATOR}</strong>
                <br />
                {c.operatorOf} {BUSINESS.brand} — {BUSINESS.site.replace(/^https?:\/\//, '')}
              </dd>
            </div>
            <div className="mk-row">
              <dt>{c.labels.address}</dt>
              <dd>
                <address style={{ fontStyle: 'normal' }}>
                  {address.line1}
                  <br />
                  {address.line2}
                  <br />
                  {address.city}, {address.province} {address.postcode}
                  <br />
                  {address.country}
                </address>
              </dd>
            </div>
            <div className="mk-row">
              <dt>{c.labels.email}</dt>
              <dd>
                <a href={`mailto:${BUSINESS.email.general}`}>{BUSINESS.email.general}</a>
                {BUSINESS.email.support !== BUSINESS.email.general && (
                  <>
                    <br />
                    {c.supportPrefix}
                    <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>
                  </>
                )}
              </dd>
            </div>
            <div className="mk-row">
              <dt>{c.labels.phone}</dt>
              <dd>
                <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>
                {BUSINESS.whatsapp && (
                  <>
                    {' · '}
                    <a
                      href={`https://wa.me/${BUSINESS.whatsapp}`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      WhatsApp
                    </a>
                  </>
                )}
              </dd>
            </div>
            <div className="mk-row">
              <dt>{c.labels.hours}</dt>
              <dd>
                {BUSINESS.hours.id}
                <br />
                <span style={{ opacity: 0.75 }}>{BUSINESS.hours.en}</span>
              </dd>
            </div>
            {BUSINESS.npwp && (
              <div className="mk-row">
                <dt>{c.labels.npwp}</dt>
                <dd>{BUSINESS.npwp}</dd>
              </div>
            )}
            <div className="mk-row">
              <dt>{c.labels.response}</dt>
              <dd>{c.responseValue}</dd>
            </div>
          </dl>

          <p style={{ fontSize: 13.5, color: 'var(--mk-muted)' }}>
            {c.note.before}
            <Link href="/refund-policy">{c.note.refund}</Link>
            {c.note.mid}
            <Link href="/faq">{c.note.faq}</Link>
            {c.note.after}
          </p>
        </div>
      </div>

      <div style={{ padding: '0 var(--mk-pad) 88px' }}>
        <div className="mk-contact">
          <ContactForm inbox={BUSINESS.email.support} locale={locale} />
          <aside className="mk-aside">
            <div>
              <div className="mk-aside-t">{c.aside.tech.t}</div>
              <div className="mk-aside-b">
                <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>
                <br />
                {c.aside.tech.b}
              </div>
            </div>
            <div>
              <div className="mk-aside-t">{c.aside.billing.t}</div>
              <div className="mk-aside-b">
                <a href={`mailto:${BUSINESS.email.billing}`}>{BUSINESS.email.billing}</a>
                <br />
                {c.aside.billing.b}
              </div>
            </div>
            <div>
              <div className="mk-aside-t">{c.aside.phone.t}</div>
              <div className="mk-aside-b">
                <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>
                <br />
                {locale === 'id' ? BUSINESS.hours.id : BUSINESS.hours.en}
              </div>
            </div>
            <div>
              <div className="mk-aside-t">{c.aside.address.t}</div>
              <div className="mk-aside-b">
                <address style={{ fontStyle: 'normal' }}>
                  {address.line1}
                  <br />
                  {address.line2}
                  <br />
                  {address.city}, {address.province} {address.postcode}
                  <br />
                  {address.country}
                </address>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}
