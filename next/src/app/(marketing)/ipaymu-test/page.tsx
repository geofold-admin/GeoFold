import type { Metadata } from 'next'
import Link from 'next/link'
import { BUSINESS } from '@/lib/business'
import type { Locale } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'

type Copy = { meta: { title: string; description: string }; eyebrow: string; title: string; body: string; cancelled: string; note: string; back: string; contact: string }

const copy: Record<Locale, Copy> = {
  id: {
    meta: { title: 'Uji iPaymu | GeoFold', description: 'Halaman kembali untuk uji integrasi sandbox iPaymu GeoFold.' },
    eyebrow: 'Uji integrasi iPaymu', title: 'Kembali dari halaman pembayaran.',
    body: 'Ini adalah uji sandbox untuk verifikasi integrasi iPaymu. Tidak membuat akun GeoFold, tidak mengaktifkan Premium, dan tidak menagih pembayaran produksi.',
    cancelled: 'Pembayaran sandbox dibatalkan atau belum diselesaikan. Anda dapat kembali ke halaman harga untuk mencoba lagi.',
    note: 'Untuk membeli Premium sebenarnya, buat akun lalu mulai pembayaran dari halaman Subscription.',
    back: 'Kembali ke harga', contact: 'Hubungi dukungan',
  },
  en: {
    meta: { title: 'iPaymu test | GeoFold', description: 'Return page for GeoFold’s iPaymu sandbox integration test.' },
    eyebrow: 'iPaymu integration test', title: 'Back from the payment page.',
    body: 'This is a sandbox test for iPaymu integration verification. It does not create a GeoFold account, activate Premium, or charge a production payment.',
    cancelled: 'The sandbox payment was cancelled or not completed. You can return to pricing to try again.',
    note: 'To buy Premium for real, create an account and start payment from Subscription.',
    back: 'Back to pricing', contact: 'Contact support',
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const c = copy[await getLocale()]
  return c.meta
}

export default async function IpaymuTestPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const c = copy[await getLocale()]
  const { cancelled } = await searchParams
  return (
    <div className="mk">
      <section className="mk-hero pad-b-sm"><span className="mk-eyebrow">{c.eyebrow}</span><h1 style={{ maxWidth: 700 }}>{c.title}</h1></section>
      <section className="mk-sec tight"><div className="mk-ipaymu-result">
        <p>{cancelled === '1' ? c.cancelled : c.body}</p>
        <p className="mk-ipaymu-result-note">{c.note}</p>
        <div className="mk-h-cta"><Link href="/pricing" className="mk-btn mk-btn-primary">{c.back}</Link><a href={`mailto:${BUSINESS.email.support}`} className="mk-btn mk-btn-outline">{c.contact}</a></div>
      </div></section>
    </div>
  )
}
