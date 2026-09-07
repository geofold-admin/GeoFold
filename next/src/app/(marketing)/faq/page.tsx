import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ANDROID_MIN, BUSINESS } from '@/lib/business'
import { PREMIUM_DAYS, PREMIUM_PRICE_LABEL } from '@/lib/pricing'
import { LangSwitch } from '../LangSwitch'

export const metadata: Metadata = {
  title: 'FAQ — GeoFold',
  description:
    'Pertanyaan yang sering diajukan tentang GeoFold: akun, harga, metode pembayaran, pengembalian dana, data dan dukungan.',
}

type QA = { q: string; a: ReactNode }
type Group = { title: string; items: QA[] }

const mail = (address: string) => <a href={`mailto:${address}`}>{address}</a>

/* ------------------------------------------------------------------ Bahasa Indonesia */

const GROUPS_ID: Group[] = [
  {
    title: 'Tentang GeoFold',
    items: [
      {
        q: 'Apa itu GeoFold?',
        a: 'GeoFold adalah alat survei lapangan berbasis GPS. Setiap titik survei terdiri dari foto yang koordinatnya tercetak langsung pada gambar, posisi GPS beserta akurasinya, waktu pengambilan, dan isian formulir yang Anda tentukan sendiri per proyek. Data dapat dilihat di peta, diekspor ke CSV atau Excel, dan digunakan sebagai bukti lapangan.',
      },
      {
        q: 'Siapa yang menggunakan GeoFold?',
        a: 'Tim survei lapangan: konservasi satwa liar, kehutanan, perkebunan dan pertanian, konsultan lingkungan, pemetaan aset, serta instansi yang membutuhkan catatan lapangan yang dapat diaudit.',
      },
      {
        q: 'Apakah GeoFold butuh koneksi internet?',
        a: 'Tidak untuk pengambilan data. Aplikasi dirancang bekerja penuh secara offline — foto dan titik tersimpan di perangkat, lalu terkirim otomatis ke server begitu ada sinyal. Melihat peta dan mengekspor data membutuhkan koneksi.',
      },
      {
        q: 'Perangkat apa saja yang didukung?',
        a: `Aplikasi Android (Android ${ANDROID_MIN} ke atas) untuk pengambilan data di lapangan, dan versi web melalui peramban untuk mengelola proyek, melihat peta, dan mengekspor. Keduanya memakai akun yang sama dan data yang sama. Tersedia pula versi khusus drone DJI untuk pengambilan foto udara.`,
      },
    ],
  },
  {
    title: 'Akun & aplikasi',
    items: [
      {
        q: 'Bagaimana cara membuat akun?',
        a: (
          <>
            Buka <Link href="/login">halaman masuk</Link>, lalu daftar dengan email dan kata sandi,
            atau gunakan tombol <strong>Continue with Google</strong>. Akun gratis, tidak memerlukan
            kartu kredit, dan langsung dapat dipakai.
          </>
        ),
      },
      {
        q: 'Saya lupa kata sandi.',
        a: (
          <>
            Gunakan <Link href="/reset">halaman atur ulang kata sandi</Link>. Tautan pemulihan akan
            dikirim ke email Anda. Jika Anda mendaftar lewat Google, masuklah kembali lewat Google —
            akun tersebut tidak memiliki kata sandi terpisah.
          </>
        ),
      },
      {
        q: 'Di mana saya mengunduh aplikasi Android-nya?',
        a: (
          <>
            Dari <Link href="/download">halaman unduhan</Link>. Berkas APK dipasang langsung
            (sideload); Android akan meminta izin &quot;Install unknown apps&quot; sekali untuk
            peramban yang Anda pakai mengunduh. Petunjuk lengkapnya ada di halaman tersebut.
          </>
        ),
      },
      {
        q: 'Apakah saya harus mengisi profil sebelum memakai aplikasi?',
        a: 'Ya. Saat pertama masuk, Anda diminta melengkapi nama, nomor WhatsApp, dan domisili, serta menyetujui Syarat & Ketentuan dan Kebijakan Privasi. Ini hanya sekali, dan persetujuan tersebut adalah catatan hukum atas penggunaan layanan.',
      },
    ],
  },
  {
    title: 'Harga & pembayaran',
    items: [
      {
        q: 'Berapa biaya GeoFold?',
        a: (
          <>
            Paket <strong>Gratis</strong> berharga Rp 0 selamanya: hingga 3 proyek, 20 foto per
            proyek, serta batas harian untuk pengambilan dan pengunggahan. Paket{' '}
            <strong>Premium</strong> berharga <strong>{PREMIUM_PRICE_LABEL}</strong> untuk{' '}
            <strong>{PREMIUM_DAYS} hari</strong>. Rinciannya ada di{' '}
            <Link href="/pricing">halaman harga</Link>.
          </>
        ),
      },
      {
        q: 'Apa yang saya dapatkan dengan Premium?',
        a: 'Proyek, survei, dan foto tanpa batas; tidak ada batas harian; akses peta survei (tampilan satelit dan jalan); serta dukungan prioritas.',
      },
      {
        q: 'Metode pembayaran apa saja yang diterima?',
        a: (
          <>
            Pembayaran diproses melalui penyedia gerbang pembayaran (payment gateway) berizin di
            Indonesia. Metode yang tersedia ditampilkan pada halaman pembayaran saat Anda
            bertransaksi, dan umumnya mencakup:
            <ul>
              <li>QRIS</li>
              <li>Transfer bank / virtual account</li>
              <li>Dompet digital (e-wallet)</li>
              <li>Kartu kredit dan kartu debit</li>
              <li>Pembayaran di gerai ritel</li>
            </ul>
            GeoFold <strong>tidak pernah menerima, melihat, atau menyimpan</strong> nomor kartu, CVV,
            PIN, atau OTP Anda. Seluruh data pembayaran ditangani langsung oleh gerbang pembayaran.
          </>
        ),
      },
      {
        q: 'Mata uang apa yang digunakan?',
        a: 'Rupiah Indonesia (IDR). Harga yang ditampilkan adalah harga akhir yang Anda bayar; tidak ada biaya tersembunyi. Biaya administrasi bank atau dompet digital, bila ada, dikenakan oleh penyedia tersebut dan berada di luar kendali kami.',
      },
      {
        q: 'Apakah Premium diperpanjang otomatis (auto-debit)?',
        a: (
          <>
            <strong>Tidak.</strong> Premium adalah pembelian sekali bayar untuk {PREMIUM_DAYS} hari.
            Tidak ada penagihan berulang, tidak ada auto-debit, dan tidak ada yang perlu dibatalkan.
            Jika masa aktif habis dan Anda tidak membeli lagi, akun kembali ke paket Gratis dengan
            sendirinya.
          </>
        ),
      },
      {
        q: 'Kapan Premium saya aktif setelah membayar?',
        a: (
          <>
            Segera setelah gerbang pembayaran mengonfirmasi transaksi — pada umumnya kurang dari 5
            menit. Untuk metode seperti transfer bank manual atau pembayaran di gerai, konfirmasi
            dapat memakan waktu lebih lama sesuai proses penyedia. Jika lebih dari 1 jam sejak
            pembayaran berhasil dan status masih belum berubah, hubungi kami di{' '}
            {mail(BUSINESS.email.billing)} dengan menyertakan bukti pembayaran.
          </>
        ),
      },
      {
        q: 'Bagaimana saya mendapatkan bukti pembayaran atau invoice?',
        a: (
          <>
            Gerbang pembayaran mengirimkan tanda terima ke email yang Anda gunakan saat
            bertransaksi, dan setiap transaksi tercatat pada halaman <strong>Subscription</strong> di
            dalam aplikasi. Jika Anda memerlukan invoice atas nama perusahaan, kirim permintaan ke{' '}
            {mail(BUSINESS.email.billing)} beserta nama, alamat, dan NPWP perusahaan.
          </>
        ),
      },
      {
        q: 'Pembayaran saya berhasil, tetapi Premium belum aktif. Apa yang harus saya lakukan?',
        a: (
          <>
            Lakukan berurutan:
            <ul>
              <li>Tutup dan buka kembali aplikasi, lalu muat ulang halaman Subscription.</li>
              <li>Pastikan Anda masuk dengan akun yang sama seperti saat melakukan pembayaran.</li>
              <li>
                Jika masih belum aktif setelah 1 jam, kirim email ke {mail(BUSINESS.email.billing)}{' '}
                dengan nomor pesanan (order ID), tanggal dan jam pembayaran, jumlah, metode
                pembayaran, dan email akun Anda. Kami menyelesaikannya dalam{' '}
                {BUSINESS.responseTime.id}.
              </li>
            </ul>
          </>
        ),
      },
      {
        q: 'Dana saya terpotong tetapi transaksi dinyatakan gagal.',
        a: (
          <>
            Transaksi yang gagal atau kedaluwarsa tidak pernah diteruskan ke kami. Dana yang tertahan
            umumnya dikembalikan otomatis oleh bank atau penerbit kartu Anda dalam 7–14 hari kerja.
            Jika setelah 14 hari kerja dana belum kembali, hubungi {mail(BUSINESS.email.billing)}{' '}
            dengan bukti mutasi rekening dan kami akan menelusurinya bersama gerbang pembayaran.
          </>
        ),
      },
      {
        q: 'Apa itu kunci aktivasi (activation key)?',
        a: 'Kode yang dapat ditukarkan menjadi masa Premium tanpa melalui pembayaran daring — dipakai untuk pengadaan instansi, program pelatihan, atau kompensasi dukungan. Tukarkan pada halaman Subscription. Setiap kode hanya dapat dipakai satu kali.',
      },
      {
        q: 'Apa yang terjadi ketika masa Premium habis?',
        a: (
          <>
            <strong>Data Anda tidak pernah dihapus.</strong> Jika saat itu isi workspace melampaui
            batas paket Gratis, workspace dibekukan: seluruh data tetap dapat dibaca, dilihat di
            peta, dan diekspor — hanya penambahan data baru yang dihentikan sampai Anda memperpanjang
            Premium atau kembali di bawah batas Gratis.
          </>
        ),
      },
    ],
  },
  {
    title: 'Pembatalan & pengembalian dana',
    items: [
      {
        q: 'Bisakah saya meminta pengembalian dana?',
        a: (
          <>
            Bisa, dengan syarat tertentu. Permintaan yang diajukan dalam{' '}
            <strong>7 hari kalender</strong> sejak pembayaran dan sebelum manfaat Premium
            dimanfaatkan secara berarti akan dikembalikan penuh. Ketentuan lengkap, pengecualian, dan
            tata caranya ada di <Link href="/refund-policy">Kebijakan Pengembalian Dana</Link>.
          </>
        ),
      },
      {
        q: 'Berapa lama proses pengembalian dana?',
        a: 'Kami memutuskan permintaan dalam 3 hari kerja. Setelah disetujui, dana diproses dalam 7 hari kerja, lalu bank atau penerbit kartu Anda membutuhkan tambahan waktu sesuai kebijakannya (umumnya 7–14 hari kerja).',
      },
      {
        q: 'Bagaimana cara membatalkan langganan?',
        a: `Tidak ada yang perlu dibatalkan. Premium tidak diperpanjang otomatis — masa aktif ${PREMIUM_DAYS} hari berakhir dengan sendirinya. Anda juga dapat berhenti memakai layanan dan menghapus akun kapan saja.`,
      },
    ],
  },
  {
    title: 'Data, privasi & keamanan',
    items: [
      {
        q: 'Siapa pemilik data survei saya?',
        a: 'Anda. Data survei Anda tetap milik Anda pada paket apa pun, dan dapat diekspor atau dihapus kapan saja.',
      },
      {
        q: 'Di mana data saya disimpan?',
        a: 'Pada basis data Postgres dan penyimpanan objek Supabase. Foto disimpan pada bucket privat dan hanya disajikan melalui tautan bertanda tangan yang berumur pendek. Data setiap akun terpisah satu sama lain.',
      },
      {
        q: 'Apakah aplikasi melacak lokasi saya di latar belakang?',
        a: 'Tidak. Lokasi dan kamera hanya diakses pada saat Anda mengambil satu titik survei, dan hanya untuk menuliskan koordinat serta foto ke titik tersebut.',
      },
      {
        q: 'Bagaimana cara menghapus akun dan seluruh data saya?',
        a: (
          <>
            Kirim permintaan dari alamat email akun Anda ke {mail(BUSINESS.email.support)}. Akun
            beserta seluruh proyek, survei, dan foto akan dihapus. Catatan transaksi pembayaran
            disimpan selama masa yang diwajibkan peraturan perpajakan dan akuntansi.
          </>
        ),
      },
      {
        q: 'Apakah data saya dijual atau dibagikan?',
        a: (
          <>
            Tidak. Data tidak dijual. Data hanya dibagikan kepada penyedia infrastruktur yang
            diperlukan untuk menjalankan layanan (hosting, basis data, gerbang pembayaran), dan bila
            diwajibkan oleh hukum. Lihat <Link href="/privacy">Kebijakan Privasi</Link>.
          </>
        ),
      },
    ],
  },
  {
    title: 'Dukungan',
    items: [
      {
        q: 'Bagaimana cara menghubungi GeoFold?',
        a: (
          <>
            Email {mail(BUSINESS.email.support)}, telepon atau WhatsApp{' '}
            <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>, atau melalui{' '}
            <Link href="/contact">halaman kontak</Link>. Jam operasional {BUSINESS.hours.id}. Kami
            menjawab dalam {BUSINESS.responseTime.id}.
          </>
        ),
      },
      {
        q: 'Saya menemukan masalah teknis. Informasi apa yang perlu saya sertakan?',
        a: 'Sertakan email akun Anda, nama proyek, referensi survei bila ada, versi aplikasi, model perangkat, dan tangkapan layar. Untuk masalah sinkronisasi, sebutkan juga jumlah titik yang tertahan pada layar Sync.',
      },
    ],
  },
]

