# Storefront zoom/reflow validation

## Scope

Storefront only. Admin selectors and shared base rules remain unchanged.
The existing 1280px content cap is retained. Navigation and long account text
wrap; sticky offsets follow the measured header height. Checkout stacks at
1000px; form/coupon/action grids adapt to available space. Narrow layouts do
not depend on page-level overflow hiding or disabled zoom.

## Browser checks

Used the existing Vite server and `/scripts/qa/storefront-layout.html?case=catalog`.
Other fixture cases: `detail`, `checkout`, `account`, `history`, `cart`, `receipt`.
Fixtures use actual index.css, synthetic long names/email, large prices, nested
shipping panels, coupon controls, and a modal opened with showModal().

84 checks passed (7 cases x 12 widths):

| Equivalent zoom from a 1440px-wide viewport | CSS width |
| --- | --- |
| 80% | 1800 |
| 100% | 1440 |
| 125% | 1152 |
| 150% | 960 |
| 200% | 720 |

Additional widths: 320, 640, 641, 800, 801, 1000, 1001.
Height was proportional to a 1440x900 viewport, with a minimum of 480px.
Checks asserted no document horizontal overflow, no visible element outside
the viewport, and no internal horizontal overflow on block/flex/grid content.
Native input scrolling and intentional cart badge overhang within the header
were excluded from internal-overflow checks, not from viewport-bound checks.
Reduced motion was enabled for deterministic measurements.

These are viewport equivalents, not actual browser zoom. The app requires
missing Supabase environment configuration; no environment was changed and no
authenticated API, checkout submission, payment, or real customer data was used.
Static fixtures do not prove React interaction or live-data correctness.

## Automated checks

- `npm.cmd run build`: passed, including TypeScript and local import checks.
- `npm.cmd test`: 110 tests, 109 passed, 1 failed.
- New navigation/reflow source assertions passed.
- Unrelated failure: `shipping provider contract adds no frontend credentials or fake adapter`
  in tests/source.test.cjs expects `/ongkir tetap di bawah/` in unchanged
  src/admin/Settings.tsx. Left outside this storefront task.
- Editor diagnostics: no errors in changed code files.
- `git diff --check`: passed.

Existing supabase/.temp changes were preserved. No commit, push, or deployment.