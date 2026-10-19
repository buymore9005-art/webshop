# Template label pengiriman

## Rilis (manual, tidak dijalankan oleh implementasi ini)

1. Terapkan skema dasar dan migrasi yang sudah ada secara berurutan, sampai `20261022000000_admin_primary_workflow.sql`.
2. Jalankan `supabase/migrations/20261023000000_shipping_label_template.sql` melalui prosedur SQL deployment biasa. Migrasi aditif dan transaksional; tidak mengubah policy.
3. Build dan rilis frontend. Tidak perlu perubahan Edge Function atau secrets untuk fitur ini.
4. Login admin, buka Konfigurasi > Template label. Ubah, simpan, muat ulang; verifikasi dengan admin kedua. Uji penolakan UPDATE sebagai pengguna non-admin pada staging.
5. Periksa label pesanan yang sudah memiliki AWB (tanpa membuat booking baru). Pilih ukuran kertas sesuai template dan skala 100%, matikan header/footer browser. Uji scanner fisik sebelum operasional.

## Perilaku

- Ukuran 100x150, 100x100, A6 atau kustom 80-210 x 80-297 mm; margin, padding, teks, judul, line-height, garis, logo Biteship, perataan dan susunan kontak.
- Bagian opsional: logo kurir/Biteship, pengirim/telepon, telepon penerima, barang, catatan, referensi/barcode referensi, total, ongkir dan rute.
- AWB nyata dan barcode, nama/alamat/kode pos penerima, layanan, COD dan disclaimer tidak dapat disembunyikan. Tidak ada penggantian nilai provider, URL logo, HTML atau CSS bebas.
- Tinggi barcode resi 15-30 mm, modul 0.25-0.5 mm, quiet zone 10-20 modul per sisi. Barcode resi yang terlalu lebar menghentikan preview/cetak. Barcode referensi opsional yang terlalu panjang menjadi teks. Barcode tidak diperkecil agar muat.
- Preview memakai `shippingLabelHtml` yang sama dengan cetak, melalui iframe sandbox tanpa izin script/same-origin; CSP hanya mengizinkan gambar data lokal. Kurir, contoh panjang dan zoom hanya state lokal dan tidak disimpan.
- Preview mengalir dan dapat digulir, bukan simulasi pagination browser. Konten panjang dilanjutkan, tidak dipotong. Dialog cetak harus diperiksa, terutama pada stok 100x100.
- Reset hanya mengubah draft; Simpan menerapkan ke seluruh toko. Timestamp settings mencegah menimpa update admin lain. Muat ulang membuang draft setelah konfirmasi. Penutupan tab memperingatkan perubahan belum disimpan; navigasi SPA tidak diblokir.
- Setiap cetak membaca settings terbaru sebelum rendering, tanpa cache fallback. Kesalahan jaringan, izin atau konfigurasi membatalkan cetak dan menutup popup. Tidak ada booking, perubahan provider retrieval, atau pengubahan data pelanggan.
- Kolom hilang pada deployment lama, NULL, atau objek parsial memakai default kompatibel. Menyimpan memerlukan migrasi; kegagalan SQL ditampilkan. Nilai yang dikenal tetapi tidak valid, key tak dikenal atau versi tidak didukung gagal tertutup.

## Penyimpanan dan keamanan

`settings.shipping_label_template` adalah JSON version 1 tanpa kredensial atau PII. Menggunakan policy existing `zyha_settings_update` dengan `zyha_is_admin()` pada USING dan WITH CHECK. Settings dapat dibaca publik; jangan menyimpan informasi rahasia dalam judul/footer. SQL membatasi bentuk objek/ukuran/versi, sementara runtime memvalidasi semua field dan rentang sebelum preview/simpan/cetak. Konfigurasi malformed yang ditulis langsung melalui SQL tidak akan dicetak.

## Verifikasi

Jalankan build, seluruh suite test, dan focused `tests/shipping-label.test.cjs`. Test mencakup default/partial settings, bounds, XSS, barcode fit, field wajib, referensi panjang dan kegagalan baca settings. Pengujian database/RLS, printer/scanner serta dialog cetak lintas browser memerlukan staging/perangkat nyata dan bukan bagian dari test unit lokal.