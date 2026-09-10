import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { FigAerial, FigCapture, FigExport, FigMap, FigOffline } from './Figures'
import { Motion } from './Motion'
import type { Locale } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'
import { PREMIUM_DAYS, PREMIUM_PRICE_LABEL } from '@/lib/pricing'

/*
 * Every claim on this page is one the app actually does today.
 *
 * An earlier version advertised Shapefile and File Geodatabase export, one-click ArcGIS sync and
 * "sub-meter accuracy". None of those exist: `lib/export.ts` writes CSV and XLSX, and a phone GPS
 * reports metres. That copy was live on a site a payment gateway was verifying, which is a bad
 * place to overstate a product. If a capability is added later, add it here — not before.
 *
 * The same rule covers the counters in the hero: 3 projects, 20 photos per project and 2 export
 * formats are the actual free-plan limits and the actual writers in lib/export.ts. A number that
 * animates draws the eye straight to it, so it had better survive being checked.
 *
 * AND IT COVERS BOTH LANGUAGES. The English column below is a translation of the Indonesian, not
 * a second draft with its own ideas: if one side ever promises something the other does not, the
 * page is making a claim that depends on who is reading it.
 */

type Copy = {
  meta: { title: string; description: string }
  eyebrow: string
  h1: string
  lede: string
  ctaStart: string
  ctaDownload: string
  stats: Array<{ label: string; unit: string }>
  capsMicro: string
  capsTitle: string
  caps: Array<{ kicker: string; title: string; body: string }>
  stepsMicro: string
  stepsTitle: string
  stepsLede: string
  steps: Array<{ t: string; b: string }>
  whyMicro: string
  whyTitle: string
  why1: string
  why2: { before: string; strong: string; after: string }
  priceMicro: string
  priceTitle: string
  free: { name: string; body: string; cta: string }
  premium: { name: string; per: string; body: string; cta: string }
  priceNote: { text: string; link: string }
  close: { title: string; body: string; ctaPrimary: string; ctaGhost: string }
  audience: string[]
}

