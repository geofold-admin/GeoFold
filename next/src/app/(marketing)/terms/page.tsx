import type { Metadata } from 'next'
import Link from 'next/link'
import { ADDRESS_ONE_LINE, BUSINESS, OPERATOR } from '@/lib/business'
import { PREMIUM_DAYS, PREMIUM_PRICE_LABEL } from '@/lib/pricing'
import { LangSwitch } from '../LangSwitch'

export const metadata: Metadata = {
  title: 'Syarat & Ketentuan (Terms & Conditions) — GeoFold',
  description:
    'Syarat dan ketentuan penggunaan layanan GeoFold: akun, penggunaan yang diperbolehkan, kepemilikan data, harga, pembayaran, pengembalian dana, dan hukum yang berlaku.',
}

const UPDATED = '7 September 2026'

const support = <a href={`mailto:${BUSINESS.email.support}`}>{BUSINESS.email.support}</a>
const billing = <a href={`mailto:${BUSINESS.email.billing}`}>{BUSINESS.email.billing}</a>

function Indonesian() {
  return (
    <div className="mk-doc">
      <div className="mk-doc-updated">Berlaku sejak: {UPDATED}</div>

      <h2>1. Siapa kami</h2>
      <p>
        Layanan GeoFold (&quot;Layanan&quot;) dioperasikan oleh <strong>{OPERATOR}</strong>{' '}
        (&quot;kami&quot;), beralamat di {ADDRESS_ONE_LINE}, dapat dihubungi melalui {support} atau{' '}
        <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>. Layanan diakses melalui{' '}
        <a href={BUSINESS.site}>{BUSINESS.site}</a> dan aplikasi GeoFold untuk Android.
      </p>
      <p>
        Dengan membuat akun atau menggunakan Layanan, Anda menyatakan telah membaca, memahami, dan
        terikat pada Syarat &amp; Ketentuan ini beserta{' '}
        <Link href="/privacy">Kebijakan Privasi</Link> dan{' '}
        <Link href="/refund-policy">Kebijakan Pengembalian Dana</Link>. Bila Anda tidak setuju,
        jangan menggunakan Layanan.
      </p>

      <h2>2. Akun</h2>
      <ul>
        <li>
          Anda bertanggung jawab menjaga kerahasiaan kredensial akun dan atas seluruh aktivitas yang
          terjadi di bawahnya.
        </li>
        <li>Data yang Anda berikan harus benar dan mutakhir.</li>
        <li>
          Anda harus berusia cukup untuk membuat perikatan yang sah menurut hukum yang berlaku bagi
          Anda. Bila Anda mendaftar untuk sebuah organisasi, Anda menyatakan berwenang mengikat
          organisasi tersebut.
        </li>
        <li>
          Satu akun untuk satu orang. Berbagi kredensial melanggar ketentuan ini dan membuat catatan
          survei kehilangan nilai pembuktiannya.
        </li>
      </ul>

      <h2>3. Penggunaan yang diperbolehkan</h2>
      <ul>
        <li>Dilarang menggunakan Layanan untuk tujuan melanggar hukum atau menyimpan konten melanggar hukum.</li>
        <li>
          Dilarang merusak, membebani secara tidak wajar, merekayasa balik, atau memperoleh akses
          tanpa izin ke Layanan maupun data pengguna lain.
        </li>
        <li>
          Dilarang mengambil data mengenai orang atau properti tanpa hak untuk melakukannya. Anda
          bertanggung jawab atas izin, perizinan lahan, dan persetujuan yang diperlukan di lokasi
          survei Anda.
        </li>
        <li>
          Untuk penggunaan drone: Anda bertanggung jawab penuh mematuhi peraturan penerbangan yang
          berlaku, termasuk ketentuan ruang udara dan perizinan penerbangan.
        </li>
      </ul>

      <h2>4. Data Anda</h2>
      <p>
        <strong>Data survei yang Anda buat tetap milik Anda.</strong> Anda memberi kami lisensi
        terbatas yang diperlukan untuk menyimpan, memproses, dan menampilkan kembali data tersebut
        kepada Anda sebagai bagian dari pengoperasian Layanan. Kami tidak menjual data Anda dan tidak
        menggunakannya untuk tujuan lain. Rinciannya ada pada{' '}
        <Link href="/privacy">Kebijakan Privasi</Link>.
      </p>
      <p>
        Anda dapat mengekspor seluruh data kapan saja (CSV dan Excel) pada paket apa pun. Kami sangat
        menganjurkan Anda menyimpan salinan sendiri atas data yang penting.
      </p>

      <h2>5. Paket, harga, dan pembayaran</h2>
      <ul>
        <li>
          <strong>Paket Gratis</strong> — Rp 0, dengan batas jumlah proyek, jumlah foto per proyek,
          serta batas harian pengambilan dan pengunggahan.
        </li>
        <li>
          <strong>GeoFold Premium</strong> — {PREMIUM_PRICE_LABEL} untuk {PREMIUM_DAYS} hari akses.
          Ini adalah <strong>pembelian sekali bayar</strong>: tidak ada penagihan berulang, tidak ada
          auto-debit, dan tidak ada yang perlu dibatalkan.
        </li>
      </ul>
      <p>
        Seluruh harga dinyatakan dan ditagihkan dalam <strong>Rupiah Indonesia (IDR)</strong> dan
        sudah termasuk pajak yang berlaku, kecuali dinyatakan lain. Harga yang ditampilkan pada
        halaman pembayaran adalah harga yang mengikat untuk transaksi tersebut.
      </p>
      <p>
        Pembayaran diproses oleh penyedia gerbang pembayaran pihak ketiga yang berizin di Indonesia.
        Metode yang tersedia ditampilkan pada halaman pembayaran. <strong>Kami tidak menerima,
        melihat, atau menyimpan</strong> nomor kartu, CVV, PIN, atau OTP Anda; seluruh data
        pembayaran ditangani langsung oleh gerbang pembayaran, dan penggunaan Anda atasnya tunduk
        pula pada ketentuan penyedia tersebut.
      </p>
      <p>
        Premium aktif setelah gerbang pembayaran mengonfirmasi transaksi. Bila lebih dari 1 jam
        setelah pembayaran berhasil Premium belum aktif, hubungi {billing} dengan bukti pembayaran.
      </p>
      <p>
        Kami dapat mengubah harga atau batas paket. Perubahan diumumkan dengan pemberitahuan yang
        wajar dan <strong>tidak berlaku surut</strong> terhadap masa Premium yang sudah Anda bayar.
      </p>

      <h2>6. Pengembalian dana</h2>
      <p>
        Permintaan pengembalian dana yang diajukan dalam 7 hari kalender sejak pembayaran, sebelum
        manfaat Premium dimanfaatkan secara berarti, dikabulkan penuh. Syarat lengkap, pengecualian,
        tata cara, dan jangka waktunya diatur dalam{' '}
        <Link href="/refund-policy">Kebijakan Pengembalian Dana</Link>, yang merupakan bagian tidak
        terpisahkan dari ketentuan ini.
      </p>

      <h2>7. Batas penggunaan dan pembekuan workspace</h2>
      <p>
        Bila masa Premium berakhir sementara isi workspace melampaui batas paket Gratis, workspace
        dibekukan. <strong>Data tidak dihapus:</strong> seluruh data tetap dapat dibaca, dilihat di
        peta, dan diekspor; hanya penambahan data baru yang dihentikan hingga Anda memperpanjang
        Premium atau kembali di bawah batas Gratis.
      </p>

      <h2>8. Ketersediaan layanan</h2>
      <p>
        Layanan disediakan &quot;sebagaimana adanya&quot; dan &quot;sebagaimana tersedia&quot;. Kami
        tidak menjamin operasi tanpa gangguan atau tanpa kesalahan. Kami dapat melakukan pemeliharaan
        terjadwal dan akan berupaya memberitahukannya lebih dahulu bila memungkinkan.
      </p>
      <p>
        Sepanjang diizinkan hukum, tanggung jawab kami atas suatu klaim yang timbul dari penggunaan
        Layanan dibatasi paling banyak sebesar jumlah yang Anda bayarkan kepada kami dalam 12 bulan
        sebelum peristiwa yang menimbulkan klaim tersebut. Pembatasan ini tidak berlaku terhadap
        kesengajaan atau kelalaian berat kami, dan tidak mengurangi hak Anda yang tidak dapat
        dikesampingkan menurut hukum.
      </p>

      <h2>9. Penghentian</h2>
      <p>
        Anda dapat berhenti menggunakan Layanan dan meminta penghapusan akun kapan saja dengan
        mengirim email dari alamat akun Anda ke {support}. Kami dapat menangguhkan atau menghentikan
        akun yang melanggar ketentuan ini; bila penghentian dilakukan bukan karena pelanggaran Anda,
        sisa masa Premium dikembalikan secara proporsional.
      </p>

      <h2>10. Perubahan ketentuan</h2>
      <p>
        Kami dapat memperbarui ketentuan ini. Perubahan yang material diberitahukan melalui email
        atau di dalam aplikasi sebelum berlaku. Penggunaan Layanan setelah perubahan berlaku
        merupakan penerimaan Anda atas ketentuan yang diperbarui.
      </p>

      <h2>11. Hukum yang berlaku dan penyelesaian sengketa</h2>
      <p>
        Ketentuan ini tunduk pada hukum Republik Indonesia. Ketentuan ini tidak mengurangi hak Anda
        sebagai konsumen berdasarkan Undang-Undang Nomor 8 Tahun 1999 tentang Perlindungan Konsumen.
        Setiap sengketa diupayakan diselesaikan secara musyawarah untuk mufakat terlebih dahulu; bila
        tidak tercapai dalam 30 hari kalender, sengketa diselesaikan melalui pengadilan yang
        berwenang di Indonesia.
      </p>

      <h2>12. Kontak</h2>
      <p>
        {OPERATOR} — {ADDRESS_ONE_LINE}. Email {support}, telepon{' '}
        <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>, atau melalui{' '}
        <Link href="/contact">halaman kontak</Link>.
      </p>
    </div>
  )
}

