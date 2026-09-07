import type { Metadata } from 'next'
import Link from 'next/link'
import { PREMIUM_DAYS, PREMIUM_PRICE_LABEL } from '@/lib/pricing'
import { BUSINESS } from '@/lib/business'

export const metadata: Metadata = {
  title: 'Harga — GeoFold',
  description:
    'Gratis untuk 3 proyek, selamanya. Premium sekali bayar untuk membuka batasnya — bukan langganan otomatis.',
}

/*
 * Rewritten 2026-09-07. The previous version sold an "Enterprise" tier offering SSO, role-based
 * access and direct ArcGIS Online integration. None of those exist — there is no team model, no
 * roles beyond the one that lifts quota limits, and no ArcGIS integration of any kind. Selling a
 * tier built entirely from unbuilt features is worse than having no third tier.
 *
 * The two plans below are the two the code actually implements, and the limits are the ones
 * lib/quota.ts enforces.
 */

const free = [
  '3 proyek aktif (+1 setiap 24 jam)',
  '20 foto per proyek',
  'Batas harian pengambilan & unggah',
  'Pengambilan offline dengan sinkron otomatis',
  'Ekspor CSV & Excel (foto tertanam)',
  'Aplikasi Android dan versi web',
]

const premium = [
  'Proyek, survei dan foto tanpa batas',
  'Tanpa batas harian',
  'Peta survei (satelit & jalan)',
  'Grid kuadrat untuk mengukur cakupan',
  'Semua yang ada di paket Gratis',
]

const faqs = [
  {
    q: 'Ini langganan bulanan?',
    a: `Bukan. Premium adalah pembelian sekali bayar untuk ${PREMIUM_DAYS} hari. Tidak ada penagihan berulang, tidak ada auto-debit, dan tidak ada yang perlu dibatalkan — masa aktifnya berakhir dengan sendirinya.`,
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
]

export default function PricingPage() {
  return (
    <>
      <section className="mk-h">
        <span className="mk-h-eyebrow">Harga</span>
        <h1 className="mk-h-title">
          Gratis dulu. <em>Selamanya</em>, kalau cukup.
        </h1>
        <p className="mk-h-lede">
          Tiga proyek tidak dipungut biaya dan tidak akan pernah dipungut. Premium hanya untuk tim
          yang sudah melewati batas itu.
        </p>
      </section>

      <section className="mk-sec">
        <div className="mk-price">
          <div className="mk-price-card">
            <div className="mk-price-name">Gratis</div>
            <div className="mk-price-num">Rp 0</div>
            <p>Untuk proyek percontohan dan tim kecil.</p>
            <ul className="mk-plist">
              {free.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Link href="/login" className="mk-btn mk-btn-outline">
              Mulai
            </Link>
          </div>

          <div className="mk-price-card feat">
            <div className="mk-price-name">Premium</div>
            <div className="mk-price-num">
              {PREMIUM_PRICE_LABEL}
              <small>/ {PREMIUM_DAYS} hari</small>
            </div>
            <p>Untuk tim yang aktif di lapangan.</p>
            <ul className="mk-plist on-dark">
              {premium.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Link href="/login" className="mk-btn mk-btn-primary">
              Ambil Premium
            </Link>
          </div>
        </div>

        <p className="mk-price-note">
          Sekali bayar, bukan langganan. Baca{' '}
          <Link href="/refund-policy">Kebijakan Pengembalian Dana</Link> sebelum membeli.
        </p>
      </section>

      <section className="mk-sec mk-sec-tint">
        <div className="mk-sec-head">
          <span className="mk-kick">Pertanyaan</span>
          <h2>Yang biasanya ditanyakan.</h2>
        </div>
        <div className="mk-qa">
          {faqs.map(({ q, a }) => (
            <div key={q}>
              <h3>{q}</h3>
              <p>{a}</p>
            </div>
          ))}
        </div>
        <p className="mk-price-note">
          Pertanyaan lain ada di <Link href="/faq">FAQ</Link>, atau hubungi{' '}
          <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>.
        </p>
      </section>

      <section className="mk-close">
        <h2>Mulai dari yang gratis.</h2>
        <p>Naik ke Premium hanya kalau tim Anda benar-benar melewati batasnya.</p>
        <div className="mk-h-cta">
          <Link href="/login" className="mk-btn mk-btn-primary">
            Buat akun
          </Link>
          <Link href="/contact" className="mk-btn mk-btn-ghost">
            Tanya dulu
          </Link>
        </div>
      </section>
    </>
  )
}
