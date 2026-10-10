# ZYHA ID — SHOPPING-WEB

Pengembangan repository webshop existing dengan React 18, React Router 6, TypeScript,
Vite 5, Tailwind CSS 3, Supabase, GitHub, dan Vercel. Bukan PRODUCTION BUYMORE.

Mulai dari **README_DEPLOYMENT.md**, kemudian baca **CHANGELOG.md** dan **QA_REPORT.md**.

- `/`: katalog, detail, keranjang, checkout, bukti pesanan, akun pelanggan, wishlist, dan artikel.
- `/backoffice`: Admin terautentikasi; produk (termasuk impor CSV), kupon, pembayaran, pesanan, analitik, artikel/footer, WhatsApp, pengaturan.
- `supabase-setup.sql`: seluruh setup database untuk Supabase **baru/kosong**.
- `supabase/migrations/20261010000000_store_growth.sql`: pasang setelah setup awal untuk akun pelanggan, wishlist, artikel, footer, dan kupon.
- `supabase/migrations/20261011000000_remove_midtrans.sql`: hapus integrasi pembayaran otomatis dari project yang menggunakan skema lama.
- `supabase/functions/`: checkout aman melalui transfer Bank, E-Wallet, atau QRIS manual.
- `supabase/tests/database-smoke.sql`: tes staging dengan rollback, bukan migration kedua.

```bash
npm ci
npm test
npm run build
npm run dev
```

Lockfile `package-lock.json` disertakan agar instalasi reproducible. Clean install,
tes, typecheck, dan build lokal sudah lulus sebelum fitur growth terbaru; jalankan
ulang sebelum deploy. SQL migration, Auth/RLS, GitHub CI, deployment dan pembayaran
live belum diuji. Baca laporan QA sebelum rollout. Tidak ada
data lama, akun Auth, atau gambar dari Supabase yang hilang di dalam paket.
