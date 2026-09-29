> ⚠️ **CATATAN HISTORIS — DOKUMEN INI SUDAH TIDAK BERLAKU.**
> Laporan ini mendokumentasikan desain **Neo-Topography** (latar AMOLED gelap, kaca buram, teks
> gradien), yang oleh klien dihentikan dengan alasan *"terlalu berlebihan"*. Perintah verifikasi
> yang disebut di bawah (`verify:neo`, dan `verify:all` dengan 88 pemeriksaan) **sudah tidak ada** —
> `verify-neo.mjs` dihapus dan digantikan `verify-site.mjs`.
>
> Desain yang berlaku sekarang adalah **profesional sederhana**: palet normal, section polos, tanpa
> latar bergerak. Laporan yang berlaku ada di **`SITE-COMPLIANCE.md`**.
>
> Dokumen ini dipertahankan hanya sebagai catatan sejarah — jangan dipakai sebagai acuan verifikasi.

# Neo-Topography — laporan kepatuhan

Laporan ini menyatakan apa yang **diukur**, bukan apa yang diniatkan. Setiap angka di bawah
diambil dari halaman yang dirender (Puppeteer + sampling piksel), bukan dari ingatan atau dari
tabel warna. Brief yang dipenuhi: `GEOFOLD_WEBSITE_REDESIGN_CONCEPT.md` — *"Cyber-Cartography"*.

Perintah verifikasi:

```
npm run verify:all     # 44 pemeriksaan marketing + 18 app chrome + 26 neo = 88
npm run audit          # 10 pemeriksaan brief + proporsi warna + paint heading
```

---

## 1. Palet — brief vs terukur

| Peran | Brief | Terukur di halaman | Status |
| :--- | :--- | :--- | :--- |
| Page Ground | `#020617` | `rgb(2, 6, 23)` | **sama persis** |
| Surface/Cards | `rgba(15, 23, 42, 0.4)` | `rgba(15, 23, 42, 0.4)` + `blur(16px) saturate(1.5)` | **sama persis** |
| Primary Text | `#F8FAFC` | `rgb(248, 250, 252)` | **sama persis** |
| Muted Text | `#94A3B8` | `rgb(148, 163, 184)` | **sama persis** |
| Primary Accent | `#00F2FE` | `rgb(0, 242, 254)` | **sama persis** |
| Gradient Accent | `#00F2FE` → `#4FACFE` | `linear-gradient(100deg, rgb(0,242,254) 0%, rgb(79,172,254) 52%, rgb(0,242,254) 100%)` | **sama persis** |
| Conversion/Action | `#00FF87` | `rgb(0, 255, 135)` | **sama persis** |

**Kontras terukur (WCAG, terhadap ground `#020617`):**

| Warna | Rasio | Ambang |
| :--- | ---: | :--- |
| Bright Silver `#F8FAFC` | **19.28:1** | AAA (7:1) |
| Neon Emerald `#00FF87` | **15.04:1** | AAA |
| Cyber Cyan `#00F2FE` | **14.54:1** | AAA |
| Sky `#4FACFE` | **8.32:1** | AAA |
| Slate Gray `#94A3B8` | **7.87:1** | AAA |

Tidak ada satu pun warna brief yang gagal — berbeda dari brief sebelumnya, di mana `#9CA3AF`
(2.54:1) dan `#6B7280` di atas kanvas (4.39:1) memang gagal dan harus disimpangi.

---

## 2. Bentuk

| Elemen | Brief | Terukur | Status |
| :--- | :--- | :--- | :--- |
| Kartu / Panel | `20px` | `20px` | **sama persis** |
| Tombol CTA | `50px` (pill) | `50px` | **sama persis** |
| Sudut `0px` tersisa | dihapus | **0 elemen** | **bersih** |

Pada kontrol setinggi 39–48px, radius 50px menghasilkan pil penuh — bukan lingkaran, karena
radiusnya melampaui setengah tinggi. Kontrol ikon kecil (tombol menu, toggle bahasa) memakai
langkah 12px, karena pil 50px pada kontrol 28px akan menjadi lingkaran.

### Dua penyimpangan yang disengaja, keduanya karena brief-nya sendiri gagal

**(a) Garis batas kontrol.** Brief: `rgba(255, 255, 255, 0.1)`. Dikompositkan di atas ground
`#020617` nilai itu terukur **1.23:1**, sedangkan WCAG 1.4.11 meminta **3:1** untuk batas visual
komponen antarmuka. Nilai brief tetap dipakai untuk garis dekoratif; batas kontrol memakai token
terpisah `rgba(255,255,255,.36)` = **3.22:1**.

