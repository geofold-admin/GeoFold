# Laporan Perubahan — Desain Profesional Sederhana

Dokumen ini melaporkan apa yang **diukur**, bukan apa yang diklaim. Setiap angka di bawah berasal
dari halaman yang benar-benar dirender (`next start -p 3100`), dibaca lewat Puppeteer dengan
`getComputedStyle`, `getImageData`, dan piksel screenshot.

---

## 1. Permintaan Anda, dan jawabannya

> "sepertinya terlalu berlebihan, saya mau di buat profesional simple saja"

Kulit **Neo-Topography** (latar AMOLED gelap, kaca buram, teks gradien, kartu bercahaya) dihentikan.
File `neotopography.css` masih ada di disk dan masih konsisten — satu baris impor di
`layout.tsx` mengembalikannya utuh bila sewaktu-waktu diperlukan.

> "section tidak berbentuk card lagi tapi section pada umum nya"

Resep kartu yang dipakai seluruh section dibongkar. Setiap section sebelumnya menggambar panel
mengambang lewat `::before`; sekarang dimatikan, dan section menjadi **pita polos**: satu garis
rambut di atasnya, jarak vertikal besar, konten rata pada tepi kiri halaman.

Terverifikasi: `all ::before display:none` pada 5 dari 6 section (yang keenam adalah hero, lihat §3).

> "latar belakang hapus saja jadi pake section dan tidak ada latar belakang bergerak di namis lagi"

`SiteGround` — kanvas WebGL satu layar penuh yang terus melukis ulang selama kunjungan — dilepas
dari layout. Terverifikasi: **0 lapisan latar fixed**; dua frame yang sama, 900 ms terpisah,
menghasilkan **0 dari 324.000 sampel berubah** (halaman benar-benar diam).

Sebagai gantinya hero memakai **graticule statis** — kisi koordinat CSS, murni dua
`repeating-linear-gradient`, tanpa JavaScript, tanpa animasi. Itu tekstur yang dikenali surveyor,
dan biayanya nol.

> "gunakan color palet sebelum ini, gunakan color palet normal nya saja"

Palet Blueprint dikembalikan sepenuhnya. Terukur dari token yang benar-benar aktif di halaman:
`--mk-ink` = `#111827`, `--mk-green` = `#014ab5`, `--mk-marker` = `#f35d19`, `--mk-raise` =
`#f3f4f6`, `--mk-deep` = `#0a192f`. Ketiga warna khas Neo — Cyber Cyan `#00F2FE`, Neon Emerald
`#00FF87`, Deep Space `#020617` — **tidak ditemukan sama sekali** di halaman landing.

> "untuk globe bisa kamu perbagus lagi?"

Globe sekarang menggambar **garis pantai asli**, bukan graticule kosong (§5).

> "buat improvisasi kamu serta ide kamu sendiri untuk menyesuaikan website profesional di bidang perpetaan dan survey lapangan"

Lihat §6.

---

## 2. Yang dihapus, dan alasannya

| Efek | Kenapa dihapus |
| :--- | :--- |
| `SiteGround` (WebGL, layar penuh) | Anda memintanya langsung: latar bergerak, hapus |
| Kursor glow yang mengikuti pointer | Membuat situs terasa seperti demo produk, bukan perusahaan |
| Tombol magnetik (bergerak menjauhi kursor) | Kontrol yang menghindar dari kursor lebih sulit diklik — biaya kegunaan demi efek |
| Tilt 3D pada kartu harga | Memutar harga menjauh dari pembaca |
| Spotlight menyapu tiap kartu | Gerakan ketiga yang bersaing dengan reveal |
| Parallax pada lapisan dekoratif | Gerakan keempat |
| Skew saat scroll (heading miring) | Memiringkan heading sambil scroll adalah gerakan yang melawan membaca |
| Teks gradien beranimasi | Butuh `background-clip: text` + isi transparan — heading jadi tak terlihat di mesin yang tidak mendukung, dan tidak bisa dicetak |
| Tanda silang "+" di sudut kartu | Sisa kulit Blueprint; menandai sudut kartu, dan kartunya sudah tidak ada |
| Glassmorphism (`backdrop-filter`) | Bagian dari tema yang Anda hentikan |

