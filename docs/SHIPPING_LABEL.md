# Printable shipping label

Admin Orders now offers **Cetak label resi** separately from the official external
label, tracking link, and internal packing slip. It opens a blank window during the
click, retrieves fresh Biteship data, then prints a 100 x 150 mm store-generated
label. Allow popups, use 100% scale and disable browser headers/footers. Failed
retrieval closes the window and shows an error. Long content flows onto additional
pages without fixed-height clipping; review pagination before printing. Close the preview tab if the browser does not emit
`afterprint`.

Layout follows the information groups in the official documentation/example:
https://biteship.com/en/docs/shipping_label
https://biteship.com/en/assets/images/label_1-5420786a0655c59deec7650a44a7e609.png

Biteship documents that it has no shipping label API and supports custom labels.
This is not an original provider PDF or an exact branded copy. Dynamic carrier
text and Biteship text are wordmarks, not downloaded logos or certification.
JsBarcode encodes the exact AWB and internal reference as CODE128. Only validated
binary modules become inline SVG rectangles; no provider text enters SVG markup.
Quiet zones are ten modules, minimum module width 0.25 mm. Unsupported/non-ASCII
or overlong values remain readable text with an explicit dashboard-label fallback,
never a truncated or compressed barcode. Physical scanner/courier acceptance is
not verified; use the dashboard label if a certified format is required.
Missing nullable fields show a dash; missing COD is omitted (zero is preserved).
Weights and dimensions are provider item values in g/unit and cm/unit, not invented
packed dimensions. Routing is never guessed. Only `courier.waybill_id` can supply
the AWB; tracking IDs and internal references are never substitutes.

Shipping fee uses only nullable numeric `courier.shipment_fee` from the documented
GET response: https://biteship.com/en/docs/api/orders/retrieve . `order.price` may
include insurance and is deliberately not a fallback. Missing fees show `Rp -`;
explicit zero is retained. Quantity sums item quantities; weight sums quantity
times g/unit only when every required value is known (not packed/billable weight).

## Security and deployment

- Deploy updated `rapid-api` with its `_shared` modules, then deploy the frontend.
- Existing `BITESHIP_API_KEY`, Supabase server credentials and `ALLOWED_ORIGINS`
  configuration remain necessary. JsBarcode is a new frontend dependency; no new
  secret or migration is needed.
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