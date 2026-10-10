# QA — ZYHA ID webshop 1.2.0

Tanggal laporan: 10 Oktober 2026. Basis: 14 file webshop yang diunggah di percakapan.

**Status: fitur toko, tes, typecheck, dan build lokal lulus. Ini belum berarti
release production tervalidasi: migration SQL/RLS, Auth/Realtime, Edge Functions,
provider shipping, GitHub CI, Vercel, dan pembayaran live belum diuji.**

## Validasi terbaru — 10 Oktober 2026

Validasi awal setelah konfigurasi deployment dan pemulihan bukti pesanan menjalankan
`npm ci`, 79 tes, dan production build. Setelah penambahan akun/wishlist/artikel/footer,
kupon, dan impor massal, `node scripts/run-tests.cjs`, `npm run typecheck`,
`npm run build`, dan `node scripts/check-files.cjs` kembali berhasil. Setelah penghapusan integrasi pembayaran otomatis, `node scripts/run-tests.cjs`,
`npm run build`, dan `node scripts/check-files.cjs` lulus kembali. Pengujian terakhir
setelah dropdown Kategori/Urutkan menjadi menu kustom meliputi 67 tes, build,
dan pemeriksaan file/import. Shipping groundwork kemudian melewati 73 tes, strict
typecheck dan production build lokal; migration PostgreSQL tidak dieksekusi.
Build mencakup
strict typecheck dan Vite production bundle. Lingkungan ini memakai Node 24.14.0/npm
11.11.0, sedangkan project dan workflow CI menetapkan Node 22; hasil ini belum
menggantikan pemeriksaan runner Node 22. Tidak ada SQL, Supabase, shipping provider,
GitHub Actions remote, atau deployment Vercel yang dijalankan.

Pembaruan storefront terbaru menambahkan navigasi ikon, berbagi produk, tombol
WhatsApp kontekstual, metode pembayaran aktif pada footer, serta cerita brand dari
artikel admin. Filter Kategori dan Urutkan kini memakai popup kustom dengan navigasi
keyboard. Assertion source memeriksa integrasi Admin dan struktur aksesibelnya.
Tes, strict typecheck, build production, pemeriksaan import, dan git diff check telah
berhasil. Browser belum dapat menguji data katalog langsung karena environment
Supabase lokal tidak dikonfigurasi.

## Yang benar-benar dijalankan

| Pemeriksaan | Hasil | Bukti dan cakupan |
|---|---|---|
| Unit domain/checkout/shipping/pembayaran manual + assertion source | 73 tes lulus setelah shipping groundwork | Pure TS dikompilasi dan dieksekusi dengan Node; assertion source bukan transaksi DB. |
| Syntax TypeScript | 25 file, 0 parse error | docs/qa/syntax.json; TypeScript5.8.3 aktual. Tidak menggantikan pemeriksaan tipe penuh |
| Kelengkapan/import lokal | 15 file wajib, 25source, 71import relatif lulus | docs/qa/imports.log; jalur relatif nyata, bukan declaration shim |
| Layout CSS browser | 25/25 fixture lulus | docs/qa/mobile-layout.json; Chromium, lebar320/360/390/768/1440 |
| Source formatting | Struktur emitted JS dibandingkan | docs/qa/format-verification.json; tidak dianggap tes integrasi |
| Clean install `npm ci` | Lulus, 148 paket | Dijalankan dengan lockfile di lingkungan Node 24; npm memberi peringatan engine karena project meminta Node 22 |
| Full typecheck | Lulus | `npm run build` menjalankan strict frontend dan Vite config typecheck sebelum bundling |
| `npm run build` | Lulus | Strict typecheck dan Vite production bundle setelah integrasi pembayaran otomatis dihapus |
| Impor CSV / kupon / akun di Supabase | BELUM DIEKSEKUSI LIVE | Tes lokal validasi domain/kontrak; tidak ada import/query aktual ke Supabase |
| API tarif / booking / label kurir | BELUM DIINTEGRASIKAN | Provider belum dipilih; interface saja tersedia, tidak ada API key atau request provider |
| SQL/RLS/trigger/functions di PostgreSQL | BELUM DIEKSEKUSI | Tidak ada PostgreSQL/Supabase staging yang terotorisasi di lingkungan ini |
| Edge Deno deploy/typecheck dan CORS live | BELUM DIUJI LIVE | Header CORS `x-supabase-api-version` sudah ditambahkan; belum dideploy ke Supabase project pengguna |
| Semua halaman React dengan data Supabase | BELUM DIUJI END-TO-END | Fixture layout bukan aplikasi React terhubung |
| GitHub CI/Vercel deployment | BELUM DIJALANKAN | File saja disediakan; tidak ada perubahan remote |

