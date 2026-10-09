# Landing page - asset register

Every image the landing page may use, where it comes from, what it means, and what is still
missing. Created in Landing 04 (step 51). Status: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

## Rules

- **Only approved originals.** Rein Drop art comes from `packages/brand-assets` (copied 1:1 from
  the owner's `Downloads/ReinDrop/branding assets`, see that package's README). Never the concept
  sheets (`docs/brand/reference/concept-*.png`, "Mascot Asset Pack" / "Branding Kit"), never the
  landing mockup, never generated or redrawn art.
- **Sections use meanings, not files**: `src/marketing/landing-assets.ts` (`landingImages.heroMascot`, ...).
  A meaning without approved art is `null` and the section shows a neutral, non-mascot visual.
- **Optimized copies at stable URLs** in `apps/web/public/assets/brand/`, generated - never edited:
  `pnpm --filter web assets:brand` (`apps/web/scripts/build-brand-assets.mjs`): transparent edges
  trimmed (2% margin kept), resized for the web, WebP (q86, lossless-quality alpha); icons as
  palette PNG. Paths and intrinsic sizes land in `src/marketing/brand-assets.generated.ts`, so
  `next/image` always gets width / height (no stretching, no layout shift). Next's optimizer then
  serves resized variants (verified in the production container: 26-54 KB for the hero mascot).
- **The mascot is the round orange droplet character** of the approved files. The landing
  mockup shows a different character (a deer / reindeer with antlers) - that is not an approved
  asset and is not used.

## Rein Drop assets

All transparent PNG originals (corners fully transparent), checked in Landing 04.

| Meaning (`landingImages.*`) | Optimized file (`/assets/brand/...`) | Size | Original (`packages/brand-assets/...`) | Where on the page |
|---|---|---|---|---|
| `heroMascot` | `mascot/holding-box.webp` | 775x1024, 94 KB | `mascot/mascot-holding-box.png` (1278x1230, 1062 KB) | Hero - "presenting a package" (spec 02) |
| `huntWorkingMascot` | `mascot/running-box.webp` | 1024x957, 98 KB | `mascot/mascot-running-box.png` (1312x1199, 1139 KB) | How it works "We keep looking"; demo Hunt starting |
| `closingMascot` | `mascot/delivery-dash.webp` | 1024x717, 108 KB | `mascot/mascot-delivery-dash.png` (1536x1024, 1856 KB) | Closing CTA band |
| `welcomeMascot` | `mascot/wave.webp` | 886x1024, 104 KB | `mascot/mascot-wave.png` (1278x1230, 1018 KB) | Waitlist intro (friendly hello) |
| `confirmedMascot` | `mascot/thumbs-up.webp` | 810x1024, 103 KB | `mascot/mascot-thumbs-up.png` (1278x1230, 1034 KB) | Waitlist success |
| `wordmark` | `logo/wordmark-navy.webp` | 570x192, 17 KB | `logo/wordmark-navy.png` | Header, light surfaces |
| `wordmarkOnDark` | `logo/wordmark-white.webp` | 564x192, 13 KB | `logo/wordmark-white.png` | Navy surfaces only |
| `lockup` | `logo/lockup-horizontal.webp` | 1200x474, 72 KB | `logo/logo-mascot-horizontal.png` | Social preview / share image (Landing 22) |
| `lockupOnDark` | `logo/lockup-hero-dark.webp` | 1024x854, 120 KB | `logo/logo-mascot-hero-dark.png` | Navy backgrounds only (dark glow baked in) |
| `appIcon` | `icon/app-icon.webp` | 512x497, 45 KB | `app-icon/app-icon-mascot.png` | Beside the App Store / Google Play badges |
| (browser / home-screen icons) | `icon/app-icon-512.png`, `icon/app-icon-192.png`, `icon/apple-touch-icon.png` | 70 / 16 / 15 KB | `app-icon/app-icon-mascot.png` | Favicon / manifest / Apple touch icon (Landing 22) |
| (unassigned) | `logo/wordmark-3d.webp` | 563x192, 23 KB | `logo/wordmark-3d.png` | Expressive marketing moments only - not UI chrome; no slot yet |

Totals: 14 files, 898 KB (from 12.6 MB of originals). Product tokens (`MascotToken` in
design-tokens, used by the app) are unchanged: the landing has its own meanings above.

## Missing Rein Drop art (TODO - approved poses only)

Each needs a single new pose following the Mascot Usage Guide ("one need -> one asset"),
approved by the owner and added to `packages/brand-assets`; until then the section uses a neutral
visual (UI fragment, icon, illustration built from tokens) - never a substitute character.

| Meaning | Wanted pose | Used in | Spec reference |
|---|---|---|---|
| `thinkingMascot` | Thinking / analysing | Deal intelligence, demo evaluation | Spec section 9 "Thinking/analysis" |
| `searchingMascot` | Searching / inspecting (e.g. magnifier) | How it works "Rein Drop searches" | Mockup step 2 (idea only) |
| `alertMascot` | Holding a phone / notification | Alerts section | Mockup "Find exactly what you're looking for" (idea only) |
| `planningMascot` | Checklist / planning | How it works "Create a Hunt" | Mockup step 1 (idea only) |
| `exceptionalMascot` | Surprised / exclamation | Demo's rare exceptional deal only | Spec section 9 |
| `celebrationMascot` | Celebration | Completed sale (outcomes) only - never speculative profit | Spec section 9 |
| (optional) | WebP / SVG wordmark source | Crisper logo at any size | Brand README TODO |

