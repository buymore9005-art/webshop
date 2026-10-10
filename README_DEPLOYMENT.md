# ZYHA ID — panduan setup, deployment, dan operasi

Versi source 1.1.0. Basisnya 14 file webshop yang diunggah, bukan aplikasi produksi.
Seluruh kode di ZIP adalah file lengkap. Tidak ada perubahan langsung ke GitHub,
Vercel, Supabase lama, atau akun payment provider pengguna.

**Penting:** build penuh dan database/payment live belum tervalidasi di lingkungan
pengerjaan. Jangan menganggap tes unit sebagai bukti siap menerima pembayaran nyata.
Gunakan project staging terlebih dahulu. Hasil dan batas pemeriksaan ada di QA_REPORT.md.

## 1. Siapkan repository dan project baru

Ekstrak isi ZIP ke working copy/branch repository webshop Anda. Root harus berisi
`package.json`, `main.tsx`, `App.tsx`, `Admin.tsx`, `index.html`, dan folder `src/` serta
`supabase/`. Tidak ada folder pembungkus tambahan dalam ZIP. Jangan campur dengan
file PRODUCTION BUYMORE. Simpan commit/backup repository lama sebelum menyalin.

Pakai Node.js 22 dan npm. Framework dan dependency utama mengikuti repository asli.
`package-lock.json` disertakan; gunakan `npm ci` untuk clean install yang reproducible.
Jangan memakai lockfile aplikasi produksi yang pernah diunggah pada percakapan lain.

Buat project Supabase BARU yang Anda kuasai. SQL ini bukan migrasi in-place untuk
schema lama yang tidak diketahui. Script berhenti bila mendeteksi tabel yang sama
pada project tanpa penanda schema ZYHA. Tidak ada DROP TABLE/DROP DATABASE.

Data produk, pesanan, akun Auth, berkas Storage dan konfigurasi dari project yang
hilang tidak dapat dipulihkan dari source frontend. Unggah kembali data/gambar milik
Anda dari backup sah bila ada. Jangan memasukkan data pelanggan atau secret ke Git.

## 2. Buat Admin, lalu jalankan satu file SQL

Di Supabase baru, buka Authentication > Users dan buat user Admin dengan email yang
Anda kendalikan serta password kuat. Pastikan email user tersebut sudah confirmed.
Membuat user Auth saja belum memberi hak Admin di aplikasi.

Buka `supabase-setup.sql`. Pada bagian paling atas, ubah hanya nilai kosong di baris:

```sql
select set_config('zyha.bootstrap_admin_email', '', true);
```

Isi dengan email user Auth yang baru dibuat. Kemudian salin SELURUH file ke SQL
Editor project baru dan jalankan sekali. Tidak perlu memecah tabel/fungsi/policy
menjadi sejumlah cuplikan SQL. Script bersifat transactional; email yang diisi tetapi
belum ditemukan/confirmed menyebabkan setup rollback, bukan membuat Admin palsu.

Bila sengaja membiarkan email kosong, schema dibuat tanpa Admin. Setelah user Auth
tersedia, isi email pada script yang sama lalu jalankan kembali. Eksekusi ulang pada
schema versi ini tidak menghapus/mengisi ulang produk, pesanan, atau pengaturan toko.
Script bukan alat upgrade otomatis untuk versi schema berbeda atau schema kustom.

Objek utama:

| Objek | Fungsi |
|---|---|
| products | Katalog, galeri/varian, status aktif, stok opsional, version concurrency |
| settings | Nama/banner/kategori/WhatsApp/ongkir |
| payment_methods | Bank, E-Wallet, dan QRIS manual |
| orders | Snapshot harga/item/pembayaran dan status pesanan privat |
| admin_users | Allowlist Admin yang terhubung auth.users |
| order_events | Audit perubahan status, alasan, dan aktor |
| zyha_private | Penanda schema dan pembatasan request, bukan schema publik API |
| Storage products | Foto katalog, banner, dan QRIS publik; Admin saja yang upload |

Tidak ada seed produk, bank, nomor rekening, pesanan, ulasan, trafik atau angka
penjualan palsu. Katalog kosong setelah setup merupakan kondisi normal.

Akses Admin tambahan dapat diberikan oleh pemilik project melalui Table Editor
`admin_users` menggunakan UUID user Auth confirmed. Pengguna browser tidak memperoleh
INSERT/UPDATE pada tabel Admin dan tidak dapat mengangkat dirinya melalui signup.
Nonaktifkan Admin melalui is_active=false. Jangan menonaktifkan seluruh Admin tanpa
memastikan pemilik project masih dapat mengakses Supabase untuk pemulihan.

