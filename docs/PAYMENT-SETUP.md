# GeoFold — Setup Pembayaran (iPaymu Redirect Payment)

Gateway utama sekarang **iPaymu**, pakai **Redirect Payment** → customer dilempar ke halaman
checkout iPaymu yang sudah berisi semua channel yang kamu aktifin (QRIS, transfer/VA, e-wallet,
kartu, gerai ritel). Midtrans tetap tersedia sebagai gateway **alternatif eksplisit** bila dipilih
lewat `PAYMENT_PROVIDER`.

Ada juga **Activation Key** (kode redeem) buat jualan manual/reseller — lihat bagian bawah.

Domain: **geofold.sayba.id**
Callback iPaymu: `https://geofold.sayba.id/api/payments/ipaymu/callback`

Harga yang dijual: **Rp 35.000 / 30 hari / semua fitur / penyimpanan cloud 5 GB**.

---

## Yang harus dibaca duluan (3 hal yang bikin orang stuck)

**1. Sandbox itu AKUN TERPISAH yang harus didaftarkan sendiri.**
VA + API Key production **tidak bisa** dipakai ke `sandbox.ipaymu.com`, dan sebaliknya. Akun sandbox
bukan sekadar "mode lain" dari akun production — **daftar akun baru** di
<https://sandbox.ipaymu.com/>, lalu **Integration → API Key**. Sandbox tidak butuh verifikasi
usaha dan **tidak kena aturan IP statis**.

> ⚠️ Jangan buang waktu dengan kredensial demo yang beredar di repo contoh resmi iPaymu
> (VA `1179000899`, dari `ipaymu-payment-v2-sample-dotnet` dan `ipaymu-php-api`). Sudah dites
> 2026-09-15: `sandbox.ipaymu.com` menjawab **`401 unauthorized signature`**. Kredensial itu mati.
> Yang jelas **bukan** masalah adalah kode tanda tangannya — sudah dicocokkan dengan vektor tes
> milik SDK resmi iPaymu sendiri (`signature_test.go`) dan hasilnya identik, POST maupun GET.

**2. Production butuh IP statis + domain terdaftar.**
iPaymu memvalidasi IP server yang memanggil API-nya (docs → *IP & Domain Validation*). Vercel
Hobby memakai egress IP dinamis, jadi panggilan production bisa ditolak walaupun kredensialnya
benar. Sebelum go-live, gunakan **Vercel Pro + Static IPs** atau proxy lewat server ber-IP statis,
lalu daftarkan IP dan domain itu di iPaymu. Kalau tidak bisa, gunakan gateway lain yang sesuai.

**3. Callback bisa terlambat atau tidak sampai.**
Callback dapat tertunda atau gagal (dan `notifyUrl` ke localhost memang tidak terjangkau saat
development), sehingga customer bisa saja sudah bayar tapi Premium belum langsung aktif. Makanya
ada **rute rekonsiliasi**:
halaman `/subscription` otomatis memanggil `POST /api/payments/ipaymu/sync` begitu customer balik
dari halaman checkout. Rute itu bertanya langsung ke iPaymu dan mengaktifkan Premium kalau memang
sudah dibayar. Jadi callback hilang = cukup refresh, bukan tiket support.

---

## FASE 1 — Ambil kredensial

1. Login **my.ipaymu.com** → menu **Integration / Settings → API Key**.
2. Catat **VA** dan **API Key**.
   - ⚠️ Keduanya **RAHASIA**. Tempel langsung ke Vercel, JANGAN ke chat, screenshot, atau GitHub.
   - Catatan: VA juga dipakai iPaymu sebagai kunci tanda tangan callback, jadi perlakukan sebagai
     kredensial walaupun angkanya kelihatan oleh pembeli di halaman checkout.
3. Untuk development, **daftar akun sandbox terpisah** di <https://sandbox.ipaymu.com/>, lalu
   ambil VA + API Key sandbox dari **Integration → API Key** di dashboard sandbox itu. Kredensial
   production di langkah 2 tidak akan berfungsi di sandbox.

