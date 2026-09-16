import type { Metadata } from 'next'
import Link from 'next/link'
import { IpaymuSandboxButton } from './IpaymuSandboxButton'
import { PREMIUM_DAYS, PREMIUM_PRICE_LABEL, PREMIUM_STORAGE_LABEL } from '@/lib/pricing'
import { BUSINESS } from '@/lib/business'
import { ipaymuConfig } from '@/lib/ipaymu'
import type { Locale } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'

/*
 * Rewritten 2026-09-07. The previous version sold an "Enterprise" tier offering SSO, role-based
 * access and direct ArcGIS Online integration. None of those exist — there is no team model, no
 * roles beyond the one that lifts quota limits, and no ArcGIS integration of any kind. Selling a
 * tier built entirely from unbuilt features is worse than having no third tier.
 *
 * The two plans below are the two the code actually implements, and the limits are the ones
 * lib/quota.ts enforces.
 *
 * Translated 2026-09-10. This page states payment terms, so the two languages have to agree
 * exactly: a refund window or a billing model that reads differently in English than in
 * Indonesian is a consumer-protection problem, not a copy inconsistency. The figures themselves
 * (price, duration, limits) come from lib/pricing.ts and are shared, not duplicated per language.
 */

type Copy = {
  meta: { title: string; description: string }
  eyebrow: string
  h1: { before: string; em: string; after: string }
  lede: string
  free: { name: string; blurb: string; cta: string; items: string[] }
  premium: { name: string; per: string; blurb: string; cta: string; items: string[] }
  note: { before: string; link: string; after: string }
  sandbox: { kicker: string; title: string; body: string; cta: string; loading: string; error: string }
  faqKick: string
  faqTitle: string
  faqs: Array<{ q: string; a: string }>
  more: { before: string; faq: string; mid: string; after: string }
  close: { title: string; body: string; ctaPrimary: string; ctaGhost: string }
}