## 3. Tambahkan migration fitur pertumbuhan toko

Setelah menjalankan `supabase-setup.sql` di project baru, jalankan seluruh isi
`supabase/migrations/20261010000000_store_growth.sql` satu kali melalui SQL Editor
Supabase atau Supabase CLI yang terhubung ke project target. Migration menambahkan
wishlist, artikel, informasi footer, kupon/pemakaian kupon, serta tautan pesanan ke
user Auth. Ia bergantung
pada fungsi dan tabel yang dibuat setup awal; jangan jalankan lebih dahulu. Migration
bersifat transactional dan aman diulang pada skema ZYHA ini, tetapi tetap tinjau
diff/backup sebelum mengubah project yang sudah berisi data. Perintah ini tidak
dijalankan pada project pengguna dalam proses pengerjaan.

Untuk signup pelanggan tanpa verifikasi email, buka Authentication > Providers >
Email pada project Supabase dan aktifkan **Confirm email** dalam keadaan nonaktif
(Supabase dapat menamai opsi itu “Enable email confirmations”). Ini mengizinkan sesi
langsung setelah signup, sesuai perilaku aplikasi. Gunakan password kuat, batasi
akses project, dan pastikan aturan signup yang dipilih sesuai kebijakan toko. Jika
verifikasi email tetap aktif, akun yang baru dibuat belum dapat memakai fitur akun
sampai Supabase mengeluarkan sesi; aplikasi akan menampilkan pesan konfigurasi.

Pesanan yang checkout saat login ditautkan ke akun melalui Edge Function; checkout
sebagai tamu tetap tersedia dan tidak ditampilkan di riwayat akun. Wishlist hanya
tersedia untuk user login dan RLS membatasi datanya ke pemilik akun. Artikel/footer
dapat diatur pada menu “Artikel & footer” di backoffice; artikel draf tidak publik.
Footer menampilkan nama dari metode pembayaran aktif yang dikelola pada menu
“Metode bayar” (tanpa membocorkan nomor rekening). Cerita brand pada footer memakai
artikel terbit terbaru yang memiliki foto sampul; kelola sampul, judul, ringkasan, dan
isi melalui menu “Artikel & footer”. Tautan Bagikan di kartu maupun detail produk
menggunakan fitur berbagi perangkat, atau menyalin tautan jika fitur berbagi tidak
tersedia. Nomor dan tombol WhatsApp berasal dari pengaturan WhatsApp Admin.
Filter Kategori dan Urutkan pada katalog memakai menu dropdown kustom dengan opsi
berbentuk kartu, penanda pilihan, dan dukungan keyboard (panah, Home/End, Enter,
Escape, serta pencarian huruf). Kontrol pilihan lain yang tidak diganti tetap memakai
select native browser.
Kupon dikelola lewat menu “Kupon”, satu kode per checkout. Sistem menghitung ulang
diskon dan batas pemakaian di database pada saat checkout, menggunakan hash nomor
WhatsApp untuk batas per pelanggan. Pembatalan order tidak otomatis mengembalikan
pemakaian kupon. Menu Produk & katalog menyediakan impor CSV maksimal 250 produk
sekali operasi; galeri/varian tidak termasuk impor massal.

Setelah migration pertumbuhan, jalankan `supabase/migrations/20261011000000_remove_midtrans.sql`
untuk membersihkan skema lama yang mungkin tertinggal. Backup dahulu: kolom
konfigurasi/token/transaksi dihapus, tetapi pesanan dan snapshot metode pembayaran
tetap tersimpan. Project baru juga boleh menjalankannya agar seluruh environment
menggunakan urutan migration yang sama.

Integrasi tarif kurir Komerce belum diaktifkan karena kontrak endpoint/authentication
dan format tarif resmi belum dapat diverifikasi. Jangan mengisi tarif seolah-olah
hasil kurir otomatis; checkout saat ini menggunakan ongkir datar yang diatur Admin.

## 4. Konfigurasi Auth dan environment frontend

Atur Auth Site URL ke domain toko yang sebenarnya. Tambahkan redirect pemulihan:

```text
https://DOMAIN-TOKO-ANDA/backoffice/recovery
http://localhost:5173/backoffice/recovery
```

