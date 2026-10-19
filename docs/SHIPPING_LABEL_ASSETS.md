# Printed label assets and barcode verification

Assets retrieved 2026-10-19. Trademarks remain their owners' property; these identify shipping services, not courier certification of this store template.

J&T contrast correction: the original official `logo.png` is white artwork intended for the site's colored header, so it disappears on white label stock. The replacement is the official red PNG, unchanged, rendered as the existing foreground image on both screen and print. No background graphics setting, CSS recoloring, or changes to other courier assets are required. The label regression test pins the verified replacement's SHA-256 to prevent accidentally restoring the white variant.

| Code | Bundled source |
| --- | --- |
| jnt | https://www.jet.co.id/static/images/logo-red.png?t=1 (linked by https://www.jet.co.id/about/company) |
| jne | https://biteship.com/images/couriers/jne.webp |
| sicepat | https://biteship.com/images/couriers/sicepat.webp |
| anteraja | https://biteship.com/images/couriers/anteraja.webp |
| pos | https://biteship.com/images/couriers/pos.webp |
| tiki | https://biteship.com/images/couriers/tiki.webp |
| biteship | https://biteship.com/images/biteship-logo.svg (official header logo, rasterized to PNG in Chromium from its native 104 x 24 CSS-pixel viewport at browser device scale; 273-pixel raster width) |

The courier WebP paths are published by the Biteship homepage carousel (https://biteship.com/en). Only these six courier codes have logo support; unknown codes retain escaped text. No tracked links, provider image fields, private API endpoints, runtime downloads or arbitrary SVG are used. The public docs path examined did not provide a usable courier-logo API response.

Vite 5 requires a small, path-restricted loader to inline these raster assets. The print document permits only `data:` images, with all other resource types denied except inline styles. Print waits for image decoding, font readiness and layout. Asset failures abort printing rather than race missing images.

JsBarcode's object renderer correctly supplies binary CODE128 modules. J00330160962 encodes to 123 modules, or 35.75 mm with two ten-module quiet zones at 0.25 mm/module. It fits the 86 mm AWB slot. ZYHA-91532DFACD9647D0A2764E2419C68964 encodes to 431 modules, requiring 112.75 mm: the old 40 mm reference slot necessarily rejected it. References now remain readable text when their optional barcode does not fit; they are never shrunk below the minimum module width. Unsupported/oversized mandatory AWBs abort label creation and direct the operator to the provider dashboard.

The existing browser preview demonstrated inline SVG rendering under the restrictive CSP, and the realistic dummy preview showed 34 AWB bar runs with both J&T and Biteship images loaded, and zero optional reference bars. Focused label/backend tests: 17 passed. Production build and TypeScript checks passed. This does not establish the cause of an unseen deployed AWB failure, nor certify scanner or thermal-printer performance. Print at 100% scale and verify with the actual scanner/printer. No live booking or deployment is needed for these checks.