Yang diukur, bukan yang dimaksud:

```
rgba(255,255,255,0.10)  ->  rgb(27, 31, 46)  =  1.23:1  FAIL  <- nilai brief
rgba(255,255,255,0.36)  ->  rgb(93, 96, 107) =  3.22:1  pass  <- yang dipakai
```

**(b) Tinta di atas tombol neon.** Brief tidak pernah menetapkan warna teks di atas tombol
gradien. Teks putih di atas cyan terukur **1.39:1** — gagal telak. Yang dipakai adalah Blue Deep
`#020617` di atas gradien: **14.54:1** di ujung cyan, **8.32:1** di ujung sky. Diperiksa
otomatis: *"NO white text sits on a neon fill"* — 0 pelanggaran.

---

## 3. Kaca (Glassmorphism)

Seluruh container memakai `backdrop-filter: blur(16px) saturate(1.5)` — sesuai brief
*"Seluruh container tidak menggunakan bayangan gelap biasa, melainkan menggunakan
backdrop-filter: blur(16px)"*. Diukur pada kartu: `blur(16px) saturate(1.5)`.

---

## 4. Gerak yang digerakkan AI

Brief menamai dua keyframes dan menetapkan periode 6 detik. Keduanya diukur sedang berjalan:

| Keyframes | Penempatan brief | Terukur | Periode |
| :--- | :--- | :--- | :--- |
| `cyberBreathe` | Pricing Cards, Hero Section | kartu + aurora hero | **6s** |
| `cyberFloat` | (bagian dari Cyber Breathe) | kartu | **6s** |
| `gradientShift` | Judul utama (H1, H2) + Tombol Primer | 6 heading di `/`, 4 di `/pricing` | **6s** |

**"Elemen melayang naik-turun"** — diukur, bukan diasumsikan: kartu disampel 14 kali sepanjang
satu siklus penuh, dan `translateY`-nya bergerak melintasi rentang **3px** (≈0.8mm pada 96 DPI,
yaitu *"dalam hitungan milimeter"* seperti yang brief minta). Satu jebakan yang tercatat:
`getComputedStyle(el).translate` mengembalikan `none` meski animasinya berjalan, karena
keyframes-nya menargetkan `transform` dan browser mengomposisikannya ke matriks. Probe yang
membaca properti `translate` akan melaporkan "tidak bergerak" untuk efek yang bekerja sempurna.

Jebakan kedua, dan ini tentang alat ukurnya sendiri: mengambil **dua** sampel berjarak 1.2s
ternyata gagal secara acak sekitar 1 dari 4 kali, karena `cyberFloat` adalah sinus 6 detik dan dua
titik bisa jatuh simetris di sekitar titik tengahnya. Pemeriksaan yang gagal pada kode yang benar
lebih buruk daripada tidak ada pemeriksaan — ia melatih orang untuk mengabaikannya. Kini
diambil rentang lintas satu siklus penuh, yang tidak bisa tertipu fase.

**Gradient pada heading benar-benar sampai ke tinta.** Ini diverifikasi dengan uji diferensial:
frame direkam, heading disembunyikan, frame direkam lagi, lalu dibedakan. Noise floor diukur
sebagai kontrol (**0 px**). Hasil:

| Halaman | Heading | Piksel bertinta | Tinta rata-rata | Cyan |
| :--- | :--- | ---: | :--- | ---: |
| `/` | H1 "Survey points that never go missing." | 3,596 | `rgb(4, 228, 243)` | 94% |
| `/` | H2 "Five things, done properly." | 11,406 | `rgb(27, 183, 219)` | 78% |
| `/pricing` | H1 "Free first. Forever, if that is enough." | 25,121 | `rgb(16, 203, 202)` | 63% |
| `/pricing` | `<em>` "Forever" | 5,981 | `rgb(2, 232, 129)` | emerald 88% |
| `/pricing` | H2 "What people usually ask." | 5,553 | `rgb(23, 160, 193)` | 65% |
| `/pricing` | H2 "Start with the free plan." | 4,936 | `rgb(27, 158, 194)` | 63% |

### Dua cacat nyata yang ditemukan pengukuran ini, dan diperbaiki

