# Peta file final

Entry file original tetap berada di root. Nama `(2)`/`(9)` hanya suffix unggahan;
file output menggunakan nama import normal. Tidak ada symlink/dependency tersembunyi.

| File/folder | Tanggung jawab |
|---|---|
| main.tsx | Root React/Router/config error dan lazy Admin |
| App.tsx | Orkestrasi toko dan navigasi URL |
| Admin.tsx | Shell Backoffice dan navigasi bagian |
| supabaseClient.ts | Environment dan satu client Supabase existing |
| index.css | Tampilan responsive untuk toko dan backoffice |
| src/types.ts | Kontrak TypeScript data webshop |
| src/lib/domain.ts | Cart, validasi, currency, URL dan CSV |
| src/lib/api.ts | Query, upload, checkout dan aksi Admin |
| src/lib/useResource.ts | Lifecycle query dan stale response |
| src/components/AdminGate.tsx | Auth/login/recovery/izin Admin |
| src/components/UI.tsx | Form, foto, dialog, status, pagination, error boundary |
| src/shop | CartPanel, Checkout, OrderReceipt, integrasi live-chat Tawk |
| src/admin | Products, Payments, Orders, Dashboard/Analytics, Settings/WA |
| supabase-setup.sql | Setup Supabase baru, lengkap satu file |
| supabase/functions/rapid-api/index.ts | API tamu checkout dan receipt |
| supabase/functions/_shared | Validasi checkout dan transport database |
| supabase/migrations/20261011000000_remove_midtrans.sql | Penghapusan skema integrasi lama; pertahankan snapshot order |
| supabase/tests/database-smoke.sql | Test SQL staging rollback, belum dijalankan lokal |
| scripts, tests | Pemeriksaan file/source, unit/kontrak dan fixture CSS |
| docs | Audit input, rencana, bukti QA, manifest hasil |

**Semua file root, src, supabase, dan konfigurasi saling melengkapi. Jangan menyalin
App.tsx saja.** Source/SQL ini khusus webshop baru, bukan patch aplikasi produksi.
