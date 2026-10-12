# Landing page - build status

_Last updated: 2026-10-12 (Landing 16 = step 63)_

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

Next: **Landing 17**.