## FASE 2 — Masukin ke Vercel

4. **Vercel → geo-fold → Settings → Environment Variables → Add**:

| Key | Value |
|-----|-------|
| `PAYMENT_PROVIDER` | `ipaymu` |
| `IPAYMU_VA` | VA kamu (tandai **Sensitive**) |
| `IPAYMU_API_KEY` | API Key kamu (tandai **Sensitive**) |
| `IPAYMU_IS_PRODUCTION` | `false` dulu buat tes, `true` pas go-live |
| `IPAYMU_LIVE_CHECKOUT_ENABLED` | `false` dulu; `true` hanya setelah IP + domain Production disetujui |
| `IPAYMU_FEE_DIRECTION` | `MERCHANT` |
| `IPAYMU_EXPIRY_HOURS` | `24` |
| `IPAYMU_TIMEOUT_MS` | `15000` |
| `PREMIUM_PRICE_IDR` | `35000` |
| `PREMIUM_DAYS` | `30` |
| `PREMIUM_STORAGE_GB` | `5` |

5. Save → **Deployments → ⋯ → Redeploy**.

> ⚠️ `PREMIUM_PRICE_IDR` bukan cuma angka yang ditagih — **semua halaman publik mengutip angka itu**
> (Harga, FAQ, beranda, halaman Subscription). Kalau Vercel masih `49000`, situs akan menjanjikan
> Rp 49.000 sementara maksudmu Rp 35.000. Cek nilainya di Vercel, jangan diasumsikan.
> Hal yang sama berlaku untuk `PREMIUM_STORAGE_GB`: itu plafon yang benar-benar ditegakkan saat
> upload foto, sekaligus angka "5 GB" yang tercetak di halaman Harga dan FAQ.

## FASE 3 — Daftarkan callback

6. iPaymu → **Integration → Setting**
   (Production: `https://my.ipaymu.com/integration/setting` · Sandbox:
   `https://sandbox.ipaymu.com/integration/setting`).
7. Isi URL notifikasi / callback:
   ```
   https://geofold.sayba.id/api/payments/ipaymu/callback
   ```
8. **Content-Type callback**: `application/json` atau `application/x-www-form-urlencoded` —
   dua-duanya sudah ditangani, jadi pilih bebas.

## FASE 4 — Aktifin channel pembayaran

9. Aktifkan channel yang mau ditampilkan di halaman checkout (QRIS, VA bank, e-wallet, kartu,
   gerai ritel). Halaman checkout iPaymu menampilkan apa pun yang aktif di akun merchant.

## FASE 4b — Update database (sekali saja)

Jalankan [`docs/migration-007-ipaymu.sql`](migration-007-ipaymu.sql) di Supabase → **SQL Editor**.
Isinya: default kolom `payments."Provider"` / `"Method"` dipindah dari `midtrans`/`qris` ke
`ipaymu`/`redirect`, satu CHECK constraint, satu index untuk rute rekonsiliasi, dan beberapa
`COMMENT` untuk kolom yang namanya sudah tidak cocok dengan isinya.

**Tidak ada baris lama yang diubah.** Enam pembayaran Midtrans yang sudah ada tetap tercatat
sebagai `midtrans` — itu memang gunanya kolom tersebut, dan menulis ulang jadi `ipaymu` bikin order
lama tidak bisa dicocokkan lagi dengan dashboard Midtrans.

## FASE 5 — Tes (sandbox)

**Tes paling cepat dulu — cek kredensial tanpa bikin pembayaran beneran:**

10. Set kredensial **sandbox** + `IPAYMU_IS_PRODUCTION=false` → restart / redeploy.
11. Login, lalu buka **`/api/payments/ipaymu/diagnose`** di browser. Rute ini khusus sandbox
    (di mode production dia menjawab 404) dan butuh login.
    - `"ok": true` → kredensial dan tanda tangan sudah benar. Responsnya juga berisi
      `checkoutUrl` yang bisa langsung diklik.
    - `"error": "payments_not_configured"` → env belum keisi; responsnya menyebut var mana.
    - `401 unauthorized signature` → kredensial ditolak, hampir selalu karena sandbox/production
      ketuker. Bukan bug tanda tangan.
    - Tambahkan `?trx=12345` untuk mengecek status satu transaksi.