/* ------------------------------------------------------------------------- English */

const GROUPS_EN: Group[] = [
  {
    title: 'About GeoFold',
    items: [
      {
        q: 'What is GeoFold?',
        a: 'GeoFold is a GPS field survey tool. Every survey point is a photo with its coordinates burned into the image, a GPS position with its accuracy, a capture timestamp, and whatever form fields you define per project. Points appear on a map, export to CSV or Excel, and stand up as field evidence.',
      },
      {
        q: 'Who uses it?',
        a: 'Field survey teams: wildlife conservation, forestry, plantations and agriculture, environmental consultants, asset mapping, and agencies that need an auditable field record.',
      },
      {
        q: 'Does GeoFold need an internet connection?',
        a: 'Not for capture. The app is built to work fully offline — photos and points are stored on the device and upload automatically once there is signal. Viewing the map and exporting need a connection.',
      },
      {
        q: 'Which devices are supported?',
        a: `An Android app (Android ${ANDROID_MIN} and above) for capture in the field, and a web version in the browser for managing projects, viewing the map and exporting. Both use the same account and the same data. There is also a DJI drone build for aerial capture.`,
      },
    ],
  },
  {
    title: 'Account & app',
    items: [
      {
        q: 'How do I create an account?',
        a: (
          <>
            Open the <Link href="/login">sign-in page</Link> and register with an email and password,
            or use <strong>Continue with Google</strong>. Accounts are free, need no card, and work
            immediately.
          </>
        ),
      },
      {
        q: 'I forgot my password.',
        a: (
          <>
            Use the <Link href="/reset">password reset page</Link>. A recovery link is emailed to
            you. If you registered through Google, sign in with Google again — that account has no
            separate password.
          </>
        ),
      },
      {
        q: 'Where do I download the Android app?',
        a: (
          <>
            From the <Link href="/download">download page</Link>. The APK is installed directly
            (sideloaded); Android asks once for the &quot;Install unknown apps&quot; permission for
            the browser you download with. Full instructions are on that page.
          </>
        ),
      },
      {
        q: 'Do I have to complete a profile first?',
        a: 'Yes. On first sign-in you are asked for your name, WhatsApp number and domicile, and to accept the Terms and Privacy Policy. It happens once, and that acceptance is the legal record of your use of the service.',
      },
    ],
  },
  {
    title: 'Pricing & payment',
    items: [
      {
        q: 'What does GeoFold cost?',
        a: (
          <>
            The <strong>Free</strong> plan is Rp 0 forever: up to 3 projects, 20 photos per project,
            and daily caps on capture and upload. <strong>Premium</strong> is{' '}
            <strong>{PREMIUM_PRICE_LABEL}</strong> for <strong>{PREMIUM_DAYS} days</strong>. Full
            detail on the <Link href="/pricing">pricing page</Link>.
          </>
        ),
      },
      {
        q: 'What does Premium include?',
        a: 'Unlimited projects, surveys and photos; no daily caps; access to the survey map (satellite and street); and priority support.',
      },
      {
        q: 'Which payment methods do you accept?',
        a: (
          <>
            Payments are processed by a licensed Indonesian payment gateway. The methods available
            are shown on the payment page at checkout, and typically include:
            <ul>
              <li>QRIS</li>
              <li>Bank transfer / virtual account</li>
              <li>E-wallets</li>
              <li>Credit and debit cards</li>
              <li>Retail outlet payment</li>
            </ul>
            GeoFold <strong>never receives, sees or stores</strong> your card number, CVV, PIN or
            OTP. All payment data is handled directly by the gateway.
          </>
        ),
      },
      {
        q: 'Which currency is used?',
        a: 'Indonesian Rupiah (IDR). The price shown is the final price you pay; there are no hidden charges. Any bank or e-wallet administration fee is charged by that provider and is outside our control.',
      },
      {
        q: 'Does Premium renew automatically?',
        a: (
          <>
            <strong>No.</strong> Premium is a one-off purchase of {PREMIUM_DAYS} days. There is no
            recurring billing, no auto-debit, and nothing to cancel. When the period ends without a
            new purchase, the account simply returns to the Free plan.
          </>
        ),
      },
      {
        q: 'How soon is Premium active after I pay?',
        a: (
          <>
            As soon as the gateway confirms the transaction — usually under 5 minutes. Methods such
            as manual bank transfer or retail outlet payment can take longer to confirm, per the
            provider. If more than 1 hour has passed since a successful payment and nothing has
            changed, email {mail(BUSINESS.email.billing)} with your proof of payment.
          </>
        ),
      },
      {
        q: 'How do I get a receipt or invoice?',
        a: (
          <>
            The gateway emails a receipt to the address used at checkout, and every transaction is
            listed on the <strong>Subscription</strong> page in the app. If you need a company
            invoice, email {mail(BUSINESS.email.billing)} with the company name, address and tax
            number.
          </>
        ),
      },
      {
        q: 'My payment succeeded but Premium is not active.',
        a: (
          <>
            In order:
            <ul>
              <li>Close and reopen the app, then reload the Subscription page.</li>
              <li>Check you are signed in as the same account you paid from.</li>
              <li>
                Still not active after 1 hour — email {mail(BUSINESS.email.billing)} with the order
                ID, date and time of payment, amount, payment method and your account email. We
                resolve these within {BUSINESS.responseTime.en}.
              </li>
            </ul>
          </>
        ),
      },
      {
        q: 'I was debited but the transaction failed.',
        a: (
          <>
            Failed or expired transactions never reach us. Held funds are normally released
            automatically by your bank or card issuer within 7–14 business days. If nothing has
            returned after 14 business days, email {mail(BUSINESS.email.billing)} with your account
            statement and we will trace it with the gateway.
          </>
        ),
      },
      {
        q: 'What is an activation key?',
        a: 'A code redeemable for Premium time without an online payment — used for agency procurement, training programmes, or support goodwill. Redeem it on the Subscription page. Each key works once.',
      },
      {
        q: 'What happens when Premium expires?',
        a: (
          <>
            <strong>Your data is never deleted.</strong> If the workspace is over the Free limits at
            that moment it is frozen: everything stays readable, mappable and exportable, and only
            new captures stop until you renew or come back under the Free limits.
          </>
        ),
      },
    ],
  },
  {
    title: 'Cancellation & refunds',
    items: [
      {
        q: 'Can I get a refund?',
        a: (
          <>
            Yes, under stated conditions. Requests made within <strong>7 calendar days</strong> of
            payment, before Premium has been used in any material way, are refunded in full. The full
            terms, exclusions and process are in the{' '}
            <Link href="/refund-policy">Refund Policy</Link>.
          </>
        ),
      },
      {
        q: 'How long does a refund take?',
        a: 'We decide a request within 3 business days. Once approved, the refund is processed within 7 business days, after which your bank or card issuer needs its own additional time (typically 7–14 business days).',
      },
      {
        q: 'How do I cancel my subscription?',
        a: `There is nothing to cancel. Premium does not auto-renew — the ${PREMIUM_DAYS}-day period simply ends. You can also stop using the service and delete your account at any time.`,
      },
    ],
  },
  {
    title: 'Data, privacy & security',
    items: [
      {
        q: 'Who owns my survey data?',
        a: 'You do. Your survey data stays yours on every plan, and can be exported or deleted at any time.',
      },
      {
        q: 'Where is my data stored?',
        a: 'In a Supabase Postgres database and object storage. Photos live in a private bucket and are served only through short-lived signed links. Every account is isolated from every other.',
      },
      {
        q: 'Does the app track my location in the background?',
        a: 'No. Location and camera are accessed only while you capture a survey point, and only to write the coordinates and photo into that point.',
      },
      {
        q: 'How do I delete my account and all my data?',
        a: (
          <>
            Email {mail(BUSINESS.email.support)} from your account address. The account and all its
            projects, surveys and photos are removed. Payment transaction records are retained for as
            long as tax and accounting rules require.
          </>
        ),
      },
      {
        q: 'Is my data sold or shared?',
        a: (
          <>
            No. Data is not sold. It is shared only with the infrastructure providers needed to run
            the service (hosting, database, payment gateway), and where required by law. See the{' '}
            <Link href="/privacy">Privacy Policy</Link>.
          </>
        ),
      },
    ],
  },
  {
    title: 'Support',
    items: [
      {
        q: 'How do I contact GeoFold?',
        a: (
          <>
            Email {mail(BUSINESS.email.support)}, call or WhatsApp{' '}
            <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>, or use the{' '}
            <Link href="/contact">contact page</Link>. Hours are {BUSINESS.hours.en}. We reply within{' '}
            {BUSINESS.responseTime.en}.
          </>
        ),
      },
      {
        q: 'I hit a technical problem — what should I include?',
        a: 'Your account email, the project name, the survey reference if there is one, the app version, your device model, and a screenshot. For sync problems, also say how many points are held on the Sync screen.',
      },
    ],
  },
]

