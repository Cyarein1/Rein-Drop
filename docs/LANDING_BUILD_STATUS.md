# Landing page - build status

_Last updated: 2026-10-13 (Landing 23 = step 70)_

Public marketing site for Rein Drop, built inside the existing monorepo (`apps/web`). Source
documents (owner's, in `Downloads/ReinDrop/landing page/`): Creative & Experience Specification
v1.0, Technical Decisions v1.0, Ordered Build Prompts v1.0 (24 steps), and a mockup (inspiration,
not a factual source). File map: [LANDING_FILE_MAP.md](LANDING_FILE_MAP.md). Main product status:
[BUILD_STATUS.md](BUILD_STATUS.md); open items: [OUTSTANDING.md](OUTSTANDING.md).

Numbering: **Landing NN = step 47 + NN** in BUILD_STATUS (Landing 01 = step 48 ... Landing 24 = step 71).
The landing page is a deliberate marketing track added after the MVP freeze ([MVP_FREEZE.md](MVP_FREEZE.md)) -
it adds no product features.

## Decisions (agreed with the owner, 2026-10-09)

These adapt the source documents to the real repository. Where they differ from a build prompt,
this list wins.

| # | Decision | Differs from the documents? |
|---|---|---|
| L-D1 | `/` becomes the public landing page; the product keeps its URLs (`/home`, `/hunts`, `/deals`, ...). Signed-in visitors on `/` go to `/home`. No `/app` prefix. | Yes - prompts reserve `/app` |
| L-D2 | Styling: **CSS Modules + `@rein-drop/design-tokens` (`--rd-*` variables)**, like the rest of `apps/web`. No Tailwind. | Yes - documents say Tailwind |
| L-D3 | Waitlist writes go to a small **public module in the existing NestJS API** (one database writer, existing validation / rate limiting / logging); the web server calls it. No Prisma / database access from `apps/web`. | Yes - documents put a route handler + Prisma in `apps/web` |
| L-D4 | **No pricing section**; the FAQ says pricing isn't final (plans and prices are open - D3). | Mockup shows pricing tiers |
| L-D5 | Mascot: only the 5 approved poses (wave, thumbs-up, holding box, running with box, delivery dash); a missing pose gets a neutral, non-mascot visual and an entry in the asset register. No stock photos of people. | Mockup uses other poses + photos |
| L-D6 | **Real logos** (owner, 2026-10-09: "MVP, can't sacrifice looks and authority, legality later"): eBay, Facebook Marketplace, the gallery marketplaces, App Store / Google Play badges - official files from each brand's kit, unaltered. Footer line: trademarks belong to their owners; Rein Drop is not affiliated or endorsed. Trademark review = pre-launch legal TODO. | Documents prefer text names until rights are clear |
| L-D7 | **App Store / Google Play download buttons** (owner addition): official badges; while the apps aren't published they say "Coming soon" and lead to the waitlist; real store URLs come from configuration and switch the buttons on. | New |
| L-D8 | Honest statuses everywhere: eBay and Facebook = **Launch target** (eBay built, not live; Facebook needs a production source - D12); others Coming soon / Exploring; never "Live" without proof. No email-alert claims (email isn't built - D14): alerts are push + in-app. | Mockup shows email alerts |
| L-D9 | Landing analytics are **anonymous** (visitors aren't signed in) - a separate event list from product events (decision 0016), console / log adapter first, vendor and consent with D15. | Detail |

## Repository baseline (audit, 2026-10-09)

- **Monorepo exists**: pnpm 12.9.1 + Turborepo 2.11, `apps/{api,web,worker,mobile}`,
  `packages/*` (contracts, design-tokens, brand-assets, api-client, client-core, db, ...). The
  "stop - run main Prompt 01 first" condition does not apply.
- **apps/web**: Next.js **16.4.0** (App Router, `cacheComponents`, `partialPrefetching`,
  `output: "standalone"`), React 19.3, TypeScript, CSS Modules (24 module files), Inter via
  `@fontsource-variable/inter`, lucide-react icons, Vitest (no Playwright yet). `AGENTS.md`: read
  the bundled docs in `node_modules/next/dist/docs/` before writing Next code (done for route
  groups and metadata files).
- **Routes today**: `/` = `src/app/page.tsx` -> `redirect("/home")`. Product pages in the `(app)`
  route group (AppShell layout): `/home`, `/hunts/**`, `/deals/**`, `/alerts`, `/analytics/**`,
  `/inventory/**`, `/settings/**`. Also `/onboarding`, `/sign-in`, `/auth/{sign-in,callback,sign-out}`
  (route handlers), `/dev/**` (development tools, incl. `/dev/ui` component showcase).
- **Auth gate**: `src/proxy.ts` matcher lists only the product routes; `/` is not matched today
  (the redirect then hits `/home`, which is). Entra proxy refreshes sessions on matched routes.
- **Root layout** (`src/app/layout.tsx`) inlines the design tokens as `--rd-*` CSS variables and
  loads Inter; `globals.css` has base styles, focus ring and a global reduced-motion rule.
- **Security headers** (`next.config.ts`): CSP `base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://*.ciamlogin.com`,
  X-Frame-Options DENY, nosniff, referrer and permissions policies, HSTS in production. No
  `img-src` / `script-src` restriction yet - self-hosted images keep it that way.
- **Design tokens** (`packages/design-tokens`): brand colours match the landing documents exactly
  (white, navy #12233F, orange #FF6B35, yellow #FFC928, green #16A66A, plus sky wash, loss red,
  soft washes, navy-derived neutrals); type scale tops out at 36 px (no display sizes yet); spacing
  4 px grid to 48 px; radius, touch target 48, page max width 1120.
- **Brand assets** (`packages/brand-assets`, imported via `src/brand/assets.ts`): wordmarks (navy,
  white, 3D), mascot lock-ups (horizontal, dark-glow hero), app icon, 5 mascot poses (wave,
  thumbs-up, holding box, delivery dash, running box). Originals 1-2 MB PNG. No third-party logos
  in the repo yet. `apps/web` has **no `public/` folder**.
- **Mobile**: `app.json` has name / slug / scheme only - no iOS `bundleIdentifier` / Android
  `package`, so there are no store listings to link to yet.
- **Commands** (real, from package.json): `pnpm install`; `pnpm --filter web dev` (port 3000 - the
  owner's port, the agent never starts it); `pnpm --filter web build | typecheck | lint | test`;
  whole repo `pnpm turbo run build typecheck lint test`; database `pnpm infra:up` (Docker
  Postgres), `pnpm db:deploy`, `pnpm db:seed`.

## Risks and notes found in the audit

1. **Signed-in redirect on `/`** must not make the landing page dynamic for everyone: do it in
   `src/proxy.ts` (add `/` to the matcher, redirect to `/home` only when a session cookie is
   present, never send signed-out visitors to sign-in) so the page stays prerenderable.
2. ~~**Image optimization**: `sharp` install scripts are denied~~ **Resolved in Landing 04**: sharp
   ships prebuilt binaries; the production container's optimizer works, and the landing uses
   pre-optimized WebP copies anyway.
3. **Type scale** has no display sizes for a marketing hero (max 36 px) - add marketing display
   tokens in Landing 03 without changing the app's scale.
4. **Third-party logos**: home decided in Landing 04 - `apps/web/public/assets/third-party/`, register
   in [LANDING_ASSETS.md](LANDING_ASSETS.md); files arrive in Landing 07 / 08.
5. **Cold start**: the web app scales to zero on Azure (decision 0015) - the first visitor after a
   quiet period waits several seconds. Launch decision (Landing 24): `minReplicas: 1` for web.
6. **Legal before real emails**: privacy notice, terms, contact route and trademark review -
   shared with the MVP release checklist.
7. **No Playwright** in the repo; browser / accessibility checks arrive with the landing QA steps.

## Scoped implementation plan (24 steps, adapted)

| Landing | Step | Prompt | What it will do here | Gate |
|---|---|---|---|---|
| 01 | 48 | Audit + boundaries | This document + file map; no UI | - |
| 02 | 49 | Marketing route skeleton | `(marketing)` route group: `/` renders the landing with section anchors (hero, marketplaces, problem, how-it-works, demo, intelligence, hunts, alerts, outcomes, faq, waitlist); remove the `/` redirect; proxy redirects signed-in visitors to `/home` | B |
| 03 | 50 | Brand tokens + typography | Marketing display sizes, section spacing, shadows, container widths in `design-tokens` (shared, generated as `--rd-*`); dev-only style reference at `/dev/landing` | B |
| 04 | 51 | Asset register + mascot mapping | `docs/LANDING_ASSETS.md`; map the 5 poses + wordmarks to landing uses; optimized copies if needed; missing poses as TODOs | B |
| 05 | 52 | Marketing primitives | Section, Container, PrimaryCTA, SecondaryCTA, Eyebrow, SectionHeading, MarketplaceTile, DealMetric, DealCardShell, FAQItem, WaitlistFormShell, **StoreBadge** (CSS Modules) | B |
| 06 | 53 | Navigation + mobile menu | Wordmark, How it works, Features, Marketplaces, FAQ, Join Early Access; accessible mobile menu | B |
| 07 | 54 | Hero | "You flip it. We find it.", CTAs, mascot + illustrative deal card, **App Store / Google Play badges (coming soon)** | B |
| 08 | 55 | Marketplace gallery | Data-driven gallery with real logos and honest statuses; "See more" | D |
| 09 | 56 | Problem | Before / after story | B |
| 10 | 57 | How it works | Three steps; user decides | B |
| 11 | 58 | Deal intelligence | One editorial deal card; gross upside != profit | B |
| 12 | 59 | Hunt customization + alerts | Illustrative controls; push / in-app notification mockup (no email claim) | B |
| 13 | 60 | After the flip, FAQ, final CTA, footer | Bought -> Sold -> Actual profit; FAQ; final CTA **with store badges**; footer with contact, legal links (marked for review), trademark line | B |
| 14 | 61 | Demo model | Typed fixtures (3 products) + pure state machine + unit tests | C |
| 15 | 62 | Demo UI | Interactive, accessible, "Illustrative demo - not live listings" | C |
| 16 | 63 | Motion | CSS-first, reduced motion honored | C |
| 17 | 64 | Marketplace request | Gallery selection carried into the waitlist form (client state) | D |
| 18 | 65 | Waitlist schema | `WaitlistSignup` in `packages/db` (unique normalized email, source, requested marketplace, consent version) + migration | E |
| 19 | 66 | Waitlist API | Public `POST /waitlist` **in the NestJS API** (L-D3): zod, honeypot, strict throttle, privacy-safe responses, no emails in logs | E |
| 20 | 67 | Waitlist form + legal drafts | One form for every CTA (server action -> API); `/privacy`, `/terms` drafts marked "requires legal review"; contact | E |
| 21 | 68 | Landing analytics | Anonymous events adapter (console / log), no personal data | F |
| 22 | 69 | SEO + accessibility | Metadata, canonical, Open Graph image, `sitemap.ts`, `robots.ts`; audit | F |
| 23 | 70 | Performance + responsive QA | 320 px to desktop, images, fonts, CLS, measured metrics | F |
| 24 | 71 | Preview deployment + release gate | Fits the existing Container Apps web app (decision 0015); preview checks; launch checklist; no paid resources provisioned | G |

Gates (Technical Decisions section 11): A design approval (owner) - B static page - C demo - D
marketplace gallery - E waitlist - F trust / polish - G preview launch - H replace the waitlist with
real sign-up when onboarding is ready (later).

## Steps

### Landing 01 (step 48) - Audit and boundaries - done 2026-10-09

- Inspected root workspace config, `apps/web` (routes, proxy, layouts, config, styles, brand
  usage), `packages/design-tokens`, `packages/brand-assets`, scripts, the mobile app config and
  the bundled Next.js 16.4 docs (route groups, metadata files).
- Wrote this document and [LANDING_FILE_MAP.md](LANDING_FILE_MAP.md). No UI or code changed.
- Commands run: inspection only (`cat`, `ls`, `grep`); no build or test needed for docs.
- Blockers: none. Owner input needed later: Gate A design approval (the mockup is inspiration
  only), official logo / badge files if you prefer specific versions, store URLs when published.
- Next: Landing 02 - marketing route skeleton.

### Landing 02 (step 49) - Marketing route skeleton - done 2026-10-09

- `(marketing)` route group: `layout.tsx` (no AppShell, no session read) and `page.tsx` - `/` now
  renders the landing skeleton: skip link, placeholder header (wordmark, section links, **Sign in**,
  Join early access) and 11 semantic `<section>`s with the build plan's ids, each labelled by its
  heading (`h1` "You flip it. We find it." in the hero, `h2` elsewhere). No final design.
- `src/marketing/sections.ts`: the section ids / labels in narrative order (+ spec).
- Removed `src/app/page.tsx` (the `/` -> `/home` redirect).
- Signed-in redirect (decision L-D1) in the Proxy, so the page stays static: matcher now includes
  `/`; `entraLandingProxy` sends a session that hasn't ended (valid or needing a refresh) to `/home`
  and shows the landing to everyone else - missing / tampered / ended sessions, never a sign-in
  redirect, cookies untouched. With development auth (signed in on every request) `/` always shows
  the landing; the app is at `/home`. No `/app` route exists or was added.
- Docs: LOCAL_MVP_ACCEPTANCE (sign in at `/home`), README dev line, file map.

Verified (commands run):
- `pnpm --filter web test` (incl. 3 new landing-proxy tests + 2 section tests), `pnpm --filter web typecheck`, `pnpm --filter web lint`.
- `pnpm --filter web build`: `/` is **static (○)**; every product route unchanged.
- Production server on port 3100 (not 3000), Entra configured with dummy values: `/` 200 with all
  11 anchors, the `h1` and title; `/` with a junk session cookie 200 (no redirect); `/home` 307 to
  `/sign-in?next=/home`; `/sign-in` 200; security headers present. Server stopped afterwards.
- Not checked in a browser by a person yet.

Next: Landing 03 - brand tokens and typography.

### Landing 03 (step 50) - Brand tokens and typography - done 2026-10-09

The brand already lived in `@rein-drop/design-tokens` (palette exactly as the documents: white,
navy, orange, yellow, green, sky / orange / yellow / green washes, navy-derived neutrals; Inter;
4 px spacing; radii). This step **extends** it for marketing - the app's values are unchanged:

- `typography.ts`: fluid **display scale** `displaySize` (hero 40-76, xl 30-48, lg 24-34, md
  20-24 px), `marketingText` (lead 17-20, eyebrow 12-13), `letterSpacing` (display -0.02em,
  eyebrow 0.08em), `displayLineHeight` (hero 1.05, heading 1.15). Fluid = linear from a 375 px to
  a 1280 px viewport, clamped (`fluidClamp`). Values are engineering defaults to confirm at Gate C.
- `layout.ts`: radii `xl` 24 / `2xl` 32; `container` (prose 680, narrow 560, page 1120, wide 1280);
  fluid `gutter` 16-40 px; `sectionSpace` (default 64-120, compact 40-72); `shadow` (sm / md / lg /
  xl navy-tinted, `cta` orange glow for the primary CTA only).
- `css.ts`: all of them as `--rd-*` variables (`--rd-display-hero`, `--rd-text-lead`,
  `--rd-section-space-default`, `--rd-gutter`, `--rd-container-wide`, `--rd-shadow-xl`, ...),
  inlined by the root layout like the existing tokens - no new styling system, no UI kit theme.
- Contrast rule recorded and tested: CTA text on orange is **navy** (5.54:1); white on orange is
  2.84:1 (fails even large-text AA), white on navy 15.7:1.
- `/dev/landing` - development-only style reference (palette with uses, type samples, CTA / navy
  band, radii, shadows, spacing, containers); `notFound()` in production, `noindex`.

Verified (commands run):
- `pnpm --filter @rein-drop/design-tokens test` 16/16 (5 new: fluid endpoints at 320 / 375 / 1280 /
  1920 px, scale order, app values unchanged, landing contrast pairs, CSS variables) + typecheck + lint.
- `pnpm --filter web` typecheck, lint, test 31/31, build.
- Production server (port 3100): `/dev/landing` 404; the new variables are served on `/`.
- Your running dev server (read-only request): `/dev/landing` 200 with the reference; `/` 200.
- `pnpm turbo run build typecheck lint test`: 58/58 (mobile uses the same token package).

Found: the existing `/dev` pages (`/dev`, `/dev/ui`, `/dev/diagnostics`, `/dev/notifications`) are
**not** gated and are served by production builds (logged in OUTSTANDING; out of this step's scope).

Next: Landing 04 - asset register and mascot mapping.

### Landing 04 (step 51) - Asset register and mascot mapping - done 2026-10-09

- Inspected every supplied file: the 11 approved originals (all already in `packages/brand-assets`,
  1:1 with `Downloads/ReinDrop/branding assets`) - **5 standalone mascot poses** (wave, thumbs-up,
  holding box, running with box, delivery dash), 3 mascot lock-ups / 3D wordmark, 2 flat
  wordmarks, the app icon. All transparent; wordmarks carry ~25% empty canvas. There are no
  "first 10" poses - the missing ones are TODOs. No third-party logos supplied.
- **Finding:** the approved mascot is the round orange droplet character; the landing mockup shows
  a deer / reindeer - not an approved asset, not used (flagged to the owner).
- `apps/web/scripts/build-brand-assets.mjs` (`pnpm --filter web assets:brand`, uses the sharp that
  ships with Next): trims transparent edges, resizes, WebP q86 / palette PNG icons ->
  `public/assets/brand/{mascot,logo,icon}/` (14 files, **898 KB from 12.6 MB**) and
  `src/marketing/brand-assets.generated.ts` (paths + intrinsic sizes).
- `src/marketing/landing-assets.ts`: meanings -> images (heroMascot = holding box, huntWorkingMascot
  = running box, closingMascot = delivery dash, welcomeMascot = wave, confirmedMascot = thumbs-up,
  wordmark / wordmarkOnDark / lockup / lockupOnDark / appIcon); six poses `null` (thinking,
  searching, alert, planning, exceptional, celebration). Product mascot tokens unchanged.
- [LANDING_ASSETS.md](LANDING_ASSETS.md): register of Rein Drop assets, missing poses, third-party
  marks (TODO, official files only, `public/assets/third-party/`), never-production files.
- `/dev/landing` shows every mapped image (next/image, real aspect ratio, on a wash / navy stage)
  and the missing ones as placeholders.
- `Dockerfile`: the web image now copies `apps/web/public` (the standalone server doesn't).
- `packages/brand-assets/README.md`: derivatives documented as generated outputs.

Verified (commands run):
- `pnpm --filter web assets:brand` (sizes above); visual contact sheet of the outputs: transparency
  kept, nothing clipped or stretched, palette icons without visible banding.
- `pnpm --filter web test` 49/49 (18 new: every generated file exists with the recorded bytes and
  header size, comes from an approved original, is under 150 KB; no concept / mockup sources;
  missing-pose list), typecheck, lint, build.
- `docker build --target web` + container on port 3100: `/assets/brand/mascot/holding-box.webp`
  200 image/webp; `/_next/image` 200 (sharp works in the Linux image; 26-54 KB variants); `/` 200.

Next: Landing 05 - reusable marketing primitives.

### Landing 05 (step 52) - Marketing primitives - not received yet

The owner sent Landing 06 next; step 52 stays reserved for Landing 05 if it comes. The navigation
was built self-contained (no primitives needed).

### Landing 06 (step 53) - Navigation and mobile menu - done 2026-10-10

- `src/marketing/nav/SiteNav.tsx` (client component) + `SiteNav.module.css`, replacing the
  skeleton header:
  - **Sticky but quiet**: transparent at the top; after 8 px of scroll a frosted white bar with a
    hairline and the navy `--rd-shadow-sm` (rAF-throttled passive scroll listener).
  - Approved wordmark (`landingImages.wordmark`, 30 px high, never stretched) -> back to top.
  - Links: How it works (`#how-it-works`), **Features (`#intelligence`, the deal-intelligence
    story)**, Marketplaces, FAQ; quiet **Sign in** (`/sign-in` - existing beta users need a way
    into the app); orange **Join early access** (navy text, CTA glow) -> `#waitlist` for now.
  - **Below 900 px**: wordmark + Join early access + a 48 px menu button (`aria-expanded`,
    `aria-controls`, "Open menu" / "Close menu"). The panel: focus moves to the first link; Tab /
    Shift+Tab wrap inside [button, links]; Escape or the button closes and returns focus to the
    button; following a link, clicking outside or widening to desktop closes it; the page behind
    doesn't scroll while it is open. 320 px: compact sizes, no overlap.
  - In-page links also move focus to the target section (sections are `tabIndex={-1}`), so
    keyboard and screen-reader users land where the page scrolled.
- `src/marketing/nav/menu-focus.ts`: the keyboard / scroll rules as pure functions (+ spec);
  `sections.ts`: `NAV_LINKS`, `PRIMARY_CTA`.
- Landing page: anchors stop 80 px below the top (clear of the bar); smooth scrolling only with
  `prefers-reduced-motion: no-preference` and only on the landing page.
- `scripts/check-landing-nav.mjs`: a real-browser check (headless Chrome / Edge over the DevTools
  protocol, no new dependency) with screenshots in `.browser-check/` (git- and lint-ignored) -
  the nav's browser test until Playwright arrives in the landing QA steps.

Verified (commands run):
- `pnpm --filter web test` 56/56 (7 new: menu keyboard rules, nav items -> real sections, CTA ->
  waitlist, scroll threshold), typecheck, lint, build.
- `node scripts/check-landing-nav.mjs` against the production build on port 3100: **23/23** -
  desktop links / Sign in / CTA, sticky + transparent -> solid on scroll, wordmark ratio, no
  horizontal overflow at 1280 / 375 / 320 px, FAQ link focus + offset, smooth vs reduced motion,
  menu open state (aria, focus, scroll lock, items), Tab wrap both ways, Escape -> focus back,
  link closes + lands 80 px down + focuses the section, outside click (on a non-control spot)
  closes, widening closes, skip link first. Screenshots reviewed (desktop scrolled, 375 open,
  320 closed).
- Not yet: a screen reader pass by a person.

Next: Landing 07 - hero (or Landing 05 if it is sent).

### Landing 07 (step 54) - Hero - done 2026-10-10

- `src/marketing/hero/Hero.tsx` + css (server component, no client JS), replacing the hero
  placeholder:
  - Eyebrow "Built for resellers"; **"You flip it. We find it."** (`--rd-display-hero`, navy; "find
    it." on an orange highlighter stroke - orange *text* on white is 2.8:1 and fails even large-text
    AA, so the mockup's orange headline isn't used); the spec's supporting line; orange **Join early
    access** (navy text) -> `#waitlist` and **See how it works** -> `#how-it-works`.
  - App Store / Google Play badges (decision L-D7): official files, "Mobile apps coming soon",
    each leads to the waitlist; `APP_STORE_URL` / `GOOGLE_PLAY_URL` (https on the store's own host
    only) switch a badge to a real download link (`store-links.ts`, `StoreBadges.tsx`).
  - "Launch targets: eBay and Facebook Marketplace. You decide what to buy." - honest scope.
  - Visual: approved mascot **holding a box** (the orange droplet - the mockup's deer is not an
    approved asset; owner to confirm) on a soft yellow / orange glow, with a **sample deal card**:
    "Illustrative example - not a live listing", Strong deal, iPhone 13 Pro 128 GB, Facebook
    Marketplace (text - official marketplace logos come with the gallery, Landing 08), asking $380,
    est. resale $520, **potential gross upside +$140** (green only at 24 px bold), "Before fees,
    shipping and repairs. Estimates aren't guaranteed." No timestamps, counters or live dots.
  - Desktop ~45 / 55 asymmetric grid, card overlapping the mascot; mobile stacked: copy -> CTAs ->
    badges -> mascot + card; 320 px: the three numbers wrap to two rows.
- `hero-example.ts`: the illustrative numbers (upside = resale - asking, gross) + formatting.
- Mascot `fetchPriority="high"` + `loading="eager"` (Next 16 deprecated `priority`); nav wordmark
  `loading="eager"`.
- Page: the main area is full width (sections set their own width), the hero runs under the
  transparent nav.
- `scripts/check-landing-nav.mjs` -> **`scripts/check-landing.mjs`** (nav + hero groups).

Verified (commands run):
- `pnpm --filter web test` 61/61 (5 new: illustrative label + gross upside invariant, launch-target
  marketplace, USD formatting; store links coming soon by default, only https store hosts accepted),
  typecheck, lint, build (`/` static).
- `node scripts/check-landing.mjs` on the production build (port 3100): **71/71** - nav (23) and,
  at 1440 / 1280 / 1024 / 768 / 375 / 320 px: headline; no horizontal overflow; card and its
  numbers fully visible and not clipped; illustrative label; approved mascot loaded as the
  high-priority image with its real aspect ratio; CTA targets; badges coming soon -> waitlist;
  **badges the same visible height and centred** (the check caught a 4.9 px baseline offset, fixed);
  primary CTA above the fold.
- Screenshots reviewed: 1440, 1280, 1024, 375 (top and visual), 320 (visual).

Next: Landing 08 - marketplace gallery and status model.

### Landing 08 (step 55) - Marketplace gallery and status model - done 2026-10-10

- `src/marketing/marketplaces.ts` (data-driven): statuses `live | beta | in_development |
  launch_target | coming_soon | exploring | unavailable` (Technical Decisions section 2) with a
  label and plain meaning each ("Launch target", "Coming soon / Exploring", "Exploring", ...).
  **`live` / `beta` require `proof` {verifiedAt, evidence} in the type** - nothing has it.
  17 entries exactly as the prompt: eBay, Facebook Marketplace = Launch target; OfferUp,
  Craigslist, Mercari, Poshmark = Coming soon / Exploring; Depop, StockX, GOAT, Grailed, Reverb,
  Swappa, Etsy, Whatnot, Vinted, Amazon, Walmart Marketplace = Exploring; each with a category.
- `MarketplaceGallery` (server component): "Starting with" (two large tiles), "On our radar"
  (4 tiles shown + a native `<details>` "See 11 more we're exploring" - works without JS, keyboard,
  find-in-page), a status legend, "Don't see where you source? Tell us when you join early access"
  (-> waitlist; the real request interaction is Landing 17) and the non-affiliation line.
- `MarketplaceMark`: official mark (unaltered file, never stretched; wordmarks keep their width)
  or a neutral store glyph + the name as text where no official file was obtainable.
- **Logos (decision L-D6):** 13 of 17 from each company's own site (eBay's official SVG wordmark
  from static.ebayinc.com; site / app icons for the rest); OfferUp (geo-blocked), Swappa (bot
  challenge), Etsy (blocked) and GOAT (its icon file is a blank black square) use the text
  fallback. Low-resolution: Craigslist 57, Mercari 64, Depop / Amazon 48 px. Sources + hashes in
  [LANDING_ASSETS.md](LANDING_ASSETS.md).
- Hero card: the marketplace is now referenced by key and shows the official Facebook mark + name.

Verified (commands run):
- `pnpm --filter web test` 66/66 (5 new: the prompt's exact groups / labels; nothing live / beta,
  never without proof; every status has a meaning without dates or guarantees; unique keys / names;
  every logo file exists with its recorded PNG size, SVG without scripts; the four text fallbacks),
  typecheck, lint, build.
- `node scripts/check-landing.mjs` on the production build: **90/90** - at 1280 / 375 / 320 px:
  no Live / Beta pill; 2 launch targets + 4 coming soon visible and the 11 exploring hidden;
  **Enter on "See more" opens it** and all 17 are then listed; the 13 logos load with their true
  aspect ratio; no horizontal overflow closed or open; trademark note; hero card Facebook mark.
  (Fixed in the check itself: visibility now uses `checkVisibility()` - a closed `<details>`
  hides content with content-visibility - and a bounded wait for lazy logos.)
- Screenshots reviewed: 1280 open, 375 closed.

Next: Landing 09 - problem section.

### Landing 09 (step 56) - Problem section - done 2026-10-10

- `src/marketing/problem/ProblemSection.tsx` + css (server component) on a sky-wash band:
  eyebrow "The problem", **"Great flips don't wait for your next refresh."** (the spec's line), one
  plain-language lead.
- Before / after as two expressive cards (not a table), side by side on desktop with a navy "vs",
  stacked on phones:
  - **Before - Without Rein Drop**: a CSS-only browser, slightly tilted - six squeezed marketplace
    tabs, a refresh button, three struck-through listings stamped "Sold already", "Too expensive",
    "Seen it twice"; points: same searches over and over / tabs everywhere / the good one was gone.
  - **After - With a saved Hunt**: one Hunt card (iPhone 13 Pro; Under $400, Good condition or
    better, Within 25 miles; eBay + Facebook official marks; "Live - watching for you") and a
    heads-up notification with the approved app icon ("Strong deal: iPhone 13 Pro 128 GB");
    points: set it once / Rein Drop keeps checking / a heads-up when something's worth a look.
- Illustrations are CSS / UI fragments plus approved assets only (app icon, official marketplace
  marks); each is `role="img"` with an "Illustration: ..." summary and hidden decoration, so the
  meaning never depends on the picture. No numbers about time saved, no speed claims, no timestamps.
- `problem-story.ts` holds the copy (+ spec).

Verified (commands run):
- `pnpm --filter web test` 70/70 (4 new: spec headline; no performance / speed / live-activity
  wording; three short points per side and "Illustration:" summaries; launch-target marketplaces
  only), typecheck, lint, build.
- `node scripts/check-landing.mjs` on the production build: **105/105** - problem at 1280 / 375 /
  320 px: headline and titles, side by side vs stacked, illustrations summarised with decoration
  hidden, three points per side, nothing off-screen, no horizontal overflow, and **the heads-up
  never covers the Hunt card's content** (added after the first screenshots showed it hiding the
  marketplace row on phones - now it overlaps only the card's bottom padding).
- Screenshots reviewed: 1280, 375 (after card), 320.

Next: Landing 10 - how it works.

### Landing 10 (step 57) - How it works - done 2026-10-10

- `src/marketing/how-it-works/HowItWorks.tsx` + css (server component): eyebrow "How Rein Drop
  works", **"A smarter way to source inventory."**, lead ending "the buying decision stays yours".
- Three connected steps as a real **ordered list** (`<ol>`; visible numbers; "Step n of 3:" for
  screen readers): **Tell us what you want** -> **Rein Drop keeps looking** -> **You check
  promising deals**. Each has a UI fragment on its own wash (sky / orange / green), `role="img"`
  with an "Illustration: ..." summary:
  1. a Hunt being set up (iPhone 13 Pro, max $400, Used / Good or better, eBay + Facebook marks);
  2. the approved **running-with-box mascot** (the one mascot moment - "Hunt begins / working" in
     the spec) above "Checked" rows for both marketplaces and "Over your max price - skipped";
  3. a flagged deal: Strong deal, why (under your max, condition matches), what to ask (battery
     health), and the reseller's own buttons - Save / Not for me / I bought it.
- Connectors are decorative (`aria-hidden`): dashed orange arrows across the gaps on desktop, a
  dashed line + chevron between stacked steps on phones.
- **"You stay in charge"** note: "Rein Drop never buys anything for you and can't promise a bargain.
  Check the listing and the seller yourself, then make the call." No check frequency is stated
  (cadence per plan is still D7).
- `how-it-works-story.ts` holds the copy (+ spec).

Verified (commands run):
- `pnpm --filter web test` 74/74 (4 new: the three steps in order; "you decide whether to buy" +
  "never buys anything for you", nothing suggesting buying on your behalf; no speed / frequency /
  bargain promises; every illustration summarised), typecheck, lint, build.
- `node scripts/check-landing.mjs` on the production build: **118/118** - how it works at 1280 /
  375 / 320 px: ordered list with "Step n of 3" titles, row vs column layout, two decorative
  connectors **located between the steps**, illustrations summarised, running mascot loaded
  undistorted, "you decide" note, no horizontal overflow; the hero's "See how it works" scrolls
  here (64 px below the top). Screenshots reviewed (1280, 375 steps).

Next: Landing 11 - deal intelligence showcase.

### Landing 11 (step 58) - Deal intelligence showcase - done 2026-10-10

- `src/marketing/intelligence/DealIntelligence.tsx` + css (server component; the nav's "Features"
  target): eyebrow "Deal intelligence", **"Know why a deal is worth a closer look."**, lead.
- One editorial composition: an oversized card ("Illustrative example - not a live listing") with a
  **listing-photo placeholder** (striped wash + controller glyph, `role="img"` "Listing photo
  placeholder" - no licensed photo exists, none invented), Strong deal, **PlayStation 5 - Disc
  edition**, Good condition - 1 controller, official eBay wordmark; oversized figures - asking
  **$300**, est. resale **$420** with an "Estimate" tag, **potential gross upside +$120** (the only
  green, "Before fees, shipping, tax and repairs"); confidence in plain words ("Medium confidence -
  a handful of similar sales to compare" - no percentage).
- Three numbered notes (an ordered list; matching decorative markers on the card): **Why it was
  flagged** (under your max, condition matches, below similar sold prices) - **Questions to ask the
  seller** (disc drive, controller / cables, pickup or shipped) + "an unusually low price can also be
  a red flag" - **Before you count it as profit** (selling fees, shipping, sales tax, repairs - named,
  never priced; "the upside shown is gross ... Rein Drop tracks them when you sell").
- `src/marketing/illustrative.ts`: the illustrative label + gross-upside / USD formatting shared by
  the hero and this section (the hero module re-exports it).
- `MarketplaceMark` used with the name hidden for wordmark logos (the eBay wordmark already spells it).

Verified (commands run):
- `pnpm --filter web test` 78/78 (4 new: gross upside = resale - asking = +$120; no "net profit",
  no "%", no priced costs, "gross" in the cost note; the three notes + red-flag caution;
  launch-target marketplace), typecheck, lint, build.
- `node scripts/check-landing.mjs` on the production build: **135/135** - deal intelligence at
  1280 / 1024 / 375 / 320 px: illustrative label, labelled photo placeholder, "Asking price / Est.
  resale Estimate / Potential gross upside" with $300 / $420 / +$120 fully visible, **green used on
  exactly one element (the upside) by computed colour**, "net profit" nowhere on the page, three
  notes, side by side >= 1000 px else stacked, no horizontal overflow; nav **Features** scrolls here
  and focuses the section. Screenshots (now taken after content above settles) reviewed.

Next: Landing 12 - Hunt customization and alerts.

### Landing 12 (step 59) - Hunt customization and alerts - done 2026-10-10

Two sections (anchors `#hunts` and `#alerts`), server components:

- **`HuntPreferences`** - **"Your budget. Your area. Your kind of flip."**, a lead, and a plain list
  (Product, Budget, Condition, Location, Marketplaces) beside an **app-screen illustration** of the
  Hunt form: iPhone 13 Pro, max $400 slider, Any / New / **Used** + "Good or better", "Within 25
  miles of your ZIP code", eBay + Facebook (official marks) selected, OfferUp / Craigslist "soon".
  It is one `role="img"` with a summary ("... It is a picture, not a working form"), captioned
  **"Example Hunt - illustration, not a working form"**, tagged "Illustration" inside the frame, and
  contains **no inputs, buttons or links**; its "Start watching" is a muted part of the screenshot.
  The only action: **"Join early access to create your first Hunt"** -> waitlist.
- **`AlertsSection`** - **"Get a heads-up when something worth checking drops."**, a phone
  lock-screen illustration (no clock, no "now"; an "Illustration" label) with one Rein Drop
  notification (the deal-intelligence PS5 example), and only what the product does: **Push
  notifications** (the app), **In-app alerts** (inbox), **You choose** (per-type settings), **One
  alert per deal**. No email (not built - D14), no speed promise; caveat: "They're a heads-up to
  look, not advice to buy." No mascot (no approved phone pose).
- Copy in `hunts/hunts-story.ts` and `alerts/alerts-story.ts` (+ a shared spec).

Verified (commands run):
- `pnpm --filter web test` 83/83 (5 new: both headlines; never claims a Hunt is created, label
  says "not a working form", the only action is joining early access; product / budget / condition
  / location / sources with launch targets only; alerts: no email / SMS, no instant / never-miss /
  timestamps, "not advice to buy"), typecheck, lint, build.
- `node scripts/check-landing.mjs` on the production build: **150/150** - at 1280 / 375 / 320 px:
  both headlines and the illustration label; **zero focusable / interactive elements inside either
  illustration**; the hunts section's only link is the waitlist CTA; marks loaded; alerts points,
  no "email", no clock / "now" / "ago", caveat; side by side vs stacked; no horizontal overflow.
  (The check now waits for smooth scrolling to finish after link clicks - the longer page made the
  old fixed wait too short.)
- Screenshots reviewed (1280 hunts + alerts, 375 screen + points); after review the illustrated
  "Start watching" was muted and an in-frame "Illustration" tag added so it can't pass for a button.

Next: Landing 13 - after the flip, FAQ, closing CTA and footer.

### Landing 13 (step 60) - After the flip, FAQ, closing CTA, footer - done 2026-10-10

The static landing page is complete (the interactive demo comes in Landing 14-15).

- **`OutcomesSection` (#outcomes)** - "The deal isn't done until it's sold." Bought **$300** (+ cleaning
  kit $8) -> Sold **$415** (- selling fees $31, - shipping $13) -> **Actual profit +$63** (the one
  strong green result), labelled "Illustrative example - PlayStation 5 - Disc edition", then
  "Estimated upside when you found it: +$120 (gross, before costs) / What you actually made: +$63".
  Uses the app ledger's realized-profit formula (`outcomes-story.ts`). No celebration mascot (no
  approved pose).
- **`FaqSection` (#faq)** - seven native `<details>` (first open): What is a Hunt? / Which
  marketplaces (launch targets, not live yet, no affiliation) / How quickly (can't promise instant or
  catch everything) / Are estimates guaranteed (No - gross, before costs) / Does Rein Drop buy for me
  (No) / What will it cost (pricing isn't final) / When can I try it (early access being prepared;
  web first, apps coming soon). No dates, prices or testimonials (`faq.ts`).
- **`ClosingCta` (#waitlist)** - the target of every "Join early access": white on navy (15.7:1),
  "Spend less time searching. More time flipping.", the approved **delivery-dash mascot**, store
  badges (dark), and the email form **shown disabled** with "Sign-up opens here soon - the form is
  being connected" (labelled input; wired in Landing 20 - nothing pretends to submit).
- **`SiteFooter`** - wordmark + line, section links, **Contact** from `CONTACT_EMAIL` (validated;
  never invented - until set: "Contact details coming soon" + **Needs review**), **Legal**: Privacy
  and Terms each tagged **"Draft - needs legal review"**, the trademark / non-affiliation line, and
  "Examples on this page are illustrative". "(c) Rein Drop" without a year (reading the clock while
  prerendering is avoided under Cache Components).
- **`/privacy`, `/terms`** - placeholder pages ("Draft - requires legal review", `noindex`, with the
  footer) so legal links never 404; the drafts are written in Landing 20.
- Page: a typed section -> component map (`Record<LandingSectionId, ...>`), so a section without a
  component is a type error - it caught `demo`, which now has a clearly temporary
  `DemoPlaceholder` until Landing 14-15. Skeleton placeholder styles removed.

Verified (commands run):
- `pnpm --filter web test` 88/88 (5 new: realized profit = (415 - 31 - 13) - (300 + 8) = +$63 <
  estimated +$120 gross; all seven FAQ topics; no dates / prices / guarantees, "No." answers for
  buying and estimates; contact address never invented; legal routes), typecheck, lint, build
  (`/privacy`, `/terms` static).
- `node scripts/check-landing.mjs` on the production build: **171/171** - at 1280 / 375 / 320 px:
  outcomes cards + estimate-vs-actual text, green only inside the result card, the 7 FAQ questions
  (first open, no dates / prices), waitlist white-on-navy by computed colour, disabled form + note +
  labelled input, badges -> waitlist, footer legal links / review tags / contact placeholder /
  trademark / no pricing, **no dead in-page links on the whole page**, no horizontal overflow;
  Enter opens a FAQ item; `/privacy` and `/terms` render the draft notice, `noindex`, footer.
- **Check-script fix:** regexes written inside the browser-side template strings lose their
  backslashes - two earlier checks (Landing 12 "no clock / now / ago" and this step's "no dates /
  prices") were silently not testing. All text regexes now run in Node, the script was audited
  (no backslashes left in page templates), and each regex was proven to catch a violation.
- Screenshots reviewed: outcomes 1280, waitlist 1280, FAQ 375, footer 375.

Next: Landing 14 - deterministic Hunt demo model.

### Step 60b - Landing photo pass (owner request, between Landing 13 and 14) - done 2026-10-10

Owner: "we need real images for listings ... more images can give it authority". Not one of the 24
prompts, so numbered 60b (Landing 14 stays step 61).

- Five real product photos under the **free Unsplash License** (licence verified on each photo
  page; not Unsplash+; no people): a Sierra Blue **iPhone 13 Pro** (hero card - Sierra Blue was
  13 Pro-only, so photo and copy agree), a **PlayStation 5** with controller (deal-intelligence
  card, replacing the placeholder, tagged "Example photo"), three iPhones as the problem section's
  missed-listing thumbnails (slightly faded). WebP, 6-36 KB each.
- `src/marketing/photos.ts` (src, size, "Example photo: ..." alt, credit) + spec; footer credit line
  "Example product photos from Unsplash by ..." with each photographer linked.
- Copy aligned to what the photos can show: "PlayStation 5 console" (not "Disc edition") in deal
  intelligence, outcomes and the alerts notification; the seller question about the disc drive
  became "Any overheating, fan noise or drift on the controller?".
- Hero card: condition on its own line (no dangling separator next to the larger photo); PS5 crop:
  landscape on phones (controller + console base), portrait 4:5 when the card is side by side.
- Register: [LANDING_ASSETS.md](LANDING_ASSETS.md) "Example product photos".

Verified (commands run):
- `pnpm --filter web test` 95/95 (7 new: each photo exists as WebP with its recorded size and under
  60 KB; credits complete with Unsplash profile / photo URLs; informative alts start "Example photo:"),
  typecheck, lint, build.
- `node scripts/check-landing.mjs`: **174/174** - all 5 photos load at 1280 and 375 px with
  `object-fit: cover` (cropped, never stretched); deal-intelligence photo alt + tag; footer credits
  (5 photographer links); all previous checks. Template audit clean (one new in-page regex caught
  by the audit script and moved to Node).
- Screenshots reviewed: hero 1280 / 375, deal intelligence 1280 / 375, problem 1280.

Next: Landing 14 - deterministic Hunt demo model.

### Landing 14 (step 61) - Deterministic Hunt demo model - done 2026-10-10

No UI in this step: Landing 15 builds the interactive demo on top of this model. The
`DemoPlaceholder` stays in `#demo` until then.

- **Fixtures** (`src/marketing/demo/demo-fixtures.ts`): three products.
  - **iPhone 13 Pro**, **PlayStation 5** and **MacBook Air M2**.
  - Each has a default Hunt, a price range and step, and radius options of 10 / 25 / 50 mi.
  - Each has illustrative resale estimates (low / typical / high, plus the number of similar
    sales), separately for **used** and **new**.
  - Each has four made-up listings on eBay and Facebook Marketplace. Every listing id starts with
    `demo-`. Facebook listings have a distance; eBay listings ship.
  - Each has questions to ask the seller.
  - The iPhone and PS5 reuse the example photos; the MacBook has none, so `photo: null` and the
    UI uses a neutral visual.
- **Disclaimers**, kept with the demo and repeated in every evaluation:
  - "Illustrative demo - not live listings."
  - The resale figures are illustrative estimates.
  - The upside is gross, "not profit".
- **The PS5 demo matches the Landing 11 deal card** ($300 asking, $420 typical resale, +$120), so
  the page never contradicts itself.
- **The model** (`demo-model.ts`):
  - A pure finite-state machine: choose → configure → scan → candidate, or no match (back to
    configure) → evaluation. Also BACK from each step and RESTART from anywhere.
  - No network, AI, clock or randomness. The scan checks one listing per `SCAN_TICK`, so the UI
    sets the pace; `SCAN_COMPLETE` finishes at once for reduced motion.
  - Each listing is checked in a fixed order (marketplace, condition, max price, distance) and
    gets a plain-words reason ("Over your max price ($450)", "38 mi away - outside 25 mi").
  - The candidate is the match with the highest estimated gross upside, using the estimate for
    that listing's condition.
  - The evaluation contains:
    - asking price;
    - resale range;
    - gross upside range;
    - strength: "Strong deal" from 20% of the typical resale, "Worth a look" from 8%, otherwise
      "Thin margin";
    - confidence in words: high from 10 similar sales, medium from 5;
    - four "why" reasons;
    - questions for the seller;
    - costs before profit;
    - the disclaimers.
  - Events that don't apply return the same state object. Settings are validated: price is
    clamped and snapped to the step, only offered conditions and radii are accepted, and the
    last marketplace can't be switched off. The fixtures are never changed.
- **Default paths**:
  - iPhone: candidate at $340, +$90, Strong deal, high confidence.
  - PS5: +$120, Strong deal, medium confidence.
  - MacBook: +$120, Worth a look, medium confidence.
  - Each default also filters out at least one listing, and a too-tight Hunt reaches "no match"
    for every product.

Verified (commands run):
- `vitest src/marketing/demo`: 41/41, covering fixture invariants, every transition, ignored
  events, the scan order and reasons, candidates, no match, the evaluation maths and wording (no
  "profit" outside the disclaimers), and determinism (Math.random, Date.now and fetch rigged to
  throw are never called).
- Mutation check: three deliberate bugs, each caught (best-candidate comparison: 6 failures;
  max-price rule: 2; last-marketplace guard: 1). The file was restored and passes 41/41.
- `pnpm turbo run typecheck lint test build --filter web`: 9/9 tasks, web tests 136/136.

Next: Landing 15 - interactive demo UI ("Illustrative demo - not live listings").

### Landing 15 (step 62) - Interactive Hunt demo - done 2026-10-12

"Try a sample Hunt" (`#demo`) is now interactive, built on the Landing 14 model. It replaces the
temporary `DemoPlaceholder`, which has been deleted.

- **Steps:**
  - **Product:** three cards (photo, or a neutral laptop glyph for the MacBook).
  - **Hunt:** max-price slider, condition (Any / New / Used), marketplace chips with the official
    logos (the last one can't be switched off), and local-pickup distance (only enabled with
    Facebook Marketplace).
  - **Scan:** a progress bar plus a log of the four example listings, each showing waiting /
    checking / fits / skipped with the plain reason. "Skip to the result" is available. A best
    match card shows asking price, estimate and gross upside; if nothing fits, there's a way back.
  - **Deal:** strength, the listing, asking price, resale range ("Estimate"), gross upside range
    (the only green), confidence in words, why it was flagged / questions to ask the seller /
    costs to count before profit, the estimate and gross disclaimers, "Join early access"
    (`#waitlist`) and "Try another product".
- **Labelling:** "Illustrative demo — not live listings" is always on screen (yellow label,
  `DEMO_LABEL`).
- **Navigation:** a four-step progress bar (`aria-current="step"`, done steps marked for screen
  readers). Back is named for where it goes ("Back to products", "Stop and go back", "Change the
  Hunt", "Back to the match"), and Start over is available from any step after the first.
- **Accessibility:** on every step change, focus moves to the new step's heading (the old controls
  are gone). The scan, which runs by itself, is announced through a polite live region (start;
  outcome with the best match and gross upside). Everything works by keyboard.
- **Fast and deterministic:** one listing every 450 ms, so a scan takes about 2 s. "Skip" and
  reduced motion finish at once. The same choices always give the same result. There are no
  network calls, AI, clock or randomness; the timer only sets the pace.
- `demo-view.ts`: the progress steps, headings and announcements as pure functions (6 tests).

Verified (commands run):
- Web tests 142/142 (6 new view tests; the model tests from Landing 14 still pass). Typecheck,
  lint and build pass.
- `node scripts/check-landing.mjs` on the production build (port 3100), with the motion checks
  below: **198/198**. The new demo checks cover:
  - the label;
  - progress and the three products;
  - focus on each new heading;
  - the scan announcement and progress advancing one listing at a time;
  - the result in about 1.8 s, with the best match marked and announced;
  - the deal explanation and the waitlist link;
  - Back and Start over;
  - keyboard Enter and Home;
  - "nothing fits", and going back keeping the settings;
  - Skip giving the same result again (deterministic);
  - 375 px with no overflow.
  The photo check now counts distinct files, since the demo reuses two photos.
- Screenshots reviewed: every step at 1280 px, and the deal at 375 px (the confidence icon was
  fixed to sit beside its text).

### Landing 16 (step 63) - Motion - done 2026-10-12

CSS only; no JavaScript animation library and no sprites.

- **Shared feel:** `--rd-motion-ease-out`, `--rd-motion-enter` (600 ms), `--rd-motion-stage`
  (280 ms) and `--rd-motion-rise` (14 px) on the landing's `<main>`.
- **Hero reveal**, on load only, then still:
  - the copy rises in with a 60 ms stagger;
  - the **headline and mascot only move** - they never start invisible, so the largest content
    is painted (and counted for LCP) immediately;
  - the glow fades in.
- **Mascot motion** uses only approved art, with no new image:
  - the hero holding-box mascot settles in, then makes **one** gentle 6 px bob and stops;
  - the How it works running mascot dashes in once, tied to scrolling it into view.
- **Deal-card entrances:**
  - the hero sample card pops in after the mascot;
  - the deal-intelligence card rises in as it scrolls into view;
  - in the demo, the best-match / no-match card enters a beat after the scan finishes.
- **Stage transitions:** each demo stage fades and rises in (keyed by progress step, so the scan
  result stays in place), and each listing's result fades in as it's checked.
- **No loops:** nothing on the landing repeats forever, and everything finishes within about
  2.5 s of loading.
- **Reduced motion:** every animation sits behind `prefers-reduced-motion: no-preference`, with
  the global reset as a backstop. With "reduce" there are no animations at all, and the demo scan
  shows its result at once.
- **Fallback:** scroll-linked entrances are wrapped in `@supports (animation-timeline: view())`.
  Browsers without support (Safari / Firefox today) simply show the element.

Verified (commands run):
- `node scripts/check-landing.mjs`: 198/198, including 11 motion checks:
  - hero copy and card animate on load;
  - the headline and mascot animations contain no opacity;
  - the mascot animations are finite;
  - after 3 s nothing is running, nothing loops forever, and the card and mascot are at rest;
  - the running mascot and deal-intelligence card use a view timeline;
  - the card is fully shown once in view, and part-way (opacity about 0.79) when part-way in;
  - the demo stage animates on change;
  - under reduced motion: no hero, mascot or scroll animations, no demo stage animation, and an
    instant scan.
- `pnpm turbo run typecheck lint test build --filter web`: 9/9 tasks.
- Screenshots reviewed: the hero at rest (1280) and the demo stages.

Next: Landing 17.

### Landing 17 (step 64) - Marketplace requests carried to the waitlist - done 2026-10-12

- **Gallery:** every "On our radar" marketplace (4 coming soon + 11 exploring) has a
  **Request** toggle. The launch targets (eBay, Facebook Marketplace) can't be requested, since
  they're what Rein Drop launches with.
  - Buttons are named "Request OfferUp" etc. and use `aria-pressed`; a picked tile gets a navy
    outline and a tick, so the state isn't shown by colour alone.
  - An **Other - somewhere else** toggle covers marketplaces not in the list.
  - A polite summary reports only the visitor's own picks: "4 picked - added to your early-access
    sign-up below", with "Go to sign-up" and "Clear picks".
  - The hint above the tiles says picks help prioritise and "don't guarantee a marketplace will be
    added".
- **Waitlist form:** the picks appear inside the early-access form, in gallery order, as chips
  with "Remove X" buttons.
  - Picking Other adds an optional "Which marketplace?" field (60 characters max). Switching Other
    off forgets the text, so nothing is carried that the visitor can't see.
  - Hidden inputs (`requestedMarketplaces` = key or `other`, `requestedMarketplaceOther` = name)
    are ready for Landing 20.
  - The email field and button stay disabled until the backend exists.
  - With no picks, the form shows a line pointing back to the marketplace list.
- **State:** client state only. One in-memory store (`interest-store.ts`, `useSyncExternalStore`)
  is shared by the two client islands. There's no localStorage, cookie or network call; a reload
  clears it. The gallery stays server-rendered. The pure rules (`marketplace-interest.ts`) are kept
  apart from the React store, so the server component can import the copy; the build caught that
  boundary.
- **Honesty:** no vote or request totals anywhere, and no delivery promises. Both are tested in
  unit tests and in the browser.

Verified (commands run):
- Unit tests: 7 new (`marketplace-interest.spec.ts`):
  - only radar marketplaces are requestable;
  - picks keep gallery order;
  - Other's text is trimmed and capped, and dropped when Other is switched off;
  - clear;
  - form fields;
  - summaries cover the visitor's own picks only;
  - the copy has no totals or promises.
  Web 149/149, typecheck, lint, build: 9/9 tasks.
- `node scripts/check-landing.mjs` on the production build (port 3100): **209/209**, with 11 new
  request checks:
  - toggles on the 15 radar marketplaces only;
  - the empty state;
  - mouse and keyboard (Space) toggles, and the announced summary;
  - picks carried in order, with Other's field;
  - hidden values, including Other's name;
  - the sign-up stays disabled and nothing is sent (no fetch / XHR);
  - no totals or promises;
  - removing in the form un-picks in the gallery;
  - Clear picks;
  - gone after a reload, with nothing in local / session storage or cookies;
  - 375 px with no overflow.
- Screenshots reviewed: the gallery with picks (1280), the waitlist form with picks at 1280 and
  375.

Next: Landing 18.

### Landing 18 (step 65) - WaitlistSignup data model - done 2026-10-12

**Existing setup:** `packages/db` holds the shared data layer: Prisma 7.10, PostgreSQL (local
docker-compose `reindrop`, later Azure Database for PostgreSQL), UUIDv7 ids, `timestamptz(3)` and
22 hand-reviewed migrations. The database exists, but **the local server wasn't running** during
this step (`P1001: Can't reach database server at localhost:5432`). It's the owner's Docker
Postgres, so it wasn't started. The migration was therefore created without a database, and
applying it locally is a prerequisite (below).

- **Model `WaitlistSignup`** (not a User, no relations):
  - `id` (uuid7);
  - `email` - `VARCHAR(254)`, **unique**, stored only in normalized form;
  - `source` - text, from `WAITLIST_SOURCES`, currently `landing_waitlist_form`;
  - `requestedMarketplaces` - text[], default empty;
  - `requestedMarketplaceOther` - `VARCHAR(60)`, optional;
  - `consentVersion` - a dated text version such as `2026-10-12`;
  - `createdAt`, with an index on it for team exports.

  "Optional requested marketplace" became a list (empty means none) plus an optional name for
  "Other", because Landing 17 lets visitors pick several. Nothing the form collects is lost.
- **Migration `20261012211858_waitlist_signup`:**
  - Generated with `prisma migrate diff --from-schema <committed schema> --to-schema <new schema>`
    (no database needed).
  - Reviewed by hand. It's additive only: one table and two indexes; no existing table is touched.
  - Two CHECK constraints added: `email = lower(btrim(email))` and not empty; `consentVersion`
    matching `^\d{4}-\d{2}-\d{2}$`. Prisma doesn't model CHECKs, so later diffs leave them alone.
  - The folder name uses a UTC timestamp, and the file has no BOM (both lessons from step 20).
- **Shared rules:** `@rein-drop/contracts` `waitlist.ts` holds `normalizeWaitlistEmail()`
  (trimmed and lower-cased as a whole, dots and +tags kept, null if implausible),
  `WAITLIST_SOURCES`, `WAITLIST_EMAIL_MAX` (254), `WAITLIST_OTHER_MARKETPLACE_MAX` (60) and
  `WAITLIST_CONSENT_VERSION_PATTERN`.
- **No public list endpoint**, and a guard keeps it that way: the API's `architecture.spec.ts`
  now fails if any waitlist controller has a GET route, or if API code calls `findMany`, `count`,
  `aggregate`, `groupBy`, `findFirst` or `findUnique` on `waitlistSignup`. Reading one back by
  email is banned too: answering "already on the list" would let anyone test whether an address
  signed up, so the sign-up response must be the same either way. The guard's own patterns are
  tested against a sample violation.

Verified (commands run):
- `prisma validate`: valid.
- **Migration replay on a fresh in-memory Postgres** (PGlite 0.3.11, installed in a scratch
  folder only, not a project dependency):
  - all 23 migrations apply in order, ending with the new one;
  - 10/10 constraint checks pass: a normalized sign-up with requests and "other" is accepted;
    the defaults apply (empty list, createdAt set); a duplicate email is rejected (23505);
    upper-case, padded and empty emails are rejected (23514); an undated consent version is
    rejected (23514); an "other" name over 60 characters and an email over 254 are rejected
    (22001).
- Contracts: 3 new waitlist tests. API: 3 new guard tests.
- `pnpm turbo run build typecheck lint test`: **58/58**. One run had a timeout in
  `health.controller.spec` under full parallel load. It passed alone (3/3, 1.9 s) and in the
  re-run of the full suite; it's unrelated to this step.

**Prerequisite (owner):** apply the migration to the local database:
`pnpm infra:up`, then `pnpm --filter @rein-drop/db db:deploy` (or `db:migrate`, which also
checks for schema drift). In Azure it is applied by the normal deploy.

Next: Landing 19.

### Landing 19 (step 66) - Waitlist sign-up endpoint - done 2026-10-12

The prompt asked for the endpoint in `apps/web` "using existing database access"; decision L-D3
keeps the database in the API. Asked the owner, who chose both, keeping L-D3: `apps/web` has
`POST /api/waitlist`, which forwards server-to-server to a new NestJS `POST /waitlist`, the only
database writer. The web app still holds **no database credentials**, and a test enforces that.

- **Shared contract** (`@rein-drop/contracts` `waitlist.ts`), used by the web route, the API and
  the API client:
  - `joinWaitlistRequestSchema` (zod 4):
    - the email is normalized inside the schema;
    - `source` is from `WAITLIST_SOURCES`;
    - `requestedMarketplaces` must come from `WAITLIST_MARKETPLACE_CHOICES` (the 15 radar
      marketplaces plus `other`), with no repeats;
    - `requestedMarketplaceOther` (trimmed, 60 characters max, blank means none) is only allowed
      with `other`;
    - `consentVersion` must be a date.
  - **Fixed field messages** (`WAITLIST_MESSAGES`) never repeat the input.
  - `joinWaitlistResponseSchema` = `{ status: "received" }`.
- **API** `modules/waitlist`:
  - `@Public()` `POST /waitlist` returns **202 `{status:"received"}` for both new and repeat
    addresses**, so the response never reveals whether someone signed up.
  - Duplicates are handled at the database with `createMany({ skipDuplicates: true })`
    (`ON CONFLICT DO NOTHING`): a concurrent double-submit is safe and nothing is overwritten.
  - It logs `{event, outcome: created|duplicate, source, requestedMarketplaces: <count>,
    requestId}` and never the email. The existing request log never logs bodies, and a database
    failure becomes the generic 500 from the existing exception filter.
  - Throttle: 120 per minute per caller IP. That's a ceiling for direct callers and the whole
    site, since every landing visitor reaches the API through the web server's one IP.
  - `POST /waitlist` was added to the reviewed public-route list (`security.e2e-spec`). It has no
    GET route and no reads, as the Landing 18 guards require.
- **API client:** `joinWaitlist()` validates before sending; server-side callers only.
- **Web route** `POST /api/waitlist`: the logic is in `marketing/waitlist/waitlist-route.ts`
  (`server-only`); `app/api/waitlist/route.ts` just wires it up. Checks, in order:
  1. Same-origin: a cross-site `Origin` gets 403. Callers without an Origin are still limited and
     validated.
  2. JSON only (415 otherwise).
  3. **Per-visitor rate limit**: 5 per 10 minutes per client IP (rightmost `X-Forwarded-For`,
     added by the trusted ingress), 429 with `Retry-After`. In memory (see OUTSTANDING).
  4. 4 KB body limit (413), checked against the declared length and the actual bytes.
  5. **Honeypot** field `website`: if filled, the answer is 202 "received" and nothing is
     forwarded.
  6. Zod validation (400 `INVALID` with field names and fixed messages).
  7. Forward with a 5 s timeout.
  - **Privacy-safe answers:** the API's text is never passed on. An API 400 becomes "check the
    form", an API 429 becomes 429, and anything else becomes 503 "We couldn't save your sign-up
    just now".
  - All answers are `Cache-Control: no-store`.
  - **Server log:** one JSON line per request with outcome, status, field names and the API status.
    Never the email, the "other" name or the IP.
  - GET returns 405, so there's no list.

Verified (commands run):
- Unit tests:
  - contracts: 11 new waitlist tests (14 in the file);
  - API: 7 (service: insert, duplicate no-op, logs without the email in JSON and text format,
    database failure; controller: same answer for new and repeat, public POST 202 with throttle);
  - API client: 1;
  - web: 16. These cover the happy path, repeats, invalid input not echoed, malformed / array /
    string JSON, the honeypot, origin, 415 and 413, the per-visitor 429 (other visitors
    unaffected), API errors mapped safely, logs free of email / name / IP, rightmost XFF,
    limiter reset, the landing ↔ contract marketplace list, and "web never touches the database"
    (no `@rein-drop/db`, `@prisma/client` or `DATABASE_URL` in `apps/web`).
- Mutation check of the web route: four deliberate bugs (origin check removed, leftmost XFF,
  honeypot disabled, limit ×100) were each caught; the file was restored and passes 16/16.
- `pnpm turbo run build typecheck lint test`: **58/58** (API 168, web 165). API e2e suite: 58/58,
  including the public-route inventory.
- Browser bundles (`.next/static`, 30 chunks): no `DATABASE_URL`, `@rein-drop/db`,
  `PrismaClient`, waitlist log or honeypot code.
- **Real HTTP** against the production build (port 3100), with the owner's running API at :4000
  (database down): 7/7.
  - GET returns 405.
  - An invalid email returns 400 with the field named and not echoed.
  - A cross-site origin returns 403, and non-JSON returns 415.
  - The honeypot returns 202 with nothing forwarded.
  - A valid sign-up returns **503 with generic text**: the API answered 500 because the database
    is down, so nothing was stored.
  - A 6th attempt from one visitor returns 429 with Retry-After 600.
  - The server log lines contained only outcome, status and field names.
- **Not verified:** a successful database write end to end. That needs the database up and the
  Landing 18 migration applied.

Next: Landing 20 - the form (one form for every CTA), legal drafts, contact.

### Landing 20 (step 67) - One waitlist form, consent, contact, legal drafts - done 2026-10-13

**Contact:** asked the owner, who chose to set the address later via `CONTACT_EMAIL`. Nothing is
invented: one `ContactLink` (mailto from `CONTACT_EMAIL`, read on the server) feeds the footer,
both legal drafts and the form's error help. Until the address is set it reads "Contact details
coming soon", tagged "Needs review".

- **One form for every CTA:** `closing/WaitlistForm.tsx` (client) replaces the disabled
  placeholder. It's the target of all 8 sign-up links on the page: nav, hero, hunts, demo, the
  gallery's sign-up links and the four "coming soon" store badges. From the hero CTA, the next Tab
  lands on the email field.
- **Fields:**
  - email (`type=email`, autocomplete, labelled);
  - an **explicit, unticked consent checkbox**, "Email me about Rein Drop early access. I've read
    the privacy notice", with the notice linked and opening in a new tab;
  - **optional requested marketplace(s)**: the gallery picks as removable chips, plus a native
    "Add a marketplace" select for visitors who skipped the gallery (radar list plus Other with an
    optional name);
  - a honeypot `website` field: off-screen, `tabIndex -1`, `aria-hidden`;
  - fine print stating what the email and picks are used for, and that you can ask us to remove
    your sign-up.
- **States:**
  - **Validation** before sending (the same rule as the server, kept in agreement by a test): the
    message sits next to the field, is announced (`role=alert`), and focus moves to the first
    problem. That covers an empty email, an invalid email and missing consent.
  - **Loading:** `aria-busy`, a "Joining…" spinner (no spin with reduced motion), and the button
    stays focusable but ignores a second press.
  - **Success:** the form is replaced by "You're on the early-access list" (`role=status`,
    focused) with the **approved thumbs-up mascot**. It's the same for a new or repeat address,
    and the picks are cleared.
  - **Errors** (announced, with no input repeated back):
    - server field errors are shown on the field;
    - rate limited says "wait a few minutes" (no retry button);
    - "couldn't save" and "couldn't reach Rein Drop" (offline or 10 s timeout) get **Try again**,
      which resends the same sign-up, plus the contact path. The typed email stays in the field.
- **Consent versioning:** `waitlist/consent.ts` holds the consent words, the fine print and
  `WAITLIST_CONSENT_VERSION` (2026-10-12) in one place. It's sent with every sign-up, and the
  privacy draft carries the same version, so each stored sign-up records which text it agreed to.
- **Legal drafts:** `/privacy` and `/terms` are rendered from typed data (`legal/legal-drafts.ts`)
  by `LegalDraft`, replacing the deleted `LegalPlaceholder`.
  - While `reviewed: false` (both today), there's a **conspicuous yellow banner** at the top,
    "Draft - requires legal review - This text hasn't been reviewed by a lawyer yet…". The banner
    is `role=note`, the version is marked "(draft)", and the pages stay `noindex`.
  - The privacy draft describes only what exists: what the sign-up stores; that server logs don't
    contain the email; that IPs are counted in memory for rate limiting and not stored with the
    sign-up; and that there are no advertising or tracking cookies. It covers why the data is
    used, that sign-ups aren't sold, removal via the contact path, and "No system is completely
    secure".
  - The terms draft says early access guarantees nothing, the examples and demo are illustrative,
    estimates and gross upside aren't profit, you make the buying decisions, marketplace marks
    belong to their owners, and you shouldn't misuse the site.
  - **11 "To be confirmed" points** are left open instead of invented: legal entity, officer,
    hosting / email providers and countries, legal basis, retention, rights, liability wording,
    governing law, app terms, the hosting provider's own logs, and analytics.

Verified (commands run):
- Unit tests: 16 new (`landing20.spec.ts`):
  - the client email check agrees with the server's normalization on 12 samples;
  - the form payload passes the API contract;
  - HTTP 202 / 400 (with and without fields) / 429 / 503 / 500 / 403 map to the right outcomes,
    and offline or a timeout gives the network outcome;
  - the consent and error copy has no promises;
  - the drafts are unreviewed and the privacy version equals the consent version;
  - the privacy draft names every stored field;
  - there are no unsupported guarantees (only negations), and the open points are listed.
  Web 181/181, typecheck, lint, build; monorepo 58/58.
- `node scripts/check-landing.mjs` on the production build (port 3100, owner's API at :4000 with
  the database down): **230/230**. New checks:
  - all 8 sign-up links point to `#waitlist`;
  - Tab from the hero CTA lands on the email field;
  - the honeypot is off-screen, out of the tab order and hidden from screen readers;
  - empty / invalid email and missing consent get messages and focus, with nothing sent;
  - the loading state, and no double send;
  - the exact payload (email, source, the marketplace picked in the select, consent version,
    empty honeypot);
  - success (announced, focused, thumbs-up mascot, no repeat-or-new hint) and picks cleared;
  - offline: error, Try again, contact placeholder; Try again resends the same sign-up;
  - rate limited (no retry);
  - **the real route**: "couldn't save" with Try again while the database is down, and the email
    kept;
  - 375 px error state;
  - legal pages at 1280 / 375: banner at the top in yellow, version, To-be-confirmed blocks,
    contact, noindex, no guarantees.
  Earlier checks were updated for the live form.
- Browser bundles: no zod schema, contracts list or database code (only the form's own strings).
- Screenshots reviewed: the form idle / error / success at 1280, error at 375, privacy at 1280 /
  375.

**Not done** (needs the owner or later steps):
- legal review;
- `CONTACT_EMAIL`;
- an email provider to actually contact sign-ups;
- a real database write (the database is down).

Next: Landing 21 - anonymous analytics.

### Landing 21 (step 68) - Anonymous landing analytics - done 2026-10-13

A lightweight, **write-only** adapter in `apps/web/src/marketing/analytics/`, separate from the
app's product events (`@rein-drop/telemetry`).

- **Catalog** (`landing-events.ts`) - exactly five events, every property from a fixed list:
  - `hero_cta_clicked {cta: join_early_access | see_how_it_works}`;
  - `demo_started {product}` and `demo_completed {product}`, using the demo's three keys;
  - `marketplace_requested {marketplace}` - radar keys or `other`, **never the typed name**;
  - `waitlist_succeeded {requested: 0-16}` - a count only, **never the email**.

  `sanitizeLandingEvent()` keeps only catalog properties and refuses anything else: free text, an
  unknown value, a count out of range, an unknown event. So no email, name, IP, ID or timestamp
  can reach a provider.
- **Adapter** (`analytics.ts`):
  - **Providers:** `console` (dev mode: `console.info("[landing-analytics]", name, props)`) and
    `none`. The provider comes from `NEXT_PUBLIC_LANDING_ANALYTICS_PROVIDER` at build time.
    Defaults: console in development, **none in production** until a real provider is chosen
    and added to `PROVIDERS`. An unknown name means none, never "send somewhere".
  - **Consent:** **Global Privacy Control or Do Not Track means never tracked.** A provider with
    `requiresConsent: true` (cookies or identifiers) stays off until consent is given, and there's
    no consent UI yet, so it would stay off. The built-in providers set nothing.
  - **Safety:** no cookies, storage, IDs, timestamps or network calls in the adapter. A failing
    provider (e.g. an ad blocker) never breaks the page.
  - Turborepo's Next.js framework inference already hashes `NEXT_PUBLIC_*`, so builds with
    different providers never share a cache entry; no config change needed.
- **Wiring:**
  - hero CTAs via `TrackedHeroLink` (the hero stays a server component);
  - demo start (product chosen) and completion (deal explanation reached) in HuntDemo's
    step-change effect;
  - marketplace requests **in one place** - the picks store - once per new pick, whether from a
    gallery toggle, the form select or Other;
  - waitlist success in WaitlistForm.
- **No fake counters:** nothing is read back, so the page has nothing to count from. Tests check
  there's no read API, and that the page shows no sign-up, visitor or request totals.

Verified (commands run):
- Unit tests: 9 new (`analytics.spec.ts`):
  - the five events and their exact properties;
  - personal data is dropped or refused;
  - GPC and DNT;
  - the consent gate;
  - provider resolution;
  - console output, and a failing provider;
  - one request per new pick, never the typed name;
  - the adapter has no storage, cookie, ID or fetch code.
  Web 190/190; monorepo 58/58.
- `node scripts/check-landing.mjs`, against two production builds:
  - **console build** (`NEXT_PUBLIC_LANDING_ANALYTICS_PROVIDER=console`, `ANALYTICS_MODE=console`):
    **235/235**. One visit (hero CTAs, the demo through to the deal, Etsy + Other with a typed
    name, a sign-up) logs exactly 7 events in order with catalog values only. No email, typed
    name or IP appears. With **Global Privacy Control** on, the same visit logs **nothing** and
    still works.
  - **default build** (`ANALYTICS_MODE=none`): **233/233** - the same visit logs **nothing**.
  - Both: no cookies or local / session storage, and no totals on the page.

Next: Landing 22.

### Landing 22 (step 69) - SEO, social image, accessibility audit - done 2026-10-13

**Rule: only accurate metadata.** All of it lives in `marketing/seo.ts`.

- **Public origin `SITE_URL`** (https, or http for localhost only; an origin with no path), read at
  build time. When it isn't set, nothing is guessed:
  - the landing page is `noindex, nofollow`;
  - there's no canonical URL or `og:url`;
  - `robots.txt` blocks everything;
  - `sitemap.xml` is empty;
  - there's no structured data.

  That keeps any preview or beta deployment out of search engines.
- **With `SITE_URL`:**
  - `metadataBase`, canonical `/`, `og:url`;
  - `robots.txt` allows `/` but blocks the app, auth, API and dev routes, and links the sitemap;
  - `sitemap.xml` lists the landing page (the legal pages join once `reviewed: true`).
- **Always:**
  - title "Rein Drop - You flip it. We find it." and a meta description (137 characters);
  - Open Graph (website, site name, title, description, `en_US`) and a Twitter
    `summary_large_image` card.
  - The legal drafts keep their own "(draft)" titles and `noindex`.
- **Structured data** (JSON-LD, only with `SITE_URL`, `<` escaped per the Next.js guide):
  - `Organization` (name, URL, app-icon logo; `contactPoint` only if `CONTACT_EMAIL` is set);
  - `WebSite`;
  - `FAQPage` that is **exactly the visible FAQ**.

  There's **no** Product, SoftwareApplication, Offer, price, rating or review markup.
- **Social image** (`app/(marketing)/opengraph-image.tsx`, 1200×630 PNG, prerendered):
  - approved art only: the navy wordmark and holding-box mascot from `@rein-drop/brand-assets`;
  - the hero's own words ("You flip it. We find it."), "A sourcing assistant for resellers." and
    an "Early access" pill, set in Inter 800 / 500;
  - no numbers, marketplaces, results or dates;
  - alt text: "Rein Drop - You flip it. We find it. The Rein Drop mascot holding a parcel."

  Implementation notes:
  - Cache Components made the image dynamic (it reads files), so the reads moved into
    `'use cache'` helpers with `cacheLife('max')` and it's now **prerendered at build**.
  - Fonts come from `@expo-google-fonts/inter` 0.4.2 (TTF, MIT / OFL). The mobile app already used
    it; it's now also a web dependency, because the image renderer can't read the site's WOFF2.
    Fonts are cached as base64 and converted back to `ArrayBuffer`s; the first attempt failed the
    build with a DataView error, which this fixed.
- **Build cache fix:** `apps/web/turbo.json` now declares `SITE_URL`, `CONTACT_EMAIL`,
  `APP_STORE_URL` and `GOOGLE_PLAY_URL` as web build inputs.
  - Turborepo 2.11.7 strict environment mode filters out undeclared variables, so these build-time
    values could be dropped from turbo builds, or a cached build could be reused across different
    values. `CONTACT_EMAIL` (Landing 13) and the store URLs (Landing 07) had this gap too.
  - Verified: the build hash changes when `SITE_URL` changes. `NEXT_PUBLIC_*` was already covered
    by framework inference.
- **Accessibility audit** with axe-core 4.10.3 (WCAG 2.0 / 2.1 / 2.2 A + AA plus best practices).
  It was injected into the real pages from a scratch folder; it isn't a project dependency.
  - Covered: `/`, `/privacy` and `/terms` at 1280 and 375 px, plus the interactive states (demo
    deal explanation, gallery expander open with picks, form validation errors).
  - It found **3 issues**, all fixed:
    1. **Contrast:** the outcomes "+$63" was brand green on the green wash at **2.75:1** (below
       3:1 even for large text). The result card is now white with a green outline; green on
       white is 3.1:1, which passes for this large bold figure.
    2. **Definition list:** the deal-intelligence "Before fees…" note was a `<span>` inside the
       `<dl>` group. It's now a `<dd>`, styled small and muted.
    3. **Landmark:** "You stay in charge" was an `<aside>` inside `<main>`. It's now a `div` with
       its own heading.
  - **Re-run: 0 violations on every page, width and state.**
- **Permanent checks** in `check-landing.mjs`. The SEO part adapts to whether the build had
  `SITE_URL`. Checks:
  - title, description length, `lang`;
  - Open Graph and the Twitter card, and that the social image really is a 1200×630 PNG;
  - canonical / `og:url` / indexable, structured-data types and FAQ parity, robots rules and
    sitemap (with `SITE_URL`); or noindex, block-all robots, an empty sitemap and no JSON-LD
    (without it);
  - the legal drafts stay noindex with their own titles;
  - one h1 with no skipped heading levels, at 1280 and 375;
  - every image has alt text (decorative ones empty, informative ones descriptive);
  - every control has an accessible name, there's one `main`, and the skip link comes first;
  - **45 Tab stops from the top of the page, each with a visible focus indicator.**

Verified (commands run):
- Unit tests: 8 new (`seo.spec.ts`):
  - `SITE_URL` validation;
  - the no-origin defaults;
  - metadata with an origin;
  - robots and sitemap;
  - structured data (FAQ parity, no product / price / rating types or properties, contact point
    only when configured);
  - JSON-LD escaping;
  - social alt text.
  Web 198/198; monorepo **58/58**.
- axe-core audit: 3 issues found and fixed, then **0 violations** across all 8 page / width /
  state runs.
- `node scripts/check-landing.mjs`: **249/249** on a build with `SITE_URL=http://localhost:3100`,
  and **247/247** on the default build (no `SITE_URL`).
- Screenshots reviewed: the social image (before and after switching to Inter).

**Not covered by automation:** a manual screen-reader pass (NVDA / VoiceOver) and a real-device
keyboard and zoom check. These stay in OUTSTANDING.

Next: Landing 23.

### Landing 23 (step 70) - Responsive audit, assets, fonts, CLS, interaction cost, Web Vitals - done 2026-10-13

**Method:** measure first, then fix only what the numbers showed. All measurements were taken on
the production build (port 3100). The tools were installed in a scratch folder only and are not
project dependencies:
- Lighthouse 12.8.2: mobile with simulated throttling, mobile with **real (DevTools) throttling**,
  and desktop;
- lab Web Vitals over CDP: 4× CPU, about 1.6 Mbps / 150 ms RTT, 412 px at DPR 1.75, with and
  without reduced motion, 3-5 runs;
- a layout sweep at 320 / 375 / 768 / 1024 / 1280 / 1440 px;
- an interaction profile: Event Timing (INP-style) plus long tasks, at 4× CPU, using real pointer
  and keyboard input.

**Found and fixed:**
1. **The brand font never loaded.** The `@fontsource-variable/inter` CSS registers the family as
   "Inter Variable" while the tokens ask for "Inter", so every visitor got the system fallback
   (Segoe UI and so on), on the landing and in the app.
   - Now `next/font/local` loads the single latin variable WOFF2 (47 KB, every weight), self-hosted
     and **preloaded**, with `display: swap` and a **size-adjusted fallback** (no layout shift on
     swap).
   - The unused `@fontsource` CSS import (every subset's `@font-face`) is gone.
   - Inter is now loaded and used (`inter 100 900`).
2. **Favicon 404 on every page.** The approved app icon (192 px PNG, plus the Apple touch icon) is
   declared through the metadata `icons`. Best Practices went from 96 to **100**.
3. **Oversized and offscreen images:**
   - The 512 px app icon was shown at 32-40 px, eager, in two below-fold illustrations. It's now
     `next/image`, 64 / 96 px WebP and lazy: 45 KB became a few KB.
   - The hero mascot got the 640 px file for a ~450 device-px slot. `images.imageSizes` now
     includes 448.
   - The store badges are now `loading="lazy"` (the closing section's copies were eager).
   - Lighthouse's image savings went from 93 KB to 26 KB (mobile) and from 77 KB to 5 KB
     (desktop).
4. **LCP "load delay":** the hero mascot is the LCP element at every width and was only found when
   the parser reached it (about 0.6 s). It's now `preload` (a `<link rel="preload">` in `<head>`,
   per the Next 16 docs), replacing `fetchPriority` / `eager`.
5. **Style and layout before first paint** (the biggest main-thread cost: **1075 ms** in the
   real-throttled run): the whole long page was laid out at once.
   - Sections below the hero now use `content-visibility: auto` with
     `contain-intrinsic-size: auto 900px`.
   - **Side effect found by the landing check:** in-page links (nav "FAQ" / "Features", CTAs to
     `#waitlist`) landed in the wrong place (off by up to −922 px), because skipped sections only
     have estimated heights.
   - Fix, `RenderAhead` (a tiny client component): after load it renders the skipped sections one
     per idle period (small chunks, no long task). Before any in-page link is followed (a
     capture-phase click listener) or on arrival with a `#hash`, it renders everything first. Nav
     links and `/#faq` / `/#waitlist` land exactly again.
6. **Consent checkbox 20 → 24 px** (the WCAG 2.2 minimum target size, even without counting its
   label).

**Before → after:**

| | Before | After |
|---|---|---|
| Lighthouse mobile, real throttling | Perf 91, FCP 2.4 s, **LCP 2.4 s**, TBT 220 ms, CLS 0 | **Perf 96, FCP 2.1 s, LCP 2.1 s, TBT 100 ms**, CLS 0 |
| Lighthouse mobile, simulated | Perf 94, LCP 3.1 s, Best Practices 96 | Perf 94, LCP 3.1 s, **Best Practices 100** |
| Lighthouse desktop | Perf 100, LCP 0.7 s, BP 96 | Perf 100, LCP 0.7 s, **BP 100** |
| Lab LCP (median, throttled) | 1376 ms (3 runs) | **1184 ms (5 runs, 1164-1192)** |
| CLS: load + scrolling the full page | 0 | **0** (with the real font now swapping in) |
| Longest load task (real throttling) | 697 ms | **394 ms** |

- **Simulated mobile LCP stays ~3.1 s.** Lighthouse's model attributes ~2.6 s to "render delay",
  but real-throttled runs measure 2.1 s and lab runs ~1.2 s. Field data after launch should settle
  it (OUTSTANDING).
- **SEO 66** in these runs is intended: the default build has no `SITE_URL`, so it's noindex
  (step 69).

**Layout sweep** (320 / 375 / 768 / 1024 / 1280 / 1440): **no horizontal overflow and nothing
outside the viewport at any width.**
- The only flags were known false positives: the visually hidden email label, the off-screen
  honeypot, and the inline "privacy notice" link (exempt from target size).
- The full-page tablet screenshot (768) was reviewed: single column below 900 px, Inter visible,
  nothing cramped.

**Interaction cost** (4× CPU, real input; good INP is ≤ 200 ms): worst event per interaction.

| Interaction | Worst event |
|---|---|
| Demo: choose a product | 152 ms |
| Demo: slider | 24 ms |
| Demo: start scan | 64 ms |
| Demo: skip | 56 ms |
| Demo: see why | 48 ms |
| Gallery: expander | 24 ms |
| Gallery: request | 40 ms |
| FAQ: open | 24 ms |
| Nav menu | 32 ms |
| Form: submit | 40 ms |
| Form: typing | 24 ms |

One 107 ms long task in total. Choosing a demo product is the closest to the limit and is noted
for field INP.

**Reduced motion is unchanged:**
- all motion checks pass;
- `RenderAhead` and `content-visibility` add no motion;
- lab LCP is the same with reduced motion (1184 ms median).

**Measured but deliberately not changed** (in OUTSTANDING):
- about 13 KB of Next.js's own modern-JS polyfills;
- 3 render-blocking CSS files, about 15 KB (`experimental.inlineCss` is experimental, global to
  the signed-in app, and duplicates styles);
- the Google Play badge PNG, an official file served unaltered.

**Permanent checks** (`check-landing.mjs`, "Performance guards"):
- the 10 sections below the hero start skipped and are all rendered ahead after load;
- Inter is loaded and used;
- CLS < 0.01 over load plus a full scroll;
- the app icon is declared and served (no favicon 404);
- below-fold images are lazy;
- opening `/#faq` and `/#waitlist` lands on the section;
- the hero mascot check now also requires the `<head>` preload.

Verified (commands run):
- `node scripts/check-landing.mjs`: **254/254** (default build).
- `pnpm turbo run build typecheck lint test`: **58/58** (web 198/198).
- Lighthouse before and after (simulated, real-throttled, desktop), lab vitals, the layout sweep
  and the interaction profile, as above.

Next: **Landing 24**.