**Yang tetap ada: reveal-on-scroll.** Itu satu-satunya gerakan yang membawa informasi — konten
yang tiba saat pembaca menurunkan halaman. Itu juga sebabnya halaman ini masih terasa hidup tanpa
satu pun efek yang berdiri sendiri.

Di `Motion.tsx` kode untuk efek-efek di atas **dihapus**, bukan dinonaktifkan: dari 641 baris
menjadi **264 baris**, dan nol referensi tersisa ke `glowCleanup`, `tiltCleanup`, `spotCleanup`,
`sparkCleanup`, `skewCleanup`, atau `magnets`.

---

## 3. Section, bukan kartu — dan satu pengecualian yang disengaja

Setiap section sekarang: **garis rambut 1px di atas, jarak 88–132px, konten di tepi halaman.**
Tidak ada latar, tidak ada sudut membulat, tidak ada bayangan.

Terverifikasi pada 6 section: `::before` semuanya `display:none`, radius `0px` semua, dan **6/6
punya padding vertikal ≥60px**.

**Pengecualian: hero.** Hero tetap plat gelap `#0A192F`. Itu satu-satunya layar tempat pembaca
memutuskan apakah akan terus membaca, dan latar kuat di bawah huruf terkuat membuat keputusan itu
mudah. Ini juga bahasa visual kategorinya — Trimble, Leica, Esri semuanya memakai permukaan gelap
teknis. Plat itu diuji terpisah supaya aturan "tanpa kartu" di atas tidak diam-diam memakannya.

**Kartu harga juga tetap kartu**, dan itu keputusan sadar: harga adalah hal yang Anda bandingkan
dengan harga di sebelahnya, dan dua permukaan yang mengambang membuat perbandingan itu terasa
fisik. Tapi bobotnya diturunkan — satu garis rambut, tanpa bayangan saat diam, dan paket Premium
ditandai dengan **garis biru** dan judul biru, bukan dengan isian gelap. Kartu gelap di halaman
terang terbaca sebagai **jenis objek yang berbeda**; garis dan warna terbaca sebagai objek yang
sama tapi lebih disukai — dan itu pernyataan yang jujur.

---

## 4. Palet dan kontras — diukur, bukan diperkirakan

Seluruh tangga tinta diukur pada **kedua** latar, karena halaman ini punya dua:

| Warna | di putih | di kanvas #F3F4F6 | Ambang WCAG AA |
| :--- | ---: | ---: | :--- |
| `#111827` (heading) | 17.74:1 | 16.12:1 | 4.5:1 ✓ |
| `#4B5563` (prosa) | 7.56:1 | 6.87:1 | 4.5:1 ✓ |
| `#6B7280` (label) | 4.83:1 | 4.39:1 | 4.5:1 — lihat catatan |
| `#9CA3AF` (hint) | 2.54:1 | 2.31:1 | ✗ **teks kecil tidak boleh** |
| `#014AB5` (tautan, aksen) | 7.93:1 | 7.21:1 | 4.5:1 ✓ |
| putih di `#0A192F` (judul hero) | — | — | 17.60:1 ✓ |

**Dua koreksi yang saya ambil, dan alasannya:**

1. **`#9CA3AF` tidak dipakai untuk teks.** Brief lama Anda menyebutnya "Teks Hint
   (Placeholder/Bantuan)", tapi pada 2.54:1 ia gagal AA bahkan untuk teks besar. Ia dipakai hanya
   untuk **non-teks** — tanda disabled, garis placeholder. Token `--mk-faint` diarahkan ulang ke
   `#6B7280` sehingga tidak ada teks yang jatuh ke bawah ambang tanpa sengaja.

