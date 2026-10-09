# ZYHA ID — SHOPPING-WEB

Pengembangan repository webshop existing dengan React 18, React Router 6, TypeScript,
Vite 5, Tailwind CSS 3, Supabase, GitHub, dan Vercel. Bukan PRODUCTION BUYMORE.

Mulai dari **README_DEPLOYMENT.md**, kemudian baca **CHANGELOG.md** dan **QA_REPORT.md**.

- `/`: katalog, detail, keranjang, checkout, bukti pesanan.
- `/backoffice`: Admin terautentikasi; produk, pembayaran, pesanan, analitik, WhatsApp, pengaturan.
- `supabase-setup.sql`: seluruh setup database untuk Supabase **baru/kosong**.
- `supabase/functions/`: checkout aman dan webhook Midtrans.
- `supabase/tests/database-smoke.sql`: tes staging dengan rollback, bukan migration kedua.

```bash
npm install
npm test
npm run build
npm run dev
```

**Status penyerahan:** source implementasi tersedia, tetapi full build, eksekusi SQL,
Auth/RLS dan Midtrans live belum tervalidasi di lingkungan pengerjaan. Baca laporan QA.
Tidak ada data lama, akun Auth, atau gambar dari Supabase yang hilang di dalam paket.
