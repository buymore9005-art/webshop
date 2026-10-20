# Biteship status synchronization

## Authority and safety

Official references inspected:
- https://biteship.com/en/docs/api/webhook/overview
- https://biteship.com/en/docs/api/webhook/add_webhook
- https://biteship.com/en/docs/api/orders/retrieve

Events are `order.status`, `order.waybill_id`, and `order.price`. Subscribe only
to the first two. Documentation mentions dashboard authentication configuration
but does not specify a signature algorithm or exact authentication headers.
This implementation deliberately invents neither: the webhook is a public,
untrusted notification trigger. Only `event` and `order_id` are consulted.
Unknown IDs are ignored; provider status, timestamps, price and waybill supplied
in notifications are NEVER persisted. Canonical `GET /v1/orders/:stored_id`
must return `success: true` and the matching stored ID before persistence.

Canonical fields: `status`, `courier.waybill_id`, and optional matching
`courier.history[].updated_at`. There is no documented revision/top-level
updated_at assumed. Missing timestamps remain unknown. A per-shipment lease
is acquired before GET, with fencing revisions and transactional row locks.
Older known timestamps are rejected. Statuses are not numerically ranked;
returned after delivered is permitted. Snapshots are deduplicated privately.
Only the latest 50 sanitized history records appear on the RLS-protected order.
Payment, stock, refunds and existing fulfillment workflow are unchanged.
Provider status is a separate field; legacy booking status remains unchanged.

Limits: webhook 120/minute globally, canonical fetches 60/minute globally and
2/minute per order, plus 60-second claim cooldown. Scheduler runs at most once
per minute with at most 20 shipments and four parallel requests. Active orders
refresh every five minutes, terminal states every six hours for 30 days after
the provider timestamp (shipment creation fallback). Failures back off to one
hour. Later terminal events still trigger canonical refresh via webhook.
An unauthenticated attacker can consume the bounded webhook budget; this mode
guarantees integrity, not webhook availability. Scheduler is the recovery path.

## Deployment order (parent performs Edge/Vercel deployment)

1. Apply only `supabase/migrations/20261024000000_biteship_sync.sql` after the
   existing account checkout/shipment migrations. Do not push migration history.
   Targeted CLI command:
   `npx.cmd supabase db query --linked --project-ref wtegvtyjidlszwcvyzkx --file supabase/migrations/20261024000000_biteship_sync.sql`
2. In Supabase Edge secrets/dashboard configure existing `BITESHIP_API_KEY`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, existing `ALLOWED_ORIGINS`,
   `BITESHIP_SYNC_ENABLED=true`, and a random dedicated `BITESHIP_SYNC_SECRET`
   of at least 32 characters. Never put secrets into frontend, git or chat.
   Missing configuration or migration fails closed. Keep enabled unset until
   SQL, secrets and functions are ready.
3. Deploy the functions, using the existing authenticated CLI:
   `npx.cmd supabase functions deploy rapid-api --project-ref wtegvtyjidlszwcvyzkx`
   `npx.cmd supabase functions deploy biteship-webhook --project-ref wtegvtyjidlszwcvyzkx --no-verify-jwt`
   `npx.cmd supabase functions deploy biteship-sync --project-ref wtegvtyjidlszwcvyzkx`
   Config keeps scheduler JWT verification ON. Only the new webhook disables
   native JWT; rapid-api retains its pre-existing own-user validation.
4. Biteship dashboard Integrations > Settings > Add Webhook: use
   `https://wtegvtyjidlszwcvyzkx.supabase.co/functions/v1/biteship-webhook`,
   selecting `order.status` and `order.waybill_id`. No invented signature header.
5. Deploy frontend after migration. Admin order detail has manual sync;
   customer histories and receipts read only orders visible under existing RLS.
   Realtime orders publication, initial query, focus, visibility and 60-second
   fallback polling update courier status without polling Biteship in browsers.

## Scheduled SQL

Enable `pg_cron`, `pg_net`, and Supabase Vault through the dashboard. In Vault
create these named secrets securely (do NOT paste secret values into chat):
- `biteship_sync_url`: the full biteship-sync function URL above.
- `biteship_sync_secret`: exactly the dedicated Edge secret.
- `biteship_sync_gateway_jwt`: a valid legacy Supabase anon JWT for this project
  (not an sb_publishable key). Gateway JWT alone does NOT authorize this job.

Run `docs/biteship-sync-schedule.sql` in SQL Editor after creating these secrets.
It fails closed when Vault configuration is missing. It is intentionally not
automatically scheduled by the migration. Restrict Vault and cron/net access to
trusted database operators: queued requests can contain headers. Rotate both
Vault and Edge copies together. Inspect cron.job_run_details and net responses
without printing request headers. Disable with
`select cron.unschedule('biteship-status-sync');`.

## Verification and limitations

Implementation-session deployment record: the targeted migration was applied
successfully through `db query --linked --project-ref` using stored CLI
authentication. Follow-up queries verified four columns, service-role EXECUTE,
denied authenticated EXECUTE on claim RPC, private-table RLS, and orders
realtime publication. No Edge Functions, cron job, webhook registration,
secrets, Vercel deployment, git commit or push were performed by this worker.
Existing `supabase/.temp` changes were preserved.

Run `npm.cmd run build` and `npm.cmd test`. New tests mock canonical retrieval,
spoofed payloads, unknown shipments, duplicate/busy claims, manual and scheduler
authorization, SQL fencing/staleness/dedupe and realtime contracts. SQL contract
tests are not a substitute for database concurrency integration tests. No live
booking, cancellation, refund, or fabricated shipping mutation is required.
Validate with a real existing shipment only after deployment/configuration.
No timestamp is fabricated when canonical history lacks a matching status;
in that case fencing orders fetches, but cannot detect stale provider caching.
New migrations are targeted SQL, not automatically recorded as historical
Supabase CLI migration entries; coordinate migration bookkeeping separately.