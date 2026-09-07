import type { Metadata } from 'next'
import Link from 'next/link'
import { BUSINESS, OPERATOR } from '@/lib/business'

export const metadata: Metadata = {
  title: 'Tentang — GeoFold',
  description:
    'Kenapa GeoFold dibuat: foto lapangan yang kehilangan lokasinya begitu dikirim ulang, dan catatan yang tidak bisa dipertanggungjawabkan enam bulan kemudian.',
}

/*
 * Rewritten 2026-09-07. The previous version claimed ArcGIS-shaped exports with "correct CRS", and
 * a "team-synced" view of every surveyor's device and sync status. There is no ArcGIS export, no
 * CRS selection, and no team model at all — each account's data is isolated from every other, and
 * no device information is recorded anywhere. See the note in product/page.tsx.
 */

const pillars = [
  {
    t: 'Offline lebih dulu',
    b: 'Dirancang untuk hari penuh di luar jangkauan sinyal. Titik disimpan di perangkat dan menunggu; tidak ada yang perlu diingat untuk dikirim manual.',
  },
  {
    t: 'Bukti, bukan sekadar foto',
    b: 'Koordinat, akurasi dan waktu dicetak ke dalam gambarnya dan disimpan di basis data. Keduanya ikut ke mana pun fotonya pergi.',
  },
  {
    t: 'Datanya tetap milik Anda',
    b: 'Ekspor lengkap ke Excel atau CSV kapan saja, di paket apa pun, termasuk yang gratis. Tidak ada yang mengunci data Anda di dalam.',
  },
]

export default function AboutPage() {
  return (
    <>
      <section className="mk-h">
        <span className="mk-h-eyebrow">Tentang</span>
        <h1 className="mk-h-title">
          Dibuat untuk yang <em>benar-benar</em> ke lapangan.
        </h1>
        <p className="mk-h-lede">
          GeoFold lahir dari satu masalah kecil yang mahal: foto survei yang, enam bulan kemudian,
          tidak bisa dibuktikan diambil di mana.
        </p>
      </section>

      <section className="mk-sec">
        <div className="mk-why" style={{ maxWidth: '68ch' }}>
          <p style={{ color: 'var(--mk-prose)' }}>
            Tim survei lapangan biasanya memakai tiga alat sekaligus: kamera ponsel untuk foto,
            aplikasi GPS terpisah untuk koordinat, dan spreadsheet untuk menyatukan keduanya. Selama
            semuanya masih segar, itu terasa cukup.
          </p>
          <p style={{ color: 'var(--mk-prose)' }}>
            Masalahnya muncul belakangan. Foto dikirim lewat WhatsApp dan metadata lokasinya hilang.
            Berkas disalin ulang, nama filenya berubah, urutannya tertukar. Saat laporan harus
            dipertanggungjawabkan, tidak ada yang bisa memastikan foto mana diambil di titik mana.
          </p>
          <p style={{ color: 'var(--mk-prose)' }}>
            GeoFold menuliskan koordinat, akurasi dan waktu <strong>ke dalam gambarnya</strong>, lalu
            menyimpan angka yang sama di basis data bersama isian formulir yang Anda tentukan
            sendiri. Satu aplikasi, satu antrean, satu ekspor — dan bukti yang bertahan setelah
            fotonya berpindah tangan.
          </p>
        </div>
      </section>

      <section className="mk-sec mk-sec-tint">
        <div className="mk-sec-head">
          <span className="mk-kick">Prinsipnya</span>
          <h2>Tiga hal yang tidak kami kompromikan.</h2>
        </div>
        <div className="mk-recs">
          {pillars.map((p) => (
            <div className="mk-rec" key={p.t}>
              <div className="mk-rec-t">{p.t}</div>
              <div className="mk-rec-b">{p.b}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mk-sec">
        <div className="mk-sec-head">
          <span className="mk-kick">Siapa di baliknya</span>
          <h2>{OPERATOR}</h2>
          <p>
            GeoFold dikembangkan dan dioperasikan dari Pontianak, Kalimantan Barat. Alamat lengkap,
            nomor telepon dan jam operasional ada di <Link href="/contact">halaman kontak</Link>.
          </p>
        </div>
        <p style={{ padding: '0 var(--mk-pad)', fontSize: 14, color: 'var(--mk-muted)', margin: 0 }}>
          Ada pertanyaan, permintaan fitur, atau kebutuhan pengadaan instansi? Kirim email ke{' '}
          <a
            href={`mailto:${BUSINESS.email.general}`}
            style={{ color: 'var(--mk-green)', textDecoration: 'underline' }}>
            {BUSINESS.email.general}
          </a>
          . Masukan dari tim yang benar-benar memakainya di lapangan adalah yang paling menentukan
          apa yang dikerjakan berikutnya.
        </p>
      </section>

      <section className="mk-close">
        <h2>Coba dulu, gratis.</h2>
        <p>Tiga proyek pertama tidak dipungut biaya.</p>
        <div className="mk-h-cta">
          <Link href="/login" className="mk-btn mk-btn-primary">
            Buat akun
          </Link>
          <Link href="/product" className="mk-btn mk-btn-outline">
            Lihat produknya
          </Link>
        </div>
      </section>
    </>
  )
}
