import type { Metadata } from 'next'
import Link from 'next/link'
import { Carousel } from './Carousel'
import {
  PhoneMock,
  ScreenCapture,
  ScreenDrone,
  ScreenExport,
  ScreenMap,
  ScreenRecords,
} from './PhoneMock'
import { PREMIUM_DAYS, PREMIUM_PRICE_LABEL } from '@/lib/pricing'

export const metadata: Metadata = {
  title: 'GeoFold — Survei lapangan yang tidak hilang',
  description:
    'Foto ber-koordinat, bekerja penuh offline, sinkron sendiri saat ada sinyal. Ekspor ke Excel dan CSV. Gratis untuk 3 proyek.',
}

/*
 * Every claim on this page is one the app actually does today.
 *
 * The previous version advertised Shapefile and File Geodatabase export, one-click ArcGIS sync and
 * "sub-meter accuracy". None of those exist: `lib/export.ts` writes CSV and XLSX, and a phone GPS
 * reports metres. That copy was live on a site a payment gateway was verifying, which is a bad
 * place to overstate a product. If a capability is added later, add it here — not before.
 */

const slides = [
  {
    kicker: 'Tangkap',
    title: 'Koordinat tercetak di fotonya',
    body: 'Bukan metadata yang bisa hilang saat file dikirim ulang — posisi, akurasi dan waktu tertulis pada gambar itu sendiri.',
    screen: <ScreenCapture />,
  },
  {
    kicker: 'Offline',
    title: 'Sinyal habis, kerja jalan terus',
    body: 'Titik tersimpan di perangkat dan terkirim sendiri begitu ada sinyal. Tidak ada yang perlu diingat, tidak ada yang hilang.',
    screen: <ScreenRecords />,
  },
  {
    kicker: 'Peta',
    title: 'Lihat sebaran, bukan daftar',
    body: 'Semua titik di atas peta satelit atau jalan, dengan grid kuadrat untuk mengukur cakupan blok yang sedang disurvei.',
    screen: <ScreenMap />,
  },
  {
    kicker: 'Ekspor',
    title: 'Excel yang fotonya ikut',
    body: 'Satu berkas .xlsx dengan foto tertanam di barisnya, atau .csv untuk diolah lebih lanjut. Tanpa aplikasi tambahan.',
    screen: <ScreenExport />,
  },
  {
    kicker: 'Drone',
    title: 'Foto udara, antrean yang sama',
    body: 'Versi DJI mengambil foto dari pesawat dengan koordinat aircraft, lalu masuk ke proyek yang sama seperti survei jalan kaki.',
    screen: <ScreenDrone />,
  },
]

const facts = [
  { k: 'Offline', v: 'Penuh' },
  { k: 'Akurasi', v: 'Tercatat ±m' },
  { k: 'Ekspor', v: 'XLSX · CSV' },
  { k: 'Mulai', v: 'Rp 0' },
]

const steps = [
  {
    n: '01',
    t: 'Buat proyek',
    b: 'Tentukan sendiri isian formulirnya — spesies, kondisi, catatan, apa pun yang tim Anda catat.',
  },
  {
    n: '02',
    t: 'Ambil titik',
    b: 'Foto, koordinat dan akurasi tersimpan bersama. Berfungsi tanpa sinyal sama sekali.',
  },
  {
    n: '03',
    t: 'Tarik laporannya',
    b: 'Ekspor Excel atau CSV kapan saja, dari ponsel atau dari peramban. Data tetap milik Anda.',
  },
]

const audience = [
  'Konservasi satwa liar',
  'Kehutanan & perkebunan',
  'Konsultan lingkungan',
  'Pemetaan aset',
  'Penelitian lapangan',
  'Instansi & LSM',
]

