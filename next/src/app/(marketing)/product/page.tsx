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
import type { Locale } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'

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
 *
 * Translated 2026-09-10. This is the page that lists what the product does and does not do, so
 * the two languages have to say the same thing — including the paragraph admitting there is no
 * Shapefile export. A limitation that only appears in one language is not a disclosure.
 */

type Copy = {
  meta: { title: string; description: string }
  eyebrow: string
  h1: { before: string; em: string; after: string }
  lede: string
  flowKick: string
  flowTitle: string
  flowLede: string
  carouselLabel: string
  slides: Array<{ kicker: string; title: string; body: string }>
  recordKick: string
  recordTitle: string
  record: Array<{ t: string; b: string }>
  formKick: string
  formTitle: string
  formLede: string
  formNote: string
  exportKick: string
  exportTitle: string
  xlsx: string
  csv: string
  gap: { before: string; link: string; after: string }
  close: { title: string; body: string; ctaPrimary: string; ctaOutline: string }
}

const copy: Record<Locale, Copy> = {
  id: {
    meta: {
      title: 'Produk — GeoFold',
      description:
        'Apa yang GeoFold rekam pada setiap titik survei, bagaimana datanya bertahan tanpa sinyal, dan dalam bentuk apa Anda mengambilnya kembali.',
    },
    eyebrow: 'Produk',
    h1: { before: 'Apa yang ', em: 'sebenarnya', after: ' direkam.' },
    lede:
      'Bukan daftar fitur. Ini isi satu baris survei, dari mana angkanya datang, dan dalam bentuk apa Anda mengambilnya kembali.',
    flowKick: 'Alur kerja',
    flowTitle: 'Dari rana sampai spreadsheet.',
    flowLede: 'Geser untuk melihat setiap tahap.',
    carouselLabel: 'Alur kerja GeoFold',
    slides: [
      {
        kicker: 'Tangkap',
        title: 'Koordinat di dalam gambar',
        body: 'Posisi, akurasi dan waktu dicetak ke fotonya, bukan hanya disimpan di sebelahnya.',
      },
      {
        kicker: 'Antrean',
        title: 'Outbox yang sabar',
        body: 'Titik menunggu di perangkat sampai ada sinyal, lalu terkirim sendiri. Gagal satu tidak menjatuhkan sisanya.',
      },
      {
        kicker: 'Peta',
        title: 'Sebaran dan cakupan',
        body: 'Titik di atas peta satelit atau jalan, dengan grid kuadrat untuk mengukur blok yang sudah dilalui.',
      },
      {
        kicker: 'Ekspor',
        title: 'XLSX dan CSV',
        body: 'Excel dengan foto tertanam di barisnya, atau CSV mentah. Dibuat di perangkat Anda, tanpa layanan pihak ketiga.',
      },
      {
        kicker: 'Drone',
        title: 'Foto udara DJI',
        body: 'Versi drone memakai koordinat aircraft, lalu masuk ke antrean dan proyek yang sama.',
      },
    ],
    recordKick: 'Isi satu titik',
    recordTitle: 'Enam hal, setiap kali.',
    record: [
      {
        t: 'Koordinat',
        b: 'Titik WGS 84, disimpan sebagai geografi PostGIS — dan dicetak ke dalam fotonya.',
      },
      {
        t: 'Akurasi',
        b: 'Angka ±meter yang dilaporkan perangkat saat itu, disimpan apa adanya. Fix yang buruk tetap terlihat buruk.',
      },
      { t: 'Waktu pengambilan', b: 'Kapan tombol rana ditekan, bukan kapan datanya terkirim.' },
      {
        t: 'Waktu sinkron',
        b: 'Kapan titik itu sampai di server. Selisihnya adalah jejak kerja offline Anda.',
      },
      { t: 'Isian formulir', b: 'Nilai dari field yang Anda tentukan sendiri untuk proyek itu.' },
      {
        t: 'Foto',
        b: 'Satu foto per titik, di bucket privat, disajikan lewat tautan bertanda tangan berumur pendek.',
      },
    ],
    formKick: 'Formulir',
    formTitle: 'Field-nya Anda yang tentukan.',
    formLede:
      'Setiap proyek punya skema formulirnya sendiri. Buat field sebanyak yang diperlukan, beri label dalam bahasa tim Anda, dan tandai mana yang wajib diisi.',
    formNote:
      'Nilai isian tersimpan bersama titiknya dan ikut ke dalam ekspor sebagai kolom tersendiri.',
    exportKick: 'Ekspor',
    exportTitle: 'Dua format, tanpa kejutan.',
    xlsx:
      ' — satu baris per titik, dengan fotonya tertanam di baris itu. Dibuat langsung di perangkat Anda, jadi tidak ada data yang dikirim ke layanan lain untuk diubah formatnya.',
    csv:
      ' — teks biasa untuk diolah di QGIS, R, Python atau apa pun yang tim Anda pakai. Koordinat dalam desimal WGS 84.',
    gap: {
      before:
        'Belum ada ekspor Shapefile atau File Geodatabase, dan belum ada integrasi langsung ke ArcGIS. Kalau itu yang Anda butuhkan, ',
      link: 'beri tahu kami',
      after: ' — lebih berguna mendengarnya dari Anda daripada menebak.',
    },
    close: {
      title: 'Coba dengan data Anda sendiri.',
      body: 'Tiga proyek pertama gratis. Tidak perlu kartu kredit.',
      ctaPrimary: 'Mulai gratis',
      ctaOutline: 'Lihat harga',
    },
  },

  en: {
    meta: {
      title: 'Product — GeoFold',
      description:
        'What GeoFold records at every survey point, how the data survives with no signal, and what shape you get it back in.',
    },
    eyebrow: 'Product',
    h1: { before: 'What actually ', em: 'gets recorded', after: '.' },
    lede:
      'Not a feature list. This is what one survey row contains, where each figure comes from, and what shape you get it back in.',
    flowKick: 'Workflow',
    flowTitle: 'From shutter to spreadsheet.',
    flowLede: 'Swipe to see each stage.',
    carouselLabel: 'GeoFold workflow',
    slides: [
      {
        kicker: 'Capture',
        title: 'Coordinates inside the image',
        body: 'Position, accuracy and time are printed onto the photo, not just filed next to it.',
      },
      {
        kicker: 'Queue',
        title: 'A patient outbox',
        body: 'Points wait on the device until there is signal, then send themselves. One failure does not take the rest down with it.',
      },
      {
        kicker: 'Map',
        title: 'Spread and coverage',
        body: 'Points over a satellite or street map, with a quadrat grid for measuring which blocks have been walked.',
      },
      {
        kicker: 'Export',
        title: 'XLSX and CSV',
        body: 'Excel with the photo embedded in its row, or raw CSV. Built on your own device, with no third-party service involved.',
      },
      {
        kicker: 'Drone',
        title: 'DJI aerial photos',
        body: 'The drone build uses the aircraft coordinates, then joins the same queue and the same project.',
      },
    ],
    recordKick: 'Inside one point',
    recordTitle: 'Six things, every time.',
    record: [
      {
        t: 'Coordinates',
        b: 'A WGS 84 point, stored as PostGIS geography — and printed into the photo.',
      },
      {
        t: 'Accuracy',
        b: 'The ±metres figure the handset reported at the time, kept as-is. A bad fix still looks bad.',
      },
      { t: 'Capture time', b: 'When the shutter was pressed, not when the data was sent.' },
      {
        t: 'Sync time',
        b: 'When the point reached the server. The gap between the two is the record of your offline work.',
      },
      { t: 'Form values', b: 'The values of the fields you defined yourself for that project.' },
      {
        t: 'Photo',
        b: 'One photo per point, in a private bucket, served through short-lived signed links.',
      },
    ],
    formKick: 'Forms',
    formTitle: 'You define the fields.',
    formLede:
      'Every project has its own form schema. Create as many fields as you need, label them in your team’s own language, and mark which ones are required.',
    formNote:
      'Field values are stored with the point and travel into the export as columns of their own.',
    exportKick: 'Export',
    exportTitle: 'Two formats, no surprises.',
    xlsx:
      ' — one row per point, with its photo embedded in that row. Built directly on your device, so no data is sent to another service to be reformatted.',
    csv:
      ' — plain text for QGIS, R, Python or whatever your team uses. Coordinates in WGS 84 decimal degrees.',
    gap: {
      before:
        'There is no Shapefile or File Geodatabase export yet, and no direct ArcGIS integration. If that is what you need, ',
      link: 'tell us',
      after: ' — hearing it from you is more useful than guessing.',
    },
    close: {
      title: 'Try it with your own data.',
      body: 'The first three projects are free. No credit card needed.',
      ctaPrimary: 'Start free',
      ctaOutline: 'See pricing',
    },
  },
}