Runtime validasi terbaru: Node24.14.0, npm11.11.0; workflow ditetapkan ke Node22.
Tes unit tidak memalsukan paket React/Vite/Supabase atau menonaktifkan strict agar
terlihat lulus.

## Shipping groundwork

Checkout/Admin sekarang menggunakan alamat penerima terstruktur; Admin dapat
menyimpan alamat gudang dengan RLS admin-only, mengelola berat gram produk, dan
mencetak packing slip yang escaping data pembeli. Ongkir tetap flat-rate dan nomor
resi/kurir tetap dapat dicatat manual. Shipping quote dan shipment tables, serta
provider interface hanya merupakan schema/kontrak; tidak ada API kurir yang dipanggil,
AWB yang dibuat, SQL yang diterapkan, atau Supabase/Vercel deployment yang dilakukan.
Migration baru belum diuji pada PostgreSQL/Supabase staging. Verifikasi otomatis lokal
meliputi test suite, strict typecheck, build, dan pemeriksaan import setelah perubahan.

`docs/qa/partial-diagnostics.json`, `docs/qa/install.log`, `docs/qa/typecheck.log`,
`docs/qa/build.log`, dan `docs/qa/tests.log` mencatat pemeriksaan pada iterasi
sebelumnya saat dependency tidak tersedia. Log tersebut bersifat historis; hasil
validasi terbaru di atas menggantikannya untuk tes/build lokal, bukan untuk staging
Supabase, CI GitHub, atau deployment.

## Cakupan tes yang lulus

- Cart merge produk+varian, quantity/stock/status, stok nol, perhitungan estimasi ongkir,
  validasi nomor WhatsApp/alamat, cart lokal kedaluwarsa/rusak, URL gambar dan formula CSV.
- Checkout server mengabaikan harga/total kiriman browser, memvalidasi UUID/proof,
  jumlah barang, duplikasi item, nominal provider dan respons GET status.
- Capture challenge tidak dianggap paid; capture accept/settlement yang sesuai dapat
  dipetakan paid; currency/ID/amount salah ditolak; signature comparison diuji.
- Pada versi sebelumnya, payload pembayaran otomatis diuji; integrasi tersebut
  sudah dihapus dan tes ini bukan validasi untuk versi saat ini.
- Assertion source menjaga Admin Auth gate, tidak ada pembaruan paid/server key di frontend,
  revoked RPC tamu, receipt yang di-hash, lock reservasi, mode pembayaran per pesanan, webhook GET,
  sandbox/production, uploads, tidak ada seed bisnis palsu/ikon dan kelengkapan file.
- Format kunci pemulihan pesanan yang diunduh diuji menerima format versi yang dikenal
  dan menolak JSON rusak maupun versi yang tidak didukung. File berisi token akses,
  bukan data alamat/nomor telepon; siapa pun yang memilikinya dapat membaca ringkasan
  pesanan sampai masa akses server 30 hari berakhir.
- Parser impor CSV menguji escaping kutip/koma, header duplikat, format harga dan URL
  gambar; semua baris divalidasi di browser sebelum satu batch insert. Tidak ada tes
  terhadap service database remote atau kegagalan jaringan saat insert.
- Kalkulasi diskon dan tampilan pembayaran manual diuji lokal; batas konkurensi/pemakaian kupon
  mengandalkan row lock pada migration dan wajib diuji pada Supabase staging.

