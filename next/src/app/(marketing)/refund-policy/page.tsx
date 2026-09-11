import type { Metadata } from 'next'
import Link from 'next/link'
import { BUSINESS, OPERATOR } from '@/lib/business'
import { PREMIUM_DAYS, PREMIUM_PRICE_LABEL } from '@/lib/pricing'
import { BilingualDoc } from '../BilingualDoc'
import type { Locale } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n.server'

/*
 * The chrome around the document — heading, lede, page title — follows the visitor's language.
 * The DOCUMENT ITSELF does not: BilingualDoc renders both versions into the HTML and only takes
 * the site language decides which one is visible, so a verifier still gets the whole document
 * in the first paint. Indonesian remains the governing version. See BilingualDoc.tsx.
 */
const chrome: Record<Locale, { title: string; description: string; eyebrow: string; h1: string; lede: string }> = {
  id: {
    title: 'Kebijakan Pengembalian Dana (Refund Policy) — GeoFold',
    description:
      'Syarat, pengecualian, tata cara, dan jangka waktu pengembalian dana untuk pembelian GeoFold Premium.',
    eyebrow: 'Pengembalian Dana',
    h1: 'Kebijakan Pengembalian Dana.',
    lede: 'Kapan dana dikembalikan, apa yang tidak, cara mengajukan, dan berapa lama prosesnya.',
  },
  en: {
    title: 'Refund Policy — GeoFold',
    description:
      'Conditions, exclusions, procedure and timeframes for refunds on GeoFold Premium purchases.',
    eyebrow: 'Refund Policy',
    h1: 'Refund Policy.',
    lede: 'When we refund, when we do not, how to ask, and how long it takes.',
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const c = chrome[await getLocale()]
  return { title: c.title, description: c.description }
}

const UPDATED_ID = '7 September 2026'
const UPDATED_EN = '7 September 2026'

const billing = <a href={`mailto:${BUSINESS.email.billing}`}>{BUSINESS.email.billing}</a>

function Indonesian() {
  return (
    <div className="mk-doc">
      <div className="mk-doc-updated">Berlaku sejak: {UPDATED_ID}</div>

      <div className="mk-callout">
        <p>
          <strong>Ringkasnya:</strong> GeoFold Premium adalah pembelian sekali bayar sebesar{' '}
          {PREMIUM_PRICE_LABEL} untuk {PREMIUM_DAYS} hari — tidak ada penagihan berulang dan tidak
          ada auto-debit. Jika Anda mengajukan permintaan dalam <strong>7 hari kalender</strong>{' '}
          sejak pembayaran dan belum memanfaatkan Premium secara berarti, dana dikembalikan{' '}
          <strong>penuh</strong>.
        </p>
      </div>

      <h2>1. Ruang lingkup</h2>
      <p>
        Kebijakan ini mengatur pengembalian dana atas pembelian layanan GeoFold yang dioperasikan
        oleh <strong>{OPERATOR}</strong> melalui situs <a href={BUSINESS.site}>{BUSINESS.site}</a>{' '}
        dan aplikasi GeoFold. Kebijakan ini merupakan bagian tidak terpisahkan dari{' '}
        <Link href="/terms">Syarat &amp; Ketentuan</Link>.
      </p>
      <p>
        Satu-satunya produk berbayar adalah <strong>GeoFold Premium</strong>: akses selama{' '}
        {PREMIUM_DAYS} hari seharga {PREMIUM_PRICE_LABEL}, dibeli sekali. Paket Gratis tidak
        dipungut biaya sehingga tidak ada yang dikembalikan.
      </p>

      <h2>2. Syarat pengembalian dana penuh</h2>
      <p>Permintaan Anda dikabulkan penuh apabila seluruh keadaan berikut terpenuhi:</p>
      <ul>
        <li>
          Permintaan diajukan dalam <strong>7 (tujuh) hari kalender</strong> terhitung sejak tanggal
          pembayaran berhasil.
        </li>
        <li>
          Manfaat Premium <strong>belum dimanfaatkan secara berarti</strong> — yaitu Anda belum
          melampaui batas paket Gratis dengan memakai kuota Premium (misalnya membuat proyek keempat
          dan seterusnya, mengunggah foto melebihi 20 per proyek, atau melampaui batas harian).
        </li>
        <li>Pembayaran dilakukan dari akun yang mengajukan permintaan.</li>
      </ul>

      <h2>3. Pengembalian dana di luar syarat di atas</h2>
      <p>Kami tetap mengembalikan dana <strong>secara penuh</strong>, tanpa batas waktu 7 hari, apabila:</p>
      <ul>
        <li>
          <strong>Anda terkena tagihan ganda.</strong> Dua transaksi berhasil untuk periode yang
          sama; kelebihannya dikembalikan seluruhnya.
        </li>
        <li>
          <strong>Anda membayar tetapi Premium tidak pernah aktif</strong> dan kami tidak dapat
          mengaktifkannya.
        </li>
        <li>
          <strong>Layanan tidak dapat digunakan karena kesalahan kami</strong> selama lebih dari 72
          jam berturut-turut dalam masa aktif Anda. Anda dapat memilih perpanjangan masa aktif
          setara, atau pengembalian dana proporsional atas sisa hari.
        </li>
        <li>
          <strong>Transaksi tidak Anda kenali</strong> dan terbukti bukan Anda yang melakukan.
        </li>
      </ul>

      <h2>4. Hal yang tidak dapat dikembalikan</h2>
      <ul>
        <li>
          Permintaan yang diajukan <strong>lebih dari 7 hari kalender</strong> sejak pembayaran, di
          luar keadaan pada Bagian 3.
        </li>
        <li>
          Masa Premium yang <strong>sudah dipakai</strong>. Setelah lewat 7 hari, sisa hari tidak
          dikembalikan kecuali karena keadaan pada Bagian 3.
        </li>
        <li>
          <strong>Kunci aktivasi (activation key) yang sudah ditukarkan.</strong> Kunci yang belum
          ditukarkan mengikuti ketentuan pengadaan yang menyertainya.
        </li>
        <li>
          Akun yang <strong>dihentikan karena pelanggaran</strong>{' '}
          <Link href="/terms">Syarat &amp; Ketentuan</Link>.
        </li>
        <li>
          Ketidakcocokan perangkat yang sudah dinyatakan sebelum pembelian — misalnya ketiadaan GPS
          pada perangkat, atau aircraft DJI yang memang tidak didukung SDK-nya. Silakan uji dengan
          paket Gratis terlebih dahulu; paket Gratis ada justru untuk itu.
        </li>
        <li>
          Biaya administrasi yang dipungut bank, dompet digital, atau gerai ritel. Biaya tersebut
          milik penyedia yang bersangkutan dan tidak pernah kami terima.
        </li>
      </ul>

      <h2>5. Cara mengajukan</h2>
      <p>
        Kirim email ke {billing} dengan subjek <strong>&quot;Permintaan Refund&quot;</strong>, dari{' '}
        <strong>alamat email akun Anda</strong>, memuat:
      </p>
      <ul>
        <li>Nomor pesanan / order ID (tercantum pada halaman Subscription dan pada tanda terima).</li>
        <li>Tanggal dan jam pembayaran.</li>
        <li>Jumlah yang dibayarkan dan metode pembayaran.</li>
        <li>Alasan permintaan.</li>
      </ul>
      <p>
        Anda juga dapat menggunakan <Link href="/contact">formulir kontak</Link>. Kami tidak pernah
        meminta nomor kartu, CVV, PIN, ataupun OTP — jangan pernah mengirimkannya kepada siapa pun.
      </p>

      <h2>6. Jangka waktu</h2>
      <dl className="mk-rows">
        <div className="mk-row">
          <dt>Konfirmasi diterima</dt>
          <dd>1 hari kerja sejak email Anda masuk.</dd>
        </div>
        <div className="mk-row">
          <dt>Keputusan</dt>
          <dd>
            Paling lama 3 hari kerja. Bila ditolak, alasannya kami sampaikan tertulis beserta cara
            mengajukan keberatan.
          </dd>
        </div>
        <div className="mk-row">
          <dt>Dana diproses</dt>
          <dd>Paling lama 7 hari kerja setelah permintaan disetujui.</dd>
        </div>
        <div className="mk-row">
          <dt>Dana diterima</dt>
          <dd>
            Tambahan 7–14 hari kerja, tergantung bank atau penerbit kartu Anda. Bagian ini di luar
            kendali kami.
          </dd>
        </div>
      </dl>

      <h2>7. Cara pengembalian</h2>
      <p>
        Dana dikembalikan ke <strong>metode pembayaran yang sama</strong> dengan yang Anda gunakan,
        dalam mata uang yang sama (IDR), melalui gerbang pembayaran yang memproses transaksi
        tersebut. Bila metode itu tidak lagi memungkinkan menerima pengembalian (misalnya kartu telah
        kedaluwarsa), kami akan menghubungi Anda untuk menyepakati transfer bank ke rekening atas
        nama pemilik akun. Kami tidak mengembalikan dana ke rekening atas nama pihak ketiga.
      </p>

      <h2>8. Akibat pengembalian dana</h2>
      <p>
        Setelah pengembalian dana disetujui, masa Premium dihentikan dan akun kembali ke paket
        Gratis. <strong>Data survei Anda tidak dihapus.</strong> Bila isi workspace melampaui batas
        paket Gratis, workspace dibekukan — seluruh data tetap dapat dibaca, dilihat di peta, dan
        diekspor, hanya penambahan data baru yang dihentikan.
      </p>

      <h2>9. Pembatalan</h2>
      <p>
        Tidak ada yang perlu dibatalkan. Premium tidak diperpanjang otomatis dan tidak ada auto-debit,
        sehingga masa aktif {PREMIUM_DAYS} hari berakhir dengan sendirinya bila Anda tidak membeli
        lagi.
      </p>

      <h2>10. Keberatan &amp; penyelesaian sengketa</h2>
      <p>
        Bila Anda tidak sepakat dengan keputusan kami, balas email keputusan tersebut dalam 14 hari
        kalender dan permintaan akan ditinjau ulang. Kebijakan ini tidak mengurangi hak Anda sebagai
        konsumen berdasarkan Undang-Undang Republik Indonesia Nomor 8 Tahun 1999 tentang
        Perlindungan Konsumen dan peraturan pelaksanaannya. Setiap sengketa diupayakan diselesaikan
        secara musyawarah terlebih dahulu.
      </p>

      <h2>11. Kontak</h2>
      <dl className="mk-rows">
        <div className="mk-row">
          <dt>Penyelenggara</dt>
          <dd>{OPERATOR}</dd>
        </div>
        <div className="mk-row">
          <dt>Email refund &amp; tagihan</dt>
          <dd>{billing}</dd>
        </div>
        <div className="mk-row">
          <dt>Telepon / WhatsApp</dt>
          <dd>
            <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>
          </dd>
        </div>
        <div className="mk-row">
          <dt>Jam operasional</dt>
          <dd>{BUSINESS.hours.id}</dd>
        </div>
        <div className="mk-row">
          <dt>Alamat usaha</dt>
          <dd>
            <Link href="/contact">Lihat halaman kontak</Link>
          </dd>
        </div>
      </dl>
    </div>
  )
}

function English() {
  return (
    <div className="mk-doc">
      <div className="mk-doc-updated">Effective: {UPDATED_EN}</div>

      <div className="mk-callout">
        <p>
          <strong>In short:</strong> GeoFold Premium is a one-off purchase of{' '}
          {PREMIUM_PRICE_LABEL} for {PREMIUM_DAYS} days — no recurring billing, no auto-debit. Ask
          within <strong>7 calendar days</strong> of payment, before you have used Premium in any
          material way, and you get a <strong>full refund</strong>.
        </p>
      </div>

      <h2>1. Scope</h2>
      <p>
        This policy governs refunds for purchases of the GeoFold service, operated by{' '}
        <strong>{OPERATOR}</strong> through <a href={BUSINESS.site}>{BUSINESS.site}</a> and the
        GeoFold apps. It forms part of the <Link href="/terms">Terms &amp; Conditions</Link>.
      </p>
      <p>
        The only paid product is <strong>GeoFold Premium</strong>: {PREMIUM_DAYS} days of access for{' '}
        {PREMIUM_PRICE_LABEL}, bought once. The Free plan costs nothing, so there is nothing to
        refund.
      </p>

      <h2>2. Conditions for a full refund</h2>
      <p>A request is granted in full when all of the following hold:</p>
      <ul>
        <li>
          The request is made within <strong>7 (seven) calendar days</strong> of the successful
          payment date.
        </li>
        <li>
          Premium has <strong>not been used in any material way</strong> — that is, you have not gone
          past the Free plan limits on Premium quota (a fourth project or beyond, more than 20 photos
          on a project, or past the daily caps).
        </li>
        <li>The payment was made from the account making the request.</li>
      </ul>

      <h2>3. Refunds outside those conditions</h2>
      <p>
        We still refund <strong>in full</strong>, with no 7-day limit, when:
      </p>
      <ul>
        <li>
          <strong>You were charged twice.</strong> Two successful transactions for the same period —
          the duplicate is returned in full.
        </li>
        <li>
          <strong>You paid and Premium never activated</strong> and we cannot activate it.
        </li>
        <li>
          <strong>The service was unusable through our fault</strong> for more than 72 consecutive
          hours during your paid period. You may take an equivalent extension instead, or a pro-rata
          refund of the remaining days.
        </li>
        <li>
          <strong>You do not recognise the transaction</strong> and it is shown not to have been made
          by you.
        </li>
      </ul>

      <h2>4. What is not refundable</h2>
      <ul>
        <li>
          Requests made <strong>more than 7 calendar days</strong> after payment, outside the
          circumstances in Section 3.
        </li>
        <li>
          Premium time <strong>already used</strong>. After 7 days, remaining days are not refunded
          except under Section 3.
        </li>
        <li>
          <strong>Activation keys that have been redeemed.</strong> Unredeemed keys follow the
          procurement terms they were issued under.
        </li>
        <li>
          Accounts <strong>terminated for breach</strong> of the{' '}
          <Link href="/terms">Terms &amp; Conditions</Link>.
        </li>
        <li>
          Device incompatibility that was stated before purchase — a handset with no GPS, or a DJI
          aircraft its SDK does not support. Test on the Free plan first; that is what it is for.
        </li>
        <li>
          Administration fees charged by a bank, e-wallet or retail outlet. Those belong to that
          provider and never reach us.
        </li>
      </ul>

      <h2>5. How to request one</h2>
      <p>
        Email {billing} with the subject <strong>&quot;Refund request&quot;</strong>, from{' '}
        <strong>your account email address</strong>, including:
      </p>
      <ul>
        <li>The order ID (shown on the Subscription page and on your receipt).</li>
        <li>The date and time of payment.</li>
        <li>The amount paid and the payment method.</li>
        <li>The reason for the request.</li>
      </ul>
      <p>
        You may also use the <Link href="/contact">contact form</Link>. We never ask for a card
        number, CVV, PIN or OTP — never send those to anyone.
      </p>

      <h2>6. Timescales</h2>
      <dl className="mk-rows">
        <div className="mk-row">
          <dt>Acknowledgement</dt>
          <dd>1 business day from your email arriving.</dd>
        </div>
        <div className="mk-row">
          <dt>Decision</dt>
          <dd>
            Within 3 business days. If refused, you get the reason in writing and how to challenge
            it.
          </dd>
        </div>
        <div className="mk-row">
          <dt>Refund processed</dt>
          <dd>Within 7 business days of approval.</dd>
        </div>
        <div className="mk-row">
          <dt>Funds received</dt>
          <dd>
            A further 7–14 business days, depending on your bank or card issuer. That part is outside
            our control.
          </dd>
        </div>
      </dl>

      <h2>7. How the money comes back</h2>
      <p>
        Refunds go to the <strong>same payment method</strong> you used, in the same currency (IDR),
        through the gateway that processed the transaction. If that method can no longer receive a
        refund — an expired card, say — we will agree a bank transfer with you, to an account in the
        account holder&apos;s name. We do not refund to third-party accounts.
      </p>

      <h2>8. Effect of a refund</h2>
      <p>
        Once a refund is approved, the Premium period ends and the account returns to the Free plan.{' '}
        <strong>Your survey data is not deleted.</strong> If the workspace is over the Free limits it
        is frozen — everything stays readable, mappable and exportable, and only new captures stop.
      </p>

      <h2>9. Cancellation</h2>
      <p>
        There is nothing to cancel. Premium does not auto-renew and there is no auto-debit, so the{' '}
        {PREMIUM_DAYS}-day period simply ends if you do not buy again.
      </p>

      <h2>10. Disputes</h2>
      <p>
        If you disagree with our decision, reply to it within 14 calendar days and the request is
        reviewed again. This policy does not limit your rights as a consumer under Law of the
        Republic of Indonesia No. 8 of 1999 on Consumer Protection and its implementing regulations.
        Disputes are to be settled amicably in the first instance.
      </p>

      <h2>11. Contact</h2>
      <dl className="mk-rows">
        <div className="mk-row">
          <dt>Operator</dt>
          <dd>{OPERATOR}</dd>
        </div>
        <div className="mk-row">
          <dt>Refunds &amp; billing</dt>
          <dd>{billing}</dd>
        </div>
        <div className="mk-row">
          <dt>Phone / WhatsApp</dt>
          <dd>
            <a href={`tel:${BUSINESS.phoneHref}`}>{BUSINESS.phone}</a>
          </dd>
        </div>
        <div className="mk-row">
          <dt>Hours</dt>
          <dd>{BUSINESS.hours.en}</dd>
        </div>
        <div className="mk-row">
          <dt>Business address</dt>
          <dd>
            <Link href="/contact">See the contact page</Link>
          </dd>
        </div>
      </dl>
    </div>
  )
}

export default async function RefundPolicyPage() {
  /* Chooses which of the two documents is visible. Both are still in the HTML — see the header
     of BilingualDoc. Indonesian remains the governing version. */
  const locale = await getLocale()
  const c = chrome[locale]

  return (
    <>
      <div className="mk-hero pad-b-sm">
        <span className="mk-eyebrow">{c.eyebrow}</span>
        <h1 style={{ maxWidth: 700 }}>{c.h1}</h1>
        <p className="mk-lede" style={{ maxWidth: 560 }}>
          {c.lede}
        </p>
      </div>

      <div className="mk-section tight">
        <BilingualDoc locale={locale} id={<Indonesian />} en={<English />} />
      </div>
    </>
  )
}