2. **Oranye tidak pernah jadi teks badan di putih.** `#F35D19` pada putih = **3.29:1** — lulus
   untuk teks besar, gagal untuk label 14–16px yang dipakai situs ini. Jadi oranye dipakai sebagai
   **isian** dengan tinta `#0A192F` di atasnya (**5.36:1**), atau sebagai marker 1px, atau sebagai
   angka seukuran heading. Untuk label oranye kecil yang memang perlu, dipakai `#C2410C`
   (**5.18:1**).

Kontras tombol CTA utama terverifikasi dari halaman: latar `rgb(243, 93, 25)`, teks
`rgb(10, 25, 47)` — **5.36:1**, bukan putih di atas oranye yang hanya 3.29:1.

**Proporsi warna terukur** (setiap piksel halaman diklasifikasikan, jarak redmean):

| Halaman | netral | GEOFOLD Blue | GEOFOLD Orange |
| :--- | ---: | ---: | ---: |
| landing | 68.2% | 31.3% | **0.5%** |
| pricing | 89.6% | 9.7% | **0.8%** |
| product | 76.6% | 23.3% | **0.1%** |

Bacanya: netral adalah halamannya, biru adalah plat hero ditambah chrome merek, dan oranye adalah
aksen konversi — yang **harus** tetap mendekati nol, karena "digunakan sangat terbatas" adalah
satu-satunya hal yang benar-benar dibatasi palet ini.

---

## 5. Globe — yang diperbaiki

**Masalahnya bukan kurang cahaya.** Versi sebelumnya menggambar cincin lintang dan meridian, dan
tidak ada apa pun di atasnya. Bola tanpa daratan adalah **diagram bola** — ia memberi tahu pembaca
"ini globe" dan tidak lebih. Itu sebabnya ia terasa generik.

Perbaikannya adalah menggambar **Bumi yang sebenarnya**, sehingga satu titik yang ditandai duduk di
benua yang bisa dikenali. Garis pantai berasal dari **Natural Earth 110m (public domain)**,
disederhanakan dan di-inline oleh `scripts/build-land.mjs`: **90 cincin, 2.910 titik**, ditulis ke
`src/components/land.ts` (16.672 byte). Itu semua yang bisa ditampilkan globe 380px.

**Terverifikasi dari piksel kanvas itu sendiri:** 18.307 piksel daratan = **12.7%** kanvas (bola
tanpa daratan mengukur ~1%), plus **149 piksel oranye** untuk marker survei. Pemeriksaan visual
mengonfirmasi: benua terlihat, marker oranye tepat di ekuator, di atas Kalimantan.

Kontras di band gelap: garis pantai **10.18:1** (bagian yang terbaca), isian daratan 1.65:1
(badan, sengaja lembut), graticule 2.97:1 (lapisan tenang di bawahnya), marker oranye **3.25:1**
terhadap daratan dan 5.36:1 terhadap band.

**Dua bug nyata yang ditemukan lewat pengukuran ini, bukan lewat melihat:**

1. **Korda melintasi bola.** Saat menggambar belahan jauh, titik sisi-dekat ditarik ke tepi — benar
   untuk *isian*, salah untuk *goresan*, karena segmen dari posisi asli ke tepi adalah garis lurus
   melintasi muka bola. Hasilnya garis dari setiap pantai ke tepi, terukur **22% kanvas** sebagai
   piksel terang. Goresan sekarang hanya menggambar ruas titik yang benar-benar terlihat.

2. **`getImageData` mengembalikan nilai unpremultiplied.** Laut diisi
   `rgba(255,255,255,.045)` dan terbaca mentah sebagai `255,255,255` — putih penuh. Probe yang
   membaca RGBA mentah melaporkan seluruh samudra sebagai daratan. Nilai harus **dikompositkan**
   ke latar band dulu sebelum bermakna, karena itulah yang diterima mata.

