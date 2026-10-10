# ZYHA ID — recovery and hardening plan

Goal: extend the uploaded SHOPPING-WEB, not the unrelated production application.
Architecture: retain App/Admin routes, React 18, Router 6, Vite 5, TS strict,
Tailwind 3 and Supabase. Preserve products/settings/payment_methods/orders names.
Reconstruct schema ONLY for a new empty Supabase project; lost data is not included.
Use Supabase Edge Functions for guest checkout and manual payment verification. No new cloud provider.

1. Audit all 14 uploaded files; record schema contract and risks.
2. Tests first for cart merging/validation, safe links, authoritative checkout,
   guest privacy, admin-only writes, payment state and missing imports.
3. Add one transactional, rerunnable SQL setup with RLS, indexes, Storage policy,
   protected admin bootstrap, order snapshot, idempotency, stock and audit.
4. Implement shared typed domain/API, Auth guard, and manual payment verification.
   No frontend-paid updates and no payment-provider credentials in public data.
5. Update existing App/Admin views, extract feature modules, remove decorative
   icons/fake ratings and fake analytics, add mobile search/filters/quantity,
   real order analytics, stock, manual verification/shipping and proper errors.
6. Run tests, full typecheck/build/install, inspect mobile layout and SQL where
   tooling permits; fix actual failures. Record untested external boundaries.
7. Deliver complete ZIP + SQL + steps/change log/QA/source map. Never deploy to
   the old project automatically. Preserve uploaded MIT license.

Review focus: duplicate checkout after timeout; tampered price/quantity; guest
order data exposure; replayed/out-of-order webhook; role revoke while admin open;
mobile overflow; missing configuration/empty data; inactive product in stored cart.
