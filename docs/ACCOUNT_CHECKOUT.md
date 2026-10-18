# Checkout dengan akun

Urutan rilis: terapkan seluruh migrasi sebelumnya, kemudian
`supabase/migrations/20261020000000_account_checkout.sql`, deploy Edge Function
`rapid-api`, lalu deploy frontend hasil build. Jadwalkan jeda checkout selama
pergantian versi agar frontend/server lama tidak membuat pesanan tamu baru.
Tidak ada SQL remote atau deployment yang dilakukan oleh perubahan kode ini.

Checkout membutuhkan akun non-anonymous yang diverifikasi Auth. Transaksi SQL
service-only menyimpan pesanan, stok, kupon, ongkir dan pemilik secara atomik.
RPC receipt memakai hak pemanggil, RLS dan pemeriksaan pemilik eksplisit;
admin tetap memakai alur admin yang sudah ada. Receipt akun tidak bergantung
pada token 30 hari, tab asal atau file recovery.

Token idempotensi tetap disimpan sebelum request, dengan fallback memori jika
sessionStorage tidak tersedia. Ulangi request yang sama dari tab yang sama
setelah gangguan jaringan. Jangan mengubah keranjang/tarif setelah respons
tidak pasti sebelum memeriksa Pesanan saya; perubahan payload adalah request
baru. Token tidak dihapus saat terjadi error atau logout, dan signature memuat
ID akun sehingga tidak dipakai ulang oleh akun berbeda.

Pesanan tamu lama tetap tersimpan untuk Admin, tetapi tidak otomatis menjadi
milik akun dengan email/telepon yang sama. UI impor/ekspor recovery dihapus.
Pelanggan harus menghubungi Admin dengan nomor pesanan; verifikasi kepemilikan
secara manual sebelum penautan terkontrol. Jangan melakukan backfill berdasarkan
nomor telepon saja. Pesanan historis yang sudah memiliki customer_user_id dapat
dibuka melalui Pesanan saya tanpa batas usia token.

Verifikasi staging setelah migrasi: akun A membuat pesanan lalu membuka detail
di sesi/perangkat baru; akun B, guest dan anonymous tidak boleh mengambil detail
A; retry identik hanya mengurangi stok sekali; kegagalan transaksi tidak boleh
menyimpan pesanan tanpa pemilik; admin tetap dapat mengelola semua pesanan.