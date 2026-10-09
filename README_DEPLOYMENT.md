# ZYHA ID — panduan setup, deployment, dan operasi

Versi source 1.1.0. Basisnya 14 file webshop yang diunggah, bukan aplikasi produksi.
Seluruh kode di ZIP adalah file lengkap. Tidak ada perubahan langsung ke GitHub,
Vercel, Supabase lama, atau akun Midtrans pengguna.

**Penting:** build penuh dan database/payment live belum tervalidasi di lingkungan
pengerjaan. Jangan menganggap tes unit sebagai bukti siap menerima pembayaran nyata.
Gunakan project staging terlebih dahulu. Hasil dan batas pemeriksaan ada di QA_REPORT.md.

## 1. Siapkan repository dan project baru

Ekstrak isi ZIP ke working copy/branch repository webshop Anda. Root harus berisi
`package.json`, `main.tsx`, `App.tsx`, `Admin.tsx`, `index.html`, dan folder `src/` serta
`supabase/`. Tidak ada folder pembungkus tambahan dalam ZIP. Jangan campur dengan
file PRODUCTION BUYMORE. Simpan commit/backup repository lama sebelum menyalin.

Pakai Node.js 22 dan npm. Framework dan dependency utama mengikuti repository asli.
Lockfile webshop tidak diunggah dan instalasi lokal gagal karena registry tidak
terjangkau, sehingga paket tidak mempunyai package-lock.json buatan. Setelah npm
install berhasil di komputer/CI yang terhubung internet, periksa dan commit lockfile
aslinya. Sesudah itu gunakan npm ci untuk clean install. Jangan memakai lockfile
aplikasi produksi yang pernah diunggah pada percakapan lain.

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
| settings | Nama/banner/kategori/WhatsApp/ongkir dan konfigurasi Midtrans PUBLIC |
| payment_methods | Bank, E-Wallet, QRIS manual, dan Midtrans opsional |
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

## 3. Konfigurasi Auth dan environment frontend

Atur Auth Site URL ke domain toko yang sebenarnya. Tambahkan redirect pemulihan:

```text
https://DOMAIN-TOKO-ANDA/backoffice/recovery
http://localhost:5173/backoffice/recovery
```

Sesuai kebutuhan toko, nonaktifkan public email signup; checkout tamu tidak memakai
signup. Login Admin dan pemulihan password memakai Supabase Auth. Konfigurasi
pengiriman email Auth mengikuti akun Supabase Anda; tidak ada provider baru yang
ditambahkan oleh aplikasi ini.

Salin `.env.example` menjadi `.env.local`:

```env
VITE_SUPABASE_URL=https://PROJECT_REF_BARU.supabase.co
VITE_SUPABASE_ANON_KEY=PUBLIC_PUBLISHABLE_ATAU_LEGACY_ANON_KEY_PROJECT_BARU
```

Gunakan URL dan key dari project YANG SAMA. Nama variabel ANON_KEY tetap digunakan
meski nilainya publishable key. Tidak menggunakan URL/anon key project lama sebagai
fallback. Jangan memasukkan service_role, sb_secret, password database, atau Midtrans
server key pada variabel VITE_*. Variabel frontend menjadi bagian bundle browser.

Tawk yang sudah ada pada source asli kini opsional. Isi VITE_TAWK_PROPERTY_ID dan
VITE_TAWK_WIDGET_ID hanya bila Anda masih menguasai property itu. Script dimuat setelah
pembeli menekan Chat langsung. Tanpa konfigurasi, gunakan WhatsApp; tidak ada widget
milik akun lama yang dipasang otomatis. Antarmuka vendor Tawk bukan komponen yang
kita desain ulang; secara default integrasinya tidak aktif.