1. **Heading `/pricing` tidak bergradasi.** Halaman marketing memakai kosakata heading yang
   berbeda: `/` memakai `.pg-d1`/`.pg-d2`, sedangkan `/pricing` memakai `.mk-h-title` dan `<h2>`
   telanjang di dalam `.mk-sec-head`. Aturan gradien saya hanya menyasar yang pertama, sehingga
   H1 pricing terukur **flat Bright Silver** padahal brief meminta gradien pada "Judul utama
   (H1, H2)". Kedua kosakata kini dicakup.

2. **Kata sorotan di dalam heading gradien nyaris tak terlihat.** `.mk-h-title` memuat `<em>`
   ("Forever"), dan `home.css` memberinya warna highlight. Tetapi `-webkit-text-fill-color`
   **diwariskan**, dan induknya diset `transparent` — nilai warisan itu mengalahkan `color` pada
   anaknya. Kata itu akan dirender sebagai celah kosong di tengah headline. Kini diwarnai Neon
   Emerald, yang juga memberi tugas yang brief sebut sendiri: *"Digunakan khusus untuk penanda
   atau highlight konversi tinggi"*.

---

## 5. Tanda "+" Blueprint — dihapus, dengan alasan

Brief lama meminta *"aksen pendaftaran silang (+) halus di sudut-sudut kartu"*. Brief baru tidak
pernah menyebutnya dan menghapus estetika yang melahirkannya:

> *"Aturan desain Blueprint sebelumnya memaksakan sudut 0px pada seluruh bentuk. Konsep
> Neo-Topography menghapusnya dan beralih ke desain organik dan fluid."*

Tanda itu juga **terukur rusak** oleh perubahan bentuk: `blueprint.css` menempatkannya di
`inset: 0` — sudut **persegi** kotak — sedangkan kartu kini beradius 20px. Pada frame pertama,
**9 px** dari lengan yang dilukis menggantung **di luar** siluet kartu. Pembacaan visual band
tersebut melaporkannya sebagai *"doubled borders"*, yang persis seperti itulah tanda yang
menggantung di sudut terpotong.

Setelah perbaikan, diukur: **0 piksel** tanda, **0 lengan gradien**.

Satu jebakan yang tercatat: probe pertama saya menyimpulkan "tidak ada sisa dekorasi" dengan
membaca `borderTopWidth` pada `::after` dan mendapat `0px`. Itu properti yang salah —
`blueprint.css` melukis delapan lengan itu sebagai **`background-image`**, bukan border, sehingga
pemeriksaan border melaporkan nol sementara tandanya tergambar penuh.

---

## 6. Isolasi aplikasi — klaim yang diuji, bukan diasumsikan

Brief: *"Perubahan ini sepenuhnya terisolasi pada halaman publik dan tidak menyentuh/mengganggu
aplikasi (dashboard)."*

| Uji | Hasil |
| :--- | :--- |
| `/login` di bawah `.mk-site`? | **tidak** |
| Aplikasi setelah masuk di bawah `.mk-site`? | **tidak** |
| Ground aplikasi | `rgb(243, 244, 246)` — Kanvas Netral, tidak berubah |
| Sudut aplikasi | tetap persegi, **bukan** pil 50px |
| Sidebar | putih, ikon stroke 1.5px, item aktif GEOFOLD Blue |
| Marker peta | **oranye `#F35D19`** — tidak berubah |
| Kanvas peta | `#F3F4F6` — tidak berubah |

Pembacaan visual atas `/home` setelah redesign mengonfirmasi hal yang sama: *"light-themed
business dashboard: white sidebar, white cards on a pale canvas"* — tidak ada satu pun token
Neo-Topography yang bocor masuk.

**Keputusan yang diambil sadar:** `SurveyGlobe` (marker globe, hanya di halaman marketing) menjadi
emerald sesuai brief; `MapView` (hanya di aplikasi) tetap oranye. Keduanya komponen berbeda dan
dipisahkan oleh aturan isolasi, bukan oleh tebakan.

---

## 7. Proporsi warna

Brief Neo-Topography **tidak menetapkan rasio apa pun** — tidak ada "60-30-10", tidak ada angka
perbandingan. Yang diukur di bawah ini karenanya deskriptif, bukan gerbang lulus/gagal:

| Halaman | ground + kaca | cyan/sky | emerald |
| :--- | ---: | ---: | ---: |
| `/` | 97.0% | 3.0% | 0.0% |
| `/pricing` | 97.2% | 2.6% | 0.2% |
| `/product` | 97.4% | 2.4% | 0.3% |