**Untuk tim verifikasi iPaymu — tanpa harus login ke GeoFold:**

12. Saat Vercel memakai kredensial sandbox, halaman `/pricing` menampilkan blok **“Uji halaman
    pembayaran sandbox”**. Tombolnya membuat checkout sandbox iPaymu yang bisa dilihat publik
    tanpa akun GeoFold. Ini adalah jalur yang perlu diberikan kepada reviewer iPaymu saat mereka
    meminta bukti integrasi.
    - Tidak membuat user, baris pembayaran, atau Premium di GeoFold.
    - Callback test dibalas `200 OK`, tetapi sengaja tidak pernah memberi akses Premium.
    - Tombol dan dua rutenya (`verification-checkout` / `verification-callback`) otomatis memberi
      `404` saat `IPAYMU_IS_PRODUCTION=true`.
    - Dibatasi tiga pembuatan checkout per IP per jam untuk menghindari penyalahgunaan.

**Lalu tes alur yang sebenarnya** (ini yang juga menguji penulisan ke database):

13. `geofold.sayba.id` → login → **Subscription → Upgrade ke Premium**.
14. Harusnya **redirect ke halaman checkout iPaymu** berisi semua channel yang aktif.
15. Bayar pakai simulator sandbox → callback jalan → **Premium aktif** ✅.
16. Kalau callback tidak sampai: balik ke `/subscription`, halaman itu otomatis rekonsiliasi.

> **Tes di situs yang sudah dideploy, bukan di localhost.** `notifyUrl` yang menunjuk ke
> `localhost` tidak bisa dijangkau iPaymu, jadi callback tidak akan pernah datang dan yang teruji
> cuma jalur `/sync`. Selain itu checkout menulis ke database, sementara `next/.env.local` sengaja
> dibiarkan kosong untuk `DB_PASSWORD` dkk — untuk tes lokal penuh, tempel dulu kredensial database
> dari Vercel.

Kalau checkout gagal, GeoFold menampilkan kode aman tanpa membocorkan kredensial:
- `sandbox_credentials_rejected` / `ipaymu_credentials_rejected` → VA / API Key salah, atau salah campur sandbox vs production.
- `sandbox_origin_rejected` / `ipaymu_origin_rejected` → domain atau IP belum divalidasi.
- `sandbox_gateway_timeout` / `ipaymu_gateway_timeout` → iPaymu tidak merespons tepat waktu; coba lagi.
- `payments_not_configured` (503) → `IPAYMU_VA` / `IPAYMU_API_KEY` belum keisi.

## FASE 6 — GO LIVE

17. Selesaikan **verifikasi merchant** iPaymu (data usaha + identitas + rekening bank).
    Alamat usaha yang diverifikasi harus **sama persis** dengan yang tercetak di halaman
    `/contact` — sumbernya satu file: [`next/src/lib/business.ts`](../next/src/lib/business.ts).
18. Urus **IP statis + domain** ke support iPaymu (lihat "Yang harus dibaca duluan" poin 2).
    Vercel Hobby tidak punya static egress IP. Pilih **Vercel Pro + Static IPs** atau jalankan
    panggilan API iPaymu melalui service/relay yang mempunyai IP statis; tidak ada env var yang
    dapat membuat IP Hobby menjadi tetap.
19. Daftarkan `https://geofold.sayba.id` di **Domain Validation Production** dan IP statis tadi di
    **IP Validation Production**. Tunggu status approved.
20. Ganti `IPAYMU_VA` + `IPAYMU_API_KEY` ke nilai **Production**, set
    `IPAYMU_IS_PRODUCTION=true` dan `IPAYMU_LIVE_CHECKOUT_ENABLED=true` → Redeploy Production.
    Scope dua secret tersebut ke **Production**, bukan Preview.
