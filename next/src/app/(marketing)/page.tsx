import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { FigAerial, FigCapture, FigExport, FigMap, FigOffline } from './Figures'
import { Carousel } from './Carousel'
import { SurveyGlobe } from '@/components/SurveyGlobe'
import HeroTerrain3D from '@/components/HeroTerrain3D'
import SpecularEdge from '@/components/SpecularEdge'
import { DitherVeil } from '@/components/DitherVeil'
import { StarBorder } from '@/components/StarBorder'
import { TechText } from '@/components/TechText'
import { TerrainGallery, type TerrainPanel } from '@/components/TerrainGallery'
/* THE GALLERY'S PANELS COME FROM THE RENDER MANIFEST, and importing it is the point.
   The labels describe MEASURED relief ("Swamp and minor rivers" for the 78 m window, "High
   country" for the 979 m one). Hand-copying them into this file would let the captions drift
   away from the data the moment a window moves — and the drift would be silent, because a
   caption is not type-checked against an elevation. Reading the same file the renderer wrote
   makes that impossible. */
import terrainManifest from '../../../public/terrain/manifest.json'
import type { Locale } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'
import { pageMetadata } from '@/lib/seo'
import { SITE_LOCATION } from '@/lib/business'
import { FREE_STORAGE_LABEL, PREMIUM_DAYS, PREMIUM_PRICE_LABEL, PREMIUM_STORAGE_LABEL } from '@/lib/pricing'
import { FREE_PROJECTS, FREE_PHOTOS_PER_PROJECT } from '@/lib/quota'
import { PricingCheckoutButton } from '@/components/PricingCheckoutButton'

/*
 * Every claim on this page is one the app actually does today.
 *
 * An earlier version advertised Shapefile and File Geodatabase export, one-click ArcGIS sync and
 * "sub-meter accuracy". None of those exist: `lib/export.ts` writes CSV and XLSX, and a phone GPS
 * reports metres. That copy was live on a site a payment gateway was verifying, which is a bad
 * place to overstate a product. If a capability is added later, add it here: not before.
 *
 * The same rule covers the counters in the hero: the free-plan project and photo caps and the 2
 * export formats in lib/export.ts are the actual limits. They are READ FROM lib/quota.ts rather
 * than typed here, because they were typed here once and went stale: commit 44ee4b0 changed the
 * free tier to 2 projects and 3 photos per project and updated the FAQ and the pricing page, but
 * missed this file, so the hero advertised 3 projects and 20 photos for a while after. A number
 * that animates draws the eye straight to it, so it had better survive being checked.
 *
 * AND IT COVERS BOTH LANGUAGES. The English column below is a translation of the Indonesian, not
 * a second draft with its own ideas: if one side ever promises something the other does not, the
 * page is making a claim that depends on who is reading it.
 *
 * REWRITTEN 2026-09-26. The copy was checked line by line against the same rule. What changed:
 * the lede now says what the product IS before it says what it does (a survey instrument, not a
 * photo app), the capability rows lead with the reader's problem instead of the feature name, and
 * the closing argument names the concrete failure (a forwarded photo losing its location) since
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
  /* The hero's coordinate readout. `label` is what the numbers ARE, because an unlabelled
     coordinate in a hero is a decoration; `note` says whose it is. */
  coordLabel: string
  coordNote: string
  stats: Array<{ label: string; unit: string }>
  capsMicro: string
  capsTitle: string
  capsLede: string
  caps: Array<{ kicker: string; title: string; body: string }>
  /* The accessible name for the capability carousel, which pages the SAME five items the
     bento shows as a grid. It has to say what is being paged through, or a screen reader
     announces "carousel" with no subject. */
  capsCarouselLabel: string
  /* THE TERRAIN GALLERY. Five blocks of real elevation data for the region the business works
     in — see scripts/build-terrain-gallery.mjs, which renders them and asserts the shared ramp
     covers every window. The labels live in that script's manifest rather than here, because
     they describe MEASURED ground and a translator editing them without the data would be
     guessing. These three strings are the section's own heading. */
  terrainMicro: string
  terrainTitle: string
  terrainLede: string
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
  free: { name: string; body: string; cta: string; features: string[] }
  premium: { name: string; per: string; body: string; cta: string; features: string[] }
  priceNote: { text: string; link: string }
  close: { title: string; body: string; ctaPrimary: string; ctaGhost: string }
  audience: string[]
  audienceLabel: string
}

