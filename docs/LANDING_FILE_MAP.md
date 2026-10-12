# Landing page - file map

Where the landing page lives in the monorepo, which existing files it touches, and what each new
file is for. Status: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md). Planned files are marked
**(planned, Landing NN)** and may be adjusted by that step (recorded there).

## Existing files the landing page depends on or changes

| File | Today | Landing impact |
|---|---|---|
| ~~`apps/web/src/app/page.tsx`~~ | ~~`/` -> `redirect("/home")`~~ | **Removed in Landing 02** - `/` is `(marketing)/page.tsx` |
| `apps/web/src/proxy.ts` + `src/auth/entra/proxy.ts` | Auth gate | **Landing 02**: matcher includes `/`; `entraLandingProxy` sends a session that hasn't ended to `/home`, everyone else (and dev auth) sees the landing |
| `apps/web/src/app/layout.tsx` | Root layout: `--rd-*` tokens, Inter, globals | Shared by the landing; site-wide metadata (title template, description) reviewed in Landing 22 |
| `apps/web/src/app/globals.css` | Base styles, focus ring, global reduced-motion rule, `.visually-hidden` | Reused; no landing-specific rules here |
| `apps/web/src/app/(app)/layout.tsx` | AppShell for product pages | Untouched - the landing never renders the AppShell |
| `apps/web/next.config.ts` | Security headers / CSP, standalone output, cacheComponents | Reviewed when logos / images / forms are added (CSP `form-action 'self'` already allows the waitlist) |
| `apps/web/src/brand/assets.ts`, `Wordmark.tsx` | Token -> file mapping for logos / mascots | Reused for the wordmark and approved poses (Landing 04) |
| `apps/web/src/components/ui/*` | App UI primitives (Button, Card, Badge, Metric, Disclosure, TextInput, ...) | Reused where they fit; marketing-specific primitives are separate (Landing 05) |
| `apps/web/src/app/dev/ui/page.tsx` | Dev-only component showcase | Pattern for the landing style reference (Landing 03 / 05) |
| `packages/design-tokens/src/*` | Colours, type scale, spacing, radius, CSS variable generator | **Landing 03**: fluid display scale, lead / eyebrow, letter spacing, containers, gutter, section spacing, shadows, radii xl / 2xl (all `--rd-*`) |
| `packages/brand-assets/{logo,mascot,app-icon}/*` | Approved Rein Drop artwork (5 mascot poses, wordmarks, lock-ups) | Source of all Rein Drop imagery on the page |
| `packages/contracts/src/*` | API contracts (zod) | **Landing 18**: `waitlist.ts` - email normalization, sources, limits, consent-version format. Landing 19: the request / response schema |
| `packages/api-client/src/index.ts` | Typed API client | **Landing 19 (done)**: `joinWaitlist()` (server-side callers only) |
| `packages/db/prisma/schema.prisma` + migrations | Product schema | **Landing 18 (done)**: `WaitlistSignup` + `20261012211858_waitlist_signup` (additive; CHECK constraints for normalized email and dated consent version) |
| `apps/api/src/modules/*` | Domain modules | **Landing 19 (done)**: public `waitlist` module - `POST /waitlist`, write-only (decision L-D3) |
| `apps/api/test/security.e2e-spec.ts` | Inventory of public routes | **Landing 19 (done)**: `POST /waitlist` is on the reviewed public list |
| `apps/mobile/app.json` | No bundle id / package yet | Store URLs come later - configuration only (Landing 07 / 13) |
| `docs/BUILD_STATUS.md`, `docs/OUTSTANDING.md` | Product trail | One entry per landing step (step 47 + NN) |

## New files (planned)

