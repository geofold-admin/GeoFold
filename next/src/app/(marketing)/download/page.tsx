import type { Metadata } from 'next'
import Link from 'next/link'
import { ANDROID_MIN, APP_DOWNLOADS, BUSINESS } from '@/lib/business'
import { LangSwitch } from '../LangSwitch'

export const metadata: Metadata = {
  title: 'Unduh aplikasi Android — GeoFold',
  description:
    'Unduh aplikasi Android GeoFold: survei lapangan berbasis GPS, bekerja offline, sinkron otomatis. Termasuk versi drone DJI.',
}

const anyPublished = APP_DOWNLOADS.some((d) => d.url)

function Builds({ lang }: { lang: 'id' | 'en' }) {
  return (
    <dl className="mk-rows">
      {APP_DOWNLOADS.map((d) => (
        <div className="mk-row" key={d.id}>
          <dt>{d.name}</dt>
          <dd>
            {d.summary[lang]}
            <br />
            <span style={{ opacity: 0.7, fontSize: 13 }}>
              {d.packageName} · {d.size}
            </span>
            <br />
            {d.url ? (
              <a href={d.url} rel="noreferrer noopener">
                {lang === 'id' ? 'Unduh APK' : 'Download APK'} →
              </a>
            ) : (
              <span style={{ opacity: 0.7, fontSize: 13 }}>
                {lang === 'id' ? (
                  <>
                    Belum tersedia untuk unduhan publik — minta melalui{' '}
                    <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>.
                  </>
                ) : (
                  <>
                    Not yet published for public download — request it from{' '}
                    <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>.
                  </>
                )}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Indonesian() {
  return (
    <div className="mk-doc">
      <h2>Aplikasi yang tersedia</h2>
      <p>
        Ketiganya adalah aplikasi survei yang sama dan memakai akun serta data yang sama. Versi drone
        menambahkan layar penerbangan di atasnya, dan dipasang berdampingan dengan versi standar.
      </p>
      <Builds lang="id" />

      <h2>Cara memasang</h2>
      <ol>
        <li>Unduh berkas APK melalui peramban di ponsel Android Anda.</li>
        <li>
          Buka berkas yang terunduh. Android akan meminta izin{' '}
          <strong>&quot;Install unknown apps&quot;</strong> untuk peramban tersebut — izinkan sekali,
          lalu kembali dan buka berkasnya lagi.
        </li>
        <li>Ketuk <strong>Install</strong>, lalu buka aplikasinya.</li>
        <li>
          Masuk dengan email dan kata sandi, atau dengan Google. Akun yang sama berlaku untuk versi
          web di <a href={BUSINESS.site}>{BUSINESS.site.replace(/^https?:\/\//, '')}</a>.
        </li>
      </ol>

      <h2>Kebutuhan perangkat</h2>
      <ul>
        <li>Android {ANDROID_MIN} atau lebih baru.</li>
        <li>GPS. Tanpa GPS, koordinat harus dimasukkan manual.</li>
        <li>Kamera, untuk memotret titik survei.</li>
        <li>
          Ruang penyimpanan sekitar 500 MB, karena foto disimpan di perangkat sampai berhasil
          disinkronkan.
        </li>
        <li>Untuk versi drone: aircraft DJI yang didukung dan kabel data ke remote control.</li>
      </ul>

      <h2>Izin yang diminta dan alasannya</h2>
      <ul>
        <li>
          <strong>Lokasi</strong> — hanya saat Anda mengambil titik survei, untuk menuliskan
          koordinat. Tidak ada pelacakan di latar belakang.
        </li>
        <li>
          <strong>Kamera</strong> — untuk memotret titik survei.
        </li>
        <li>
          <strong>Penyimpanan / foto</strong> — untuk melampirkan foto yang sudah Anda ambil.
        </li>
      </ul>
      <p>
        Rincian selengkapnya ada pada <Link href="/privacy">Kebijakan Privasi</Link>.
      </p>

      <h2>Mengapa tidak melalui Google Play?</h2>
      <p>
        Aplikasi ini didistribusikan langsung agar tim lapangan dapat memasang versi tertentu, dan
        agar ketiga versi dapat berdampingan pada satu perangkat.
      </p>
      <p>
        Konsekuensinya: pemeriksaan otomatis Google Play tidak berlaku di sini. Unduh hanya dari
        halaman ini. Bila Anda menerima berkas APK dari sumber lain yang mengaku sebagai GeoFold,
        jangan pasang — mintalah verifikasi ke{' '}
        <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a> terlebih dahulu.
      </p>

      <h2>Butuh bantuan?</h2>
      <p>
        Email <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>, telepon atau
        WhatsApp <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>, atau lihat{' '}
        <Link href="/faq">FAQ</Link>.
      </p>
    </div>
  )
}

function English() {
  return (
    <div className="mk-doc">
      <h2>Available builds</h2>
      <p>
        All three are the same survey app on the same account and the same data. The drone builds add
        a flight screen on top, and install alongside the standard build rather than replacing it.
      </p>
      <Builds lang="en" />

      <h2>How to install</h2>
      <ol>
        <li>Download the APK in a browser on your Android phone.</li>
        <li>
          Open the downloaded file. Android asks for the{' '}
          <strong>&quot;Install unknown apps&quot;</strong> permission for that browser — allow it
          once, then go back and open the file again.
        </li>
        <li>
          Tap <strong>Install</strong>, then open the app.
        </li>
        <li>
          Sign in with an email and password, or with Google. The same account works on the web at{' '}
          <a href={BUSINESS.site}>{BUSINESS.site.replace(/^https?:\/\//, '')}</a>.
        </li>
      </ol>

      <h2>Device requirements</h2>
      <ul>
        <li>Android {ANDROID_MIN} or newer.</li>
        <li>GPS. Without it, coordinates have to be entered by hand.</li>
        <li>A camera, to photograph the survey point.</li>
        <li>About 500 MB free, since photos stay on the device until they sync.</li>
        <li>For the drone builds: a supported DJI aircraft and a data cable to the controller.</li>
      </ul>

      <h2>Permissions, and why</h2>
      <ul>
        <li>
          <strong>Location</strong> — only while you capture a survey point, to write its
          coordinates. No background tracking.
        </li>
        <li>
          <strong>Camera</strong> — to photograph the survey point.
        </li>
        <li>
          <strong>Storage / photos</strong> — to attach a photo you already took.
        </li>
      </ul>
      <p>
        The full detail is in the <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Why not Google Play?</h2>
      <p>
        The app is distributed directly so field teams can pin a specific version and so all three
        builds can sit on one device.
      </p>
      <p>
        The trade-off is that Google Play&apos;s automated checks do not apply here. Download only
        from this page. If someone sends you an APK claiming to be GeoFold, do not install it —
        check with <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a> first.
      </p>

      <h2>Need help?</h2>
      <p>
        Email <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>, call or
        WhatsApp <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>, or see the{' '}
        <Link href="/faq">FAQ</Link>.
      </p>
    </div>
  )
}

export default function DownloadPage() {
  return (
    <>
      <div className="mk-hero pad-b-sm">
        <span className="mk-eyebrow">Unduh / Download</span>
        <h1 style={{ maxWidth: 700 }}>Aplikasi Android GeoFold.</h1>
        <p className="mk-lede" style={{ maxWidth: 560 }}>
          Survei lapangan berbasis GPS yang bekerja penuh secara offline, lalu menyinkronkan sendiri
          begitu ada sinyal.
          <br />
          GPS field survey that works fully offline and syncs itself once there is signal.
        </p>
      </div>

      <div className="mk-section tight">
        {!anyPublished && (
          <div className="mk-doc" style={{ marginBottom: 32 }}>
            <div className="mk-callout">
              <p>
                <strong>Belum ada tautan unduhan publik.</strong> Berkas pemasangan dikirim langsung
                atas permintaan — email{' '}
                <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a> dan
                sebutkan versi mana yang Anda butuhkan. Versi web tersedia sekarang di{' '}
                <Link href="/login">halaman masuk</Link> dan menjalankan seluruh fungsi kecuali
                pengambilan data di lapangan.
              </p>
            </div>
          </div>
        )}
        <LangSwitch id={<Indonesian />} en={<English />} />
      </div>
    </>
  )
}
