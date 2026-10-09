# CHANGELOG — ZYHA ID 1.1.0

Pengembangan dilakukan dari 14 file webshop pengguna. Tidak mengambil halaman,
SQL, role, atau dependency dari aplikasi PRODUCTION BUYMORE.

## Tahap 1 — audit dan pemetaan

Seluruh file diinventarisasi pada docs/INPUT_MANIFEST.json. Alur existing tetap
menjadi dasar: toko -> detail/varian -> cart -> checkout; /backoffice untuk
pengelolaan produk, pembayaran, pesanan, dashboard/analitik, WhatsApp dan pengaturan.
Schema lama tidak tersedia sehingga setup dibuat khusus untuk project baru.
Temuan source dan batas rekonstruksi dicatat pada docs/REPOSITORY_AUDIT.md.

## Tahap 2 — Supabase baru dan keamanan

- Satu supabase-setup.sql transactional dengan guard project kosong dan rerun schema ini.
- Nama empat tabel inti existing dipertahankan: products, settings, payment_methods, orders.
- Menambahkan admin_users, order_events dan schema privat untuk penanda/limit request.
- Bootstrap Admin berdasarkan user Auth confirmed milik pengguna; tidak ada password
  default atau kemampuan mengangkat role dari browser.
- RLS dan grants eksplisit. Pengunjung hanya membaca katalog/metode/pengaturan publik;
  daftar/detail privat pesanan tidak dapat dibaca langsung oleh anon/non-Admin.
- Checkout melalui Edge Function dan RPC service-only, bukan INSERT bebas dari browser.
- Bucket products dengan pembatasan format/ukuran; upload hanya active Admin.
- Tidak membuat ulang data produk, Auth atau Storage yang hilang. Tidak ada seed bisnis palsu.

## Tahap 3 — checkout dan pembayaran

- Jumlah barang digabung per produk/varian, validasi 1–99; cart persisten per project.
- Tombol beli langsung memakai cart hasil pembaruan, bukan state lama.
- Harga, varian, status aktif, ongkir dan stok diputuskan oleh database saat checkout.
- UUID request + proof + hash payload mencegah request retry membuat order/reservasi ganda.
- Nomor pesanan konsisten dengan database, bukan nomor WA buatan yang berbeda.
- Halaman receipt menampilkan total final sebelum pembayaran, instruksi manual/QRIS,
  status, cetak ringkasan dan tombol WhatsApp yang eksplisit.
- Field nama pemilik rekening yang sebelumnya tidak terisi kini tersedia.
- Midtrans rapid-api diimplementasikan karena file Edge lama tidak diunggah.
- Webhook baru: signature SHA-512 dan GET status server untuk validasi status/nominal/ID.
- Callback Snap tidak lagi bisa menulis paid ke database. Mode/client key disnapshot;
  server key berada hanya pada Supabase Secrets, bukan tabel settings/browser.
- Nominal request cocok total item, item IDs unik per baris varian, nama item maksimal
  50 karakter, alamat ke Midtrans maksimal 255 karakter; alamat penuh tetap di database.
  Request besar diringkas untuk batas ukuran Snap tanpa mengubah total/isi order asli.
  Kartu memakai request secure/3DS. Ketersediaan tiap channel tetap mengikuti merchant.
- Pending/cancel/expire/failure, capture/settlement, refund/partial_refund serta callback
  berulang ditangani. Late payment ditandai untuk rekonsiliasi stok bila diperlukan.
- Stok opsional per produk, reservasi atomic dan pelepasan stok sekali saja.

## Tahap 4 — backoffice dan UI mobile

- /backoffice dilindungi login Supabase Auth, cek Admin, lupa password dan logout.
- Sidebar teks desktop dan menu dialog mobile. Tidak ada Lucide, emoji, fake star ratings
  atau ornamen ikon buatan. Identitas ZYHA, warna biru/slate/putih tetap digunakan.
- Search/kategori/urutan dan pagination katalog bekerja melalui query database.
- Produk dua kolom pada ponsel, kontrol selalu tersedia tanpa hover-only.
- Form berlabel, ukuran input ponsel 16px, tombol utama minimal 44px, dialog native
  dengan fokus, scroll lock dan Escape; tabel Admin menjadi baris berlabel saat mobile.
- Produk/metode dapat dinonaktifkan; tidak menggunakan hard delete sebagai alur normal.
- Galeri maks.5 dan varian maks.30, pemeriksaan file JPEG/PNG/WebP hingga5MB.
- Optimistic version/updated_at check untuk menghindari penimpaan sunyi.
- Verifikasi pembayaran manual oleh Admin dengan alasan; pengiriman bertahap+resi+kurir.
- Ekspor CSV halaman pesanan yang sedang dimuat dengan perlindungan formula.
- Dashboard/analitik menghitung pesanan nyata; grafik trafik buatan dan +15% dihapus.
- WA tetap tautan manual, bukan gateway otomatis. Tawk opsional konfigurasi baru,
  tidak memakai widget akun lama secara otomatis.

## Tahap 5 — struktur repository dan build

Root main.tsx/App.tsx/Admin.tsx/supabaseClient.ts tetap ada. Komponen dipisahkan ke:

| Folder | Tanggung jawab |
|---|---|
| src/shop | Cart, checkout, receipt, pemuatan integrasi pembayaran/chat |
| src/admin | Produk, metode pembayaran, pesanan, dashboard/analitik, settings/WA |
| src/components | Auth gate dan komponen bersama |
| src/lib | Domain/validasi, API, pengambilan data dengan stale-response guard |
| supabase/functions | Edge checkout, webhook dan helper server/validasi |
| supabase/tests | Skenario SQL staging dengan rollback |
| tests / scripts | Tes domain/kontrak, pemeriksa import/source dan fixture layout |

- Konfigurasi Tailwind/PostCSS lokal ditambahkan; CDN Tailwind dan Snap statis dihapus.
- Versi mayor React18/Router6/Vite5/TS5/Tailwind3/Supabase2 tetap.
- lucide-react dihapus karena seluruh kontrol memakai teks; @types/node ditambahkan
  untuk typecheck konfigurasi Vite. Node22 dinyatakan eksplisit.
- npm run build mewajibkan pemeriksaan file + typecheck sebelum Vite.
- .env.example, README, panduan deployment, QA, dan GitHub checks disertakan.
- MIT license asli dipertahankan. vercel.json/Vite plugin existing tetap digunakan.

## Tahap 6 — pengujian dan perbaikan hasil pemeriksaan

- Tes ditulis terlebih dahulu untuk domain/kontrak dan regresi gateway.
- Perbaikan review: variable bootstrap email tidak ambigu, pagination URL integer,
  ukuran font input unggah mobile, total/ID/ukuran request Snap, normalisasi varian,
  provider GET response tanpa currency, pembatalan capture dan duplicate Auth event.
- Source diformat dan dibandingkan melalui AST hasil emit JS untuk memastikan
  perapian whitespace tidak mengubah logika. Perubahan fungsional setelah formatting
  diuji ulang; log formatting bukan pengganti review source keseluruhan.
- 76 tes lulus, pemeriksaan25source/71import lulus, 25 fixture CSS layout lulus.
- Full build BELUM lulus karena dependency tidak berhasil diinstal. SQL, Auth/RLS,
  browser React penuh dan pembayaran live BELUM diuji. Detail ada di QA_REPORT.md.

Tidak ada deployment atau transaksi pembayaran nyata yang dijalankan. Tidak ada
SQL lama yang ditimpa di project pengguna; file setup adalah untuk Supabase baru.