const copy: Record<Locale, Copy> = {
  id: {
    meta: {
      title: 'Harga — GeoFold',
      description:
        'Gratis untuk 3 proyek, selamanya. Premium sekali bayar untuk membuka batasnya — bukan langganan otomatis.',
    },
    eyebrow: 'Harga',
    h1: { before: 'Gratis dulu. ', em: 'Selamanya', after: ', kalau cukup.' },
    lede:
      'Tiga proyek tidak dipungut biaya dan tidak akan pernah dipungut. Premium hanya untuk tim yang sudah melewati batas itu.',
    free: {
      name: 'Gratis',
      blurb: 'Untuk proyek percontohan dan tim kecil.',
      cta: 'Mulai',
      items: [
        '3 proyek aktif (+1 setiap 24 jam)',
        '20 foto per proyek',
        'Batas harian pengambilan & unggah',
        'Pengambilan offline dengan sinkron otomatis',
        'Ekspor CSV & Excel (foto tertanam)',
        'Aplikasi Android dan versi web',
      ],
    },
    premium: {
      name: 'Premium',
      per: `/ ${PREMIUM_DAYS} hari`,
      blurb: 'Untuk tim yang aktif di lapangan.',
      cta: 'Ambil Premium',
      items: [
        'Semua fitur terbuka',
        'Proyek, survei dan foto tanpa batas jumlah',
        `Penyimpanan cloud ${PREMIUM_STORAGE_LABEL}`,
        'Tanpa batas harian',
        'Peta survei (satelit & jalan)',
        'Grid kuadrat untuk mengukur cakupan',
      ],
    },
    note: {
      before: 'Sekali bayar, bukan langganan. Baca ',
      link: 'Kebijakan Pengembalian Dana',
      after: ' sebelum membeli.',
    },
    sandbox: {
      kicker: 'Untuk verifikasi iPaymu',
      title: 'Uji halaman pembayaran sandbox',
      body: 'Buka checkout sandbox iPaymu tanpa akun GeoFold. Ini hanya untuk pengujian integrasi dan tidak mengaktifkan Premium.',
      cta: 'Buka checkout iPaymu sandbox',
      loading: 'Membuka checkout…',
      error: 'Checkout sandbox belum siap. Coba lagi nanti.',
    },
    faqKick: 'Pertanyaan',
    faqTitle: 'Yang biasanya ditanyakan.',
    faqs: [
      {
        q: 'Ini langganan bulanan?',
        a: `Bukan. Premium adalah pembelian sekali bayar untuk ${PREMIUM_DAYS} hari. Tidak ada penagihan berulang, tidak ada auto-debit, dan tidak ada yang perlu dibatalkan — masa aktifnya berakhir dengan sendirinya.`,
      },
      {
        q: `Apa yang dihitung terhadap penyimpanan ${PREMIUM_STORAGE_LABEL}?`,
        a: `Foto survei yang tersimpan di cloud. Jumlah proyek, survei dan foto tidak dibatasi — yang dibatasi adalah total ukurannya, ${PREMIUM_STORAGE_LABEL}. Kalau penuh, data lama tetap aman dan bisa diekspor; unggahan baru berhenti sampai Anda menghapus foto atau proyek yang tidak diperlukan.`,
      },
      {
        q: 'Apa yang terjadi kalau masa Premium habis?',
        a: 'Data Anda tidak pernah dihapus. Jika isi workspace melampaui batas Gratis saat itu, workspace dibekukan: semuanya tetap bisa dibaca, dilihat di peta, dan diekspor — hanya penambahan data baru yang berhenti sampai Anda memperpanjang atau kembali di bawah batas.',
      },
      {
        q: 'Bagaimana cara membayarnya?',
        a: 'Lewat gerbang pembayaran berizin di Indonesia — QRIS, transfer/virtual account, dompet digital, kartu, atau gerai ritel, sesuai yang tersedia di halaman pembayaran. GeoFold tidak pernah menerima atau menyimpan nomor kartu, CVV, PIN, atau OTP Anda.',
      },
      {
        q: 'Siapa pemilik data survei saya?',
        a: 'Anda. Ekspor atau hapus seluruh data proyek kapan saja, di paket apa pun.',
      },
      {
        q: 'Ada diskon untuk instansi atau lembaga penelitian?',
        a: 'Untuk pengadaan atau program pelatihan, kami menerbitkan kunci aktivasi yang bisa ditukarkan menjadi masa Premium tanpa pembayaran daring. Hubungi kami untuk membicarakannya.',
      },
    ],
    more: { before: 'Pertanyaan lain ada di ', faq: 'FAQ', mid: ', atau hubungi ', after: '.' },
    close: {
      title: 'Mulai dari yang gratis.',
      body: 'Naik ke Premium hanya kalau tim Anda benar-benar melewati batasnya.',
      ctaPrimary: 'Buat akun',
      ctaGhost: 'Tanya dulu',
    },
  },

  en: {
    meta: {
      title: 'Pricing — GeoFold',
      description:
        'Free for 3 projects, forever. Premium is a one-off payment that lifts the limits — not an auto-renewing subscription.',
    },
    eyebrow: 'Pricing',
    h1: { before: 'Free first. ', em: 'Forever', after: ', if that is enough.' },
    lede:
      'Three projects cost nothing and never will. Premium is only for teams that have already gone past that.',
    free: {
      name: 'Free',
      blurb: 'For pilot projects and small teams.',
      cta: 'Start',
      items: [
        '3 active projects (+1 every 24 hours)',
        '20 photos per project',
        'Daily capture & upload limits',
        'Offline capture with automatic sync',
        'CSV & Excel export (photos embedded)',
        'Android app and web version',
      ],
    },
    premium: {
      name: 'Premium',
      per: `/ ${PREMIUM_DAYS} days`,
      blurb: 'For teams working in the field.',
      cta: 'Get Premium',
      items: [
        'Every feature unlocked',
        'No limit on how many projects, surveys or photos',
        `${PREMIUM_STORAGE_LABEL} of cloud storage`,
        'No daily limits',
        'Survey map (satellite & street)',
        'Quadrat grid for measuring coverage',
      ],
    },
    note: {
      before: 'A one-off payment, not a subscription. Read the ',
      link: 'Refund Policy',
      after: ' before buying.',
    },
    sandbox: {
      kicker: 'For iPaymu verification',
      title: 'Test the sandbox payment page',
      body: 'Open iPaymu’s sandbox checkout without a GeoFold account. This only tests the integration and never activates Premium.',
      cta: 'Open iPaymu sandbox checkout',
      loading: 'Opening checkout…',
      error: 'The sandbox checkout is not ready yet. Please try again later.',
    },
    faqKick: 'Questions',
    faqTitle: 'What people usually ask.',
    faqs: [
      {
        q: 'Is this a monthly subscription?',
        a: `No. Premium is a one-off purchase for ${PREMIUM_DAYS} days. There is no recurring billing, no auto-debit and nothing to cancel — the period simply ends on its own.`,
      },
      {
        q: `What counts towards the ${PREMIUM_STORAGE_LABEL}?`,
        a: `Survey photos held in the cloud. There is no cap on how many projects, surveys or photos you create — the cap is on their combined size, ${PREMIUM_STORAGE_LABEL}. When it is full, everything already stored stays safe and exportable; new uploads stop until you delete photos or projects you no longer need.`,
      },
      {
        q: 'What happens when Premium runs out?',
        a: 'Your data is never deleted. If the workspace is over the Free limits at that point it is frozen: everything stays readable, viewable on the map and exportable — only adding new data stops, until you renew or come back under the limits.',
      },
      {
        q: 'How do I pay?',
        a: 'Through a licensed Indonesian payment gateway — QRIS, bank transfer / virtual account, e-wallet, card, or a retail outlet, whichever is offered on the payment page. GeoFold never receives or stores your card number, CVV, PIN or OTP.',
      },
      {
        q: 'Who owns my survey data?',
        a: 'You do. Export or delete all of a project’s data at any time, on any plan.',
      },
      {
        q: 'Is there a discount for government or research institutions?',
        a: 'For procurement or training programmes we issue activation keys that can be redeemed for a Premium period without an online payment. Get in touch to discuss it.',
      },
    ],
    more: { before: 'Other questions are in the ', faq: 'FAQ', mid: ', or contact ', after: '.' },
    close: {
      title: 'Start with the free plan.',
      body: 'Move to Premium only if your team genuinely outgrows it.',
      ctaPrimary: 'Create an account',
      ctaGhost: 'Ask a question',
    },
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const c = copy[await getLocale()]
  return { title: c.meta.title, description: c.meta.description }
}

export default async function PricingPage() {
  const c = copy[await getLocale()]
  const ipaymu = ipaymuConfig()
  const sandboxIpaymu = Boolean(ipaymu && !ipaymu.isProduction)

  return (
    <>
      <section className="mk-h">
        <span className="mk-h-eyebrow">{c.eyebrow}</span>
        <h1 className="mk-h-title">
          {c.h1.before}
          <em>{c.h1.em}</em>
          {c.h1.after}
        </h1>
        <p className="mk-h-lede">{c.lede}</p>
      </section>

      <section className="mk-sec">
        <div className="mk-price">
          <div className="mk-price-card">
            <div className="mk-price-name">{c.free.name}</div>
            <div className="mk-price-num">Rp 0</div>
            <p>{c.free.blurb}</p>
            <ul className="mk-plist">
              {c.free.items.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Link href="/login" className="mk-btn mk-btn-outline">
              {c.free.cta}
            </Link>
          </div>

          <div className="mk-price-card feat">
            <div className="mk-price-name">{c.premium.name}</div>
            <div className="mk-price-num">
              {PREMIUM_PRICE_LABEL}
              <small>{c.premium.per}</small>
            </div>
            <p>{c.premium.blurb}</p>
            <ul className="mk-plist on-dark">
              {c.premium.items.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Link href="/login" className="mk-btn mk-btn-primary">
              {c.premium.cta}
            </Link>
          </div>
        </div>

        <p className="mk-price-note">
          {c.note.before}
          <Link href="/refund-policy">{c.note.link}</Link>
          {c.note.after}
        </p>

        {sandboxIpaymu && (
          <aside className="mk-ipaymu-test" aria-labelledby="ipaymu-sandbox-title">
            <span className="mk-kick">{c.sandbox.kicker}</span>
            <h2 id="ipaymu-sandbox-title">{c.sandbox.title}</h2>
            <p>{c.sandbox.body}</p>
            <IpaymuSandboxButton
              label={c.sandbox.cta}
              loadingLabel={c.sandbox.loading}
              genericError={c.sandbox.error}
            />
          </aside>
        )}
      </section>

      <section className="mk-sec mk-sec-tint">
        <div className="mk-sec-head">
          <span className="mk-kick">{c.faqKick}</span>
          <h2>{c.faqTitle}</h2>
        </div>
        <div className="mk-qa">
          {c.faqs.map(({ q, a }) => (
            <div key={q}>
              <h3>{q}</h3>
              <p>{a}</p>
            </div>
          ))}
        </div>
        <p className="mk-price-note">
          {c.more.before}
          <Link href="/faq">{c.more.faq}</Link>
          {c.more.mid}
          <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>
          {c.more.after}
        </p>
      </section>

      <section className="mk-close">
        <h2>{c.close.title}</h2>
        <p>{c.close.body}</p>
        <div className="mk-h-cta">
          <Link href="/login" className="mk-btn mk-btn-primary">
            {c.close.ctaPrimary}
          </Link>
          <Link href="/contact" className="mk-btn mk-btn-ghost">
            {c.close.ctaGhost}
          </Link>
        </div>
      </section>
    </>
  )
}