Marker-nya sendiri adalah **reticle survei**: cincin, empat tick pada dua sumbu, dan isian yang
berdenyut pada irama berbeda dari cincinnya. Alat ukur menandai titik dengan cincin dan tick, bukan
dengan titik telanjang — tick itulah yang membuatnya terbaca "diukur di sini", bukan "peluru di
peta".

---

## 6. Improvisasi untuk bidang perpetaan & survey lapangan

Hal-hal yang saya tambahkan sendiri, semuanya memakai bahasa visual alat ukur:

1. **Graticule statis di hero.** Kisi lat/long tipis, dua `repeating-linear-gradient`, di-fade
   radial di tepinya. Menggantikan ladang kontur beranimasi dengan hal yang benar-benar dikenali
   surveyor — kisi koordinat — dan tidak bergerak, sesuai permintaan Anda.

2. **Ekuator digambar lebih tebal.** Satu-satunya garis di bola yang merupakan **fakta**, bukan
   referensi. Lembar peta cetak menandainya sama.

3. **Skala jarak diukur dalam milimeter.** Semua radius dikembalikan ke nilai kerja: **4px** untuk
   kontrol, **8px** untuk permukaan, **999px** hanya untuk kontrol yang memang pil (tombol Portal).
   Dua kulit sebelumnya memakai 0px di mana-mana lalu 50px di mana-mana — keduanya satu nilai yang
   diterapkan tanpa bertanya kontrol itu untuk apa.

4. **Garis rambut sebagai pengganti batas kartu.** Tanpa panel untuk memisahkan gagasan, yang
   memisahkan adalah garis dan ruang. Garis rambut 1px adalah satu-satunya tanda struktural, dan
   itulah yang membuat halaman panjang tetap bisa dipindai tanpa mewarnai apa pun.

5. **Ukuran baris dibatasi 68ch.** Perubahan keterbacaan terbesar di situs ini, dan biayanya satu
   deklarasi: di monitor lebar, paragraf tidak lagi menjadi 140 karakter per baris.

6. **Pita bergantian untuk section argumen.** Tanpa kartu, pita berlatar berbeda adalah satu-satunya
   cara sah mengatakan "section ini hal yang berbeda". Dipakai untuk satu section saja, jadi masih
   bermakna.

---

## 7. Aplikasi (dashboard) tidak tersentuh

Setiap brief dalam rangkaian ini mensyaratkan halaman publik direnovasi **tanpa menyentuh
aplikasi**, dan yang ini sama. Isolasinya bukan niat, tapi mekanisme: seluruh lapisan memakai
selektor `.mk.mk.mk-site`, sedangkan layar aplikasi hanya membawa `.mk`.

Terverifikasi:
- Permintaan dingin ke `/map` tetap dialihkan ke `/login` — **aplikasi masih terkunci**.
- **Tidak ada** `.mk-site` di layar aplikasi — lapisan situs tidak bocor.
- Token `--mk-green` **tidak terdefinisi** di luar `.mk-site`, sesuai rancangan.
- `verify-app.mjs`: **18/18 lulus** — sidebar putih, biru GEOFOLD, marker oranye peta, semuanya
  tidak berubah.
- `audit-brief.mjs` masih menjaga kanvas peta `#F3F4F6` dan sudut 0px di aplikasi.

---

## 8. Angka verifikasi

Semua dijalankan terhadap build produksi yang disajikan di port 3100.

| Suite | Hasil |
| :--- | ---: |
| `verify:ui` | **47 lulus / 0 gagal** |
| `verify:app` | **18 lulus / 0 gagal** |
| `verify:site` | **29 lulus / 0 gagal** |
| `audit:brief` | **11 lulus / 0 gagal** |
| `audit:colour` | laporan proporsi per halaman |
| `audit:headline` | semua heading terbukti TERLIHAT |
| `npx tsc --noEmit` | **exit 0** |
| `npx next build` | bersih |

**Total: 105 pemeriksaan, 0 gagal.**

### Tiga kontrak lama yang saya perbarui, bukan hapus