## 4. Pasang Supabase Edge Functions — diperlukan untuk checkout

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
npx supabase functions deploy midtrans-webhook --project-ref PROJECT_REF_BARU --use-api
```

`--use-api` meminta bundling via API CLI. Konfigurasi verify_jwt=false disertakan:
checkout memang dapat diakses tamu; kontrol yang tepat diterapkan sendiri di handler.
Permintaan pengubahan oleh Admin memvalidasi bearer token ke Auth dan active Admin;
akses bukti tamu membutuhkan UUID request + token acak 256-bit; webhook memverifikasi
signature dan GET status Midtrans. Jangan mengganti handler dengan proxy service key.

## 5. Jalankan dan bangun frontend

```bash
npm install
npm run check:files
npm test
npm run typecheck
npm run build
npm run dev
```

PowerShell: gunakan Copy-Item .env.example .env.local untuk menyalin file environment.
Isi nilainya dahulu. Tanpa konfigurasi yang valid, aplikasi menampilkan layar penjelasan,
bukan mencoba terhubung ke project lama. Build tetap menjalankan typecheck strict.

GitHub workflow `.github/workflows/ci.yml` melakukan install/test/build pada PR/push.
Workflow tidak menjalankan SQL, tidak men-deploy Edge Function, dan tidak memanggil
pembayaran. Bila lockfile belum ada ia menjalankan npm install; setelah lockfile
nyata dikomit ia menggunakan npm ci. Hasil workflow belum dijalankan dari lingkungan
penyerahan ini. Build yang gagal tidak boleh dianggap deployment berhasil.

## 6. Deploy Vercel

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

## 7. Lengkapi toko melalui /backoffice

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

## 8. Aktifkan Midtrans secara opsional, mulai dari sandbox

Source asli menggunakan Midtrans. Integrasi dipertahankan tetapi kode rapid-api lama
berikut secrets tidak tersedia dalam unggahan; implementasi server baru disertakan.

Atur MIDTRANS_SERVER_KEY_SANDBOX pada Edge Function Secrets untuk sandbox. Isi client
key sandbox di Pengaturan toko, pilih mode sandbox, aktifkan Midtrans, lalu tambahkan
metode bayar bertipe Midtrans. Jangan memasukkan server key ke formulir Admin.

Di konfigurasi Midtrans untuk environment yang sama, atur HTTP notification URL:

```text
https://PROJECT_REF_BARU.supabase.co/functions/v1/midtrans-webhook
```

Uji sandbox sampai tuntas: token, pending, capture/settlement, gagal, cancel/expire,
refund, notifikasi ulang, dan status diperiksa kembali setelah browser ditutup.
Frontend callback hanya memicu pemeriksaan; tidak bisa mengubah status paid sendiri.
Server memeriksa signature webhook lalu GET status, order ID, transaction ID, nominal,
dan currency bila fieldnya tersedia. Notifikasi duplikat tidak mengurangi stok lagi. Item IDs dibuat unik per baris varian; alamat ke provider dibatasi 255 karakter sementara alamat asli tetap utuh di orders.

Untuk production, gunakan server key production di Edge Secrets dan client key
production di Pengaturan dengan mode production. Pasang URL webhook juga pada
konfigurasi production Midtrans. Kunci/mode lama harus tetap tersedia bila masih ada
pesanan dari mode sebelumnya: tiap pesanan menyimpan snapshot mode/client key-nya.
Jangan menerima pembayaran nyata sebelum alur staging, RLS, dan payment lolos.

## 9. Mengelola pesanan dan batas operasional

Manual: pending -> lunas setelah Admin memeriksa dana; atau pending -> dibatalkan
beserta pengembalian stok sekali saja. Pesanan lunas dapat diproses -> dikirim
(kurir + resi wajib) -> selesai. Alasan perubahan disimpan pada order_events.

Midtrans: pembatalan/refund transaksi yang sudah dimulai dilakukan melalui merchant
Midtrans; tombol Periksa Midtrans mengambil status server. Aplikasi tidak memalsukan
cancel untuk pesanan yang masih dapat menerima pembayaran. Pengecualian aman tersedia
untuk pesanan minimal 5 menit tanpa token/transaksi/claim aktif dan GET status 404.
Pesanan dengan token tetapi tanpa transaksi provider dapat tetap pending; rekonsiliasi
melalui status/provider diperlukan. Tidak ada auto-expiry berdasarkan jam browser.

Late settlement setelah pelepasan stok tetap dicatat sebagai pembayaran nyata.
Aplikasi mencoba reservasi kembali dan memberi catatan rekonsiliasi bila stok kurang.
Refund tidak otomatis berarti barang sudah kembali secara fisik; stok barang yang
sudah dikirim harus ditinjau Admin, bukan otomatis ditambah saat refund.

Bukti pesanan tamu disimpan dengan secret proof di sessionStorage tab; tidak di URL.
Akses server dibatasi 30 hari. Alamat/nomor pelanggan tidak dipersist dalam bukti
browser baru. Cart di localStorage berisi data katalog/qty, bukan credential pelanggan.
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
sama, salah proof, galeri5gambar, stock0, pembayaran manual, resi, Midtranssandbox,
logout/perubahanAdmin, reloadURL, serta tampilan perangkat Anda. Uji pemulihan password
melalui email dan izin Storage. Baru lanjutkan production setelah hasil nyata lulus.

Masalah konfigurasi umum: “relation does not exist” = SQL belum selesai/project salah;
401/403 Admin = Auth/allowlist/RLS; function not found = rapid-api belum dideploy;
CORS = ALLOWED_ORIGINS tidak memuat origin; Midtrans unavailable = keys/mode belum
konsisten; vite/client not found = dependencies belum terpasang, bukan API key salah.
Jangan menyelesaikan error dengan service key di browser atau mematikan strict/RLS.

## 11. Rujukan teknis resmi

Rujukan berikut dipakai untuk desain integrasi, bukan bukti konfigurasi akun Anda.

- Supabase Functions secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase SQL functions: https://supabase.com/docs/guides/database/functions
- Supabase CLI deploy: https://supabase.com/docs/reference/cli/supabase-functions-deploy
- Supabase Storage RLS: https://supabase.com/docs/guides/storage/security/access-control
- Midtrans webhook: https://docs.midtrans.com/docs/https-notification-webhooks
- Midtrans status: https://docs.midtrans.com/reference/get-transaction-status
- Midtrans field limits: https://docs.midtrans.com/reference/json-objects
- Tailwind3/Vite: https://v3.tailwindcss.com/docs/guides/vite
