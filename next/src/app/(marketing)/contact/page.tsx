import type { Metadata } from 'next'
import Link from 'next/link'
import { ADDRESS_ONE_LINE, BUSINESS, OPERATOR } from '@/lib/business'
import { ContactForm } from './ContactForm'

export const metadata: Metadata = {
  title: 'Kontak — GeoFold',
  description: `Hubungi ${OPERATOR}: email ${BUSINESS.email.general}, telepon ${BUSINESS.phone}, alamat ${ADDRESS_ONE_LINE}.`,
}

const { address } = BUSINESS

export default function ContactPage() {
  return (
    <>
      <div className="mk-hero pad-b-sm">
        <span className="mk-eyebrow">Kontak / Contact</span>
        <h1 style={{ maxWidth: 640 }}>Hubungi kami.</h1>
        <p className="mk-lede" style={{ maxWidth: 560 }}>
          Pertanyaan tentang proyek, harga, pembayaran, atau pengembalian dana — kami menjawab dalam{' '}
          {BUSINESS.responseTime.id}.
          <br />
          Questions about a project, pricing, payment or a refund — we reply within{' '}
          {BUSINESS.responseTime.en}.
        </p>
      </div>

      {/* The identity block. Everything a payment gateway, a customer or a regulator needs to
          establish who is behind the service, in one place, above the fold, with no interaction. */}
      <div className="mk-section tight" style={{ paddingTop: 0 }}>
        <div className="mk-doc">
          <h2>Identitas usaha / Business details</h2>
          <dl className="mk-rows">
            <div className="mk-row">
              <dt>Nama usaha</dt>
              <dd>
                <strong>{OPERATOR}</strong>
                <br />
                Pengelola layanan {BUSINESS.brand} — {BUSINESS.site.replace(/^https?:\/\//, '')}
              </dd>
            </div>
            <div className="mk-row">
              <dt>Alamat usaha</dt>
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
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${BUSINESS.email.general}`}>{BUSINESS.email.general}</a>
                {BUSINESS.email.support !== BUSINESS.email.general && (
                  <>
                    <br />
                    Dukungan / support:{' '}
                    <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>
                  </>
                )}
              </dd>
            </div>
            <div className="mk-row">
              <dt>Nomor telepon</dt>
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
              <dt>Jam operasional</dt>
              <dd>
                {BUSINESS.hours.id}
                <br />
                <span style={{ opacity: 0.75 }}>{BUSINESS.hours.en}</span>
              </dd>
            </div>
            {BUSINESS.npwp && (
              <div className="mk-row">
                <dt>NPWP</dt>
                <dd>{BUSINESS.npwp}</dd>
              </div>
            )}
            <div className="mk-row">
              <dt>Waktu tanggapan</dt>
              <dd>
                {BUSINESS.responseTime.id} untuk email dan formulir di bawah / within{' '}
                {BUSINESS.responseTime.en}
              </dd>
            </div>
          </dl>

          <p style={{ fontSize: 13.5, color: 'var(--mk-muted)' }}>
            Untuk permintaan pengembalian dana, ikuti langkah pada{' '}
            <Link href="/refund-policy">Kebijakan Pengembalian Dana</Link>. Untuk pertanyaan umum,
            lihat <Link href="/faq">FAQ</Link> terlebih dahulu — sebagian besar jawaban ada di sana.
          </p>
        </div>
      </div>

      <div style={{ padding: '0 var(--mk-pad) 88px' }}>
        <div className="mk-contact">
          <ContactForm inbox={BUSINESS.email.support} />
          <aside className="mk-aside">
            <div>
              <div className="mk-aside-t">Dukungan teknis / Technical support</div>
              <div className="mk-aside-b">
                <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>
                <br />
                Sertakan referensi survei (mis. KAMPUNG-DURIAN-001) bila menyangkut satu titik
                tertentu.
              </div>
            </div>
            <div>
              <div className="mk-aside-t">Pembayaran &amp; refund / Billing</div>
              <div className="mk-aside-b">
                <a href={`mailto:${BUSINESS.email.billing}`}>{BUSINESS.email.billing}</a>
                <br />
                Sertakan order ID, tanggal, jumlah, dan metode pembayaran.
              </div>
            </div>
            <div>
              <div className="mk-aside-t">Telepon / WhatsApp</div>
              <div className="mk-aside-b">
                <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>
                <br />
                {BUSINESS.hours.id}
              </div>
            </div>
            <div>
              <div className="mk-aside-t">Alamat / Address</div>
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