Aktifkan **Allow new users to sign up** dan nonaktifkan **Confirm email** untuk
mengizinkan akun pelanggan langsung digunakan. Login Admin dilindungi allowlist
database secara terpisah. Konfigurasi pengiriman email Auth mengikuti akun Supabase
Anda; tidak ada provider baru yang ditambahkan oleh aplikasi ini. Jika nanti ingin
membatasi pembuatan akun, ubah kebijakan signup dengan sengaja karena halaman daftar
pelanggan saat ini mengandalkan signup email/password Supabase.

Salin `.env.example` menjadi `.env.local`:

```env
VITE_SUPABASE_URL=https://PROJECT_REF_BARU.supabase.co
VITE_SUPABASE_ANON_KEY=PUBLIC_PUBLISHABLE_ATAU_LEGACY_ANON_KEY_PROJECT_BARU
```

Gunakan URL dan key dari project YANG SAMA. Nama variabel ANON_KEY tetap digunakan
meski nilainya publishable key. Tidak menggunakan URL/anon key project lama sebagai
fallback. Jangan memasukkan service_role, sb_secret, atau password database pada
variabel VITE_*. Variabel frontend menjadi bagian bundle browser.

Tawk yang sudah ada pada source asli kini opsional. Isi VITE_TAWK_PROPERTY_ID dan
VITE_TAWK_WIDGET_ID hanya bila Anda masih menguasai property itu. Script dimuat setelah
pembeli menekan Chat langsung. Tanpa konfigurasi, gunakan WhatsApp; tidak ada widget
milik akun lama yang dipasang otomatis. Antarmuka vendor Tawk bukan komponen yang
kita desain ulang; secara default integrasinya tidak aktif.

## 5. Pasang Supabase Edge Functions — diperlukan untuk checkout

SQL membangun database, bukan men-deploy function server. Bahkan pembayaran manual
memerlukan `rapid-api` karena validasi checkout/nominal tidak dipercayakan ke browser.
Kedua function memakai runtime Supabase; tidak menambahkan server/cloud/database lain.

Dari root repository, login CLI Supabase dengan akun BARU:

```bash
npx supabase login
```

Buat `.env.edge` dari `supabase/functions/.env.example`. Ganti ALLOWED_ORIGINS dengan
origin aplikasi yang nyata, dipisahkan koma, tanpa path/trailing slash. Contoh format:

```env
ALLOWED_ORIGINS=https://nama-toko.vercel.app,http://localhost:5173
```

Origin Preview Vercel berbeda-beda; tambahkan origin Preview yang memang Anda gunakan
secara eksplisit sebelum menguji. CORS bukan pengganti validasi identitas atau RLS.

SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY tersedia sebagai environment bawaan hosted
Supabase Edge Functions. Kode ini menggunakan service-role legacy pada server saja;
jangan menyalinnya ke env frontend, public.settings, atau GitHub. Pastikan nilai server
bawaan tersedia di project baru. `.env.edge` diabaikan oleh .gitignore.

Ganti PROJECT_REF_BARU pada perintah berikut dengan ref project yang benar:

```bash
npx supabase secrets set --env-file .env.edge --project-ref PROJECT_REF_BARU
npx supabase functions deploy rapid-api --project-ref PROJECT_REF_BARU --use-api
```

`--use-api` meminta bundling via API CLI. Konfigurasi verify_jwt=false disertakan:
checkout memang dapat diakses tamu; kontrol yang tepat diterapkan sendiri di handler.
Permintaan pengubahan oleh Admin memvalidasi bearer token ke Auth dan active Admin;
akses bukti tamu membutuhkan UUID request + token acak 256-bit. Jangan mengganti
handler dengan proxy service key.

Jika browser menampilkan “Failed to send a request to the Edge Function” saat checkout,
pastikan function `rapid-api` sudah dideploy dari source terbaru dan `ALLOWED_ORIGINS`
memuat origin persis situs aktif, misalnya `https://nama-toko.vercel.app` (tanpa path
atau slash akhir). Setelah mengubah source CORS atau secret, deploy ulang function dan
coba checkout lagi pada tab yang sama.

Jika project sebelumnya telah memakai skema lama, backup database lalu jalankan
`supabase/migrations/20261011000000_remove_midtrans.sql` setelah migration pertumbuhan
toko. Migration ini menghapus konfigurasi, token, ID transaksi dan fungsi pembayaran
otomatis; snapshot instruksi pembayaran pesanan lama tetap dipertahankan. Metode lama
dinonaktifkan agar tidak muncul lagi di checkout. Setelah redeploy `rapid-api`, hapus
function dan secrets lama secara terpisah:

```bash
npx supabase functions delete midtrans-webhook --project-ref PROJECT_REF_BARU
npx supabase secrets unset MIDTRANS_SERVER_KEY_SANDBOX MIDTRANS_SERVER_KEY_PRODUCTION --project-ref PROJECT_REF_BARU
```

Jangan jalankan migration sebelum backup, dan jangan anggap penghapusan resource cloud
terjadi hanya karena source code dihapus dari repository.

## 6. Jalankan dan bangun frontend

```bash
npm ci
npm run check:files
npm test
npm run typecheck
npm run build
npm run dev
```

PowerShell: gunakan Copy-Item .env.example .env.local untuk menyalin file environment.
Isi nilainya dahulu. Tanpa konfigurasi yang valid, aplikasi menampilkan layar penjelasan,
bukan mencoba terhubung ke project lama. Build tetap menjalankan typecheck strict.

GitHub workflow `.github/workflows/ci.yml` melakukan clean install/test/build pada
pull request dan push ke branch `main`. Workflow tidak menjalankan SQL, tidak
men-deploy Edge Function, dan tidak memanggil pembayaran. Build CI GitHub tetap perlu
diperiksa setelah workflow pertama berjalan. Build yang gagal tidak boleh dianggap
deployment berhasil.

## 7. Deploy Vercel

Hubungkan repository WEB SHOP ke project Vercel, atau perbarui branch project webshop
yang sama. Root Directory menunjuk folder package.json; Framework Preset: Vite;
Build Command: npm run build; Output Directory: dist; Node.js: 22.x.

Tambahkan dua variabel VITE_SUPABASE_* di Vercel untuk environment yang relevan.
Tambahkan Tawk env hanya bila digunakan. Sesudah mengubah variabel, buat deployment
baru. `vercel.json` mempertahankan rewrite SPA agar /backoffice dan recovery dapat
dibuka langsung. Tidak ada secret server yang perlu ditambahkan ke Vercel frontend.

Commit seluruh folder src dan supabase, bukan hanya App.tsx/Admin.tsx. Jangan upload
ZIP sebagai satu file repository. Periksa import dan filename kapitalisasi dengan
npm run check:files sebelum push. Pengaturan GitHub/Vercel nyata tidak diubah oleh
penyerahan file ini.

## 8. Lengkapi toko melalui /backoffice

Login dengan Admin yang dibootstrap. Pada Pengaturan, isi nama toko, kategori, banner,
nomor WhatsApp, ongkos kirim tetap, dan ambang gratis ongkir opsional. Nilai ongkir
bukan tarif otomatis kurir atau per kota; pastikan sesuai wilayah layanan toko.

Tambahkan produk nyata: nama, harga integer Rupiah, deskripsi, kategori, foto maksimal
5, variasi maksimal 30, serta stok. Foto JPG/PNG/WebP maksimal 5 MB per file. Bucket
berisi gambar publik; jangan unggah KTP, bukti transfer, atau dokumen privat ke sana.
Menghapus gambar dari galeri tidak otomatis menghapus objek Storage karena objek lama
mungkin masih dibutuhkan referensi pesanan. Pembersihan Storage dilakukan terpisah
setelah mengecek referensi. File galeri hanya merupakan konten yang Anda miliki.

Stok kosong berarti tidak dibatasi, bukan stok nol. Stok 0 berarti tidak dapat
menerima item tersebut. Penghitungan stok per PRODUK, bukan per variasi warna. Saat
pesanan dibuat, stok langsung direservasi termasuk ketika menunggu pembayaran.

Tambahkan metode manual yang nyata. Bank/E-Wallet memerlukan nomor dan pemilik rekening;
QRIS memerlukan gambar QRIS. Harga/nama/nomor metode disnapshot pada pesanan sehingga
perubahan berikutnya tidak mengubah instruksi pembayaran pesanan lama.

Pembeli membuat pesanan, meninjau total FINAL server, lalu membayar. WhatsApp merupakan
click-to-chat atas pilihan pembeli, bukan bukti bahwa pesan sudah terkirim. Admin
memverifikasi mutasi rekening, bukan hanya mempercayai screenshot pembeli.

## 9. Mengelola pesanan dan batas operasional

Pembayaran manual: pending -> lunas setelah Admin memeriksa dana; atau pending -> dibatalkan
beserta pengembalian stok sekali saja. Pesanan lunas dapat diproses -> dikirim
(kurir + resi wajib) -> selesai. Alasan perubahan disimpan pada order_events.

