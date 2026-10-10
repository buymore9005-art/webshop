# Audit repository unggahan — 10 Oktober 2026

14 file ZYHA ID saja digunakan. Semua file dibaca; manifest hash disertakan.
Bukan repository PRODUCTION BUYMORE. Tidak ada akses database lama/remote.

## Arsitektur sumber
- main.tsx: React StrictMode + BrowserRouter; / toko dan /backoffice Admin.
- App.tsx pada unggahan awal: katalog, detail, variasi/galeri, cart, checkout,
  WhatsApp, Snap, Tawk hardcoded, Realtime products/payment_methods/settings.
- Admin.tsx: dashboard, produk/kategori, metode bayar, orders, analytics,
  WhatsApp, pengaturan/banner dan kunci provider pembayaran.
- index.css pada unggahan awal: Tailwind directives + globals. Konfigurasi
  Tailwind/PostCSS tidak disertakan; index.html masih memuat CDN Tailwind dan Snap.
- supabaseClient.ts: URL/key anon project lama hardcoded.
- package.json: React18/Router6/Supabase2/Vite5/TS5/Tailwind3/Lucide.
- vercel.json: SPA rewrite. README hanya satu judul. Lockfile tidak diunggah.

## Kontrak database yang dapat disimpulkan, bukan dump schema lama
- products: id, title, price, description, category, image_url, images, variants,
  created_at; bucket Storage products.
- settings singleton id=1: store_name/banner_url/categories/admin_phone dan
  pengaturan ongkir. Versi unggahan awal juga membaca kunci provider; field tersebut
  tidak ada di skema baru dan dibersihkan melalui migration terpisah.
- payment_methods: id/name/account_number/account_holder/type/qris_url.
- orders: UUID id/customer_name/customer_address/customer_phone/items/
  total_price/payment_method/status/created_at.
- Edge rapid-api dipanggil, implementasinya tidak disertakan.
- Tidak ada schema SQL, policies, auth guard admin atau backup data pada unggahan.

## Masalah terkonfirmasi pada kode (bukan klaim eksploitasi live)
- /backoffice merender Admin langsung tanpa auth/role check.
- Total/order items dikirim browser; callback Snap mengubah paid langsung.
- Server key masuk state browser dan settings yang storefront select('*').
- Banyak mutasi mengabaikan result.error lalu menampilkan berhasil.
- Beli langsung memakai state cart lama setelah setCart.
- Pencarian, kategori dan CTA hero tidak memiliki handler fungsional.
- Cart tidak persist; qty tidak dikelompokkan; nomor order WA bukan UUID database.
- Dashboard +15%, rating bintang dan traffic array adalah angka dekoratif.
- Sidebar desktop fixed width dan hero/text besar tidak cocok untuk ponsel.

## Keputusan lingkup
Nama/route/merek/warna utama dan jenis alur tetap dipakai. Tidak menambah
marketplace/multi-vendor/coupon/review palsu atau provider lain. Pengiriman flat
rate opsional, bukan tarif kurir API. Stock per produk opsional, bukan per varian.
WA tetap click-to-chat manual, bukan gateway pengiriman otomatis. Tawk opsional
lewat env; property lama tidak dibawa. Pembayaran saat ini manual melalui Bank,
E-Wallet, atau QRIS; integrasi provider otomatis telah dihapus dari source.

Catatan: bagian arsitektur dan masalah di atas adalah temuan pada unggahan awal,
bukan deskripsi source saat ini. Snap, callback pembayaran, dan kode kunci provider
telah dihapus; migration `20261011000000_remove_midtrans.sql` membersihkan skema lama.
