import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { FigAerial, FigCapture, FigExport, FigMap, FigOffline } from './Figures'
import { Motion } from './Motion'
import { SurveyField } from '@/components/SurveyField'
import { SurveyGlobe } from '@/components/SurveyGlobe'
import { MagnetField } from '@/components/MagnetField'
import type { Locale } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'
import { pageMetadata } from '@/lib/seo'
import { PREMIUM_DAYS, PREMIUM_PRICE_LABEL, PREMIUM_STORAGE_LABEL } from '@/lib/pricing'
import { PricingCheckoutButton } from '@/components/PricingCheckoutButton'

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
 *
 * REWRITTEN 2026-09-26. The copy was checked line by line against the same rule. What changed:
 * the lede now says what the product IS before it says what it does (a survey instrument, not a
 * photo app), the capability rows lead with the reader's problem instead of the feature name, and
 * the closing argument names the concrete failure — a forwarded photo losing its location — since
 * that is the thing a surveyor has actually been burned by. Nothing was added that the app does
 * not do; several sentences were removed that only restated the heading above them.
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
  capsLede: string
  caps: Array<{ kicker: string; title: string; body: string }>
  stepsMicro: string
  stepsTitle: string
  stepsLede: string
  steps: Array<{ t: string; b: string }>
  whyMicro: string
  whyTitle: string
  why1: string
  why2: { before: string; strong: string; after: string }
  globePlace: string
  globeSub: string
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
      title: 'GeoFold — Survei lapangan yang tidak kehilangan satu titik pun',
      description:
        'Foto berkoordinat, bekerja penuh offline, sinkron sendiri begitu ada sinyal. Ekspor ke Excel dan CSV dengan foto tertanam. Gratis untuk 2 proyek.',
    },
    eyebrow: 'Survei lapangan · Android & web',
    h1: 'Titik survei yang tidak hilang.',
    lede:
      'GeoFold mengubah ponsel lapangan menjadi alat ukur: satu foto berkoordinat, satu titik tercatat, langsung tersimpan di perangkat. Tidak ada sinyal bukan masalah — datanya menyusul sendiri begitu kembali online.',
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
    capsLede:
      'Bukan daftar fitur. Ini yang membedakan catatan lapangan yang bisa dipertanggungjawabkan dari foto di galeri ponsel.',
    caps: [
      {
        kicker: 'Tangkap',
        title: 'Koordinat tercetak di dalam fotonya',
        body: 'Bukan metadata yang hilang saat file dikirim ulang. Posisi, akurasi, dan waktu ditulis langsung ke gambar — buktinya ikut ke mana pun foto itu pergi.',
      },
      {
        kicker: 'Offline',
        title: 'Sinyal putus, pekerjaan jalan terus',
        body: 'Titik masuk ke antrean di perangkat dan terkirim sendiri begitu ada sinyal. Tidak ada yang perlu dicatat dua kali, tidak ada yang menunggu di depan layar.',
      },
      {
        kicker: 'Peta',
        title: 'Lihat sebarannya, bukan daftarnya',
        body: 'Semua titik tergambar di atas peta satelit atau jalan, lengkap dengan grid kuadrat untuk mengukur seberapa penuh satu blok sudah tersisir.',
      },
      {
        kicker: 'Ekspor',
        title: 'Excel yang fotonya masih menempel',
        body: 'Satu berkas .xlsx dengan foto tertanam di barisnya, atau .csv kalau mau diolah lagi. Tanpa aplikasi tambahan, tanpa perlu menyusun ulang.',
      },
      {
        kicker: 'Drone',
        title: 'Foto udara masuk ke antrean yang sama',
        body: 'Versi DJI memotret dari udara dengan koordinat pesawatnya, lalu menyimpan hasilnya ke proyek yang sama seperti survei jalan kaki.',
      },
    ],
    stepsMicro: 'Cara kerjanya',
    stepsTitle: 'Tiga langkah. Selesai.',
    stepsLede:
      'Dari proyek kosong sampai laporan yang siap dikirim, tanpa langkah tambahan di antaranya.',
    steps: [
      {
        t: 'Buat proyek',
        b: 'Tentukan sendiri isian formulirnya — jenis temuan, kondisinya, catatannya. Apa pun yang tim Anda memang catat di lapangan.',
      },
      {
        t: 'Ambil titik',
        b: 'Foto, koordinat, dan akurasi tersimpan bersamaan. Berfungsi walau tidak ada sinyal sama sekali.',
      },
      {
        t: 'Tarik laporannya',
        b: 'Ekspor Excel atau CSV kapan saja — dari ponsel maupun dari peramban. Datanya tetap milik Anda.',
      },
    ],
    whyMicro: 'Kenapa ini penting',
    whyTitle: 'Foto tanpa koordinat bukan bukti.',
    why1:
      'Foto lapangan biasa menitipkan lokasinya di metadata — dan metadata hilang begitu gambar dikirim lewat WhatsApp, disalin ulang, atau diedit sedikit saja. Enam bulan kemudian tidak ada yang bisa membuktikan foto itu diambil di mana.',
    why2: {
      before: 'GeoFold menuliskan koordinat, akurasi, dan waktu ',
      strong: 'ke dalam gambarnya',
      after:
        ', lalu menyimpan angka yang sama di basis data. Keduanya tetap menempel ke mana pun fotonya berpindah.',
    },
    globePlace: 'Sintang, Kalimantan Barat',
    globeSub: 'Titik ini tempat kami bekerja — dan tempat survei pertama diuji.',
    priceMicro: 'Harga',
    priceTitle: 'Gratis dulu. Bayar hanya kalau memang perlu.',
    free: {
      name: 'Gratis',
      body: '2 proyek, 3 foto per proyek, penyimpanan 10 MB, batas harian. Selamanya, tanpa kartu.',
      cta: 'Mulai',
    },
    premium: {
      name: 'Premium',
      per: `/ ${PREMIUM_DAYS} hari`,
      body: `Semua fitur terbuka, tanpa batas jumlah proyek, foto, dan survei. Penyimpanan ${PREMIUM_STORAGE_LABEL}. Sekali bayar, tidak berulang.`,
      cta: 'Lihat detail',
    },
    priceNote: {
      text:
        'Sekali bayar, bukan langganan otomatis. Tidak ada auto-debit dan tidak ada yang perlu dibatalkan.',
      link: 'Kebijakan pengembalian dana',
    },
    close: {
      title: 'Coba dulu. Gratis.',
      body: 'Tidak perlu kartu kredit. Dua proyek pertama tidak dipungut biaya, selamanya.',
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
      title: 'GeoFold — Field surveys that never lose a point',
      description:
        'Photos with the coordinates printed into them, full offline capture, syncing themselves the moment there is a signal. Exports to Excel and CSV with the photos embedded. Free for 2 projects.',
    },
    eyebrow: 'Field survey · Android & web',
    h1: 'Survey points that never go missing.',
    lede:
      'GeoFold turns a field phone into a survey instrument: one geotagged photo, one recorded point, saved to the device immediately. No signal is not a problem — the data catches up on its own once you are back online.',
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
    capsLede:
      'This is not a feature list. It is the difference between field records that hold up and photos sitting in a phone gallery.',
    caps: [
      {
        kicker: 'Capture',
        title: 'Coordinates printed inside the photo',
        body: 'Not metadata that disappears the moment the file is forwarded. Position, accuracy and time are written onto the image itself — the evidence travels with it.',
      },
      {
        kicker: 'Offline',
        title: 'The signal drops, the work carries on',
        body: 'Points queue up on the device and send themselves the moment there is a signal. Nothing to write down twice, nobody waiting on a screen.',
      },
      {
        kicker: 'Map',
        title: 'See the spread, not the list',
        body: 'Every point drawn on a satellite or street map, with a quadrat grid for measuring how much of a block has actually been covered.',
      },
      {
        kicker: 'Export',
        title: 'Excel with the photos still attached',
        body: 'One .xlsx file with each photo embedded in its row, or .csv if you want to process it further. No extra software, no reassembling anything.',
      },
      {
        kicker: 'Drone',
        title: 'Aerial photos join the same queue',
        body: 'The DJI build photographs from the aircraft with the aircraft coordinates, then files the results into the same project as a walked survey.',
      },
    ],
    stepsMicro: 'How it works',
    stepsTitle: 'Three steps. Done.',
    stepsLede: 'From an empty project to a report you can send, with nothing extra in between.',
    steps: [
      {
        t: 'Create a project',
        b: 'Define the form fields yourself — the finding, its condition, your notes. Whatever your team actually records in the field.',
      },
      {
        t: 'Take a point',
        b: 'Photo, coordinates and accuracy are saved together. Works with no signal at all.',
      },
      {
        t: 'Pull the report',
        b: 'Export Excel or CSV any time — from the phone or from the browser. The data stays yours.',
      },
    ],
    whyMicro: 'Why this matters',
    whyTitle: 'A photo without coordinates is not evidence.',
    why1:
      'An ordinary field photo keeps its location in metadata — and the metadata is gone the moment the image goes through WhatsApp, gets copied again, or is edited even slightly. Six months later, nobody can prove where it was taken.',
    why2: {
      before: 'GeoFold writes the coordinates, accuracy and time ',
      strong: 'into the image itself',
      after:
        ', then stores the same figures in the database. Both stay attached wherever the photo travels.',
    },
    globePlace: 'Sintang, West Kalimantan',
    globeSub: 'This is where we work — and where the first survey was tested.',
    priceMicro: 'Pricing',
    priceTitle: 'Free first. Pay only if you actually need to.',
    free: {
      name: 'Free',
      body: '2 projects, 3 photos per project, 10 MB of storage, daily limits. Forever, no card.',
      cta: 'Start',
    },
    premium: {
      name: 'Premium',
      per: `/ ${PREMIUM_DAYS} days`,
      body: `Every feature unlocked, no limit on projects, photos or surveys. ${PREMIUM_STORAGE_LABEL} of storage. One payment, not recurring.`,
      cta: 'See details',
    },
    priceNote: {
      text:
        'A one-off payment, not an auto-renewing subscription. No auto-debit and nothing to cancel.',
      link: 'Refund policy',
    },
    close: {
      title: 'Try it first. Free.',
      body: 'No credit card needed. The first two projects cost nothing, forever.',
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
  const locale = await getLocale()
  const c = copy[locale]
  return pageMetadata({ title: c.meta.title, description: c.meta.description, path: '/', locale })
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

      {/* ================= hero =================
          THE SURVEY FIELD. A canvas graticule with waypoints that lean away from the cursor and
          spring back — the one piece of pointer-reactive motion on the site, and the reason the
          hero reads as a map rather than as a headline on a white page. It is `aria-hidden`
          decoration sitting behind the copy, it never eats a click, and it draws nothing at all
          when the visitor prefers reduced motion. See SurveyField.tsx for the full argument. */}
      <section className="pg-sec pg-hero">
        <div className="pg-hero-field" aria-hidden="true">
          <SurveyField />
        </div>
        <div className="pg-wrap pg-hero-inner">
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
            <p className="pg-body pg-head-lede" data-anim="up">
              {c.capsLede}
            </p>
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

            <ol className="pg-scene-steps" data-scene-steps>
              {c.steps.map((s, i) => (
                <li className="pg-step" data-scene-step data-spotlight key={s.t}>
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
        {/* A field of ranging-rod ticks that swing toward the pointer, like needles finding
            north. Adapted from React Bits' MagnetLines — see MagnetField for what changed and
            why. It is decoration with a fact attached: every rod is the same survey mark the
            product drops on a map. */}
        <MagnetField />
        <div className="pg-wrap">
          <div className="pg-head">
            <div className="pg-head-top">
              <p className="pg-micro">{c.whyMicro}</p>
            </div>
            <h2 className="pg-d2 pg-quote" data-anim="lines">
              {c.whyTitle}
            </h2>
          </div>

          {/* The globe sits beside the argument rather than decorating a hero: it marks the place
              the business actually operates from, and the caption names it. See SurveyGlobe for
              why this is canvas 2D and not the three.js globe the brief linked to. */}
          <div className="pg-globe-row">
            <div className="pg-quote-body" data-anim="up">
              <p>{c.why1}</p>
              <p>
                {c.why2.before}
                <strong>{c.why2.strong}</strong>
                {c.why2.after}
              </p>
            </div>

            <figure className="pg-globe" data-anim="up">
              <SurveyGlobe className="pg-globe-canvas" />
              <figcaption className="pg-globe-cap">
                <span className="pg-globe-dot" aria-hidden="true" />
                <span>
                  <strong>{c.globePlace}</strong>
                  <span className="pg-globe-sub">{c.globeSub}</span>
                </span>
              </figcaption>
            </figure>
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
            <div className="pg-price-card" data-spotlight data-tilt>
              <p className="pg-micro">{c.free.name}</p>
              <p className="pg-price-fig pg-num">Rp 0</p>
              <p className="pg-body">{c.free.body}</p>
              <div>
                <Link href="/login" className="pg-btn pg-btn-outline">
                  {c.free.cta}
                </Link>
              </div>
            </div>

            <div className="pg-price-card feat" data-spotlight data-tilt>
              <p className="pg-micro">{c.premium.name}</p>
              <p className="pg-price-fig pg-num">
                {PREMIUM_PRICE_LABEL}
                <small>{c.premium.per}</small>
              </p>
              <p className="pg-body">{c.premium.body}</p>
              <div>
                <PricingCheckoutButton
                  label={c.premium.cta}
                  className="pg-btn pg-btn-primary"
                  offerLabel={PREMIUM_PRICE_LABEL}
                  storageLabel={PREMIUM_STORAGE_LABEL}
                  locale={locale}
                />
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