21. Daftarkan ulang URL callback di dashboard **Production** (setting-nya terpisah dari sandbox).
22. Tes sekali dengan nominal beneran, lalu cek uangnya masuk dan Premium aktif.

---

## Balik ke Midtrans

Set `PAYMENT_PROVIDER=midtrans` di Vercel + isi `MIDTRANS_SERVER_KEY` → Redeploy. Selesai; kode
Midtrans (`/api/payments/midtrans/webhook`) tidak dihapus dan masih jalan. `PAYMENT_PROVIDER` wajib
ditulis secara eksplisit supaya checkout tidak pernah diam-diam berpindah merchant.

Pembayaran lama tetap tercatat: kolom `payments."Provider"` menyimpan gateway mana yang dipakai,
jadi riwayat dua gateway bisa hidup berdampingan.

---

## Activation Key (jualan manual / reseller)
- User redeem kode di halaman Subscription → dapet Premium sesuai `GrantsDays`.
- Kode disimpan sebagai **hash** (aman walau DB bocor).
- ⚠️ Belum ada tombol GENERATE kode — sekarang insert manual via SQL, atau minta dibikinin script.

---

## Keamanan — bagaimana Premium benar-benar diberikan

Ini bagian yang paling penting untuk dimengerti, karena berbeda dari Midtrans.

**Isi callback iPaymu TIDAK dipercaya sebagai bukti bayar.** iPaymu menandatangani callback
memakai **nomor VA** sebagai secret — padahal nomor VA bukan rahasia: tampil di halaman checkout
dan bahkan dikirim balik di dalam body callback sebagai field `merchant`. Siapa pun yang pernah
membayar ke merchant ini secara teori bisa memalsukan callback yang lolos verifikasi tanda tangan.

Jadi alurnya:

1. Tanda tangan `X-Signature` dicek untuk menyaring request rusak/palsu sebelum aplikasi menghubungi
   iPaymu. Ia **bukan** bukti pembayaran final karena VA dapat terlihat di halaman checkout.
2. Reference id dicocokkan dulu ke baris `payments` lokal. Reference yang tidak dikenal langsung
   ditolak **tanpa** memanggil iPaymu — supaya endpoint ini tidak bisa dipakai sebagai amplifier.
3. Yang menentukan adalah panggilan server-ke-server `POST /api/v2/transaction` yang
   **diautentikasi dengan API Key**. Itu tidak bisa dipalsukan.
4. Transaksi yang dijawab iPaymu harus benar-benar **milik order ini** — dicocokkan lewat
   `ReferenceId` atau `SessionId` yang kita simpan saat checkout. Tanpa cek ini, callback palsu
   bisa memasangkan reference milik korban dengan trx_id yang memang sudah dibayar penyerang, dan
   satu pembayaran jadi dua periode Premium.
5. Nominal harus cocok (toleransi +Rp 999 untuk *unique code* transfer bank). Kurang bayar ditolak.
6. Grant dijalankan di dalam transaksi DB dengan `SELECT ... FOR UPDATE`, dan order yang sudah
   `settled` dilewati — jadi callback yang diulang, refresh halaman, dan rute `/sync` yang balapan
   tetap menghasilkan **satu** grant.

Rute `/api/payments/ipaymu/sync` memakai pengecekan yang **persis sama** (fungsi yang sama,
`settleIpaymuOrder`), dan hanya pernah menyentuh baris pembayaran milik user yang sedang login.

Sisanya:
- `IPAYMU_API_KEY` = rahasia → cuma di Vercel env, tidak pernah sampai ke browser.
- Uang masuk ke akun **merchant iPaymu**-mu → settle ke rekening bank sesuai jadwal iPaymu.
- `IPAYMU_FEE_DIRECTION=MERCHANT` berarti pembeli membayar **persis** angka yang tertulis di
  halaman Harga, dan fee dipotong dari settlement. Kalau diubah ke `BUYER`, pembeli membayar lebih
  besar dari angka yang diiklankan — dan halaman Harga tidak menyebutkan itu.
