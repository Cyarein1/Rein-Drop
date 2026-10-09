# Landing page - build status

_Last updated: 2026-10-09 (Landing 01 = step 48)_

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
2. **Image optimization**: `pnpm-workspace.yaml` denies `sharp` install scripts. Next's image
   optimizer in production needs a working `sharp`; verify the standalone container serves
   optimized images (Landing 04 / 23), or pre-optimize WebP copies of the large PNGs.
3. **Type scale** has no display sizes for a marketing hero (max 36 px) - add marketing display
   tokens in Landing 03 without changing the app's scale.
4. **Third-party logos** need a home and a register: proposed `apps/web/src/marketing/logos/` with
   a source / usage table (decided in Landing 04 / 08).
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
- Next: **Landing 02** - marketing route skeleton.
