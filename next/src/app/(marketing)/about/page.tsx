import type { Metadata } from 'next'
import Link from 'next/link'
import { BUSINESS, OPERATOR } from '@/lib/business'
import type { Locale } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'

/*
 * Rewritten 2026-09-07. The previous version claimed ArcGIS-shaped exports with "correct CRS", and
 * a "team-synced" view of every surveyor's device and sync status. There is no ArcGIS export, no
 * CRS selection, and no team model at all — each account's data is isolated from every other, and
 * no device information is recorded anywhere. See the note in product/page.tsx.
 *
 * Translated 2026-09-10. The English is a translation of the Indonesian, not a second draft: if
 * the two ever describe the product differently, the page is making a claim that depends on who
 * is reading it.
 */

type Copy = {
  meta: { title: string; description: string }
  eyebrow: string
  h1: { before: string; em: string; after: string }
  lede: string
  story: { p1: string; p2: string; p3: { before: string; strong: string; after: string } }
  pillarsKick: string
  pillarsTitle: string
  pillars: Array<{ t: string; b: string }>
  whoKick: string
  whoBody: { before: string; link: string; after: string }
  email: { before: string; after: string }
  close: { title: string; body: string; ctaPrimary: string; ctaOutline: string }
}

const copy: Record<Locale, Copy> = {
  id: {
    meta: {
      title: 'Tentang — GeoFold',
      description:
        'Kenapa GeoFold dibuat: foto lapangan yang kehilangan lokasinya begitu dikirim ulang, dan catatan yang tidak bisa dipertanggungjawabkan enam bulan kemudian.',
    },
    eyebrow: 'Tentang',
    h1: { before: 'Dibuat untuk yang ', em: 'benar-benar', after: ' ke lapangan.' },
    lede:
      'GeoFold lahir dari satu masalah kecil yang mahal: foto survei yang, enam bulan kemudian, tidak bisa dibuktikan diambil di mana.',
    story: {
      p1: 'Tim survei lapangan biasanya memakai tiga alat sekaligus: kamera ponsel untuk foto, aplikasi GPS terpisah untuk koordinat, dan spreadsheet untuk menyatukan keduanya. Selama semuanya masih segar, itu terasa cukup.',
      p2: 'Masalahnya muncul belakangan. Foto dikirim lewat WhatsApp dan metadata lokasinya hilang. Berkas disalin ulang, nama filenya berubah, urutannya tertukar. Saat laporan harus dipertanggungjawabkan, tidak ada yang bisa memastikan foto mana diambil di titik mana.',
      p3: {
        before: 'GeoFold menuliskan koordinat, akurasi dan waktu ',
        strong: 'ke dalam gambarnya',
        after:
          ', lalu menyimpan angka yang sama di basis data bersama isian formulir yang Anda tentukan sendiri. Satu aplikasi, satu antrean, satu ekspor — dan bukti yang bertahan setelah fotonya berpindah tangan.',
      },
    },
    pillarsKick: 'Prinsipnya',
    pillarsTitle: 'Tiga hal yang tidak kami kompromikan.',
    pillars: [
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
    ],
    whoKick: 'Siapa di baliknya',
    whoBody: {
      before:
        'GeoFold dikembangkan dan dioperasikan dari Pontianak, Kalimantan Barat. Alamat lengkap, nomor telepon dan jam operasional ada di ',
      link: 'halaman kontak',
      after: '.',
    },
    email: {
      before: 'Ada pertanyaan, permintaan fitur, atau kebutuhan pengadaan instansi? Kirim email ke ',
      after:
        '. Masukan dari tim yang benar-benar memakainya di lapangan adalah yang paling menentukan apa yang dikerjakan berikutnya.',
    },
    close: {
      title: 'Coba dulu, gratis.',
      body: 'Tiga proyek pertama tidak dipungut biaya.',
      ctaPrimary: 'Buat akun',
      ctaOutline: 'Lihat produknya',
    },
  },

  en: {
    meta: {
      title: 'About — GeoFold',
      description:
        'Why GeoFold exists: field photos that lose their location the moment they are forwarded, and records nobody can vouch for six months later.',
    },
    eyebrow: 'About',
    h1: { before: 'Built for people who ', em: 'actually', after: ' go out there.' },
    lede:
      'GeoFold came out of one small, expensive problem: a survey photo that, six months later, nobody can prove where it was taken.',
    story: {
      p1: 'A field survey team usually runs three tools at once: the phone camera for photos, a separate GPS app for coordinates, and a spreadsheet to tie the two together. While it is all still fresh, that feels like enough.',
      p2: 'The trouble comes later. The photo goes through WhatsApp and its location metadata is gone. Files get copied again, filenames change, the order gets shuffled. When the report has to stand up, nobody can say for certain which photo was taken at which point.',
      p3: {
        before: 'GeoFold writes the coordinates, accuracy and time ',
        strong: 'into the image',
        after:
          ', then stores the same figures in the database alongside the form fields you defined yourself. One app, one queue, one export — and evidence that survives the photo changing hands.',
      },
    },
    pillarsKick: 'What we hold to',
    pillarsTitle: 'Three things we do not compromise on.',
    pillars: [
      {
        t: 'Offline first',
        b: 'Designed for a full day beyond signal. Points are held on the device and wait; there is nothing to remember to send by hand.',
      },
      {
        t: 'Evidence, not just a photo',
        b: 'Coordinates, accuracy and time are printed into the image and stored in the database. Both travel wherever the photo goes.',
      },
      {
        t: 'The data stays yours',
        b: 'A full export to Excel or CSV any time, on any plan, the free one included. Nothing here locks your data in.',
      },
    ],
    whoKick: 'Who is behind it',
    whoBody: {
      before:
        'GeoFold is built and operated from Pontianak, West Kalimantan. The full address, phone number and opening hours are on the ',
      link: 'contact page',
      after: '.',
    },
    email: {
      before: 'A question, a feature request, or a government procurement requirement? Email ',
      after:
        '. Feedback from teams actually using it in the field is what decides what gets built next.',
    },
    close: {
      title: 'Try it first, free.',
      body: 'The first three projects cost nothing.',
      ctaPrimary: 'Create an account',
      ctaOutline: 'See the product',
    },
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const c = copy[await getLocale()]
  return { title: c.meta.title, description: c.meta.description }
}

export default async function AboutPage() {
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

      <section className="mk-sec">
        <div className="mk-why" style={{ maxWidth: '68ch' }}>
          <p style={{ color: 'var(--mk-prose)' }}>{c.story.p1}</p>
          <p style={{ color: 'var(--mk-prose)' }}>{c.story.p2}</p>
          <p style={{ color: 'var(--mk-prose)' }}>
            {c.story.p3.before}
            <strong>{c.story.p3.strong}</strong>
            {c.story.p3.after}
          </p>
        </div>
      </section>

      <section className="mk-sec mk-sec-tint">
        <div className="mk-sec-head">
          <span className="mk-kick">{c.pillarsKick}</span>
          <h2>{c.pillarsTitle}</h2>
        </div>
        <div className="mk-recs">
          {c.pillars.map((p) => (
            <div className="mk-rec" key={p.t}>
              <div className="mk-rec-t">{p.t}</div>
              <div className="mk-rec-b">{p.b}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mk-sec">
        <div className="mk-sec-head">
          <span className="mk-kick">{c.whoKick}</span>
          <h2>{OPERATOR}</h2>
          <p>
            {c.whoBody.before}
            <Link href="/contact">{c.whoBody.link}</Link>
            {c.whoBody.after}
          </p>
        </div>
        <p style={{ padding: '0 var(--mk-pad)', fontSize: 14, color: 'var(--mk-muted)', margin: 0 }}>
          {c.email.before}
          <a
            href={`mailto:${BUSINESS.email.general}`}
            style={{ color: 'var(--mk-green)', textDecoration: 'underline' }}>
            {BUSINESS.email.general}
          </a>
          {c.email.after}
        </p>
      </section>

      <section className="mk-close">
        <h2>{c.close.title}</h2>
        <p>{c.close.body}</p>
        <div className="mk-h-cta">
          <Link href="/login" className="mk-btn mk-btn-primary">
            {c.close.ctaPrimary}
          </Link>
          <Link href="/product" className="mk-btn mk-btn-outline">
            {c.close.ctaOutline}
          </Link>
        </div>
      </section>
    </>
  )
}