function Groups({ groups }: { groups: Group[] }) {
  return (
    <div className="mk-faq">
      {groups.map((group) => (
        <section key={group.title} className="mk-faq-group">
          <h2>{group.title}</h2>
          <div className="mk-faq-list">
            {group.items.map(({ q, a }) => (
              <div key={q}>
                <div className="mk-faq-q">{q}</div>
                <div className="mk-faq-a">{a}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export default function FaqPage() {
  return (
    <>
      <div className="mk-hero pad-b-sm">
        <span className="mk-eyebrow">FAQ</span>
        <h1 style={{ maxWidth: 700 }}>Pertanyaan yang sering diajukan.</h1>
        <p className="mk-lede" style={{ maxWidth: 560 }}>
          Akun, harga, pembayaran, pengembalian dana, dan data — dijawab lengkap.
          <br />
          Accounts, pricing, payment, refunds and your data — answered in full.
        </p>
      </div>

      <div className="mk-section tight">
        <LangSwitch id={<Groups groups={GROUPS_ID} />} en={<Groups groups={GROUPS_EN} />} />
      </div>

      <div className="mk-section tight" style={{ borderTop: '1px solid var(--mk-line)' }}>
        <div className="mk-inner">
          <h2 className="mk-centered-h2">Tidak menemukan jawabannya?</h2>
          <div className="mk-meta-grid">
            <div className="mk-meta">
              <div className="mk-meta-t">Email</div>
              <div className="mk-meta-b">{mail(BUSINESS.email.support)}</div>
            </div>
            <div className="mk-meta">
              <div className="mk-meta-t">Telepon / WhatsApp</div>
              <div className="mk-meta-b">
                <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>
              </div>
            </div>
            <div className="mk-meta">
              <div className="mk-meta-t">Lainnya</div>
              <div className="mk-meta-b">
                Lihat <Link href="/contact">halaman kontak</Link> untuk alamat usaha dan jam
                operasional.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
