import type { Metadata } from 'next'
import Link from 'next/link'
import { ADDRESS_ONE_LINE, BUSINESS, OPERATOR } from '@/lib/business'
import { LangSwitch } from '../LangSwitch'
import { getLocale } from '@/lib/i18n.server'

export const metadata: Metadata = {
  title: 'Kebijakan Privasi (Privacy Policy) — GeoFold',
  description:
    'Data apa yang GeoFold kumpulkan, untuk apa digunakan, di mana disimpan, dengan siapa dibagikan, dan hak Anda atasnya.',
}

const UPDATED = '7 September 2026'
const support = <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>

function Indonesian() {
  return (
    <div className="mk-doc">
      <div className="mk-doc-updated">Berlaku sejak: {UPDATED}</div>

      <h2>1. Pengendali data</h2>
      <p>
        Pengendali data atas informasi yang dijelaskan di sini adalah <strong>{OPERATOR}</strong>,{' '}
        {ADDRESS_ONE_LINE}. Pertanyaan mengenai privasi dapat dikirim ke {support} atau melalui{' '}
        <Link href="/contact">halaman kontak</Link>.
      </p>

      <h2>2. Data yang kami kumpulkan</h2>
      <ul>
        <li>
          <strong>Data akun</strong> — alamat email dan kredensial autentikasi. Kata sandi di-hash
          oleh penyedia autentikasi kami dan tidak pernah disimpan dalam bentuk terbaca.
        </li>
        <li>
          <strong>Data profil</strong> — nama lengkap, nomor WhatsApp, domisili, jenis kelamin, dan
          pekerjaan (opsional), beserta waktu Anda menyetujui Syarat &amp; Ketentuan.
        </li>
        <li>
          <strong>Data survei yang Anda buat</strong> — foto, koordinat GPS beserta akurasinya, waktu
          pengambilan, definisi proyek, dan isian formulir Anda.
        </li>
        <li>
          <strong>Data transaksi</strong> — nomor pesanan, jumlah, metode, status, dan waktu
          pembayaran. <strong>Kami tidak pernah menerima atau menyimpan nomor kartu, CVV, PIN, atau
          OTP.</strong> Data tersebut ditangani sepenuhnya oleh gerbang pembayaran.
        </li>
        <li>
          <strong>Pesan yang Anda kirim</strong> melalui formulir kontak: nama, email, organisasi,
          dan isi pesan. Alamat IP pengirim hanya disimpan dalam bentuk <em>hash</em> untuk membatasi
          penyalahgunaan, tidak dalam bentuk aslinya.
        </li>
        <li>
          <strong>Data teknis</strong> — log permintaan dan galat yang diperlukan untuk menjalankan
          dan mengamankan layanan.
        </li>
      </ul>

      <h2>3. Dasar dan tujuan penggunaan</h2>
      <ul>
        <li>Menjalankan layanan inti: menyimpan survei Anda dan menampilkannya kembali di peta, daftar, dan ekspor — dasar: pelaksanaan perjanjian dengan Anda.</li>
        <li>Mengautentikasi Anda dan memisahkan data Anda dari pengguna lain — dasar: pelaksanaan perjanjian.</li>
        <li>Memproses pembayaran dan memenuhi kewajiban perpajakan serta pembukuan — dasar: kewajiban hukum.</li>
        <li>Menjawab pertanyaan dan permintaan dukungan Anda — dasar: pelaksanaan perjanjian.</li>
        <li>Memelihara, mengamankan, dan memperbaiki layanan — dasar: kepentingan sah kami.</li>
      </ul>
      <p>
        Kami tidak menggunakan data Anda untuk iklan, tidak melakukan profiling, dan tidak mengambil
        keputusan otomatis yang berdampak hukum bagi Anda.
      </p>

      <h2>4. Lokasi dan kamera</h2>
      <p>
        Aplikasi mengakses lokasi dan kamera perangkat Anda <strong>hanya pada saat</strong> Anda
        mengambil satu titik survei, dan hanya untuk menuliskan koordinat serta foto ke titik
        tersebut. <strong>Tidak ada pelacakan lokasi di latar belakang.</strong>
      </p>

      <h2>5. Penyimpanan dan pemrosesan</h2>
      <p>
        Data disimpan pada Supabase (basis data Postgres dan penyimpanan objek), dengan wilayah server
        di Asia-Pasifik. Foto disimpan pada bucket privat dan hanya disajikan melalui tautan
        bertanda tangan berumur pendek. Data setiap akun terpisah satu sama lain. Aplikasi web
        dijalankan pada infrastruktur hosting Vercel.
      </p>

      <h2>6. Pihak yang menerima data</h2>
      <p>Kami tidak menjual data Anda. Data hanya dibagikan kepada:</p>
      <ul>
        <li>Penyedia infrastruktur yang menjalankan layanan (hosting dan basis data).</li>
        <li>
          Gerbang pembayaran, sebatas yang diperlukan untuk memproses transaksi dan pengembalian
          dana.
        </li>
        <li>Pihak berwenang, bila diwajibkan oleh peraturan perundang-undangan.</li>
      </ul>

      <h2>7. Retensi</h2>
      <ul>
        <li>Data akun dan survei disimpan selama akun Anda aktif.</li>
        <li>
          Setelah akun dihapus, proyek, survei, dan foto dihapus. Catatan transaksi pembayaran
          disimpan selama masa yang diwajibkan peraturan perpajakan dan akuntansi.
        </li>
        <li>Pesan pada formulir kontak disimpan paling lama 24 bulan.</li>
      </ul>

      <h2>8. Hak Anda</h2>
      <p>
        Sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi, Anda berhak
        memperoleh akses, meminta perbaikan, meminta penghapusan, membatasi pemrosesan, menarik
        persetujuan, dan memperoleh salinan data Anda. Ekspor mandiri tersedia kapan saja di dalam
        aplikasi (CSV dan Excel). Untuk permintaan lain, kirim email dari alamat akun Anda ke{' '}
        {support}; kami menanggapi paling lambat 30 hari kalender.
      </p>

      <h2>9. Keamanan</h2>
      <p>
        Seluruh lalu lintas berjalan di atas HTTPS. Akses basis data dibatasi pada tingkat baris,
        foto berada pada bucket privat, dan aplikasi web menerapkan Content Security Policy berbasis
        nonce. Tidak ada sistem yang sepenuhnya kebal; bila terjadi pelanggaran data pribadi yang
        berisiko bagi Anda, kami memberitahukannya sesuai ketentuan yang berlaku.
      </p>

      <h2>10. Anak</h2>
      <p>
        Layanan tidak ditujukan bagi anak di bawah 18 tahun dan kami tidak dengan sengaja
        mengumpulkan data pribadi anak.
      </p>

      <h2>11. Perubahan</h2>
      <p>
        Kebijakan ini dapat diperbarui. Perubahan material diberitahukan melalui email atau di dalam
        aplikasi sebelum berlaku.
      </p>

      <h2>12. Kontak</h2>
      <p>
        {OPERATOR} — {ADDRESS_ONE_LINE}. Email {support}, telepon{' '}
        <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>.
      </p>
    </div>
  )
}

