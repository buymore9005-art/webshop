# Official labels and tracking

The previous rapid-api mapping was `providerOrder.label_url ?? courier.label_url ?? courier.link`.
It could persist a tracking page as `label_url`. The new mapping accepts only explicit
provider `label_url` fields as labels; `courier.link` is stored as `tracking_url`.
Missing labels remain missing. No PDF, barcode, or official label is generated locally.
Packing slips remain internal documents, not official courier labels.

Both backend and UI parse HTTPS URLs, rejecting credentials, malformed URLs,
whitespace, backslashes, and URLs over 2048 characters (never truncating signed URLs).
HTTPS validates transport/structure, not the authenticity of a destination.
The label verification flag records explicit provider-field provenance or manual review.

## Deployment sequence (operator action, not applied by this change)

1. Deploy the new admin frontend first if immediate suppression of legacy label buttons
   is needed. Missing new columns are treated as unverified; tracking stays hidden.
2. In Supabase SQL Editor, run `supabase/migrations/20261021000000_shipment_links.sql`
   after existing migrations, including `20261019000000_fix_biteship_service_role.sql`.
   This is a transaction and reloads the PostgREST schema. Fresh installs also need
   the migrations after `supabase-setup.sql`; that baseline is not a migration replacement.
3. Deploy rapid-api including `_shared/shipmentLinks.ts` only after the SQL succeeds.
   The new distinctly named v2 RPC wraps the existing five-argument RPC atomically.
   No overloaded signatures, removed RPCs, or changed old argument names are introduced.
   Old backend callers still work, but their label URLs remain unverified and hidden.
4. Verify one booking: tracking opens tracking; an explicit provider label opens the
   official label; a response with only `courier.link` shows the clear absence message.
   Do not repeat a booking just to obtain a label. Check the Biteship dashboard instead.

## Historic URLs: explicit manual verification

The migration does NOT move, delete, rewrite, or automatically classify any existing
`label_url`. All existing rows default to `label_url_verified=false`. This intentionally
hides genuine historic labels too until reviewed, preventing tracking from masquerading
as an official label. Do not infer purpose from filename, hostname, path, or booking date.

Using a trusted admin/SQL Editor session, list rows with a nonempty `label_url` and false
`label_url_verified`. For EACH row, match `provider_shipment_id` and the order to the
provider dashboard/API, and inspect the destination. Preserve the original value in a
secure operational audit record before any manual correction (URLs may contain secrets).

- Confirmed genuine official label: keep `label_url` unchanged and set only
  `label_url_verified=true` for that exact row.
- Confirmed tracking page: copy the verified HTTPS tracking address to `tracking_url`
  only if that field is empty or already matches; leave the historical `label_url`
  unchanged and its verification flag false. Resolve conflicts manually.
- Unknown, expired, or inaccessible: leave untouched and unverified. Obtain a fresh
  official label from the provider if available; do not substitute the packing slip.

Apply each reviewed update with a row ID and original-value predicate inside a
transaction, check the affected row count, and record who verified it and when.
No bulk heuristic cleanup is authorized or included.

## Verification limits

Local regressions cover mapping, URL validation, historic visibility, and source-level
RPC/UI integration. They do not execute PostgreSQL or contact Biteship. An operator must
validate migration execution, permissions, legacy/v2 booking calls, and real provider
responses in a staging Supabase project before production rollout.