/** The five field types a project form can use — ProjectForm.tsx FIELD_TYPES. */
const fieldTypes = ['text', 'number', 'integer', 'date', 'boolean']

/* The phone schematics are language-independent drawings and stay in slide order. */
const screens = [
  <ScreenCapture key="capture" />,
  <ScreenRecords key="records" />,
  <ScreenMap key="map" />,
  <ScreenExport key="export" />,
  <ScreenDrone key="drone" />,
]

export async function generateMetadata(): Promise<Metadata> {
  const c = copy[await getLocale()]
  return { title: c.meta.title, description: c.meta.description }
}

export default async function ProductPage() {
  const c = copy[await getLocale()]

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

      <section className="mk-sec mk-sec-tint">
        <div className="mk-sec-head">
          <span className="mk-kick">{c.flowKick}</span>
          <h2>{c.flowTitle}</h2>
          <p>{c.flowLede}</p>
        </div>
        <Carousel label={c.carouselLabel}>
          {c.slides.map((s, i) => (
            <article className="mk-cap" key={s.title}>
              <PhoneMock>{screens[i]}</PhoneMock>
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
          <span className="mk-kick">{c.recordKick}</span>
          <h2>{c.recordTitle}</h2>
        </div>
        <div className="mk-recs">
          {c.record.map((r) => (
            <div className="mk-rec" key={r.t}>
              <div className="mk-rec-t">{r.t}</div>
              <div className="mk-rec-b">{r.b}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mk-sec mk-sec-tint">
        <div className="mk-sec-head">
          <span className="mk-kick">{c.formKick}</span>
          <h2>{c.formTitle}</h2>
          <p>{c.formLede}</p>
        </div>
        {/* The type names are identifiers from the code, not prose, so they are the same in both
            languages — a project form's `boolean` field is called boolean whichever way the site
            is being read. */}
        <ul className="mk-tags" style={{ marginBottom: 18 }}>
          {fieldTypes.map((t) => (
            <li key={t} style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 12.5 }}>
              {t}
            </li>
          ))}
        </ul>
        <p style={{ padding: '0 var(--mk-pad)', fontSize: 13.5, color: 'var(--mk-muted)', margin: 0 }}>
          {c.formNote}
        </p>
      </section>

      <section className="mk-sec mk-sec-dark">
        <div className="mk-sec-head">
          <span className="mk-kick on-dark">{c.exportKick}</span>
          <h2>{c.exportTitle}</h2>
        </div>
        <div className="mk-why">
          <p>
            <strong>.xlsx</strong>
            {c.xlsx}
          </p>
          <p>
            <strong>.csv</strong>
            {c.csv}
          </p>
          <p style={{ fontSize: 13.5, opacity: 0.85 }}>
            {c.gap.before}
            <Link href="/contact">{c.gap.link}</Link>
            {c.gap.after}
          </p>
        </div>
      </section>

      <section className="mk-close">
        <h2>{c.close.title}</h2>
        <p>{c.close.body}</p>
        <div className="mk-h-cta">
          <Link href="/login" className="mk-btn mk-btn-primary">
            {c.close.ctaPrimary}
          </Link>
          <Link href="/pricing" className="mk-btn mk-btn-outline">
            {c.close.ctaOutline}
          </Link>
        </div>
      </section>
    </>
  )
}
