# Printable shipping label

Admin Orders now offers **Cetak label resi** separately from the official external
label, tracking link, and internal packing slip. It opens a blank window during the
click, retrieves fresh Biteship data, then prints a 100 x 150 mm store-generated
label. Allow popups, use 100% scale and disable browser headers/footers. Failed
retrieval or a label taller than the printable area closes the window and shows
an error rather than cutting off addresses/items. Long labels need the Biteship
dashboard label instead. Close the preview tab if the browser does not emit
`afterprint`.

Layout follows the information groups in the official documentation/example:
https://biteship.com/en/docs/shipping_label
https://biteship.com/en/assets/images/label_1-5420786a0655c59deec7650a44a7e609.png

Biteship documents that it has no shipping label API and supports custom labels.
This is not an original provider PDF or an exact branded copy. No courier logo or
barcode is fabricated. Courier acceptance/scanning compatibility is not verified;
use the dashboard label if the courier requires a barcode or certified format.
Missing nullable fields show a dash; missing COD is omitted (zero is preserved).
Weights and dimensions are provider item values in g/unit and cm/unit, not invented
packed dimensions. Routing is never guessed. Only `courier.waybill_id` can supply
the AWB; tracking IDs and internal references are never substitutes.

## Security and deployment

- Deploy updated `rapid-api` with its `_shared` modules, then deploy the frontend.
- Existing `BITESHIP_API_KEY`, Supabase server credentials and `ALLOWED_ORIGINS`
  configuration remain necessary. No new secret, dependency or migration is needed.
- `biteship-shipping-label` authenticates the session and active admin membership
  before shipment queries/provider access. It accepts a store order UUID only,
  reads its stored provider shipment ID and allows booked/picked_up/in_transit/
  delivered shipments. It performs only URI-encoded GET `/v1/orders/:id`, never
  creates a shipment. Successful responses must match the stored provider ID and
  the store reference when returned. Normalization returns only label fields.
- Responses use existing no-store headers. No provider URLs, remote fonts, images,
  scripts or secrets enter print HTML. All dynamic text is HTML-escaped; the print
  document also has a restrictive CSP and no opener relationship.
- Run `npm.cmd test` and `npm.cmd run build` before release. Test an authorized
  existing sandbox booking with a real sandbox AWB; check missing-AWB, rejected
  admin access, popup blocking, paper fit and print output. Do not create a live
  shipment merely to validate printing. Protect and dispose of printed PII.

Existing official-label verification and tracking behavior is unchanged. No
database persistence or remote SQL execution is required by this feature.