Assertion keberadaan grant/lock/signature pada file SQL tidak membuktikan PostgreSQL
menerapkan policy dengan benar. Supabase tests/database-smoke.sql disediakan sebagai
pengujian nyata yang harus dijalankan pada project staging Anda setelah setup.

## Batas fixture mobile

`scripts/qa/check-mobile-layout.py` menggunakan CSS index.css hasil implementasi dan
markup statis representatif katalog, pesanan Admin, checkout, dialog produk, dan keranjang. Dokumen
inline sengaja bertuliskan fixture pengujian. Tidak memakai database pengganti dalam
aplikasi. Screenshot bukan katalog/data pelanggan Anda dan bukan screenshot hasil
bundle Vite/Tailwind/React production.

Browser memeriksa overflow halaman/kontrol dan ukuran input mobile. Tiga kegagalan
awal terjadi karena font file input 14px, kemudian diperbaiki menjadi 16px dan 25 fixture lulus.
Screenshot 360 dan 1440 tersedia di docs/qa/layout-*.png. Script memerlukan Python
Playwright dan Chromium untuk mengulang, terpisah dari dependency/runtime website.
Pengujian itu tidak mencakup keyboard virtual perangkat nyata, popup pembayaran, login,
email pemulihan, RLS atau rehydration data.

## Review keamanan dan batas operasional

Review source dilakukan dalam sesi pengerjaan, bukan audit keamanan independen.
Data penjualan asli/backup/Auth lama tidak disertakan. Tidak ada klaim telah memulihkan
Supabase lama. RLS baru/grants SQL/service RPC/pemeriksaan header didesain selaras, tetapi
harus diuji dengan anon, user non-Admin, Admin, request palsu dan replay pada staging.

Pembatasan request IP/phone/global adalah mitigasi dasar, bukan perlindungan DDOS
lengkap. Pesanan pending mereservasi stok. Token pembayaran yang sudah diterbitkan tidak dibatalkan
secara buta hanya karena GET status 404; pelanggan dapat masih membayar. Rekonsiliasi
pending, pembayaran terlambat, refund, pembatalan capture, returnedgoods dan metode paylater merchant
harus diuji sebelum penggunaan nyata. Tidak menambahkan cron expiry fiktif.

## Release gate yang belum ditutup

1. Jalankan workflow GitHub Actions pada Node 22 dan verifikasi Preview Vercel.
2. Jalankan setup pada Supabase baru, ulang sekali, lalu SQL smoke test dan audit RLS/Storage.
3. Deploy Edge Functions dan uji request checkout, idempotency, stock concurrency,privasi receipt.
4. Uji akun Admin/anon/non-Admin, recovery, logout, perubahan izin, galeri, CSV, semua form.
5. Uji pembayaran manual, konfirmasi Admin, pengembalian stok, dan pesanan lama pada Supabase staging.
6. Pilih provider shipping, verifikasi akses akun/fitur, implementasikan adapter dan
   uji staging sebelum mengaktifkan tarif dinamis; checkout kini masih flat-rate.
7. Vercel Preview pada perangkat mobile/desktop; production hanya setelah semua gate lulus.

README_DEPLOYMENT.md berisi urutan setup dan penyimpanan secrets yang tepat. Tidak perlu
menambahkan service key ke frontend untuk mengatasi error konfigurasi.

## Verifikasi paket unduhan

ZIP diekstrak ke direktori terpisah, lalu npm test, check-files dan pemeriksaan syntax
benar-benar dijalankan dari hasil ekstraksi:76/76teslulus;25source,71importrelatif
lulus. Percobaan build hasil ekstraksi tetap gagal pada vite/client yang belum
terpasang. Log delivery-tests.log, delivery-imports.log dan delivery-build.log di
docs/qa menyertakan outputnya. ZIP juga diuji CRC dan dibandingkan dengan setiap hash
pada PACKAGE_MANIFEST.json. Manifest tidak mencakup hash file manifest itu sendiri.
