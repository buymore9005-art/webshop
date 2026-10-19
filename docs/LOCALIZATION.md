# Indonesian / English localization

The existing language selector persists a project-scoped preference. Indonesian
is the default. i18next owns both the original keyed resources and the exact
phrase resources in `src/i18n/phrases.ts` and `src/i18n/adminPhrases.ts`.

## Coverage

- Storefront catalog, ProductDetail, cart, checkout, customer account, order
  history, wishlist, articles, and receipt UI.
- Dashboard, Orders, Products, Settings, Content, Coupons, Payments, and
  LabelTemplates admin screens.
- Shared field hints, modal controls, pagination, photo fallback, known messages,
  shipping-area search, and labels supplied to Dropdown.
- Order/fulfillment/action labels, IDR formatting, and Jakarta date presentation.
- Packing-slip headings and defaults; shipping-label loading and known errors.

## Compile-time integration

`scripts/localize.ts` is a Vite pre-transform, used by development and production
builds. It uses the TypeScript parser and source offsets rather than regular
expression replacement. It wraps exact application-owned literals in the phrase
helper and adds `useTranslation` subscriptions to function components. The helper
calls i18next with the original Indonesian text as `defaultValue`.

It does not translate runtime product/customer/provider content, identifiers,
comparison operands, HTML values, or object value/id/key/type fields. Inventory
adjustment options explicitly retain their Indonesian canonical values. Module
constants are not translated at import time; status and template label maps use
getters. No DOM mutation or machine translation is involved.

When adding copy, add its exact Indonesian and English pair to the dictionaries.
For new module-level display maps use `phrase` at render time, not initialization.
For complex interpolated sentences prefer explicit keyed i18next calls rather
than relying on translated sentence fragments. Non-Vite consumers of TSX must
apply the same transform or use explicit translation calls.

## Limits

- Unknown backend/provider errors fall back unchanged. Exact known validation
  errors are mapped; row-specific CSV errors and uncommon provider errors may
  remain Indonesian.
- User-authored content, store configuration, article text, catalog names,
  addresses, audit notes, carrier/service names, and shipment statuses received
  from providers are not translated.
- Existing generated shipping-label body terminology remains Indonesian, unlike
  the localized editor and packing slip. Browser-native validation, file picker,
  print dialogs, and external courier pages follow browser/provider language.
- Already stored interpolated notifications may retain the language in which
  the action ran. Static messages are translated at display time.
- Complex nested template expressions can retain untranslated inner fragments.
  The dictionary inventory is an aid, not proof of complete rendered coverage.

## Verification

`npm run build` passes (with Vite's large-chunk warning). `npm test` passes all
135 tests, including transform parsing across requested screens, language
switching, dynamic-data preservation, and canonical inventory values. No live
authenticated checkout, shipment booking, or admin writes were performed.