## Third-party marks (decision L-D6 - real logos, legal later)

Marketplace marks (Landing 08) are each company's **own site icon / logo, downloaded unaltered
from its official domain on 2026-10-10** (`public/assets/third-party/marketplaces/`); favicon
`.ico` files only had their largest image extracted to PNG. Brand-kit / press-kit versions are
better and should replace them when available - especially the low-resolution ones and the four
with no file. Shown in tiles with the name as text; a missing mark is a neutral store glyph,
never a recreated logo.

Official files only, from each owner's brand / press kit, unaltered (no
recolouring, stretching or redrawing); stored under `apps/web/public/assets/third-party/` with this
table updated (source URL, date, licence notes). Footer line on the page: trademarks belong to their
owners; Rein Drop is not affiliated with or endorsed by them. Trademark review before public launch.

| Mark | Status on the page | Needed by | File |
|---|---|---|---|
| eBay | Launch target | Gallery, hero line | **`marketplaces/ebay.svg`** - official 4-colour wordmark SVG (191x77) from eBay Inc.'s site, https://static.ebayinc.com/static/theme/images/logo.svg (ebay.com blocked automated requests); checked: no scripts; sha256 50cfd1d4... |
| Facebook Marketplace | Launch target | Gallery, hero card | **`marketplaces/facebook.webp`** - Facebook's site icon (180x180), https://www.facebook.com/apple-touch-icon.png (Marketplace has no separate mark); sha256 cd5fcbd5... |
| Craigslist | Coming soon / Exploring | Gallery | `marketplaces/craigslist.png` - site icon 57x57, https://www.craigslist.org/apple-touch-icon.png - **low resolution** |
| Mercari | Coming soon / Exploring | Gallery | `marketplaces/mercari.png` - 64x64 image extracted (pixels unchanged) from the official favicon.ico, u-web-assets.mercdn.net - **low resolution** |
| Poshmark | Coming soon / Exploring | Gallery | `marketplaces/poshmark.png` - apple-touch-icon 180x180 from poshmark.com's page |
| OfferUp | Coming soon / Exploring | Gallery | **None** - offerup.com is geo-blocked from this network; name + neutral store glyph |
| Depop | Exploring | Gallery | `marketplaces/depop.png` - 48x48 from the official favicon.ico (assets.depop.com) - **low resolution** |
| StockX | Exploring | Gallery | `marketplaces/stockx.png` - https://stockx.com/apple-touch-icon.png (180x180) |
| GOAT | Exploring | Gallery | **None** - the site's apple-touch-icon is a solid black square (logo not visible); name + store glyph |
| Grailed | Exploring | Gallery | `marketplaces/grailed.png` - https://www.grailed.com/apple-touch-icon.png (152x152) |
| Reverb | Exploring | Gallery | `marketplaces/reverb.png` - apple-touch-icon 180x180 (static.reverb-assets.com) |
| Swappa | Exploring | Gallery | **None** - bot challenge page; name + store glyph |
| Etsy | Exploring | Gallery | **None** - blocked automated requests; name + store glyph |
| Whatnot | Exploring | Gallery | `marketplaces/whatnot.png` - https://www.whatnot.com/apple-touch-icon.png (180x180) |
| Vinted | Exploring | Gallery | `marketplaces/vinted.png` - apple-touch-icon 192x192 (marketplace-web-assets.vinted.com) |
| Amazon | Exploring | Gallery | `marketplaces/amazon.png` - 48x48 from https://www.amazon.com/favicon.ico - **low resolution** |
| Walmart Marketplace | Exploring | Gallery | `marketplaces/walmart.png` - https://www.walmart.com/apple-touch-icon.png (180x180, the Walmart spark) |
| Download on the App Store badge | "Coming soon" until `APP_STORE_URL` is set | Hero (Landing 07), closing CTA (13) | **`stores/app-store-badge.svg`** - official SVG "Download_on_the_App_Store_Badge_US-UK_RGB_blk", 120x40, from https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg (2026-10-10; `tools.applemarketingtools.com` didn't resolve from this network); unaltered; checked: no scripts / external refs; sha256 a26fc5b3...b9fb99f |
| Get it on Google Play badge | "Coming soon" until `GOOGLE_PLAY_URL` is set | Hero (Landing 07), closing CTA (13) | **`stores/google-play-badge.png`** - official PNG 646x250 (badge 564x168 + Google's 41 px clear space), from https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png (2026-10-10); unaltered - the clear space is offset in CSS; sha256 f72611e2...9934849 |

## Never production assets

| File | Why |
|---|---|
| `docs/brand/reference/concept-mascot-asset-pack.png`, `concept-mascot-branding-kit.png` | Concept / reference sheets (Mascot Usage Guide) |
| `Downloads/ReinDrop/landing page/Rein Drop Reseller Landing Page Mockup.png` | Inspiration only; different mascot; stock photos |
| Anything generated to fill a missing pose | Never invent mascot art |