const copy: Record<Locale, Copy> = {
  id: {
    meta: {
      title: 'Data lapangan yang tidak bisa dibantah | GeoFold',
      description:
        'Satu foto, satu titik, koordinat tercetak di dalam gambarnya. Tetap bekerja tanpa sinyal, lalu sinkron sendiri. Ekspor ke Excel dan CSV dengan foto menempel di barisnya. Gratis untuk 2 proyek.',
    },
    eyebrow: 'Alat survei lapangan · Android & web',
    h1: 'Bukti lapangan, bukan sekadar foto.',
    lede:
      'GeoFold mengubah ponsel lapangan menjadi alat ukur: setiap titik membawa koordinat, akurasi, dan waktu yang tercetak langsung ke dalam gambarnya. Tetap bekerja tanpa sinyal, lalu mengirim sendiri begitu ada koneksi.',
    ctaStart: 'Mulai gratis',
    ctaDownload: 'Unduh aplikasi',
    coordLabel: 'Posisi kami',
    coordNote: 'Titik survei pertama kami',
    stats: [
      { label: 'Proyek gratis', unit: 'selamanya' },
      { label: 'Foto per proyek', unit: 'paket gratis' },
      { label: 'Format ekspor', unit: 'XLSX · CSV' },
      { label: 'Biaya mulai', unit: 'tanpa kartu' },
    ],
    capsMicro: 'Apa yang bisa dilakukan',
    capsTitle: 'Lima hal, dikerjakan sampai benar.',
    capsLede:
      'Ini bukan daftar fitur. Ini garis pembeda antara catatan lapangan yang bisa dipertanggungjawabkan dan foto yang mengendap di galeri ponsel.',
    capsCarouselLabel: 'Lima kemampuan GeoFold, satu per satu',
    terrainMicro: 'Medan yang kami kerjakan',
    terrainTitle: 'Bukan peta hiasan. Ini tanah yang sebenarnya.',
    terrainLede:
      'Lima potong medan di sekitar Sintang, dirender dari data elevasi publik yang sama yang dipakai alat kami. Angka di tiap panel adalah relief — beda tinggi titik terendah dan tertinggi di potongan itu: dari 78 meter di rawa dataran rendah sampai 979 meter di pegunungan.',
    caps: [
      {
        kicker: 'Tangkap',
        title: 'Koordinat tercetak di dalam fotonya',
        body: 'Bukan metadata yang hilang saat file dikirim ulang. Posisi, akurasi, dan waktu ditulis langsung ke gambar: buktinya ikut ke mana pun foto itu pergi.',
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
    stepsTitle: 'Tiga langkah, lalu selesai.',
    stepsLede:
      'Dari proyek kosong sampai laporan yang siap dikirim, tanpa langkah tambahan di antaranya.',
    steps: [
      {
        t: 'Buat proyek',
        b: 'Tentukan sendiri isian formulirnya: jenis temuan, kondisinya, catatannya. Apa pun yang tim Anda memang catat di lapangan.',
      },
      {
        t: 'Ambil titik',
        b: 'Foto, koordinat, dan akurasi tersimpan bersamaan. Berfungsi walau tidak ada sinyal sama sekali.',
      },
      {
        t: 'Tarik laporannya',
        b: 'Ekspor Excel atau CSV kapan saja: dari ponsel maupun dari peramban. Datanya tetap milik Anda.',
      },
    ],
    whyMicro: 'Kenapa ini penting',
    whyTitle: 'Foto tanpa koordinat bukan bukti.',
    why1:
      'Foto lapangan biasa menitipkan lokasinya di metadata, dan metadata hilang begitu gambar dikirim lewat WhatsApp, disalin ulang, atau diedit sedikit saja. Enam bulan kemudian tidak ada yang bisa membuktikan foto itu diambil di mana.',
    why2: {
      before: 'GeoFold menuliskan koordinat, akurasi, dan waktu ',
      strong: 'ke dalam gambarnya',
      after:
        ', lalu menyimpan angka yang sama di basis data. Keduanya tetap menempel ke mana pun fotonya berpindah.',
    },
    globePlace: 'Tempat kami bekerja',
    globeSub: 'Titik ini yang membuat produk ini ada: masalah nyata di lapangan, bukan asumsi ruang rapat.',
    priceMicro: 'Harga',
    priceTitle: 'Mulai gratis. Bayar hanya kalau memang perlu.',
    free: {
      name: 'Gratis',
      body: '2 proyek, 3 foto per proyek, penyimpanan 10 MB, batas harian. Selamanya, tanpa kartu.',
      cta: 'Mulai',
      features: [
        `${FREE_PROJECTS} proyek aktif`,
        `${FREE_PHOTOS_PER_PROJECT} foto per proyek`,
        `${FREE_STORAGE_LABEL} penyimpanan`,
        'Peta offline di HP',
        'Ekspor KML, GeoJSON, CSV',
      ],
    },
    premium: {
      name: 'Premium',
      per: `/ ${PREMIUM_DAYS} hari`,
      body: `Semua fitur terbuka, tanpa batas jumlah proyek, foto, dan survei. Penyimpanan ${PREMIUM_STORAGE_LABEL}. Sekali bayar, tidak berulang.`,
      cta: 'Lihat detail',
      features: [
        'Proyek tanpa batas',
        'Foto tanpa batas',
        `${PREMIUM_STORAGE_LABEL} penyimpanan`,
        'Sinkronisasi lintas perangkat',
        'Prioritas dukungan',
      ],
    },
    priceNote: {
      text:
        'Sekali bayar, bukan langganan otomatis. Tidak ada auto-debit dan tidak ada yang perlu dibatalkan.',
      link: 'Kebijakan pengembalian dana',
    },
    close: {
      title: 'Coba dulu. Tanpa biaya.',
      body: 'Tidak perlu kartu kredit. Dua proyek pertama gratis selamanya — cukup untuk membuktikan apakah alat ini cocok dengan cara kerja tim Anda.',
      ctaPrimary: 'Buat akun gratis',
      ctaGhost: 'Tanya dulu',
    },
    audienceLabel: 'Untuk siapa',
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
      title: 'Field data that holds up | GeoFold',
      description:
        'One photo, one point, with the coordinates printed into the image itself. Keeps working with no signal, then syncs on its own. Exports to Excel and CSV with the photos embedded in their rows. Free for 2 projects.',
    },
    eyebrow: 'Field survey instrument · Android & web',
    h1: 'Field evidence, not just photos.',
    lede:
      'GeoFold turns a field phone into a survey instrument: every point carries a coordinate, an accuracy figure and a timestamp written onto the image itself. It keeps working with no signal, then sends itself the moment there is one.',
    ctaStart: 'Start free',
    ctaDownload: 'Download the app',
    coordLabel: 'Our position',
    coordNote: 'Our first survey site',
    stats: [
      { label: 'Free projects', unit: 'forever' },
      { label: 'Photos per project', unit: 'free plan' },
      { label: 'Export formats', unit: 'XLSX · CSV' },
      { label: 'Cost to start', unit: 'no card' },
    ],
    capsMicro: 'What it does',
    capsTitle: 'Five things, done until they are right.',
    capsLede:
      'This is not a feature list. It is the line between field records that hold up under scrutiny and photos quietly rotting in a phone gallery.',
    capsCarouselLabel: 'The five things GeoFold does, one at a time',
    terrainMicro: 'The ground we work on',
    terrainTitle: 'Not a decorative map. This is the actual ground.',
    terrainLede:
      'Five blocks of terrain around Sintang, rendered from the same public elevation data our tools use. The number on each panel is its relief — the height difference between the lowest and highest point in that block: from 78 metres in the lowland swamp to 979 metres in the high country.',
    caps: [
      {
        kicker: 'Capture',
        title: 'Coordinates printed inside the photo',
        body: 'Not metadata that disappears the moment the file is forwarded. Position, accuracy and time are written onto the image itself: the evidence travels with it.',
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
        body: 'The DJI drone build captures from the aircraft, with the aircraft\'s own coordinates, then files the results into the same project as a walked survey.',
      },
    ],
    stepsMicro: 'How it works',
    stepsTitle: 'Three steps, then done.',
    stepsLede: 'From an empty project to a report you can send, with nothing extra in between.',
    steps: [
      {
        t: 'Create a project',
        b: 'Define the form fields yourself: the finding, its condition, your notes. Whatever your team actually records in the field.',
      },
      {
        t: 'Take a point',
        b: 'Photo, coordinates and accuracy are saved together. Works with no signal at all.',
      },
      {
        t: 'Pull the report',
        b: 'Export Excel or CSV any time: from the phone or from the browser. The data stays yours.',
      },
    ],
    whyMicro: 'Why this matters',
    whyTitle: 'A photo without coordinates is not evidence.',
    why1:
      'An ordinary field photo keeps its location in metadata, and the metadata is gone the moment the image goes through WhatsApp, gets copied again, or is edited even slightly. Six months later, nobody can prove where it was taken.',
    why2: {
      before: 'GeoFold writes the coordinates, accuracy and time ',
      strong: 'into the image itself',
      after:
        ', then stores the same figures in the database. Both stay attached wherever the photo travels.',
    },
    globePlace: 'Where we work',
    globeSub: 'This is the point the product came out of: real problems in the field, not assumptions made in a meeting room.',
    priceMicro: 'Pricing',
    priceTitle: 'Start free. Pay only if you actually need to.',
    free: {
      name: 'Free',
      body: '2 projects, 3 photos per project, 10 MB of storage, daily limits. Forever, no card.',
      cta: 'Start',
      features: [
        `${FREE_PROJECTS} active projects`,
        `${FREE_PHOTOS_PER_PROJECT} photos per project`,
        `${FREE_STORAGE_LABEL} of storage`,
        'Offline maps on the phone',
        'KML, GeoJSON and CSV export',
      ],
    },
    premium: {
      name: 'Premium',
      per: `/ ${PREMIUM_DAYS} days`,
      body: `Every feature unlocked, no limit on projects, photos or surveys. ${PREMIUM_STORAGE_LABEL} of storage. One payment, not recurring.`,
      cta: 'See details',
      features: [
        'Unlimited projects',
        'Unlimited photos',
        `${PREMIUM_STORAGE_LABEL} of storage`,
        'Sync across devices',
        'Priority support',
      ],
    },
    priceNote: {
      text:
        'A one-off payment, not an auto-renewing subscription. No auto-debit and nothing to cancel.',
      link: 'Refund policy',
    },
    close: {
      title: 'Try it first. At no cost.',
      body: 'No credit card needed. The first two projects are free forever — enough to prove whether this fits the way your team actually works.',
      ctaPrimary: 'Create a free account',
      ctaGhost: 'Ask a question',
    },
    audienceLabel: 'Who it is for',
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

/* Counter values are language-independent: there is no version of this page where the free plan
   is a different number, so they live outside the copy table. The figures each take the locale
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
const STAT_VALUES = [FREE_PROJECTS, FREE_PHOTOS_PER_PROJECT, 2, 0]
const STAT_DISPLAY = [String(FREE_PROJECTS), String(FREE_PHOTOS_PER_PROJECT), '2', 'Rp 0']
const STAT_PREFIX = [undefined, undefined, undefined, 'Rp ']
/* Row 05 is the aerial one. The palette's secondary accent is reserved for aerial material and
   appears nowhere else: see the token block in paper.css. */
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

  /* The gallery's panels, straight from the render manifest. `TerrainPanel` wants the four fields
     the component reads and the manifest carries six (the extras are the lat/lon of the window
     and its measured stats, kept in the file for anyone re-rendering it). Mapping explicitly
     rather than casting means a manifest that loses a field fails the build instead of shipping
     a panel with a blank label. */
  const terrainPanels: TerrainPanel[] = terrainManifest.map((p) => ({
    file: p.file,
    id: p.id,
    label: p.label,
    note: p.note,
  }))

  return (
    <>
      {/* <Motion /> is mounted in the (marketing) layout, not here: it is the whole site's motion
          system and mounting it per page would tear it down and rebuild it on every navigation. */}

      {/* ================= hero =================
          THE GROUND IS GLOBAL NOW. The hero used to carry its own survey graticule, the
          how-it-works section a contour field, the argument band a magnet field and the closing
          section a shape grid — four effects, each sized to its own section, so crossing a section
          boundary changed the background. The brief asked for ONE background behind everything,
          so all four were removed and replaced by SiteGround, which is mounted once in the
          (marketing) layout and fixed to the viewport. See SiteGround.tsx. */}
      <section className="pg-sec pg-hero">
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
                {/* The specular edge goes on the hero CTA and nowhere else: it is a WebGL context,
                    and one is the right number. It wraps the LINK rather than replacing it, so the
                    href, the client-side routing and the keyboard behaviour are untouched. */}
                <Link href="/login" className="pg-btn pg-btn-primary" data-magnetic>
                  <SpecularEdge>{c.ctaStart}</SpecularEdge>
                </Link>
                <Link href="/download" className="pg-btn pg-btn-outline" data-magnetic>
                  {c.ctaDownload}
                </Link>
              </div>

              {/* THE COORDINATE READOUT.
                  The brief asks for the decrypt effect on "animasi angka koordinat GPS", and a
                  coordinate is the one number on this page that is a fact about the company
                  rather than a claim about the product — so it earns the hero's second slot.
                  It is read from SITE_LOCATION, the same constant the globe in the argument
                  section marks, so the two cannot drift.

                  `data-anim="up"` rather than the char split: the TechText component owns this
                  element's text content, and a SplitText pass over the same node would fight it
                  for the same children. */}
              <p className="pg-coord" data-anim="up" data-anim-delay="0.55">
                <span className="pg-coord-label">{c.coordLabel}</span>
                <span className="pg-coord-sep" aria-hidden="true" />
                <TechText text={SITE_LOCATION.dms.lat} delay={520} />
                <TechText text={SITE_LOCATION.dms.lon} delay={680} />
                <span className="pg-coord-sep" aria-hidden="true" />
                <span className="pg-coord-note">{c.coordNote}</span>
              </p>
            </div>

            {/* ================= the 3D map block =================
                THE CLIENT'S REQUEST: "untuk di bagian atas di hero section berikan gambar peta
                3D ikuti refrensi foto yang saya berikan." Both reference photos are terrain
                blocks — a slice of ground lifted out of the earth, corner-on, with the cut side
                walls visible.

                IT IS TURNED NOW, NOT JUST DRAWN. It used to be a single <img>: a build-time
                render of this ground, honest but dead — a picture OF a 3D map. HeroTerrain3D
                draws the same ground as a real WebGL mesh you can turn, built from the same
                cached Terrarium elevation (scripts/build-terrain-3d.mjs) so the block and its
                own static fallback cannot disagree about the hillside.

                THE <img> STAYS, BEHIND THE CANVAS, AND THAT IS THE POINT. It is the accessible
                layer: the picture carries a fact about where the business works, and a fact a
                screen reader cannot reach is decoration. It is also the no-WebGL fallback. The
                canvas is aria-hidden and simply covers it when WebGL is available. */}
            <figure className="pg-hero-art">
              <div className="pg-hero-stage">
                {/* eslint-disable-next-line @next/next/no-img-element -- a static, fixed-size,
                    already-optimised PNG of a generated asset, and now the accessible/fallback
                    layer under the canvas; next/image would add a loader and a layout box for an
                    image whose dimensions are known at build time. */}
                <img
                  className="pg-hero-map"
                  src="/hero-terrain.png"
                  alt={`A 3D terrain block of the ground we work on, built from real satellite elevation data`}
                  width={1200}
                  height={880}
                  // Above the fold on the landing page: without this the browser discovers it late
                  // and the hero paints as an empty column first.
                  fetchPriority="high"
                  decoding="async"
                />
                <HeroTerrain3D className="pg-hero-canvas" />
              </div>
              <figcaption className="pg-hero-map-cap">
                {c.globePlace} · {c.globeSub}
              </figcaption>
            </figure>
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
        <p className="pg-marquee-label">{c.audienceLabel}</p>
        <div className="pg-marquee-scroll">
          <MarqueeRow items={c.audience} />
          <MarqueeRow items={c.audience} hidden />
        </div>
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

          {/* A bento, not a list. The lead cell is the product's core act and gets a double cell;
              the rest take single cells around it. See the .pg-bento block in paper.css for why the
              sizes differ and what was deliberately not taken from the component it adapts. */}
          {/* The bento fills exactly: the lead spans 4 of 6 columns beside one small cell, and three
              small cells close the second row. 4+2 / 2+2+2 is twelve columns over two rows, so there
              is no hole in the grid and no cell is stretched to fill one. An earlier version made
              the last cell span 4 as well, which left two empty columns at the end of the second
              row; a bento is a packing problem and that one does not pack. */}
          {/* `data-glow-zone` is what arms the glow cursor. It is on the GRID rather than on each
              cell, because the light is a property of the region: one zone, one light, and the
              brief's own scoping ("area interaktif seperti Bento Grid fitur") is exactly this. */}
          <div className="pg-bento" data-glow-zone>
            {c.caps.map((cap, i) => (
              <article
                className={`pg-cell${i === 0 ? ' pg-cell--lead' : ''}`}
                data-anim="up"
                data-spotlight
                key={cap.title}
              >
                <div className="pg-cell-copy">
                  <p className="pg-cell-n pg-num">{String(i + 1).padStart(2, '0')}</p>
                  <p className={i === AERIAL_INDEX ? 'pg-micro aerial' : 'pg-micro accent'}>
                    {cap.kicker}
                  </p>
                  <h3 className="pg-d3">{cap.title}</h3>
                  <p className="pg-body">{cap.body}</p>
                </div>
                {/* The figure's frame carries the dither veil. It is drawn over the drawing
                    rather than replacing it, it is pointer-events-none, and it only plays while
                    the pointer is on the frame — so the drawing is always what the reader sees
                    and the scan is what they get for looking closer. */}
                <div className="pg-cell-art">
                  {figs[i]}
                  <DitherVeil />
                </div>
              </article>
            ))}
          </div>

          {/* ================= the same five, one at a time =================
              The client: "susunan layout pada home page di perbagus dan kombinasikan dengan
              carousel."

              The bento above is a dense grid — five capabilities at once, which is the right
              answer for a reader who is scanning and the wrong one for a reader who is not.
              This is the SAME five items, in the SAME order, one per slide, so the section
              offers both readings without making a second claim. It is the section's second
              half rather than a new band, so the page gains a rhythm without gaining another
              500px of height.

              The slide's art is the same figure the bento cell above uses, inside a
              containment box (`.pg-cap-slide-art`, `overflow: hidden`) — which is also what
              answers the client's other note about images escaping their card. */}
          <div className="pg-cap-carousel">
            <Carousel label={c.capsCarouselLabel}>
              {c.caps.map((cap, i) => (
                <article className="pg-cap-slide" key={cap.title}>
                  <div className="pg-cap-slide-copy">
                    <p className="pg-cell-n pg-num">{String(i + 1).padStart(2, '0')}</p>
                    <p className={i === AERIAL_INDEX ? 'pg-micro aerial' : 'pg-micro accent'}>
                      {cap.kicker}
                    </p>
                    <h3 className="pg-d3">{cap.title}</h3>
                    <p className="pg-body">{cap.body}</p>
                  </div>
                  <div className="pg-cap-slide-art">{figs[i]}</div>
                </article>
              ))}
            </Carousel>
          </div>
        </div>
      </section>

      {/* ================= how it works, pinned =================
          The left column pins while the three steps scroll past it and light up in turn. Below
          1000px the pin never engages and this is three ordinary stacked cards.

          NO FIELD OF ITS OWN. This section used to carry the contour canvas; the contours are the
          whole site's ground now (SiteGround), so there is nothing to mount here. */}
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

      {/* ================= the terrain gallery =================
          THE REACT BITS ACCORDIONGALLERY, ADAPTED. The client asked for this component by name
          ("yarn shadcn@latest add @file:react-bits/AccordionGallery-JS-CSS"); the interaction is
          kept and the content is the site's own — five blocks of REAL elevation data for the
          region the business surveys, rendered by scripts/build-terrain-gallery.mjs.

          WHY IT SITS HERE. The section above argues that a photo without a coordinate is not
          evidence, and names the place the business works from. This is the same argument made
          with the product's own material: the actual ground, at its actual heights. A gallery of
          stock photography here would undercut the sentence directly above it.

          THE LABELS COME FROM THE RENDER MANIFEST, NOT FROM THIS FILE. They describe measured
          relief ("78 m" through "979 m"), so they belong beside the data that produced them. */}
      <section className="pg-sec pg-sec-tint">
        <div className="pg-wrap">
          <div className="pg-head">
            <div className="pg-head-top">
              <p className="pg-micro">{c.terrainMicro}</p>
            </div>
            <h2 className="pg-d2" data-anim="lines">
              {c.terrainTitle}
            </h2>
            <p className="pg-body pg-head-lede" data-anim="up">
              {c.terrainLede}
            </p>
          </div>
          <TerrainGallery panels={terrainPanels} locale={locale} />
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
              {/* The list is generated from the same constants the API enforces, so a card cannot
                  promise an allowance the server will refuse. See lib/quota.ts. */}
              <ul className="pg-price-list">
                {c.free.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
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
              <ul className="pg-price-list">
                {c.premium.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <div>
                {/* THE ONE STAR BORDER ON THE PAGE. The brief names it for the primary CTA and
                    the Premium card; on this page those are the same object, so it goes here and
                    nowhere else. It wraps the checkout button rather than replacing it — the
                    button's own handler, its focus behaviour and its loading state are untouched,
                    and the travelling light is a ::before on the wrapper that takes no pointer
                    events. */}
                <StarBorder>
                  <PricingCheckoutButton
                    label={c.premium.cta}
                    className="pg-btn pg-btn-primary"
                    offerLabel={PREMIUM_PRICE_LABEL}
                    storageLabel={PREMIUM_STORAGE_LABEL}
                    locale={locale}
                  />
                </StarBorder>
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
      <section className="pg-sec sg-host">
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