const copy: Record<Locale, Copy> = {
  id: {
    meta: {
      title: 'GeoFold — Survei lapangan yang tidak hilang',
      description:
        'Foto ber-koordinat, bekerja penuh offline, sinkron sendiri saat ada sinyal. Ekspor ke Excel dan CSV. Gratis untuk 3 proyek.',
    },
    eyebrow: 'Survei lapangan · Android & web',
    h1: 'Titik survei yang tidak hilang.',
    lede:
      'Foto dengan koordinat tercetak di gambarnya. Bekerja penuh tanpa sinyal, lalu menyinkronkan dirinya sendiri. Dipakai tim lapangan yang catatannya harus bisa dipertanggungjawabkan.',
    ctaStart: 'Mulai gratis',
    ctaDownload: 'Unduh aplikasi',
    stats: [
      { label: 'Proyek gratis', unit: 'selamanya' },
      { label: 'Foto per proyek', unit: 'paket gratis' },
      { label: 'Format ekspor', unit: 'XLSX · CSV' },
      { label: 'Biaya mulai', unit: 'tanpa kartu' },
    ],
    capsMicro: 'Apa yang bisa dilakukan',
    capsTitle: 'Lima hal, dikerjakan dengan benar.',
    caps: [
      {
        kicker: 'Tangkap',
        title: 'Koordinat tercetak di fotonya',
        body: 'Bukan metadata yang bisa hilang saat file dikirim ulang — posisi, akurasi dan waktu tertulis pada gambar itu sendiri.',
      },
      {
        kicker: 'Offline',
        title: 'Sinyal habis, kerja jalan terus',
        body: 'Titik tersimpan di perangkat dan terkirim sendiri begitu ada sinyal. Tidak ada yang perlu diingat, tidak ada yang hilang.',
      },
      {
        kicker: 'Peta',
        title: 'Lihat sebaran, bukan daftar',
        body: 'Semua titik di atas peta satelit atau jalan, dengan grid kuadrat untuk mengukur cakupan blok yang sedang disurvei.',
      },
      {
        kicker: 'Ekspor',
        title: 'Excel yang fotonya ikut',
        body: 'Satu berkas .xlsx dengan foto tertanam di barisnya, atau .csv untuk diolah lebih lanjut. Tanpa aplikasi tambahan.',
      },
      {
        kicker: 'Drone',
        title: 'Foto udara, antrean yang sama',
        body: 'Versi DJI mengambil foto dari pesawat dengan koordinat aircraft, lalu masuk ke proyek yang sama seperti survei jalan kaki.',
      },
    ],
    stepsMicro: 'Cara kerjanya',
    stepsTitle: 'Tiga langkah, selesai.',
    stepsLede:
      'Dari proyek kosong sampai laporan yang bisa dikirim, tanpa langkah tambahan di antaranya.',
    steps: [
      {
        t: 'Buat proyek',
        b: 'Tentukan sendiri isian formulirnya — spesies, kondisi, catatan, apa pun yang tim Anda catat.',
      },
      {
        t: 'Ambil titik',
        b: 'Foto, koordinat dan akurasi tersimpan bersama. Berfungsi tanpa sinyal sama sekali.',
      },
      {
        t: 'Tarik laporannya',
        b: 'Ekspor Excel atau CSV kapan saja, dari ponsel atau dari peramban. Data tetap milik Anda.',
      },
    ],
    whyMicro: 'Kenapa ini penting',
    whyTitle: 'Foto tanpa koordinat bukan bukti.',
    why1:
      'Foto lapangan biasa menyimpan lokasi di metadata — yang hilang begitu gambar dikirim lewat WhatsApp, disalin ulang, atau diedit sedikit saja. Enam bulan kemudian, tidak ada yang bisa membuktikan foto itu diambil di mana.',
    why2: {
      before: 'GeoFold menuliskan koordinat, akurasi dan waktu ',
      strong: 'ke dalam gambarnya',
      after:
        ', dan menyimpan angka yang sama di basis data. Keduanya ikut ke mana pun fotonya pergi.',
    },
    priceMicro: 'Harga',
    priceTitle: 'Gratis dulu. Bayar kalau memang perlu.',
    free: {
      name: 'Gratis',
      body: '3 proyek, 20 foto per proyek, batas harian. Selamanya.',
      cta: 'Mulai',
    },
    premium: {
      name: 'Premium',
      per: `/ ${PREMIUM_DAYS} hari`,
      body: 'Tanpa batas proyek, foto dan survei. Peta survei terbuka. Sekali bayar.',
      cta: 'Lihat detail',
    },
    priceNote: {
      text:
        'Sekali bayar, bukan langganan otomatis. Tidak ada auto-debit dan tidak ada yang perlu dibatalkan.',
      link: 'Kebijakan pengembalian dana',
    },
    close: {
      title: 'Coba dulu, gratis.',
      body: 'Tidak perlu kartu kredit. Tiga proyek pertama tidak dipungut biaya.',
      ctaPrimary: 'Buat akun',
      ctaGhost: 'Tanya dulu',
    },
    audience: [
      'Konservasi satwa liar',
      'Kehutanan & perkebunan',
      'Konsultan lingkungan',
      'Pemetaan aset',
      'Penelitian lapangan',
      'Instansi & LSM',
      'Reklamasi tambang',
      'Survei topografi',
    ],
  },

  en: {
    meta: {
      title: 'GeoFold — Field surveys that do not go missing',
      description:
        'Geo-tagged photos, fully offline capture, syncing itself the moment there is a signal. Exports to Excel and CSV. Free for 3 projects.',
    },
    eyebrow: 'Field survey · Android & web',
    h1: 'Survey points that do not go missing.',
    lede:
      'Photos with the coordinates printed into the image itself. Works completely offline, then syncs itself. Built for field teams whose records have to hold up.',
    ctaStart: 'Start free',
    ctaDownload: 'Download the app',
    stats: [
      { label: 'Free projects', unit: 'forever' },
      { label: 'Photos per project', unit: 'free plan' },
      { label: 'Export formats', unit: 'XLSX · CSV' },
      { label: 'Cost to start', unit: 'no card' },
    ],
    capsMicro: 'What it does',
    capsTitle: 'Five things, done properly.',
    caps: [
      {
        kicker: 'Capture',
        title: 'Coordinates printed into the photo',
        body: 'Not metadata that disappears when the file is forwarded — position, accuracy and time are written onto the image itself.',
      },
      {
        kicker: 'Offline',
        title: 'No signal, work carries on',
        body: 'Points are stored on the device and sent by themselves the moment there is a signal. Nothing to remember, nothing lost.',
      },
      {
        kicker: 'Map',
        title: 'See the spread, not a list',
        body: 'Every point on a satellite or street map, with a quadrat grid for measuring how much of a block has been covered.',
      },
      {
        kicker: 'Export',
        title: 'Excel with the photos still in it',
        body: 'One .xlsx file with the photo embedded in its row, or .csv for further processing. No extra software.',
      },
      {
        kicker: 'Drone',
        title: 'Aerial photos, the same queue',
        body: 'The DJI build takes photos from the aircraft with the aircraft coordinates, then files them into the same project as a walked survey.',
      },
    ],
    stepsMicro: 'How it works',
    stepsTitle: 'Three steps, done.',
    stepsLede: 'From an empty project to a report you can send, with nothing extra in between.',
    steps: [
      {
        t: 'Create a project',
        b: 'Define the form fields yourself — species, condition, notes, whatever your team records.',
      },
      {
        t: 'Take a point',
        b: 'Photo, coordinates and accuracy are saved together. Works with no signal at all.',
      },
      {
        t: 'Pull the report',
        b: 'Export Excel or CSV any time, from the phone or from the browser. The data stays yours.',
      },
    ],
    whyMicro: 'Why this matters',
    whyTitle: 'A photo without coordinates is not evidence.',
    why1:
      'An ordinary field photo keeps its location in metadata — which is gone the moment the image goes through WhatsApp, gets copied again, or is edited even slightly. Six months later, nobody can prove where it was taken.',
    why2: {
      before: 'GeoFold writes the coordinates, accuracy and time ',
      strong: 'into the image',
      after:
        ', and stores the same figures in the database. Both travel wherever the photo goes.',
    },
    priceMicro: 'Pricing',
    priceTitle: 'Free first. Pay only if you need to.',
    free: {
      name: 'Free',
      body: '3 projects, 20 photos per project, daily limits. Forever.',
      cta: 'Start',
    },
    premium: {
      name: 'Premium',
      per: `/ ${PREMIUM_DAYS} days`,
      body: 'No limit on projects, photos or surveys. Survey map unlocked. One payment.',
      cta: 'See details',
    },
    priceNote: {
      text:
        'A one-off payment, not an auto-renewing subscription. No auto-debit and nothing to cancel.',
      link: 'Refund policy',
    },
    close: {
      title: 'Try it first, free.',
      body: 'No credit card needed. The first three projects cost nothing.',
      ctaPrimary: 'Create an account',
      ctaGhost: 'Ask a question',
    },
    audience: [
      'Wildlife conservation',
      'Forestry & plantations',
      'Environmental consultants',
      'Asset mapping',
      'Field research',
      'Government & NGOs',
      'Mine reclamation',
      'Topographic survey',
    ],
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const c = copy[await getLocale()]
  return { title: c.meta.title, description: c.meta.description }
}

/* Counter values are language-independent — there is no version of this page where the free plan
   is a different number — so they live outside the copy table. The figures each take the locale
   and carry their own alt text and in-drawing labels; see the header of Figures.tsx. */
function figures(locale: Locale): ReactNode[] {
  return [
    <FigCapture key="capture" locale={locale} />,
    <FigOffline key="offline" locale={locale} />,
    <FigMap key="map" locale={locale} />,
    <FigExport key="export" locale={locale} />,
    <FigAerial key="aerial" locale={locale} />,
  ]
}
const STAT_VALUES = [3, 20, 2, 0]
const STAT_DISPLAY = ['3', '20', '2', 'Rp 0']
const STAT_PREFIX = [undefined, undefined, undefined, 'Rp ']
/* Row 05 is the aerial one. The palette's secondary accent is reserved for aerial material and
   appears nowhere else — see the token block in paper.css. */
const AERIAL_INDEX = 4

function MarqueeRow({ items, hidden }: { items: string[]; hidden?: boolean }) {
  return (
    <div className="pg-marquee-row" aria-hidden={hidden || undefined}>
      {items.map((a) => (
        <span className="pg-marquee-item" key={a}>
          {a}
        </span>
      ))}
    </div>
  )
}

export default async function HomePage() {
  const locale = await getLocale()
  const c = copy[locale]
  const figs = figures(locale)

  return (
    <>
      <Motion />

      {/* ================= hero ================= */}
      <section className="pg-sec pg-hero">
        <div className="pg-wrap">
          <div className="pg-hero-grid">
            <div>
              <p className="pg-micro accent">{c.eyebrow}</p>
              {/* data-anim="chars": SplitText reveals this per character. GSAP puts the original
                  string back on the element as aria-label, so it is still announced as one
                  sentence rather than as forty letters. */}
              <h1 className="pg-d1" data-anim="chars" style={{ marginTop: 22 }}>
                {c.h1}
              </h1>
              <p className="pg-lede" data-anim="up" data-anim-delay="0.35" style={{ marginTop: 26 }}>
                {c.lede}
              </p>
              <div className="pg-hero-cta" data-anim="up" data-anim-delay="0.45">
                <Link href="/login" className="pg-btn pg-btn-primary" data-magnetic>
                  {c.ctaStart}
                </Link>
                <Link href="/download" className="pg-btn pg-btn-outline" data-magnetic>
                  {c.ctaDownload}
                </Link>
              </div>
            </div>

            {/* Decorative, and marked so: row 01 below repeats this figure with its real label and
                its own alt text. Parallax is applied here and nowhere near copy or controls. */}
            <div className="pg-row-art" data-parallax="-6" aria-hidden="true">
              <FigCapture locale={locale} />
            </div>
          </div>

          <dl className="pg-stats" data-anim="stagger">
            {c.stats.map((s, i) => (
              <div className="pg-stat" key={s.label}>
                <dt className="pg-micro">{s.label}</dt>
                <dd>
                  <span
                    className="pg-num"
                    data-count={STAT_VALUES[i]}
                    data-count-prefix={STAT_PREFIX[i]}
                  >
                    {STAT_DISPLAY[i]}
                  </span>
                  <small>{s.unit}</small>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ================= marquee =================
          Two identical rows so the loop is seamless without cloning a node React does not know
          about. The second is hidden from assistive tech: it is the same eight words again. */}
      <div className="pg-marquee" data-marquee>
        <MarqueeRow items={c.audience} />
        <MarqueeRow items={c.audience} hidden />
      </div>

      {/* ================= capabilities ================= */}
      <section className="pg-sec">
        <div className="pg-wrap">
          <div className="pg-head">
            <div className="pg-head-top">
              <p className="pg-micro">{c.capsMicro}</p>
              <p className="pg-micro pg-num pg-num-tag">05</p>
            </div>
            <h2 className="pg-d2" data-anim="lines">
              {c.capsTitle}
            </h2>
          </div>

          <div className="pg-rows">
            {c.caps.map((cap, i) => (
              <article className="pg-row" data-anim="row" key={cap.title}>
                <div className="pg-row-copy">
                  <p className="pg-row-n pg-num">{String(i + 1).padStart(2, '0')}</p>
                  <p className={i === AERIAL_INDEX ? 'pg-micro aerial' : 'pg-micro accent'}>
                    {cap.kicker}
                  </p>
                  <h3 className="pg-d3">{cap.title}</h3>
                  <p className="pg-body">{cap.body}</p>
                </div>
                <div className="pg-row-art">{figs[i]}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ================= how it works, pinned =================
          The left column pins while the three steps scroll past it and light up in turn. Below
          1000px the pin never engages and this is three ordinary stacked cards. */}
      <section className="pg-sec pg-sec-tint">
        <div className="pg-wrap">
          <div className="pg-scene" data-scene>
            <div className="pg-scene-fixed" data-scene-fixed>
              <div className="pg-head-top">
                <p className="pg-micro">{c.stepsMicro}</p>
                <p className="pg-micro pg-num pg-num-tag" data-scene-readout>
                  01 / 03
                </p>
              </div>
              <h2 className="pg-d2" data-anim="lines">
                {c.stepsTitle}
              </h2>
              <p className="pg-body" style={{ maxWidth: '34ch' }}>
                {c.stepsLede}
              </p>
            </div>

            <ol className="pg-scene-steps">
              {c.steps.map((s, i) => (
                <li className="pg-step" data-scene-step key={s.t}>
                  <span className="pg-step-n pg-num">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="pg-d3">{s.t}</h3>
                  <p className="pg-body">{s.b}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ================= the argument ================= */}
      <section className="pg-sec pg-sec-dark">
        <div className="pg-wrap">
          <div className="pg-head">
            <div className="pg-head-top">
              <p className="pg-micro">{c.whyMicro}</p>
            </div>
            <h2 className="pg-d2 pg-quote" data-anim="lines">
              {c.whyTitle}
            </h2>
          </div>
          <div className="pg-quote-body" data-anim="up">
            <p>{c.why1}</p>
            <p>
              {c.why2.before}
              <strong>{c.why2.strong}</strong>
              {c.why2.after}
            </p>
          </div>
        </div>
      </section>

      {/* ================= pricing ================= */}
      <section className="pg-sec">
        <div className="pg-wrap">
          <div className="pg-head">
            <div className="pg-head-top">
              <p className="pg-micro">{c.priceMicro}</p>
            </div>
            <h2 className="pg-d2" data-anim="lines">
              {c.priceTitle}
            </h2>
          </div>

          <div className="pg-price" data-anim="stagger">
            <div className="pg-price-card">
              <p className="pg-micro">{c.free.name}</p>
              <p className="pg-price-fig pg-num">Rp 0</p>
              <p className="pg-body">{c.free.body}</p>
              <div>
                <Link href="/login" className="pg-btn pg-btn-outline">
                  {c.free.cta}
                </Link>
              </div>
            </div>

            <div className="pg-price-card feat">
              <p className="pg-micro">{c.premium.name}</p>
              <p className="pg-price-fig pg-num">
                {PREMIUM_PRICE_LABEL}
                <small>{c.premium.per}</small>
              </p>
              <p className="pg-body">{c.premium.body}</p>
              <div>
                <Link href="/pricing" className="pg-btn pg-btn-primary">
                  {c.premium.cta}
                </Link>
              </div>
            </div>
          </div>

          <p className="pg-price-note">
            {c.priceNote.text} <Link href="/refund-policy">{c.priceNote.link}</Link>.
          </p>
        </div>
      </section>

      {/* ================= closer ================= */}
      <hr className="pg-rule" />
      <section className="pg-sec">
        <div className="pg-wrap pg-close">
          <h2 className="pg-d2" data-anim="lines">
            {c.close.title}
          </h2>
          <p className="pg-lede" style={{ textAlign: 'center' }}>
            {c.close.body}
          </p>
          <div className="pg-hero-cta" style={{ justifyContent: 'center', marginTop: 0 }}>
            <Link href="/login" className="pg-btn pg-btn-primary" data-magnetic>
              {c.close.ctaPrimary}
            </Link>
            <Link href="/contact" className="pg-btn pg-btn-ghost">
              {c.close.ctaGhost}
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
