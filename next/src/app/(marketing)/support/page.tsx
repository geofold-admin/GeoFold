import type { Metadata } from 'next'
import Link from 'next/link'
import { BUSINESS } from '@/lib/business'
import type { Locale } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'

/*
 * This page was English-only while the rest of the marketing site was Indonesian — a leftover
 * from before either language was a decision. The Indonesian below is the translation; the
 * English is the original wording, unchanged, because it is the copy that has been answering
 * these questions.
 *
 * The troubleshooting answers describe real behaviour of the app (pending rows, the separate
 * photo upload, the ±m accuracy record, the plan caps). If any of that changes, this page is one
 * of the places that goes stale silently — there is no test that catches a support answer that
 * has stopped being true.
 */

type Copy = {
  meta: { title: string; description: string }
  eyebrow: string
  h1: string
  lede: string
  troubleshooting: string
  topics: Array<{ q: string; a: string }>
  stillStuck: string
  tech: { t: string; after: string }
  billing: { t: string; mid: string; link: string; after: string }
  other: { t: string; before: string; faq: string; mid: string; form: string; after: string }
}

const copy: Record<Locale, Copy> = {
  id: {
    meta: {
      title: 'Dukungan — Geofold',
      description:
        'Bantuan untuk pengambilan titik di lapangan, sinkronisasi, ekspor dan langganan Geofold Anda.',
    },
    eyebrow: 'Dukungan',
    h1: 'Lepas dari macet.',
    lede:
      'Masalah yang sering muncul di lapangan, dan cara menghubungi orangnya kalau jawabannya tidak ada di sini.',
    troubleshooting: 'Pemecahan masalah',
    topics: [
      {
        q: 'Survei saya tertahan di status "pending"',
        a: 'Pending berarti titiknya sudah tersimpan di perangkat tapi belum sampai ke server — tidak ada yang hilang. Pengambilan titik memang dirancang berfungsi penuh tanpa sinyal. Buka layar Capture dan tekan "Sync now" begitu ada sinyal. Kalau masih tidak terkirim, keluar lalu masuk lagi: sesi yang kedaluwarsa memblokir unggahan.',
      },
      {
        q: 'Fotonya terunggah tapi titiknya tidak ada',
        a: 'Baris survei dan fotonya diunggah terpisah. Barisnya masuk lebih dulu, jadi titik yang hilang biasanya berarti survei itu sendiri ditolak — periksa apakah proyeknya masih ada dan isian formulirnya sudah lengkap.',
      },
      {
        q: 'Akurasi GPS buruk, atau tidak ada GPS sama sekali',
        a: 'Akurasi (±m) dicatat pada setiap titik supaya fix yang buruk tetap terlihat, bukan diam-diam dipercaya. Di peramban desktop sering tidak ada GPS yang bisa dipakai — gunakan "Enter manually" di layar Capture untuk mengetik koordinat desimal.',
      },
      {
        q: 'Saya kena batas dan tidak bisa mengambil titik',
        a: 'Ruang kerja gratis punya batas jumlah proyek, batas foto per proyek, dan batas harian untuk pengambilan dan unggahan. Data yang sudah ada selalu tetap bisa dibaca. Tukarkan kunci aktivasi atau naikkan paket untuk melepas batasnya.',
      },
      {
        q: 'Hasil ekspor terbuka jadi karakter aneh di Excel',
        a: 'Gunakan ekspor .xlsx alih-alih CSV kalau data Anda mengandung koma atau karakter non-Latin. Ekspor xlsx juga menanamkan fotonya ke dalam baris spreadsheet.',
      },
      {
        q: 'Aplikasi ponsel tidak bisa menjangkau server',
        a: 'Aplikasi perlu alamat server yang dikonfigurasi. Di ponsel, "localhost" berarti ponsel itu sendiri — alamatnya harus menunjuk ke alamat LAN komputer Anda atau ke URL yang sudah dideploy.',
      },
    ],
    stillStuck: 'Masih macet?',
    tech: {
      t: 'Dukungan teknis',
      after:
        ' — sertakan referensi surveinya (misalnya KAMPUNG-DURIAN-001) kalau menyangkut titik tertentu.',
    },
    billing: {
      t: 'Tagihan & kunci aktivasi',
      mid: ' — untuk masalah penukaran, sebutkan awalan kuncinya, jangan pernah kunci lengkapnya. Pengembalian dana mengikuti ',
      link: 'Kebijakan Pengembalian Dana',
      after: '.',
    },
    other: {
      t: 'Selain itu',
      before: 'Lihat ',
      faq: 'FAQ',
      mid: ', atau gunakan ',
      form: 'formulir kontak',
      after: '. Kami biasanya membalas dalam satu hari kerja.',
    },
  },

  en: {
    meta: {
      title: 'Support — Geofold',
      description: 'Help with field capture, syncing, exports and your Geofold subscription.',
    },
    eyebrow: 'Support',
    h1: 'Get unstuck.',
    lede: 'Common issues from the field, and how to reach a human when the answer is not here.',
    troubleshooting: 'Troubleshooting',
    topics: [
      {
        q: 'My surveys are stuck as "pending"',
        a: 'Pending means the point is saved on the device but has not reached the server yet — nothing is lost. Capture works fully offline by design. Open Capture and tap "Sync now" once you have signal. If it still will not clear, sign out and back in: an expired session blocks the upload.',
      },
      {
        q: 'The photo uploaded but the point is missing',
        a: 'The survey row and its photo upload separately. The row lands first, so a missing point usually means the survey itself was rejected — check that the project still exists and that its form fields are filled in.',
      },
      {
        q: 'GPS accuracy is poor, or there is no GPS at all',
        a: 'Accuracy (±m) is recorded with every point so bad fixes stay visible instead of being silently trusted. On a desktop browser there is often no usable GPS — use "Enter manually" on the Capture screen to type decimal-degree coordinates instead.',
      },
      {
        q: 'I hit a limit and cannot capture',
        a: 'Free workspaces have a project limit, a per-project photo limit and daily caps on captures and uploads. Existing data always stays readable. Redeem an activation key or upgrade to lift the limits.',
      },
      {
        q: 'Export opens as gibberish in Excel',
        a: 'Use the .xlsx export rather than CSV when your data contains commas or non-Latin characters. The xlsx export also embeds the photos into the spreadsheet rows.',
      },
      {
        q: 'The mobile app cannot reach the server',
        a: 'The app needs the server origin configured. On a phone, "localhost" means the phone itself — it must point at your machine’s LAN address or the deployed URL.',
      },
    ],
    stillStuck: 'Still stuck?',
    tech: {
      t: 'Technical support',
      after:
        ' — include the survey reference (e.g. KAMPUNG-DURIAN-001) if it is about a specific point.',
    },
    billing: {
      t: 'Billing & activation keys',
      mid: ' — for redemption problems, quote the key prefix, never the full key. Refunds follow the ',
      link: 'Refund Policy',
      after: '.',
    },
    other: {
      t: 'Everything else',
      before: 'See the ',
      faq: 'FAQ',
      mid: ', or use the ',
      form: 'contact form',
      after: '. We usually reply within a business day.',
    },
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const c = copy[await getLocale()]
  return { title: c.meta.title, description: c.meta.description }
}

export default async function SupportPage() {
  const c = copy[await getLocale()]

  return (
    <>
      <div className="mk-hero pad-b-sm">
        <span className="mk-eyebrow">{c.eyebrow}</span>
        <h1 style={{ maxWidth: 640 }}>{c.h1}</h1>
        <p className="mk-lede" style={{ maxWidth: 520 }}>
          {c.lede}
        </p>
      </div>

      <div className="mk-section tight">
        <div className="mk-faq">
          <h2>{c.troubleshooting}</h2>
          <div className="mk-faq-list">
            {c.topics.map(({ q, a }) => (
              <div key={q}>
                <div className="mk-faq-q">{q}</div>
                <div className="mk-faq-a">{a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mk-section tight" style={{ borderTop: '1px solid var(--mk-line)' }}>
        <div className="mk-inner">
          <h2 className="mk-centered-h2">{c.stillStuck}</h2>
          <div className="mk-meta-grid">
            <div className="mk-meta">
              <div className="mk-meta-t">{c.tech.t}</div>
              <div className="mk-meta-b">
                <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>
                {c.tech.after}
              </div>
            </div>
            <div className="mk-meta">
              <div className="mk-meta-t">{c.billing.t}</div>
              <div className="mk-meta-b">
                <a href={`mailto:${BUSINESS.email.billing}`}>{BUSINESS.email.billing}</a>
                {c.billing.mid}
                <Link href="/refund-policy">{c.billing.link}</Link>
                {c.billing.after}
              </div>
            </div>
            <div className="mk-meta">
              <div className="mk-meta-t">{c.other.t}</div>
              <div className="mk-meta-b">
                {c.other.before}
                <Link href="/faq">{c.other.faq}</Link>
                {c.other.mid}
                <Link href="/contact">{c.other.form}</Link>
                {c.other.after}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