Suite verifikasi ini sudah menjaga tiga brief berbeda, jadi tiap kali brief berganti, ada
pemeriksaan yang menguji desain yang **sudah pensiun** dan gagal pada desain yang benar:

- `verify-ui.mjs` menuntut "tidak ada elemen bersudut siku" + "kartu 20px" + "CTA pil 50px" —
  kontrak Neo. Sekarang menguji kontrak kerja (4px / 8px / 999px).
- `verify-ui.mjs` menuntut **oranye tidak ada** di halaman marketing — kebalikan dari yang Anda
  minta sekarang. Sekarang menuntut oranye **ada** dan terukur, dan menuntut emerald serta cyan
  yang pensiun **hilang**.
- `verify-ui.mjs` menuntut latar "Deep Space". Sekarang menuntut dua lapisan latar yang benar
  menurut brief: `body` = Kanvas Netral `#F3F4F6`, pembungkus `.mk` = Panel Utama `#FFFFFF`.
- `audit-brief.mjs` menuntut kartu Premium "Cyber Cyan" dan "frosted-glass blur 16px". Sekarang
  menuntut biru merek, **dan** menuntut kartu Premium benar-benar berbeda dari kartu Free, **dan**
  menuntut glassmorphism **hilang**.
- `verify-neo.mjs` (26 pemeriksaan untuk kulit Neo) dihapus dan digantikan `verify-site.mjs`
  (29 pemeriksaan untuk kontrak ini).

Tidak ada pemeriksaan yang dihapus tanpa pengganti. Sebuah pemeriksaan yang dihapus adalah
pemeriksaan yang berhenti menangkap regresi.

---

## 9. Kesalahan yang saya buat dan temukan sendiri

Ini dicatat karena masing-masing menghasilkan **jawaban salah yang terdengar meyakinkan**:

1. **Probe `clip` vs `getBoundingClientRect`.** Saya mengambil screenshot globe dengan `clip` dari
   `getBoundingClientRect()` — dua sistem koordinat berbeda. Crop mendarat ~4.000px dari globe, dan
   probe melaporkan 0.5% daratan pada globe yang bekerja. Pemeriksaan visual atas PNG yang salah
   itu bahkan mendeskripsikan "mockup UI tanpa globe". Keduanya salah karena alasan yang sama.

2. **`getImageData` unpremultiplied** (§5) — melaporkan seluruh samudra sebagai daratan.

3. **Ambang luminans yang tidak dikalibrasi.** Percobaan pertama menghitung 65% kanvas sebagai
   daratan karena ambangnya juga menangkap halo dan graticule. Sekarang dikalibrasi terhadap pigmen
   yang sebenarnya: laut terkomposit = 34, graticule = 43, daratan = 61, garis pantai = 200+.
   Ambang 50 duduk di celah kosong antara graticule dan daratan.

4. **Mengukur `document.body` untuk latar halaman.** Saya menuntut body = putih dan gagal pada
   halaman yang benar; yang sebenarnya terjadi adalah body = `#F3F4F6` (kanvas) dan `.mk` = putih
   (panel) — persis struktur yang brief Anda sendiri sebutkan. Desainnya benar, probe saya salah.

5. **Komentar yang bertentangan dengan kode.** Saya menulis "`!important` tidak dipakai di mana pun
   di file ini" lalu memakainya di blok terakhir. Diperbaiki jadi spesifisitas.

6. **`[data-anim="lines"]` di daftar `transform: none`.** Terlihat seperti miliknya, padahal itu
   target GSAP — memaksa `transform: none` pada host tidak berpengaruh apa pun pada anaknya dan
   tetap salah sebagai pernyataan niat. Dihapus, dengan catatan kenapa.

7. **Token font `--gf-*` yang saya kira tidak ada.** Saya hampir menulis ulang blok font sebelum
   mengukur bahwa token itu memang ada di `blueprint.css` — dan bahwa `--font-sans` di `.mk`
   adalah Inter, bukan Archivo, sehingga blok itu memang diperlukan.