function English() {
  return (
    <div className="mk-doc">
      <div className="mk-doc-updated">Effective: {UPDATED}</div>

      <h2>1. Data controller</h2>
      <p>
        The controller for the information described here is <strong>{OPERATOR}</strong>,{' '}
        {ADDRESS_ONE_LINE}. Privacy questions go to {support} or through the{' '}
        <Link href="/contact">contact page</Link>.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — your email address and authentication credentials.
          Passwords are hashed by our authentication provider and never stored in readable form.
        </li>
        <li>
          <strong>Profile data</strong> — full name, WhatsApp number, domicile, gender, and
          occupation (optional), plus when you accepted the Terms.
        </li>
        <li>
          <strong>Survey data you create</strong> — photos, GPS coordinates with accuracy, capture
          timestamps, project definitions, and the field values you enter.
        </li>
        <li>
          <strong>Transaction data</strong> — order id, amount, method, status and time of payment.{' '}
          <strong>We never receive or store card numbers, CVV, PIN or OTP.</strong> Those are handled
          entirely by the payment gateway.
        </li>
        <li>
          <strong>Messages you send</strong> through the contact form: name, email, organisation and
          the message. The sender&apos;s IP address is stored only as a hash, to limit abuse, never
          in its original form.
        </li>
        <li>
          <strong>Technical data</strong> — request and error logs needed to operate and secure the
          service.
        </li>
      </ul>

      <h2>3. Why we use it</h2>
      <ul>
        <li>To run the core service — storing your surveys and showing them back on the map, records and exports (performance of our contract with you).</li>
        <li>To authenticate you and keep your data separate from other users (performance of contract).</li>
        <li>To process payments and meet tax and bookkeeping obligations (legal obligation).</li>
        <li>To answer your questions and support requests (performance of contract).</li>
        <li>To maintain, secure and improve the service (our legitimate interests).</li>
      </ul>
      <p>
        We do not use your data for advertising, do not profile you, and make no automated decisions
        with legal effect for you.
      </p>

      <h2>4. Location &amp; camera</h2>
      <p>
        The app accesses your device&apos;s location and camera <strong>only</strong> while you
        capture a survey point, and only to write the coordinates and photo into that point.{' '}
        <strong>There is no background location tracking.</strong>
      </p>

      <h2>5. Storage &amp; processing</h2>
      <p>
        Data is stored on Supabase (Postgres database and object storage) in an Asia-Pacific region.
        Photos live in a private bucket and are served only through short-lived signed links. Each
        account is isolated from every other. The web app runs on Vercel hosting.
      </p>

      <h2>6. Who receives data</h2>
      <p>We do not sell your data. It is shared only with:</p>
      <ul>
        <li>The infrastructure providers that run the service (hosting and database).</li>
        <li>The payment gateway, as far as needed to process transactions and refunds.</li>
        <li>Authorities, where required by law.</li>
      </ul>

      <h2>7. Retention</h2>
      <ul>
        <li>Account and survey data are kept while your account is active.</li>
        <li>
          After deletion, projects, surveys and photos are removed. Payment transaction records are
          retained for as long as tax and accounting rules require.
        </li>
        <li>Contact-form messages are kept for at most 24 months.</li>
      </ul>

      <h2>8. Your rights</h2>
      <p>
        Under Law No. 27 of 2022 on Personal Data Protection you may access, correct, delete, restrict
        processing of, withdraw consent for, and obtain a copy of your data. Self-service export is
        available in the app at any time (CSV and Excel). For anything else, email {support} from
        your account address; we respond within 30 calendar days.
      </p>

      <h2>9. Security</h2>
      <p>
        All traffic runs over HTTPS. Database access is restricted at row level, photos sit in a
        private bucket, and the web app enforces a nonce-based Content Security Policy. No system is
        perfectly secure; if a personal-data breach puts you at risk, we notify you as the rules
        require.
      </p>

      <h2>10. Children</h2>
      <p>
        The service is not aimed at anyone under 18 and we do not knowingly collect children&apos;s
        personal data.
      </p>

      <h2>11. Changes</h2>
      <p>
        This policy may be updated. Material changes are notified by email or in the app before they
        take effect.
      </p>

      <h2>12. Contact</h2>
      <p>
        {OPERATOR} — {ADDRESS_ONE_LINE}. Email {support}, call{' '}
        <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>.
      </p>
    </div>
  )
}

export default async function PrivacyPage() {
  /* Seeds which of the two documents is shown first. Both are still in the HTML —
     see the header of LangSwitch. Indonesian remains the governing version. */
  const locale = await getLocale()

  return (
    <>
      <div className="mk-hero pad-b-sm">
        <span className="mk-eyebrow">Legal</span>
        <h1 style={{ maxWidth: 700 }}>Kebijakan Privasi.</h1>
        <p className="mk-lede" style={{ maxWidth: 560 }}>
          Data apa yang kami kumpulkan, untuk apa, di mana disimpan, dan hak Anda atasnya.
          <br />
          What we collect, why, where it lives, and what you can ask us to do with it.
        </p>
      </div>

      <div className="mk-section tight">
        <LangSwitch initial={locale} id={<Indonesian />} en={<English />} />
      </div>
    </>
  )
}