Yang penting bukan angka 97%, melainkan bahwa **emerald tetap mendekati 0% dan cyan tetap satu
digit** — itulah yang benar-benar dibatasi brief: *"Digunakan khusus untuk penanda atau highlight
konversi tinggi"*. Halaman yang seluruh permukaannya ground AMOLED akan selalu terukur dominan
netral; itu tampilan yang diminta, bukan kekurangan.

---

## 8. Kesalahan pengukuran yang tercatat

Bagian ini sengaja disimpan. Empat probe pertama atas pertanyaan "apakah headline terlihat?"
memberi jawaban yang saling bertentangan, dan **ketiganya salah karena alat ukurnya**, bukan
karena desainnya:

1. `getComputedStyle` melaporkan gradien, `background-clip: text`, dan animasi 6s — semuanya
   benar, dan semuanya diam tentang apakah ada glyph yang sampai ke layar. Teks gradien melukis
   hurufnya dengan **background yang di-clip** sementara tintanya `transparent`; seluruh gaya bisa
   resolve sempurna dan headline tetap tak terlihat.
2. Menghitung "piksel yang berbeda dari ground" di dalam kotak H1 mengembalikan ribuan hit —
   tetapi halaman ini melukis **pola kontur topografi** dan aurora cyan di seluruh permukaannya,
   sehingga hitungan itu tidak bisa membedakan huruf dari garis kontur.
3. Diff frame-ke-frame melaporkan 47% viewport berubah, karena **dither veil berbasis canvas**
   terus melukis ulang di bawah `requestAnimationFrame`; `animation: none` tidak menghentikannya.
4. Pembacaan visual melaporkan band kosong — dua kali — dan juga salah membaca eyebrow.

Yang akhirnya menyelesaikan semuanya adalah **pengurangan dengan sumber derau dinamai dan
dihilangkan**: animasi CSS dibekukan, setiap `<canvas>` disembunyikan, sebuah frame kontrol
direkam untuk mengukur drift yang tersisa (hasil: **0 px** di `/pricing`), baru kemudian heading
disembunyikan dan frame-nya dibedakan. Sejak itu setiap diff di proyek ini menyatakan noise
floor-nya sebelum menyatakan temuannya.

Satu kesalahan lagi yang sejenis dan sudah diperbaiki: diff tanda "+" sempat melaporkan 22,960
piksel "tanda" setelah perbaikannya — ternyata kartunya **bergerak** karena `cyberBreathe` dan
`cyberFloat`. Setelah animasi dibekukan, angkanya **0**.

---

## 9. Berkas yang berubah

| Berkas | Perubahan |
| :--- | :--- |
| `src/styles/neotopography.css` | **baru** — seluruh token gelap, kaca, radius, dan tiga keyframes |
| `src/app/(marketing)/layout.tsx` | impor di baris paling bawah, setelah `checkout.css` |
| `scripts/verify-neo.mjs` | **baru** — 26 pemeriksaan kontrak Neo-Topography |
| `scripts/audit-headline.mjs` | **baru** — uji diferensial paint heading |
| `scripts/shots-neo.mjs` | **baru** — tangkapan layar per viewport |
| `scripts/verify-ui.mjs` | asersi dibalik: sudut 0px, ground terang, dan oranye kini harus **gagal** |
| `scripts/audit-brief.mjs` | kartu premium → cyan + kaca; tanda "+" kini harus **hilang** |
| `scripts/audit-colour.mjs` | palet referensi diganti ke spektrum Neo-Topography |
| `package.json` | `verify:neo`, `audit:headline` ditambahkan |

Tidak ada aturan lama yang dihapus dari `blueprint.css` — brief menetapkan bahwa
`neotopography.css` menimpanya lewat cascade, dan itu yang terjadi. `blueprint.css` tetap utuh
(1049 baris, `git status` bersih) dan tidak tersentuh. `neotopography.css` diimpor di baris
terakhir daftar stylesheet pada `layout.tsx` (baris 43), setelah `checkout.css` (baris 30) —
persis seperti yang brief tetapkan.

---

## 10. Status verifikasi

```
tsc --noEmit                     exit 0
npm run verify:all               44 pass / 0 fail  +  18 pass / 0 fail  +  26 pass / 0 fail  =  88
npm run audit                    10 pass / 0 fail
npm run audit:colour             proporsi di atas
npm run audit:headline           semua heading PAINTED, gradien sampai ke tinta
```