export default function HomePage() {
  return (
    <>
      {/* ---------- hero ---------- */}
      <section className="mk-h">
        <span className="mk-h-eyebrow">Survei lapangan · Android &amp; web</span>
        <h1 className="mk-h-title">
          Titik survei yang <em>tidak hilang</em>.
        </h1>
        <p className="mk-h-lede">
          Foto dengan koordinat tercetak di gambarnya. Bekerja penuh tanpa sinyal, lalu menyinkronkan
          dirinya sendiri. Dipakai tim lapangan yang catatannya harus bisa dipertanggungjawabkan.
        </p>
        <div className="mk-h-cta">
          <Link href="/login" className="mk-btn mk-btn-primary">
            Mulai gratis
          </Link>
          <Link href="/download" className="mk-btn mk-btn-outline">
            Unduh aplikasi
          </Link>
        </div>

        <dl className="mk-facts">
          {facts.map((f) => (
            <div key={f.k}>
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------- what it does, as a carousel ---------- */}
      <section className="mk-sec mk-sec-tint">
        <div className="mk-sec-head">
          <span className="mk-kick">Apa yang bisa dilakukan</span>
          <h2>Lima hal, dikerjakan dengan benar.</h2>
          <p>Geser untuk melihat semuanya.</p>
        </div>

        <Carousel label="Kemampuan GeoFold">
          {slides.map((s) => (
            <article className="mk-cap" key={s.title}>
              <PhoneMock>{s.screen}</PhoneMock>
              <div className="mk-cap-copy">
                <span className="mk-cap-kick">{s.kicker}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </article>
          ))}
        </Carousel>
      </section>

      {/* ---------- how ---------- */}
      <section className="mk-sec">
        <div className="mk-sec-head">
          <span className="mk-kick">Cara kerjanya</span>
          <h2>Tiga langkah, selesai.</h2>
        </div>
        <ol className="mk-steps2">
          {steps.map((s) => (
            <li key={s.n}>
              <span className="mk-steps2-n">{s.n}</span>
              <div>
                <h3>{s.t}</h3>
                <p>{s.b}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- the honest bit ---------- */}
      <section className="mk-sec mk-sec-dark">
        <div className="mk-sec-head">
          <span className="mk-kick on-dark">Kenapa ini penting</span>
          <h2>Foto tanpa koordinat bukan bukti.</h2>
        </div>
        <div className="mk-why">
          <p>
            Foto lapangan biasa menyimpan lokasi di metadata — yang hilang begitu gambar dikirim
            lewat WhatsApp, disalin ulang, atau diedit sedikit saja. Enam bulan kemudian, tidak ada
            yang bisa membuktikan foto itu diambil di mana.
          </p>
          <p>
            GeoFold menuliskan koordinat, akurasi dan waktu <strong>ke dalam gambarnya</strong>, dan
            menyimpan angka yang sama di basis data. Keduanya ikut ke mana pun fotonya pergi.
          </p>
        </div>
      </section>

      {/* ---------- who ---------- */}
      <section className="mk-sec">
        <div className="mk-sec-head">
          <span className="mk-kick">Untuk siapa</span>
          <h2>Tim yang bekerja di luar jangkauan sinyal.</h2>
        </div>
        <ul className="mk-tags">
          {audience.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>

      {/* ---------- price ---------- */}
      <section className="mk-sec mk-sec-tint">
        <div className="mk-price">
          <div className="mk-price-card">
            <div className="mk-price-name">Gratis</div>
            <div className="mk-price-num">Rp 0</div>
            <p>3 proyek, 20 foto per proyek, batas harian. Selamanya.</p>
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
            <p>Tanpa batas proyek, foto dan survei. Peta survei terbuka. Sekali bayar.</p>
            <Link href="/pricing" className="mk-btn mk-btn-primary">
              Lihat detail
            </Link>
          </div>
        </div>
        <p className="mk-price-note">
          Sekali bayar, bukan langganan otomatis. Tidak ada auto-debit dan tidak ada yang perlu
          dibatalkan. <Link href="/refund-policy">Kebijakan pengembalian dana</Link>.
        </p>
      </section>

      {/* ---------- closer ---------- */}
      <section className="mk-close">
        <h2>Coba dulu, gratis.</h2>
        <p>Tidak perlu kartu kredit. Tiga proyek pertama tidak dipungut biaya.</p>
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
