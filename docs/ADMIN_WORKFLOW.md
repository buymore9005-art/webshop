# Admin primary workflow

1. Konfirmasi pembayaran: manually verify the bank transaction and confirm the checkbox. Does not automatically process or book shipping.
2. Proses pesanan: explicitly confirm processing. Does not book shipping.
3. Cetak label: first explicitly create a Biteship booking (real shipping and possible courier charges), then print using fresh server/provider data. A packing slip is not a waybill.

Cancellation and manual fulfillment/completion remain under separate advanced actions with required reasons. No refund action exists in the current admin order RPC/UI; none is added or bypassed here. Refunds remain outside the primary flow. Manual-shipping orders obtain official labels from their courier.

## Deployment prerequisite

Apply `supabase/migrations/20261022000000_admin_primary_workflow.sql` after the existing migrations, before publishing the new UI. No remote SQL or deployment was performed for this change. The old RPC rejects empty normal-action notes; do not work around this with fabricated notes.

The migration only makes notes optional for paid/processing, retains admin authorization, row locks, optimistic versions, transitions, stock restoration and actor/event audit, and rejects manual shipping for Biteship orders. Empty notes remain empty, not fabricated verification claims.

Successful transitions reload the order/version without closing the detail. On uncertain errors, reload detail before retrying. Booking reservations and provider idempotency guards are unchanged. Created/failed bookings must be reconciled with Biteship, not blindly retried. Label authorization, provider freshness checks, waybill validation and safe URL rules are unchanged.

## Verification

Node tests cover action eligibility/reason policy and source-level UI/SQL regression guards. Database migration execution and authenticated browser/provider integration require a configured test environment; source assertions are not a substitute for SQL execution. Verify empty-note paid/processing success, cancellation empty-note rejection, non-admin rejection, stale-version rejection, audit actor/events, and blocked manual Biteship shipping in staging before release.