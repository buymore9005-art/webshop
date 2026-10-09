# QA — ZYHA ID webshop 1.1.0

Tanggal laporan: 10 Oktober 2026. Basis: 14 file webshop yang diunggah di percakapan.

**Status: kandidat implementasi lengkap sebagai source, belum release production
tervalidasi. Full build belum lulus. Eksekusi SQL dan pembayaran live belum diuji.**

## Yang benar-benar dijalankan

| Pemeriksaan | Hasil | Bukti dan cakupan |
|---|---|---|
| Unit domain/checkout/gateway + assertion source | 76 lulus, 0 gagal, 0 skip | docs/qa/tests.log; pure TS dikompilasi dan dieksekusi dengan Node; sebagian tes adalah assertion source, bukan transaksi DB |
| Syntax TypeScript | 25 file, 0 parse error | docs/qa/syntax.json; TypeScript5.8.3 aktual. Tidak menggantikan pemeriksaan tipe penuh |
| Kelengkapan/import lokal | 15 file wajib, 25source, 71import relatif lulus | docs/qa/imports.log; jalur relatif nyata, bukan declaration shim |
| Layout CSS browser | 25/25 fixture lulus | docs/qa/mobile-layout.json; Chromium, lebar320/360/390/768/1440 |
| Source formatting | Struktur emitted JS dibandingkan | docs/qa/format-verification.json; tidak dianggap tes integrasi |
| Instalasi npm | Tidak berhasil, timeout exit124 | docs/qa/install.log dan .exit; registry tidak terjangkau saat pengerjaan |
| Full typecheck | Gagal, exit2 | docs/qa/typecheck.log; vite/client belum tersedia karena dependencies belum terpasang |
| npm run build | Gagal, exit2 | docs/qa/build.log; pemeriksaan file lulus, mandatory typecheck berhenti sebelum Vite |
| SQL/RLS/trigger/functions di PostgreSQL | BELUM DIEKSEKUSI | Tidak ada PostgreSQL/Supabase staging yang terotorisasi di lingkungan ini |
| Edge Deno deploy/typecheck dan Midtrans | BELUM DIUJI LIVE | Hanya validasi pure/helper, parse source dan kontrak keamanan; tidak ada secret merchant |
| Semua halaman React dengan data Supabase | BELUM DIUJI END-TO-END | Fixture layout bukan aplikasi React terhubung |
| GitHub CI/Vercel deployment | BELUM DIJALANKAN | File saja disediakan; tidak ada perubahan remote |

Runtime: Node22.16.0, npm10.9.2, TypeScript5.8.3 preinstalled. Tes unit tidak
memalsukan paket React/Vite/Supabase atau menonaktifkan strict agar terlihat lulus.

`docs/qa/partial-diagnostics.json` adalah diagnostik programmatic compiler ketika
paket eksternal masih hilang; banyak error dependency/JSX/inference tetap muncul.
Tidak ditemukannya unbound internal name pada pemeriksaan itu BUKAN full typecheck
lulus. Jangan menafsirkan parse/import atau hasil76tes sebagai kepastian build.

## Cakupan tes yang lulus

- Cart merge produk+varian, quantity/stock/status, stok nol, perhitungan estimasi ongkir,
  validasi nomor WhatsApp/alamat, cart lokal kedaluwarsa/rusak, URL gambar dan formula CSV.
- Checkout server mengabaikan harga/total kiriman browser, memvalidasi UUID/proof,
  jumlah barang, duplikasi item, nominal provider dan respons GET status.
- Capture challenge tidak dianggap paid; capture accept/settlement yang sesuai dapat
  dipetakan paid; currency/ID/amount salah ditolak; signature comparison diuji.
- Snap menggunakan ID item unik per varian, total konsisten, pemotongan alamat hanya untuk
  provider; ukuran payload dibatasi, tanpa mengubah snapshot order atau nominal.
- Assertion source menjaga Admin Auth gate, tidak ada pembaruan paid/server key di frontend,
  revoked RPC tamu, receipt yang di-hash, lock reservasi, mode pembayaran per pesanan, webhook GET,
  sandbox/production, uploads, tidak ada seed bisnis palsu/ikon dan kelengkapan file.

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

1. npm install/lockfile nyata, clean npm ci, typecheck dan build exit0.
2. Jalankan setup pada Supabase baru, ulang sekali, lalu SQL smoke test dan audit RLS/Storage.
3. Deploy Edge Functions dan uji request checkout, idempotency, stock concurrency,privasi receipt.
4. Uji akun Admin/anon/non-Admin, recovery, logout, perubahan izin, galeri, CSV, semua form.
5. Midtrans sandbox end-to-end dengan notifikasi/GET status/retry/refund/nominal asli.
6. Vercel Preview pada perangkat mobile/desktop; production hanya setelah semua gate lulus.

README_DEPLOYMENT.md berisi urutan setup dan penyimpanan secrets yang tepat. Tidak perlu
menambahkan service key ke frontend untuk mengatasi error konfigurasi.

## Verifikasi paket unduhan

ZIP diekstrak ke direktori terpisah, lalu npm test, check-files dan pemeriksaan syntax
benar-benar dijalankan dari hasil ekstraksi:76/76teslulus;25source,71importrelatif
lulus. Percobaan build hasil ekstraksi tetap gagal pada vite/client yang belum
terpasang. Log delivery-tests.log, delivery-imports.log dan delivery-build.log di
docs/qa menyertakan outputnya. ZIP juga diuji CRC dan dibandingkan dengan setiap hash
pada PACKAGE_MANIFEST.json. Manifest tidak mencakup hash file manifest itu sendiri.