```
apps/web/src/app/(marketing)/
  layout.tsx                 marketing layout (no AppShell)              (Landing 02)
  page.tsx                   the landing page at / (skeleton)            (Landing 02)
  landing.module.css         skeleton styles                             (Landing 02)
  privacy/page.tsx           privacy notice DRAFT - "Draft - requires legal review" banner, noindex (Landing 20)
  terms/page.tsx             terms of use DRAFT - same banner, noindex (Landing 20)
  (no server action: the form posts to app/api/waitlist/route.ts -> API, Landing 19-20)
apps/web/src/app/sitemap.ts, robots.ts, opengraph-image.*                (planned, Landing 22)
apps/web/src/marketing/
  sections.ts (+ spec)       section ids / labels, narrative order       (Landing 02)
  components/                Section, Container, PrimaryCTA, SecondaryCTA, Eyebrow, SectionHeading,
                             MarketplaceTile, DealMetric, DealCardShell, FAQItem, WaitlistFormShell,
                             StoreBadge (+ *.module.css)                   (planned, Landing 05)
  nav/                       SiteNav (+ css), menu-focus.ts keyboard / scroll rules (+ spec) (Landing 06)
  hero/                      Hero (+ css), hero-example.ts illustrative card data (+ spec) (Landing 07)
  StoreBadges.tsx (+ css)    App Store / Google Play badges, coming soon -> waitlist (Landing 07)
  problem/                   ProblemSection (+ css), problem-story.ts copy (+ spec) (Landing 09)
  how-it-works/              HowItWorks (+ css), how-it-works-story.ts copy (+ spec) (Landing 10)
  intelligence/              DealIntelligence (+ css), deal-showcase.ts example (+ spec) (Landing 11)
  illustrative.ts            illustrative label, gross upside, USD formatting (shared) (Landing 11)
  hunts/                     HuntPreferences (+ css), hunts-story.ts, hunts-alerts spec (Landing 12)
  alerts/                    AlertsSection (+ css), alerts-story.ts (Landing 12)
  outcomes/                  OutcomesSection (+ css), outcomes-story.ts (Landing 13)
  faq/                       FaqSection (+ css), faq.ts, landing13 spec (Landing 13)
  closing/                   ClosingCta (+ css) - the #waitlist target (Landing 13; form in 20)
  footer/                    SiteFooter (+ css) (Landing 13)
  demo/HuntDemo.tsx (+ css)  "Try a sample Hunt" - the interactive, illustrative demo (client component) (Landing 15; motion 16)
  demo/demo-view.ts (+spec)  progress steps, panel headings, live-region announcements (Landing 15)
  demo/demo-fixtures.ts      3 demo products: made-up listings, illustrative resale estimates, disclaimers (Landing 14)
  demo/demo-model.ts (+spec) pure finite-state demo: choose > configure > scan > candidate / no match > evaluation (Landing 14)
  site-config.ts             CONTACT_EMAIL (never invented), legal links (Landing 13)
  photos.ts (+ spec)         example product photos (Unsplash) + credits (step 60b)
  sections/                  Marketplaces, Problem, HowItWorks, Demo, Intelligence,
                             Hunts, Alerts, Outcomes, Faq, FinalCta, Footer (planned, Landing 07-15)
  marketplaces.ts (+ spec)   marketplace roadmap data, statuses, proof rule (Landing 08)
  marketplaces/              MarketplaceGallery, MarketplaceMark (+ css) (Landing 08)
  marketplaces/marketplace-interest.ts (+spec)  requestable marketplaces, pure reducer, form fields, copy (Landing 17)
  marketplaces/interest-store.ts                in-memory client store shared by gallery + waitlist form (Landing 17)
  marketplaces/InterestControls.tsx             Request / Other toggles + the visitor's own summary (client islands) (Landing 17)
  closing/WaitlistInterest.tsx                  optional marketplace picks in the form: chips, add-a-marketplace select, Other's name (Landing 17 / 20)
  closing/WaitlistForm.tsx                      THE early-access form: validation, loading / success / error / retry, consent, honeypot (Landing 20)
  waitlist/consent.ts, waitlist/submit.ts (+landing20 spec)  consent words + version, client email check, submit -> outcomes (Landing 20)
  contact/ContactLink.tsx (+ css)               the one contact path (CONTACT_EMAIL, placeholder until set) (Landing 20)
  legal/legal-drafts.ts, legal/LegalDraft.tsx (+ css)  privacy + terms drafts, 'Draft - requires legal review' banner, To be confirmed points (Landing 20)
  store-links.ts             App Store / Google Play URLs from config (APP_STORE_URL / GOOGLE_PLAY_URL) (Landing 07)
  analytics/landing-events.ts  the 5 landing events + sanitizer (fixed values only, no personal data) (Landing 21)
  analytics/analytics.ts (+spec)  write-only adapter: console (dev) / none (prod default) / provider slot; GPC + DNT; consent gate (Landing 21)
  analytics/TrackedLink.tsx  hero CTA links that record which CTA was used (Landing 21)
  seo.ts (+spec)             SITE_URL, landing metadata, robots / sitemap rules, JSON-LD (accurate only) (Landing 22)
app/robots.ts, app/sitemap.ts           generated from seo.ts (block-all / empty until SITE_URL is set) (Landing 22)
app/(marketing)/opengraph-image.tsx    1200x630 social image from approved brand art + Inter, prerendered (Landing 22)
apps/web/turbo.json                     declares the web's build-time env vars (SITE_URL, CONTACT_EMAIL, store URLs) (Landing 22)
  brand-assets.generated.ts  GENERATED paths + sizes of the optimized brand images (Landing 04)
  landing-assets.ts (+ spec) landing meanings -> images; null = missing pose (Landing 04)
apps/web/scripts/check-landing.mjs       real-browser landing check: whole landing page + legal placeholders + demo + motion (headless Chrome / Edge, screenshots) (Landing 06-16)
apps/web/scripts/build-brand-assets.mjs  generates public/assets/brand + brand-assets.generated.ts (Landing 04)
apps/web/public/assets/brand/          GENERATED optimized Rein Drop images, stable URLs (Landing 04)
apps/web/public/assets/third-party/    official third-party marks: stores/ badges (Landing 07), marketplaces/ (Landing 08)
apps/web/public/assets/photos/         example product photos, Unsplash License (step 60b)
apps/web/src/app/dev/landing/page.tsx  dev-only style reference (Landing 03; primitives added in Landing 05)
apps/api/src/modules/waitlist/         public POST /waitlist module (write-only, 202 'received' for new + repeat) (Landing 19)
apps/web/src/app/api/waitlist/route.ts  POST /api/waitlist - wires the checks to the API client (Landing 19)
apps/web/src/marketing/waitlist/waitlist-route.ts (+spec)  origin / JSON / rate limit / size / honeypot / zod / privacy-safe answers + logs (Landing 19)
packages/contracts/src/waitlist.ts     email normalization, sources, limits (Landing 18); request / response schema, requestable marketplaces, safe messages (Landing 19)
docs/LANDING_ASSETS.md                 asset register (Rein Drop + third-party) (Landing 04)
docs/LANDING_BUILD_STATUS.md           this track's status (exists)
docs/LANDING_FILE_MAP.md               this file (exists)
```

## Route map after the landing work

| URL | Served by | Access |
|---|---|---|
| `/` | `(marketing)/page.tsx` | Public; signed-in visitors redirected to `/home` by the proxy |
| `/privacy`, `/terms` | `(marketing)/…` | Public |
| `/sign-in`, `/auth/*` | existing | Public (auth flow) |
| `/home`, `/hunts/**`, `/deals/**`, `/alerts`, `/analytics/**`, `/inventory/**`, `/settings/**`, `/onboarding` | existing `(app)` / onboarding | Signed in (proxy + `verifySession()`) |
| `/dev/**` (incl. `/dev/landing`) | existing dev tools | Development only |
| API `POST /waitlist` | `apps/api` waitlist module | Public, throttled (Landing 19) |

Collision check: no existing route under `/privacy`, `/terms`, `/sitemap.xml`, `/robots.txt` or
`/opengraph-image`; the only collision is `/` itself (the current redirect), resolved in Landing 02.
There is no `/app` route and none is added (decision L-D1).
