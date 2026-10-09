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
| `packages/contracts/src/*` | API contracts (zod) | Add the waitlist request / response contract (Landing 19) |
| `packages/api-client/src/index.ts` | Typed API client | Add `joinWaitlist()` (Landing 19 / 20) |
| `packages/db/prisma/schema.prisma` + migrations | Product schema | Add `WaitlistSignup` + UTC-named migration (Landing 18) |
| `apps/api/src/modules/*` | Domain modules | Add a public `waitlist` module (Landing 19, decision L-D3) |
| `apps/api/test/security.e2e-spec.ts` | Inventory of public routes | Updated: `POST /waitlist` becomes a reviewed public route (Landing 19) |
| `apps/mobile/app.json` | No bundle id / package yet | Store URLs come later - configuration only (Landing 07 / 13) |
| `docs/BUILD_STATUS.md`, `docs/OUTSTANDING.md` | Product trail | One entry per landing step (step 47 + NN) |

## New files (planned)

```
apps/web/src/app/(marketing)/
  layout.tsx                 marketing layout (no AppShell)              (Landing 02)
  page.tsx                   the landing page at / (skeleton)            (Landing 02)
  landing.module.css         skeleton styles                             (Landing 02)
  privacy/page.tsx           privacy notice draft - "requires legal review" (planned, Landing 20)
  terms/page.tsx             terms draft - "requires legal review"       (planned, Landing 20)
  actions.ts                 server action: waitlist -> API              (planned, Landing 20)
apps/web/src/app/sitemap.ts, robots.ts, opengraph-image.*                (planned, Landing 22)
apps/web/src/marketing/
  sections.ts (+ spec)       section ids / labels, narrative order       (Landing 02)
  components/                Section, Container, PrimaryCTA, SecondaryCTA, Eyebrow, SectionHeading,
                             MarketplaceTile, DealMetric, DealCardShell, FAQItem, WaitlistFormShell,
                             StoreBadge (+ *.module.css)                   (planned, Landing 05)
  sections/                  Nav, Hero, Marketplaces, Problem, HowItWorks, Demo, Intelligence,
                             Hunts, Alerts, Outcomes, Faq, FinalCta, Footer (planned, Landing 06-15)
  marketplaces.ts            gallery data + status enum                  (planned, Landing 08)
  store-links.ts             App Store / Google Play URLs from config    (planned, Landing 07)
  demo/                      fixtures + finite-state model + tests       (planned, Landing 14)
  analytics.ts               anonymous landing events adapter            (planned, Landing 21)
  logos/                     official third-party logo / badge files + register (planned, Landing 04 / 08)
apps/web/src/app/dev/landing/page.tsx  dev-only style reference (Landing 03; primitives added in Landing 05)
apps/api/src/modules/waitlist/         public POST /waitlist module      (planned, Landing 19)
packages/contracts/src/waitlist.ts     waitlist request / response schema (planned, Landing 19)
docs/LANDING_ASSETS.md                 asset register (Rein Drop + third-party) (planned, Landing 04)
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
