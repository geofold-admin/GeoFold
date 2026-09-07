import type { Metadata } from 'next'
import Link from 'next/link'
import { Carousel } from '../Carousel'
import {
  PhoneMock,
  ScreenCapture,
  ScreenDrone,
  ScreenExport,
  ScreenMap,
  ScreenRecords,
} from '../PhoneMock'

export const metadata: Metadata = {
  title: 'Produk — GeoFold',
  description:
    'Apa yang GeoFold rekam pada setiap titik survei, bagaimana datanya bertahan tanpa sinyal, dan dalam bentuk apa Anda mengambilnya kembali.',
}

/*
 * Rewritten 2026-09-07 because the previous version was not true.
 *
 * It advertised sub-metre GPS accuracy, support for external GNSS receivers, team and device sync
 * status, a choice of coordinate system (WGS 84 / NAD83 / Web Mercator), and export to Shapefile
 * and File Geodatabase. None of that exists. The surveys table stores a PostGIS geography point
 * (WGS 84, always), AccuracyMeters as reported by the handset, a capture time, a sync time and a
 * jsonb blob of the project's own form fields; `lib/export.ts` writes CSV and XLSX and nothing
 * else; there is no team model, no device record and no CRS selection anywhere in the codebase.
 *
 * Everything below is checked against the schema and the exporter. If a capability is added later,
 * add it here then — not before.
 */

/** Exactly what one survey row carries. Straight from the surveys table. */
const record = [
  { t: 'Koordinat', b: 'Titik WGS 84, disimpan sebagai geografi PostGIS — dan dicetak ke dalam fotonya.' },
  { t: 'Akurasi', b: 'Angka ±meter yang dilaporkan perangkat saat itu, disimpan apa adanya. Fix yang buruk tetap terlihat buruk.' },
  { t: 'Waktu pengambilan', b: 'Kapan tombol rana ditekan, bukan kapan datanya terkirim.' },
  { t: 'Waktu sinkron', b: 'Kapan titik itu sampai di server. Selisihnya adalah jejak kerja offline Anda.' },
  { t: 'Isian formulir', b: 'Nilai dari field yang Anda tentukan sendiri untuk proyek itu.' },
  { t: 'Foto', b: 'Satu foto per titik, di bucket privat, disajikan lewat tautan bertanda tangan berumur pendek.' },
]

/** The five field types a project form can use — ProjectForm.tsx FIELD_TYPES. */
const fieldTypes = ['text', 'number', 'integer', 'date', 'boolean']

const slides = [
  { kicker: 'Tangkap', title: 'Koordinat di dalam gambar', body: 'Posisi, akurasi dan waktu dicetak ke fotonya, bukan hanya disimpan di sebelahnya.', screen: <ScreenCapture /> },
  { kicker: 'Antrean', title: 'Outbox yang sabar', body: 'Titik menunggu di perangkat sampai ada sinyal, lalu terkirim sendiri. Gagal satu tidak menjatuhkan sisanya.', screen: <ScreenRecords /> },
  { kicker: 'Peta', title: 'Sebaran dan cakupan', body: 'Titik di atas peta satelit atau jalan, dengan grid kuadrat untuk mengukur blok yang sudah dilalui.', screen: <ScreenMap /> },
  { kicker: 'Ekspor', title: 'XLSX dan CSV', body: 'Excel dengan foto tertanam di barisnya, atau CSV mentah. Dibuat di perangkat Anda, tanpa layanan pihak ketiga.', screen: <ScreenExport /> },
  { kicker: 'Drone', title: 'Foto udara DJI', body: 'Versi drone memakai koordinat aircraft, lalu masuk ke antrean dan proyek yang sama.', screen: <ScreenDrone /> },
]

export default function ProductPage() {
  return (
    <>
      <section className="mk-h">
        <span className="mk-h-eyebrow">Produk</span>
        <h1 className="mk-h-title">
          Apa yang <em>sebenarnya</em> direkam.
        </h1>
        <p className="mk-h-lede">
          Bukan daftar fitur. Ini isi satu baris survei, dari mana angkanya datang, dan dalam bentuk
          apa Anda mengambilnya kembali.
        </p>
      </section>

      <section className="mk-sec mk-sec-tint">
        <div className="mk-sec-head">
          <span className="mk-kick">Alur kerja</span>
          <h2>Dari rana sampai spreadsheet.</h2>
          <p>Geser untuk melihat setiap tahap.</p>
        </div>
        <Carousel label="Alur kerja GeoFold">
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

      <section className="mk-sec">
        <div className="mk-sec-head">
          <span className="mk-kick">Isi satu titik</span>
          <h2>Enam hal, setiap kali.</h2>
        </div>
        <div className="mk-recs">
          {record.map((r) => (
            <div className="mk-rec" key={r.t}>
              <div className="mk-rec-t">{r.t}</div>
              <div className="mk-rec-b">{r.b}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mk-sec mk-sec-tint">
        <div className="mk-sec-head">
          <span className="mk-kick">Formulir</span>
          <h2>Field-nya Anda yang tentukan.</h2>
          <p>
            Setiap proyek punya skema formulirnya sendiri. Buat field sebanyak yang diperlukan, beri
            label dalam bahasa tim Anda, dan tandai mana yang wajib diisi.
          </p>
        </div>
        <ul className="mk-tags" style={{ marginBottom: 18 }}>
          {fieldTypes.map((t) => (
            <li key={t} style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 12.5 }}>
              {t}
            </li>
          ))}
        </ul>
        <p style={{ padding: '0 var(--mk-pad)', fontSize: 13.5, color: 'var(--mk-muted)', margin: 0 }}>
          Nilai isian tersimpan bersama titiknya dan ikut ke dalam ekspor sebagai kolom tersendiri.
        </p>
      </section>

      <section className="mk-sec mk-sec-dark">
        <div className="mk-sec-head">
          <span className="mk-kick on-dark">Ekspor</span>
          <h2>Dua format, tanpa kejutan.</h2>
        </div>
        <div className="mk-why">
          <p>
            <strong>.xlsx</strong> — satu baris per titik, dengan fotonya tertanam di baris itu.
            Dibuat langsung di perangkat Anda, jadi tidak ada data yang dikirim ke layanan lain untuk
            diubah formatnya.
          </p>
          <p>
            <strong>.csv</strong> — teks biasa untuk diolah di QGIS, R, Python atau apa pun yang tim
            Anda pakai. Koordinat dalam desimal WGS 84.
          </p>
          <p style={{ fontSize: 13.5, opacity: 0.85 }}>
            Belum ada ekspor Shapefile atau File Geodatabase, dan belum ada integrasi langsung ke
            ArcGIS. Kalau itu yang Anda butuhkan, <Link href="/contact">beri tahu kami</Link> — lebih
            berguna mendengarnya dari Anda daripada menebak.
          </p>
        </div>
      </section>

      <section className="mk-close">
        <h2>Coba dengan data Anda sendiri.</h2>
        <p>Tiga proyek pertama gratis. Tidak perlu kartu kredit.</p>
        <div className="mk-h-cta">
          <Link href="/login" className="mk-btn mk-btn-primary">
            Mulai gratis
          </Link>
          <Link href="/pricing" className="mk-btn mk-btn-outline">
            Lihat harga
          </Link>
        </div>
      </section>
    </>
  )
}