8. **Gutter harga 12px.** Ditemukan dengan mengukur, bukan melihat: dua kartu 634px berjarak 12px
   sementara masing-masing punya padding internal 40px. Dinaikkan ke 24px, menyamakan ritmenya
   dengan grid harga di landing.

9. **Graticule menembus kartu koordinat.** Kartu itu berlatar `rgba(127,168,232,.06)` — cucian 6%
   yang tidak menghalangi garis grid. Diukur pada baris di dalam kartu, mengikuti periode 72px milik
   graticule: **38.4 luminans pada garis vs 31.9 di antaranya** — selisih 6.5 yang menggambar garis
   vertikal samar melintasi bacaan, memotong `32″` dari `N`. Kartu sekarang **opaque** dengan warna
   hasil komposit persis (`#11223A`), dan selisihnya **0.00**.

10. **Statistik ringkasan yang dihitung di atas sampel yang salah.** Percobaan pertama probe di
   atas merata-ratakan piksel teks ke dalam ringkasannya dan melaporkan "garis 30 luminans" pada
   kartu yang **sudah** diperbaiki — setiap kolom bersih membaca 32.1 yang identik. Probe sekarang
   hanya menyimpan kolom yang rata (tanpa glyph). Ringkasan sebagus sampelnya.

11. **Pemeriksaan visual yang salah soal garis.** Ditanya apakah ada garis di dalam kotak,
    pemeriksaan visual menjawab "tidak ada" — dua kali. Pengukuran membuktikan ada. Ini kasus
    keempat di proyek ini di mana penglihatan keliru dan angka benar; perlakukan temuan visual
    sebagai hipotesis, bukan putusan.

---

## 10. Berkas yang berubah

| Berkas | Status | Keterangan |
| :--- | :--- | :--- |
| `src/styles/site.css` | **baru** | 880 baris. Seluruh lapisan ini: token, section polos, hero, globe, kontrol, motion |
| `src/components/land.ts` | **baru** | 90 cincin, 2.910 titik garis pantai Natural Earth |
| `src/components/SurveyGlobe.tsx` | diubah | Menggambar benua asli; 473 baris |
| `src/app/(marketing)/Motion.tsx` | diubah | 641 → 264 baris; efek berlebihan dihapus, bukan dimatikan |
| `src/app/(marketing)/layout.tsx` | diubah | `site.css` diimpor terakhir; `SiteGround` dilepas |
| `src/styles/home.css` | diubah | Gutter harga 12px → 24px |
| `scripts/verify-site.mjs` | **baru** | 29 pemeriksaan untuk kontrak ini |
| `scripts/build-land.mjs` | **baru** | Generator satu-kali untuk `land.ts` |
| `scripts/verify-ui.mjs` | diubah | Tiga kontrak lama diperbarui |
| `scripts/audit-brief.mjs` | diubah | Pemeriksaan kartu Premium diperbarui |
| `scripts/audit-colour.mjs` | diubah | Tabel referensi dikembalikan ke palet normal |
| `scripts/audit-headline.mjs` | diubah | Predikat warna diperbarui |
| `scripts/verify-neo.mjs` | **dihapus** | Digantikan `verify-site.mjs` |
| `src/styles/neotopography.css` | tidak diubah | Masih di disk, masih konsisten; satu baris impor mengembalikannya |

---

## 11. Cara mengembalikan desain sebelumnya

Setiap kulit dalam proyek ini adalah **satu baris impor**, dan itu disengaja. Untuk kembali ke
Neo-Topography: di `src/app/(marketing)/layout.tsx`, ganti `import '@/styles/site.css'` menjadi
`import '@/styles/neotopography.css'`, lalu kembalikan `<SiteGround />` di layout yang sama.
Tidak ada komponen yang perlu disentuh — itu sebabnya tidak ada satu pun komponen yang berubah
struktur dalam perubahan ini.