function English() {
  return (
    <div className="mk-doc">
      <div className="mk-doc-updated">Effective: {UPDATED}</div>

      <h2>1. Who we are</h2>
      <p>
        The GeoFold service (&quot;the Service&quot;) is operated by <strong>{OPERATOR}</strong>{' '}
        (&quot;we&quot;), at {ADDRESS_ONE_LINE}, reachable at {support} or{' '}
        <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>. The Service is delivered through{' '}
        <a href={BUSINESS.site}>{BUSINESS.site}</a> and the GeoFold Android apps.
      </p>
      <p>
        By creating an account or using the Service you confirm you have read, understood and are
        bound by these Terms, together with the <Link href="/privacy">Privacy Policy</Link> and the{' '}
        <Link href="/refund-policy">Refund Policy</Link>. If you do not agree, do not use the
        Service.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>
          You are responsible for keeping your credentials secure and for all activity under your
          account.
        </li>
        <li>The information you give us must be accurate and kept current.</li>
        <li>
          You must be old enough to form a binding contract where you are. If you register for an
          organisation, you confirm you may bind it.
        </li>
        <li>
          One account per person. Sharing credentials breaches these Terms and destroys the
          evidential value of the survey record.
        </li>
      </ul>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Do not use the Service unlawfully or to store unlawful content.</li>
        <li>
          Do not break, unreasonably load, reverse-engineer, or gain unauthorised access to the
          Service or to other users&apos; data.
        </li>
        <li>
          Do not capture data about people or property without the right to do so. Permits, land
          permissions and consents at your survey sites are your responsibility.
        </li>
        <li>
          For drone use: complying with the applicable aviation rules, including airspace and flight
          permissions, is entirely your responsibility.
        </li>
      </ul>

      <h2>4. Your data</h2>
      <p>
        <strong>The survey data you create stays yours.</strong> You grant us the limited licence
        needed to store, process and show it back to you as part of operating the Service. We do not
        sell your data and do not use it for anything else. Detail is in the{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <p>
        You can export everything at any time (CSV and Excel) on any plan. Keep your own copies of
        anything important.
      </p>

      <h2>5. Plans, pricing and payment</h2>
      <ul>
        <li>
          <strong>Free plan</strong> — Rp 0, with limits on projects, photos per project, and daily
          capture and upload.
        </li>
        <li>
          <strong>GeoFold Premium</strong> — {PREMIUM_PRICE_LABEL} for {PREMIUM_DAYS} days of access.
          This is a <strong>one-off purchase</strong>: no recurring billing, no auto-debit, nothing to
          cancel.
        </li>
      </ul>
      <p>
        All prices are stated and charged in <strong>Indonesian Rupiah (IDR)</strong> and include
        applicable taxes unless stated otherwise. The price shown at checkout is the binding price
        for that transaction.
      </p>
      <p>
        Payments are processed by a licensed third-party Indonesian payment gateway. Available
        methods are shown at checkout. <strong>We do not receive, see or store</strong> your card
        number, CVV, PIN or OTP; all payment data is handled directly by the gateway, and your use of
        it is also subject to that provider&apos;s terms.
      </p>
      <p>
        Premium activates once the gateway confirms the transaction. If more than 1 hour has passed
        after a successful payment and Premium is not active, contact {billing} with your proof of
        payment.
      </p>
      <p>
        We may change prices or plan limits. Changes are announced with reasonable notice and{' '}
        <strong>do not apply retroactively</strong> to Premium time you have already paid for.
      </p>

      <h2>6. Refunds</h2>
      <p>
        Refund requests made within 7 calendar days of payment, before Premium has been used in any
        material way, are granted in full. The full conditions, exclusions, process and timescales
        are in the <Link href="/refund-policy">Refund Policy</Link>, which forms part of these Terms.
      </p>

      <h2>7. Limits and workspace freezing</h2>
      <p>
        If Premium ends while the workspace is over the Free plan limits, the workspace is frozen.{' '}
        <strong>Nothing is deleted:</strong> everything stays readable, mappable and exportable, and
        only new captures stop until you renew or come back under the Free limits.
      </p>

      <h2>8. Availability</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot;. We do not guarantee
        uninterrupted or error-free operation. We may carry out scheduled maintenance and will give
        notice beforehand where we can.
      </p>
      <p>
        To the extent permitted by law, our liability for any claim arising from your use of the
        Service is limited to the amount you paid us in the 12 months before the event giving rise to
        it. This limit does not apply to our wilful misconduct or gross negligence, and does not
        affect rights you cannot waive by law.
      </p>

      <h2>9. Termination</h2>
      <p>
        You may stop using the Service and ask for your account to be deleted at any time by emailing{' '}
        {support} from your account address. We may suspend or terminate accounts that breach these
        Terms; where we terminate for a reason other than your breach, remaining Premium time is
        refunded pro rata.
      </p>

      <h2>10. Changes to these Terms</h2>
      <p>
        We may update these Terms. Material changes are notified by email or in the app before they
        take effect. Continued use after they take effect is acceptance of the updated Terms.
      </p>

      <h2>11. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the Republic of Indonesia, and do not limit your
        rights as a consumer under Law No. 8 of 1999 on Consumer Protection. Disputes are to be
        settled amicably in the first instance; if not resolved within 30 calendar days, they are
        settled before the competent courts in Indonesia.
      </p>

      <h2>12. Contact</h2>
      <p>
        {OPERATOR} — {ADDRESS_ONE_LINE}. Email {support}, call{' '}
        <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>, or use the{' '}
        <Link href="/contact">contact page</Link>.
      </p>
    </div>
  )
}

export default function TermsPage() {
  return (
    <>
      <div className="mk-hero pad-b-sm">
        <span className="mk-eyebrow">Legal</span>
        <h1 style={{ maxWidth: 700 }}>Syarat &amp; Ketentuan.</h1>
        <p className="mk-lede" style={{ maxWidth: 560 }}>
          Ketentuan penggunaan layanan GeoFold, termasuk harga, pembayaran, dan pengembalian dana.
          <br />
          The terms you use GeoFold under, including pricing, payment and refunds.
        </p>
      </div>

      <div className="mk-section tight">
        <LangSwitch id={<Indonesian />} en={<English />} />
      </div>
    </>
  )
}
