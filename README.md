# Cafetería zoe

Trilingual static website for **Cafetería zoe**, a coffee shop on Rambla de Sant Jordi, Vilanova i la Geltrú (Barcelona).

**Live:** https://yourdataweb.github.io/cafeteria-zoe/
**Català:** https://yourdataweb.github.io/cafeteria-zoe/ca/
**English:** https://yourdataweb.github.io/cafeteria-zoe/en/

Hand-written HTML, CSS and vanilla JS with a small dependency-free build step. No framework, no runtime dependencies, no client-side rendering.

---

## Project identity

| Field | Value |
|---|---|
| Code name | `cafeteria-zoe` |
| Domain label | `cafeteria-zoe` |
| Repository | `cafeteria-zoe` |
| S3 prefix | `cafeteria-zoe/` |

Lowercase ASCII, hyphen-separated, no edge hyphens — valid as an RFC 1123 DNS label (≤63 chars), a GitHub repository name and an S3 bucket prefix.

## Data source

Business facts come from the Google Places API (New) payload in the `geoleads`
dataset, file `data/places/vilanova_i_la_geltru_catalonia_spain.csv`, place ID
`ChIJtTIcSACHoxIRmP5bCGvKFyw`.

| Field | Value |
|---|---|
| Address | Rambla de Sant Jordi, 08800 Vilanova i la Geltrú |
| Primary type | `coffee_shop` |
| Rating | 5.0 from 10 reviews |
| Phone | **none in the payload** |
| Website | none |
| Social profiles | none beyond the Google listing |

> A second record, **Zoe Bar** (`ChIJ4epxHACHoxIRtYXHVgr9MRY`), sits at Rambla
> de Sant Jordi 5 and is rated **2.0**. It is a different business and was
> deliberately **not** used. If the client intended that one, the data would
> make a very different site.

## What the data does and does not drive

| Rule | Behaviour here |
|---|---|
| `rating > 4` | Star badge shown (5.0 → shown) |
| `user_rating_count > 50` | **Not shown** — only 10 reviews |
| phone is a mobile | No phone exists → **no WhatsApp, no tel: link, no floating button** |
| review rating ≥ 4 | Testimonials rendered, longest first, max 3 |
| `raw_price_range` | **Not published** (explicitly excluded) |
| opening hours | **Not published** (explicitly excluded, and empty in the payload) |

The absence of a phone number is handled in the build, not in the template: the
address card omits the phone row entirely and the contact block simply shows
Directions and the Google listing. No empty `tel:` or `wa.me` href is emitted
anywhere — asserted by `scripts/verify.mjs`.

Neighbourhood and street number were **not** invented: the payload gives
neither, so the address renders as street, postcode and town only.

## Structure

```
.
├── src/
│   ├── template.html          # single HTML template with {{i18n}} holes
│   ├── place.json             # business data (edit here)
│   └── i18n/
│       ├── es.json            # Spanish (default)
│       ├── ca.json            # Catalan
│       └── en.json            # English
├── index.html                 # GENERATED — Spanish
├── ca/index.html              # GENERATED — Catalan
├── en/index.html              # GENERATED — English
├── assets/
│   ├── css/styles.css
│   ├── js/app.js              # behaviour only; content is in the HTML
│   └── photos/                # SVG artwork, og.png, touch icon
├── scripts/
│   ├── build.mjs              # renders every locale
│   ├── make-icons.mjs         # og.png + apple-touch-icon.png
│   ├── verify.mjs             # headless functional assertions
│   └── audit-layout.mjs       # geometry, contrast, touch-target audit
└── .github/workflows/pages.yml
```

## Build

```bash
node scripts/build.mjs
```

Emits `index.html`, `ca/index.html`, `en/index.html`, `sitemap.xml`,
`manifest.webmanifest` and `robots.txt`. The build **fails** if any `{{hole}}`
or `<!--MARKER-->` survives into the output.

Every locale is real server-rendered HTML — not a JS language swap. Each has its
own `<html lang>`, canonical URL, `og:locale`, and a reciprocal `hreflang` set
for all three languages plus `x-default`.

## Verification

```bash
node scripts/build.mjs
python3 -m http.server 8100 &
BASE=http://127.0.0.1:8100/ node scripts/verify.mjs
BASE=http://127.0.0.1:8100/ node scripts/audit-layout.mjs
```

`verify.mjs` asserts, per locale: exactly one `h1`, no heading-level jumps,
canonical + 4 `hreflang` links, one active language, testimonials present,
**zero** `tel:` links, **zero** `wa.me` links, no floating WhatsApp button, the
rating badge for a 5.0 rating, the review count hidden under 50, parseable
`CafeOrCoffeeShop` JSON-LD with **no invented telephone**, an `output=embed`
map, no published hours or prices, and no horizontal overflow.

`audit-layout.mjs` measures 3 locales × 5 viewports for overflow, clipped text,
touch targets and WCAG contrast.

## Deploy

Push to `main`; the workflow builds and deploys. First-time setup:
**Settings → Pages → Source: GitHub Actions**.

## Attribution

Business data from the Google Maps Places API. Review text and reviewer avatars
belong to their authors. The map embed is served by Google Maps.