Tidak ada verifikasi pembayaran otomatis atau gateway di aplikasi. Untuk pesanan
provider lama yang masih tertunda, cocokkan mutasi dan status merchant di luar aplikasi
sebelum Admin memilih konfirmasi atau pembatalan. Migration tidak mengubah status atau
stok pesanan lama secara otomatis. Status refund lama dipertahankan sebagai riwayat;
rekonsiliasi dana/barang dilakukan manual.

Bukti pesanan tamu disimpan dengan secret proof di sessionStorage tab; tidak di URL.
Di halaman bukti pesanan, unduh file kunci pemulihan untuk membuka kembali bukti setelah
tab/penyimpanan browser hilang: pilih file tersebut pada halaman Pesanan terakhir.
Simpan file secara pribadi; siapa pun yang memilikinya dapat membuka ringkasan pesanan.
File hanya berisi token akses acak, ID request, tanda tangan request dan nomor pesanan,
bukan alamat atau nomor telepon. Akses server dibatasi 30 hari. Tanpa file pemulihan,
bukti hanya tersedia pada tab saat pesanan dibuat. Cart di localStorage berisi data
katalog/qty, bukan credential pelanggan.
Harga cart hanya estimasi; server mengambil ulang harga/varian/stok saat checkout.
Tab hilang/penyimpanan diblokir dapat menghilangkan akses bukti; pembeli menyimpan nomor
pesanan untuk menghubungi Admin. Tidak ada akun pembeli/riwayat publik berdasarkan
nomor telepon yang dapat ditebak.

Analitik menghitung data nyata. Pendapatan memasukkan ongkir, dikurangi refund
terverifikasi; subtotal produk pada statistik produk tidak mengalokasikan refund
sebagian. Filter tanggal memakai WIB. Ekspor CSV hanya HALAMAN yang dimuat (maks. 20),
bukan seluruh database; label tombol menyebutkan batas ini. Sel CSV berisiko formula
diescape. Data pesanan hasil ekspor berisi informasi pelanggan; simpan secara aman.

Batas request server: checkout global 250/menit; IP terbaik yang tersedia 8/menit;
nomor telepon (hash) 6/10 menit; semua request 90/menit/IP; payment6/menit/order.
Ini mitigasi dasar, bukan jaminan anti-bot/DDOS sempurna. Jangan menganggap CORS atau
anon key sebagai otorisasi Admin. SQL/service functions tetap membatasi akses.

## 10. Pengujian sebelum rollout

Baca QA_REPORT.md. Tes lokal yang disertakan tidak menggantikan uji Supabase nyata.
Di project staging, jalankan setup, jalankan ulang untuk idempotensi, kemudian
`supabase/tests/database-smoke.sql` sebagai postgres SQL Editor. File test memakai
fixture transaksi dan ROLLBACK, bukan data toko. Bila assertion gagal, jalankan
ROLLBACK sebelum meninggalkan sesi test. File ini belum dieksekusi di lingkungan
penyerahan yang tidak menyediakan PostgreSQL.

Uji anon/non-Admin ditolak membuka orders/Admin RPC, Admin berhasil menyimpan master,
checkout harga dimanipulasi, stok terakhir dipesan dua sesi, retry timeout request
sama, salah proof, galeri5gambar, stock0, pembayaran Bank/E-Wallet/QRIS manual, resi,
logout/perubahanAdmin, reloadURL, serta tampilan perangkat Anda. Uji pemulihan password
melalui email dan izin Storage. Baru lanjutkan production setelah hasil nyata lulus.

Masalah konfigurasi umum: “relation does not exist” = SQL belum selesai/project salah;
401/403 Admin = Auth/allowlist/RLS; function not found = rapid-api belum dideploy;
CORS = ALLOWED_ORIGINS tidak memuat origin; vite/client not found = dependencies
belum terpasang, bukan API key salah.
Jangan menyelesaikan error dengan service key di browser atau mematikan strict/RLS.

## 11. Rujukan teknis resmi

Rujukan berikut dipakai untuk desain integrasi, bukan bukti konfigurasi akun Anda.

- Supabase Functions secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase SQL functions: https://supabase.com/docs/guides/database/functions
- Supabase CLI deploy: https://supabase.com/docs/reference/cli/supabase-functions-deploy
- Supabase Storage RLS: https://supabase.com/docs/guides/storage/security/access-control
- Tailwind3/Vite: https://v3.tailwindcss.com/docs/guides/vite
