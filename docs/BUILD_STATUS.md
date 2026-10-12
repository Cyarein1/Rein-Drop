# Build Status

_Last updated: 2026-10-13 (step 67 - Landing 20)_

Everything still open since step 1 - decisions needed, unbuilt work, unverified items - is
collected in [`docs/OUTSTANDING.md`](OUTSTANDING.md), updated with every step.

## Completed steps

### Step 67 - Landing 20: one waitlist form, consent, contact path, legal drafts

**The form:**
- Every sign-up link and coming-soon badge on the landing leads to one accessible form:
  - email;
  - an explicit consent checkbox;
  - optional requested marketplaces (gallery picks plus an in-form select);
  - a honeypot.
- Its states: validation with focus, loading, success with the approved mascot, and errors with
  Try again and the contact path.
- The consent words and version are defined once and shared with the privacy draft.

**Legal drafts and contact:**
- `/privacy` and `/terms` are drafts with a conspicuous "Draft - requires legal review" banner and
  11 "To be confirmed" points, noindex, and no unsupported guarantees.
- Contact comes from `CONTACT_EMAIL` via one `ContactLink`. It's a placeholder until set (the
  owner will set it later).

**Verified:** web 181/181, monorepo 58/58, landing browser check 230/230 (including one real
submission through the route); screenshots reviewed. Details:
[LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 66 - Landing 19: waitlist sign-up endpoint

**Endpoints:**
- Web `POST /api/waitlist`: same-origin check, JSON only, 5 sign-ups per 10 minutes per visitor,
  4 KB limit, honeypot, shared Zod schema.
- It forwards server-to-server to the new public API `POST /waitlist`, which keeps decision L-D3:
  the API is the only database writer, and the web has no database credentials (a test enforces
  that).

**Behaviour:**
- Repeat addresses are a database no-op (`ON CONFLICT DO NOTHING`), and the answer is the same
  `202 received` for new and repeat addresses.
- Errors use fixed messages and never echo input or API internals.
- Logs on both sides carry outcomes only, never the email, the "other" name or the IP.

**Verified:**
- New unit tests: contracts 11, API 7, API client 1, web 16; a 4-mutation check of the web route.
- Monorepo 58/58; API e2e 58/58.
- No server code in the browser bundles.
- Real HTTP 7/7 against a production build.

**Still to do:** a successful database write is unverified until the local database is up and the
step 65 migration is applied. Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 65 - Landing 18: WaitlistSignup model

- **Model:** `WaitlistSignup` in `packages/db`: a unique normalized email, source, requested
  marketplaces (list) plus an optional "Other" name, consent version and createdAt.
- **Migration:** additive only, `20261012211858_waitlist_signup`, with CHECK constraints for the
  normalized email and the dated consent version.
- **Shared rules:** `normalizeWaitlistEmail()` and the waitlist constants live in
  `@rein-drop/contracts`.
- **No public list endpoint:** API guard tests forbid GET routes and reads, counts or lists of
  sign-ups.
- **Not yet applied locally:** the local database was down, so the migration was generated without
  it. Verified by replaying all 23 migrations on an in-memory Postgres, with 10/10 constraint
  checks.
- **Checks:** monorepo 58/58.
- **Prerequisite:** `pnpm infra:up`, then `pnpm --filter @rein-drop/db db:deploy`.

Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 64 - Landing 17: marketplace requests carried to the waitlist

- **Gallery:** visitors can request any "On our radar" marketplace, or "Other", from the gallery.
- **Waitlist form:** the picks appear in the early-access form, where they can be removed; Other
  can be named; hidden inputs are ready for Landing 20.
- **State:** client state only, in memory, never stored or sent. The sign-up stays disabled.
- **Honesty:** no vote totals, no delivery promises.
Verified: 7 unit tests (web 149/149), typecheck, lint, build; landing browser check 209/209;
screenshots at 1280 / 375. Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 63 - Landing 16: motion

CSS-only motion:
- a one-time hero reveal (the headline and mascot only move, so the page's main content is shown
  at once);
- one gentle bob for the approved hero mascot, and a single scroll-linked dash-in for the approved
  running mascot;
- deal-card entrances and demo stage transitions.
Nothing loops. Everything sits behind `prefers-reduced-motion: no-preference`, and scroll-linked
entrances fall back to simply showing the element. Verified with 11 motion checks in the landing
browser check (198/198, with the demo checks). Details:
[LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 62 - Landing 15: interactive Hunt demo

"Try a sample Hunt" is now interactive, built on the step 61 model: product → Hunt → scan → deal.
- **On screen:** progress, Back / Start over, and the always-visible "Illustrative demo — not live
  listings" label.
- **Accessibility:** focus moves to each new heading, and the scan is announced politely.
- **Speed:** about 2 s per scan, deterministic, with an instant result under reduced motion or Skip.
Verified: web tests 142/142, typecheck, lint, build; landing browser check 198/198; screenshots at
1280 / 375. Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 61 - Landing 14: deterministic Hunt demo model

Typed fixtures for three products (iPhone 13 Pro, PlayStation 5, MacBook Air M2): made-up
listings, illustrative resale estimates per condition, and explicit "demo / estimate / gross - not
profit" disclaimers. A pure finite-state model drives it: choose → configure → scan → candidate
(or no match) → evaluation. There is no network, AI, clock or randomness, and no UI yet
(Landing 15). Verified: 41 new tests (and a mutation check), web 136/136, typecheck, lint and
build. Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 60b - Landing photo pass (owner request)

Real product photos (free Unsplash License, verified per photo, no people) for the example deals:
iPhone 13 Pro in the hero card, PlayStation 5 in the deal-intelligence card ("Example photo" tag),
three iPhones as missed-listing thumbnails; credited in the footer; copy aligned to what the photos
show ("PlayStation 5 console"). Verified: web tests 95/95, browser check 174/174, screenshots
reviewed. Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 60 - Landing 13: after the flip, FAQ, closing CTA, footer

Static landing page complete: Bought -> Sold -> Actual profit (+$63 vs the +$120 gross estimate,
illustrative), a seven-question FAQ (Hunt, launch targets, timing, estimates, pricing not final,
availability, Rein Drop never buys), a white-on-navy closing CTA (#waitlist) with the approved
mascot, store badges and the email form shown disabled until Landing 20, and a footer with contact
(configured, never invented - "needs review" until set), Privacy / Terms marked "draft - needs legal
review" (placeholder pages, noindex) and the trademark line. Typed section map caught the missing
demo (temporary placeholder). Verified: web tests 88/88, browser check 171/171 (incl. no dead
in-page links); fixed two check-script regexes that had silently stopped testing. Details:
[LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 59 - Landing 12: Hunt customization and alerts

"Your budget. Your area. Your kind of flip." with an app-screen illustration of the Hunt form
(product, budget, condition, location, sources) that contains no real controls and is labelled
"illustration, not a working form" - the only action is joining early access; and "Get a heads-up
when something worth checking drops." with a phone notification illustration and only real channels
(push in the app, in-app inbox, per-type choice, one alert per deal; no email, no speed promise).
Verified: web tests 83/83, browser check 150/150 (incl. zero controls inside illustrations).
Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 58 - Landing 11: deal intelligence showcase

One editorial deal card (illustrative PS5 on eBay, labelled photo placeholder): asking $300,
estimated resale $420 ("Estimate"), potential gross upside +$120 - the only green - with three
numbered notes: why it was flagged, questions to ask (+ red-flag caution), and the costs that come
before profit (named, never priced; never "net profit"). Verified: web tests 78/78, browser check
135/135 (incl. one-green and no-net-profit checks by computed style / page text), screenshots
reviewed. Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 57 - Landing 10: how it works

Three connected steps (ordered list, decorative connectors): Tell us what you want -> Rein Drop
keeps looking (approved running mascot) -> You check promising deals (why flagged, what to ask,
your own Save / Not for me / I bought it), plus "You stay in charge - Rein Drop never buys anything
for you". Verified: web tests 74/74, browser check 118/118 (incl. connector placement and the hero
CTA landing here), screenshots reviewed. Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 56 - Landing 09: problem section

"Great flips don't wait for your next refresh." - a before / after story in two expressive cards:
a crowded CSS browser (tabs, refresh, listings sold / too expensive / seen) vs one saved Hunt (live,
official eBay + Facebook marks, a heads-up with the approved app icon). CSS / UI illustrations with
screen-reader summaries; no performance claims or live activity. Verified: web tests 70/70, browser
check 105/105 (incl. a new no-overlap check after a screenshot caught one), screenshots reviewed.
Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 55 - Landing 08: marketplace gallery and status model

Data-driven marketplace roadmap (17 sources, statuses with plain meanings; Live / Beta impossible
without recorded proof): eBay + Facebook Marketplace "Launch target", OfferUp / Craigslist /
Mercari / Poshmark "Coming soon / Exploring", 11 "Exploring" behind a native "See more". 13
official marks from the companies' own sites (eBay SVG wordmark), 4 text fallbacks; hero card shows
the Facebook mark. Verified: web tests 66/66, browser check 90/90 incl. keyboard expand and logo
loading at 1280 / 375 / 320 px. Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 54 - Landing 07: hero

"You flip it. We find it." hero: supporting copy, orange Join early access + See how it works,
official App Store / Google Play badges ("coming soon" -> waitlist; configurable store URLs),
honest launch-target line, approved mascot holding a box and a sample deal card labelled
"Illustrative example - not a live listing" (gross upside, cost caveat, no live activity).
Asymmetric desktop, stacked mobile. Verified: web tests 61/61, real-browser check 71/71 at
1440-320 px (incl. badge alignment it caught and we fixed), screenshots reviewed. Details:
[LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 53 - Landing 06: navigation and mobile menu

(Step 52 is reserved for Landing 05, marketing primitives, not sent yet.) Sticky-but-subtle landing
nav: approved wordmark, How it works / Features / Marketplaces / FAQ, quiet Sign in, orange Join
early access -> waitlist; below 900 px a menu with aria-expanded / controls, focus to the first
link, Tab wrap, Escape / outside click / link / resize close, focus back to the button, scroll
lock; in-page links focus their section; smooth scroll only without reduced motion. Verified: web
tests 56/56 and a real-browser check (`scripts/check-landing-nav.mjs`, headless Chrome) 23/23 on
the production build, screenshots reviewed. Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 51 - Landing 04: asset register and mascot mapping

Generated optimized copies of the 11 approved brand originals (`pnpm --filter web assets:brand` ->
`apps/web/public/assets/brand/`, 898 KB from 12.6 MB, trimmed WebP + palette PNG icons, sizes in a
generated module); landing meanings mapped (`landing-assets.ts`: 5 approved poses + logos; 6 poses
missing as TODOs); register [LANDING_ASSETS.md](LANDING_ASSETS.md) incl. third-party marks (TODO,
official files). Dockerfile copies `public/`. Verified: 49 web tests, build, container serves the
files and the image optimizer works (sharp). Found: the mockup's deer mascot isn't an approved
asset - the approved mascot is the orange droplet. Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 50 - Landing 03: brand tokens and typography

Extended `@rein-drop/design-tokens` for marketing (app values unchanged): fluid display type
scale, lead / eyebrow text, letter spacing, containers, gutter, section spacing, navy-tinted
shadows + CTA glow, radii xl / 2xl - all generated as `--rd-*` CSS variables. Dev-only style
reference at `/dev/landing` (404 in production). Verified: token tests 16/16, web checks, production
404, render on the running dev server, full check 58/58. Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 49 - Landing 02: marketing route skeleton

`/` is now the public landing page (skeleton: 11 anchored sections, placeholder header with Sign
in) in a `(marketing)` route group; the old `/` -> `/home` redirect is gone. Signed-in redirect in
the Proxy (`entraLandingProxy`: a session that hasn't ended -> `/home`; never a sign-in redirect),
so `/` builds as a static page. Development auth always sees the landing; the app is at `/home`
(acceptance guide updated). Verified: web tests / typecheck / lint / build (`/` static), production
server smoke test on port 3100. Details: [LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md).

### Step 48 - Landing 01: landing page audit and boundaries

Start of the marketing landing-page track (24 owner prompts, Landing NN = step 47 + NN), a
deliberate addition after the MVP freeze that adds no product features. Status and plan:
[LANDING_BUILD_STATUS.md](LANDING_BUILD_STATUS.md); file map: [LANDING_FILE_MAP.md](LANDING_FILE_MAP.md).

- Audited the workspace, `apps/web` (routes, proxy, layouts, CSP, styles, brand usage), design
  tokens, brand assets, mobile config and the bundled Next.js 16.4 docs. Monorepo exists - no
  prerequisite missing.
- Recorded the agreed decisions L-D1..L-D9 (`/` = landing with signed-in -> `/home`; CSS Modules +
  tokens, no Tailwind; waitlist in the NestJS API; no pricing; approved mascots only; real logos
  with a non-affiliation line; store badges "coming soon"; honest statuses; anonymous analytics)
  and seven audit risks (signed-in redirect must keep `/` static, `sharp` denied, no display type
  sizes, logo home, cold start, legal before emails, no Playwright).
- No code or UI changed; nothing to build or test.

### Step 47 - MVP freeze, post-MVP backlog, release checklist, known limitations (Build Prompt 44)

The last Build Prompt. Scope review: [MVP_FREEZE.md](MVP_FREEZE.md). No product code changed
(two stale comments fixed).

**What was added**

- [`MVP_FREEZE.md`](MVP_FREEZE.md): the technical MVP definition (Tech Architecture section 28)
  clause by clause with the steps that built it, the automated evidence and what still needs a live
  run; the App Flow Blueprint "Must work in MVP" table; a check that no critical flow depends on a
  future feature; freeze rules.
- [`POST_MVP_BACKLOG.md`](POST_MVP_BACKLOG.md): B-01..B-09 explicitly deferred (additional
  marketplaces, Hot Hunts - unfinished, teams / seats, cross-listing / delisting, Redis, data
  warehouse, advanced search, fine-tuning, microservices), each with the proven blocker that would
  bring it back; product (B-10..B-25) and platform (B-30..B-37) items with priorities.
- [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md): decisions, quality gates (incl. the final local
  acceptance run), external services with their live tests, Azure deployment, hosted verification,
  go / no-go + rollback, first week.
- [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md): what testers and operators will notice, each
  linked to a backlog item or decision.
- OUTSTANDING: section 2 now holds only release work; 87 nonessential items moved to Resolved with
  their backlog id (or the step that already resolved them).

**Findings of the review**

- Every clause of the MVP definition is built and covered by automated tests on a real database.
- **Facebook in production depends on D12**: production registers no Facebook adapter, so the
  source shows "isn't set up" and a Facebook-only Hunt finds nothing - a release decision
  (checklist section 1), not missing code.
- Not yet run against real Entra / Stripe / eBay / Foundry / push, and the mobile app not on a
  device - release checklist sections 3 and 5.
- Hot Hunts are unfinished (NORMAL priority only, entitlements off, "coming later") - deferred (B-02).
- OpenAPI (locked in the Tech Architecture) is missing - backlog P1 (B-30), not an MVP clause.

**Not done / TODO**

- The final run of LOCAL_MVP_ACCEPTANCE.md is yours (it writes demo data into your database):
  `pnpm db:reset-demo`, then the guide, then the sign-off sheet - release checklist section 2.

### Step 46 - Product events behind a provider abstraction (Build Prompt 43)

Decision [0016](decisions/0016-product-events.md); catalog, privacy rules and queries in
[telemetry/product-events.md](telemetry/product-events.md). No vendor is approved yet (D15), so
events go to a structured log line (the prompt's "local logger first").

**What was added**

- Contracts `product-events.ts`: the 13 events (onboarding_started / completed, hunt_created /
  activated, deal_alerted / opened / saved / ignored / bought, sale_recorded, plan_viewed /
  selected, cancellation), each with a strict property schema - ids, enums and booleans only; no
  listing content, money, free text or personal data. `POST /telemetry/events` body schema
  (client events: `plan_viewed` only).
- New package `@rein-drop/telemetry`: `ProductEventProvider` (log | none | memory for tests),
  `ProductEvents.track()` (validates against the catalog, drops and warns by path on anything
  else, never throws or waits), `PRODUCT_EVENTS_PROVIDER` env shape (default `log`).
- API: global `TelemetryModule` + `POST /telemetry/events` (signed in, 60/min, 204). Events
  recorded after commit and only on real state changes in Seller Snapshot, Hunts, Deals, Outcomes
  and Billing (`plan_selected` on Free / checkout / development choice; `cancellation` from the
  stored-vs-Stripe change in verified webhooks, so redeliveries never count twice).
- Worker: `deal_alerted` after the alert transaction commits (once per deal).
- Web + mobile: Start watching reports `plan_viewed` once when the plan comparison is shown
  (best effort). api-client `trackEvent()`; `send()` now accepts 204 No Content.
- `.env.example` (api, worker): `PRODUCT_EVENTS_PROVIDER`.

**What works (verified)**

- Contracts: every event accepts its documented properties and rejects titles, URLs, email,
  money and free text; clients can't send server events (29 tests).
- Telemetry package (6): envelope, drop-without-echo, provider failures swallowed, log line format.
- API int `product-events.int-spec.ts` (6): onboarding once each, hunt created / activated (not on
  a repeated activation or resume), deal opened (first / again), saved / ignored / bought once,
  sale once (a correction isn't another), client endpoint 400 / 401 rules, and no listing title,
  URL, price, ignore reason, query, email or subject in any of the run's 11 events.
- API int `billing.int-spec.ts` (+1): plan_selected x3 (refused requests not counted),
  cancellation scheduled once and ended once across redeliveries, no Stripe ids / prices / email.
- Worker int `alerts.int-spec.ts`: one `deal_alerted` per alert, none after re-runs / re-analysis.
- api-client: `trackEvent` validates before sending and handles 204.
- Full suites and `pnpm turbo run build typecheck lint test`: see the step 46 summary.

**Not done / TODO**

- Vendor provider (D15) and pseudonymised ids for it; dashboards (only a KQL example).

### Step 45 - Azure beta infrastructure (Bicep) + deployment runbook (Build Prompt 42)

Decision [0015](decisions/0015-azure-beta-hosting.md); runbook
[azure/BETA_DEPLOYMENT.md](azure/BETA_DEPLOYMENT.md). **Nothing was deployed or provisioned** -
templates, images and documentation only.

**What was added**

- `Dockerfile` (targets `api`, `worker`, `web`, `migrate`; one pnpm/turbo build stage, `pnpm deploy
  --prod` for api / worker, Next.js standalone for web, non-root `node` user) + `.dockerignore`.
- `apps/web/next.config.ts`: `output: "standalone"` with the monorepo as tracing root.
- `infra/` Bicep: `main.bicep` (resource group, two phases: `deployApps=false` foundation, then
  `true` for apps + migration job), modules `foundation` (Log Analytics with 0.2 GB/day cap,
  user-assigned managed identity, Key Vault RBAC + purge protection, Secrets User / Officer roles),
  `environment` (Container Apps, Consumption profile), `container-app` (Key Vault secret
  references, liveness / readiness probes, scale), `migrate-job` (manual `prisma migrate deploy`),
  optional `postgres` (B1ms, off by default); `budget.bicep` (subscription scope, actual 50/80/100 %
  + forecast 100 %); `beta.example.bicepparam` (identifiers only). Filled-in `infra/*.bicepparam`
  files are git-ignored.
- Scale: API 0-1 (in-memory rate limits), web 0-2, worker 1 always (0.25 vCPU / 0.5 GiB).
  Images from ghcr.io (no Container Registry), no PostgreSQL by default (bring a TLS connection
  string), no Dedicated profile / Front Door / VNet / Redis.
- Runbook: prerequisites, build + push to GHCR, two-phase deploy, Key Vault secret names and
  commands, migration job, seeding, Entra redirect + Stripe webhook wiring, checks, releases,
  database options (free-account B1MS / external / paid B1ms) + future migration to Azure
  PostgreSQL, cost drivers (free grant, always-on worker, log cap - no invented prices), Cost
  Management budget (portal + Bicep) and what to switch off when it fires, teardown, and the
  Static Web Apps vs Container Apps evaluation.
- Fix found by the container smoke test: `apps/api` imported `@rein-drop/marketplace-core` without
  declaring it (worked only through the workspace layout) - added to its dependencies.

**What works (verified)**

- `az bicep build` of `main.bicep` and `budget.bicep`, `az bicep lint` of every module, and
  `az bicep build-params` of the example: no errors, no warnings.
- `docker build` of all four targets (api 834 MB, worker 815 MB, web 313 MB, migrate 3.5 GB).
- Containers run locally in production mode (ports 4100 / 3100, not yours): API `/health` ok,
  `/ready` database up, `/me` and `/dev/diagnostics/ingestion` 401, JSON logs; worker starts its
  pipeline with production config and masks the database password (pointed at a non-existent
  database so it couldn't touch your Hunts); web serves `/sign-in`, redirects protected pages to
  sign-in, sends the security headers; the migrate image applied all 22 migrations to a throwaway
  database (`reindrop_migrate_check`, dropped afterwards).
- `pnpm turbo run build typecheck lint test --force`: 54/54 (incl. the standalone web build).

**Not done / TODO**

- Not deployed: the first real deployment, Entra / Stripe wiring and an acceptance run on Azure
  are for you to run with the runbook. Budget amount is your decision.
- CI/CD pipeline, slimmer migrate image, worker as a scheduled job, custom domains, private
  networking, move to Azure PostgreSQL (OUTSTANDING).

### Step 44 - Local MVP acceptance sequence + one-command demo reset (Build Prompt 41)

**What was added**

- [`docs/LOCAL_MVP_ACCEPTANCE.md`](LOCAL_MVP_ACCEPTANCE.md): an exact manual sequence with the
  expected result of every step - reset, start the stack, sign in, Seller Snapshot, create a Hunt
  (Nintendo Switch OLED, Cape Town, max R 4 000, eBay + Facebook), plan gate (Free), activate,
  worker searches both marketplaces (dev or real, as configured), match / analyse / alert
  (inbox + notification simulator), open the deal, Bought, Sold, realized P/L + Analytics,
  pause / resume, source degradation (`FACEBOOK_DEV_SCENARIO=unavailable`) and recovery; a
  configuration table for real providers, troubleshooting and a sign-off sheet.
- `pnpm db:reset-demo` (packages/db/prisma/reset-demo.ts): `prisma migrate reset --force` +
  `prisma db seed` in one command; refuses `NODE_ENV=production` and non-local databases unless
  `--allow-remote`; runs the Prisma CLI without a shell. README links the guide.

**What works (verified)**

- `pnpm db:reset-demo` run (with your consent) against a throwaway database `reindrop_reset_check`
  in the local Docker Postgres: 22 migrations applied, 2 marketplaces, 3 plans, the development
  user with an empty profile, no Hunts; the throwaway database was dropped afterwards and the real
  development database was untouched (row counts before / after). Refusals checked for a remote
  host and NODE_ENV=production. The shell-free Prisma launch checked with `migrate status`.
- Every label, route, log line and expected banner in the guide was checked against the code
  (create-Hunt fields, plan gate, deal actions, Mark sold, source banner copy, scheduler log).
- **Not done here:** the full manual sequence itself (it would add data to your development
  database) - run it with the guide and fill in the sign-off sheet.

**Not done / TODO**

- Run the sequence on a real phone and with the real providers.

### Step 43 - Hardening pass (Build Prompt 40)

Scoped review of validation, authorization, rate limiting, secrets, CORS, error leakage, webhook
verification, idempotency, DB indexes / slow queries, retention, backups, dependencies, accessible
UI states and structured logging. Report: [security/hardening-2026-10.md](security/hardening-2026-10.md);
retention + backups: [operations/data-lifecycle.md](operations/data-lifecycle.md). No new architecture.

**What changed**

- API: per-user rate limiting (`@nestjs/throttler`, `RateLimitGuard` after the AuthGuard;
  `RATE_LIMIT_PER_MINUTE`, 20/min on billing writes, webhook exempt, `TRUST_PROXY_HOPS`);
  security headers middleware; explicit 100 kB body limits; no `X-Powered-By`; CORS off (by
  design, tested); JSON logs (`LOG_FORMAT`) with structured request lines; inventory cursor
  ownership check; hunt history capped at 500 events.
- Contracts: `moneyInputSchema` (0..2,147,483,647) on every request amount.
- Env: secret-named values never echoed in config errors.
- DB migration `..._hardening_indexes`: 8 indexes (alerts, matches, saved deals, inventory, sales).
- Worker: `LOG_FORMAT` JSON logs.
- Web: security headers + baseline CSP, no `X-Powered-By`; accessible loading buttons, password
  toggle names, plan-gate focus and live region, described disabled buttons.
- Mobile: iOS announcements for errors / successes and "Hunt is live", busy loading state,
  error + hint in field hints.
- Dependencies: `mysql2` override (patched); remaining advisories are build tooling (documented).

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (contracts money bounds; config incl. rate
  limit / logging; production web build with the new headers).
- New `security.e2e-spec.ts` (6): route inventory - only 3 reviewed public routes, every other
  route 401 without credentials; security headers, no framework banner, no CORS (incl. preflight);
  413 oversized body, 400 out-of-range money; no internal details on failure; per-user rate limit
  (429 RATE_LIMITED + Retry-After, other users unaffected); webhook never throttled.
- API int 62/62 (incl. foreign inventory cursor -> 400), e2e 58/58, worker int 40/40.
- `pnpm audit`: 5 advisories, none in API / worker runtime.

**Not done / TODO**

- Retention jobs and backup drills (D38); shared rate-limit store for several instances; strict
  nonce CSP; worker N+1 batching when measured (all in OUTSTANDING).

### Step 42 - Web billing with Stripe (Build Prompt 39)

The owner approved Stripe for web billing (D2, web). Decision
[0014](decisions/0014-stripe-web-billing.md). Free behaviour unchanged; native store billing not built.

**What was added**

- DB (migration `..._web_billing`): `BillingCustomer`, `BillingEvent` (idempotency, unique per
  provider event), `Subscription.cancelAtPeriodEnd` / `providerPriceId`, statuses `INCOMPLETE`, `PAUSED`.
- API billing module: `BillingProvider` + `StripeBillingProvider` (`stripe` 23, API 2026-09-30);
  `GET /billing`, `POST /billing/checkout`, `POST /billing/portal` (manage / change plan / cancel),
  `POST /billing/free`, `POST /billing/webhooks/stripe` (public, raw-body signature, idempotent,
  re-reads the subscription from Stripe, 500 -> Stripe retries; foreign customers ignored); the
  development fake kept. Config `BILLING_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_IDS` (plan -> price; prices never in code), `WEB_APP_URL`; production requires Stripe.
  `main.ts` keeps raw bodies.
- Entitlements: entitled = ACTIVE / TRIALING / PAST_DUE (grace, D36); summary adds
  `cancelAtPeriodEnd`, `currentPeriodEnd`. Plans show Stripe prices (`pricing.status: priced`).
- Hunts: `HuntPlanLimits` subscribes to plan changes and pauses LIVE hunts above the new limit
  (newest first, system HuntEvent `reason: plan_limit`).
- Env: values of SECRET / TOKEN / PASSWORD / *_KEY variables are never echoed in config errors.
- Web: plan gate - Free (no card), Stripe Checkout redirect, "confirming your payment" wait on
  return, cancelled notice, change plan via the portal; Settings plan card (renewal / cancelled /
  past due, Manage billing); `/settings/cancel` cancels in the portal (copy matches what happens).
- Mobile: Free via `/billing/free`; paid plans "bought on the web" (no in-app purchase); plan card
  renewal info; cancel screen points to the web.
- client-core: `priceLabel` ("R 199,00 / month"), `available` on plan options; cancellation model
  with online / elsewhere states.
- `.env.example`, README env table + "Billing locally with Stripe test mode" (Stripe CLI).

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (Stripe provider against a fake Stripe API the
  real SDK talks to: checkout / portal parameters, idempotent customer, item-level periods, prices,
  signature checks incl. forged / tampered / replayed; config + secret masking; price labels;
  cancellation copy).
- API int 62/62 incl. new `billing.int-spec.ts` (checkpoint: subscribe / change / cancel events ->
  correct Subscription + entitlements; nothing granted before the webhook; duplicates; late older
  event; past due + scheduled cancellation keep access; forged / unsigned refused; failed event
  retried; foreign customer ignored; downgrade pauses hunts above the Free limit; Free choice);
  e2e 52/52; worker int 40/40.
- Running local stack (development billing): `/billing` = development, `/plans` unchanged, webhook
  route 404, `/settings` and `/settings/cancel` 200.
- **Not run against Stripe itself** (no keys here): follow the README test-mode steps.

**Not done / TODO**

- Stripe account set-up (prices, portal, webhook), a test-mode run, tax.
- D36 past-due grace, D37 card before Free; native store billing (D2 mobile).
- Downgrade: marketplace / priority enforcement and a "choose which stay live" screen.

### Step 41 - Managed auth: Microsoft Entra External ID (Build Prompt 38)

Evaluated the options and chose **Microsoft Entra External ID** (Azure-aligned; Azure AD B2C closed
to new customers on 1 May 2025; first 50,000 monthly active users free; email + password with
verification and reset built in) - decision [0013](decisions/0013-entra-external-id-auth.md),
resolving D1. Implemented behind the existing auth boundaries on API, web and mobile.

**What was added**

- Contracts: `AUTH_PROVIDER_IDS = dev | entra`; `entraDiscoveryUrl`, `entraApiScope`.
- API: `EntraAuthProvider` (`jose`): bearer access token -> signature against the tenant's keys
  (discovered, cached, rollover-safe), exact issuer, audience = API client ID, exp / nbf, tenant,
  `access_as_user` scope. `oid` -> `User.authSubject` (authProvider `entra`); first sign-in creates
  the user from `email` / `name`; an email belonging to another user is refused (no linking by
  email); 503 when keys / database are unreachable. Config `ENTRA_AUTHORITY`, `ENTRA_TENANT_ID`,
  `ENTRA_API_CLIENT_ID`, `ENTRA_REQUIRED_SCOPE`.
- Web: `/auth/sign-in` (PKCE + state + nonce in an encrypted 10-minute cookie) -> Entra hosted
  page (email + password, sign-up) -> `/auth/callback` (state / PKCE / ID-token checks via
  `openid-client`) -> encrypted httpOnly session cookies (JWE; access token + absolute expiry;
  refresh token in a second cookie). The Proxy refreshes access tokens near expiry and ends
  sessions at `AUTH_SESSION_MAX_AGE_HOURS` (default 7 days) or when refresh is refused. Sign out
  (POST `/auth/sign-out`) clears cookies and ends the Entra session. Real `/sign-in` page
  (signed-out / expired / cancelled / failed notices); Settings -> Sign out. Proxy matcher now
  includes `/inventory` (was missing since step 32).
- Mobile: Entra provider (`expo-auth-session` PKCE in the system browser, `expo-secure-store`
  for tokens, single-flight refresh, absolute expiry), sign-in screen in the session gate,
  Settings -> Sign out. New dependencies: expo-auth-session, expo-secure-store, expo-web-browser,
  expo-crypto (config plugins added to app.json).
- client-core `token-session`: shared refresh / absolute-expiry rules (web + mobile).
- **Dev auth can't be enabled in production**: API config + auth module + DevAuthProvider refuse
  it; web and mobile production builds don't contain the dev provider.
- `.env.example` (api, web, mobile), README auth section + env table.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54.
- API unit: 13 Entra provider tests (real RS256 tokens from a test key: valid / expired / other
  key / issuer / audience / tenant / no oid / alg none / tampered / missing scope; user creation,
  missing email claim, email collision, parallel first sign-in, DB down -> 503, discovery failure
  and wrong-tenant issuer -> 503), config tests; live tenant check skipped (no tenant).
- API int 53/53 incl. new `entra-auth.int-spec.ts` (real API + PostgreSQL: first sign-in creates
  the user, later requests map to it; missing / expired / foreign-tenant / under-scoped tokens and
  the development header are refused; no account takeover by email; /health stays public);
  e2e 52/52; worker int 40/40.
- Web: 15 auth tests against a fake Entra tenant (PKCE S256 / state / nonce / scopes in the
  authorize URL, code redemption, forged state / wrong verifier / replayed nonce refused, refresh
  keeps the absolute expiry, end-session URL, wrong-tenant discovery refused; cookie encryption,
  tampering / other secret / other purpose / expiry; open-redirect guard; Proxy: valid session
  passes, no session -> sign-in with return path, expired -> cookies cleared, refresh updates the
  request and sets httpOnly SameSite=Lax cookies, refused refresh ends the session).
- Production web build: no development-auth identifiers in `.next/server` or `.next/static`;
  session code server-only. Development mode unchanged (running dev server: /home, /sign-in,
  /settings 200 with dev auth).
- **Not run against a real tenant** (none exists yet) and mobile sign-in not tried on a device.

**Not done / TODO**

- Create the tenant + app registrations (checklist in decision 0013); brand the hosted pages.
- D34 session length; D35 hosted page vs in-app forms (native auth).
- Account deletion / Entra-side email changes not synced; secrets via Key Vault / managed identity
  when deploying to Azure.

### Step 40 - Microsoft Foundry AIProvider (Build Prompt 37)

Production-capable `AIProvider` for Microsoft Foundry, configured by environment; the mock stays
the default offline provider (decision [0012](decisions/0012-foundry-ai-provider.md)).

**What was added**

- ai-core `foundry/`:
  - `FoundryAIProvider`: Azure OpenAI in Foundry Models **v1** API
    (`POST {endpoint}/openai/v1/chat/completions`, no api-version), `api-key` header (bearer-token
    function supported for Entra ID), one deployment per task from config, structured outputs
    (`json_schema`, `strict: true`), `max_completion_tokens`, no temperature.
  - `toStrictJsonSchema`: the task zod schemas converted to Azure's strict JSON Schema subset.
  - Versioned prompts (`foundry-*@1`) with the canonical fact values evidence must match; listing
    text declared untrusted.
  - Timeouts (25 s per request), in-process retries (1, exponential backoff + jitter, honouring
    `retry-after-ms` / `retry-after` up to 5 s), longer waits handed to the job queue with the
    service's retry time; `foundryWorstCaseMs` for the lease check.
  - Error mapping: NOT_CONFIGURED (401/403/404), RATE_LIMITED (429), UNAVAILABLE (408/5xx/network/
    timeout), new CONTENT_FILTERED (400 content_filter / finish_reason content_filter), new
    REQUEST_REJECTED (other 400), INVALID_OUTPUT (length, refusal, non-JSON); the key never appears.
  - Usage metadata per task: deployment, reported model version, prompt version, latency, tokens,
    request id, attempts, `costUsd` only with configured pricing.
  - `resolveFoundryConfig` / `foundryEnvShape`; `createAIProvider('foundry', config)`.
- `AIProviderError.retryAfter`; failed analysis records carry it; the worker's analysis handler
  retries at that time.
- Worker config: `FOUNDRY_ENDPOINT`, `FOUNDRY_API_KEY`, `FOUNDRY_DEPLOYMENT` (+ per-task),
  `FOUNDRY_TIMEOUT_MS`, `FOUNDRY_MAX_RETRIES`, `FOUNDRY_MAX_OUTPUT_TOKENS`,
  `FOUNDRY_PRICE_INPUT_PER_1M_USD` / `_OUTPUT_`; refuses missing values, http endpoints, half
  pricing and a job lease shorter than the worst case. `.env.example` + README.
- Diagnostics: AI cost = the tasks' reported `costUsd` (unknown when not reported).

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54. ai-core 42 (+1 live skipped): strict schema
  rules for all three tasks (closed objects, all required, no unsupported keywords, depth <= 5,
  <= 100 properties), request shape (URL forms, deployment per task, key only in the header,
  bearer auth), full candidate analysis through a fake Foundry with usage / cost, schema / JSON /
  truncation / refusal / content-filter rejections, ungrounded output rejected, every HTTP error
  class without retries or key leaks, 429 retried after `retry-after-ms`, long waits handed to the
  queue, 5xx / network backoff, request timeout abort, config resolution. Worker config tests
  (Foundry env, https, lease check, no key in errors).
- Worker int 40/40 (rate-limit retry time reaches the job queue), API int 49/49, e2e 52/52.
- **Not run against a real Foundry deployment** - no credentials on this machine; the live test
  (`foundry-ai-provider.live.spec.ts`) is skipped.

**Not done / TODO**

- Live run with your deployment (prompt quality and validation-failure rate unproven).
- Managed identity (keyless) auth wiring; model / deployment / region choice (D33).
- No repair attempt when a model's output fails validation.

### Step 39 - Internal ingestion diagnostics: economics and freshness (Build Prompt 36)

Internal, development-only report per marketplace / provider (decision
[0011](decisions/0011-ingestion-diagnostics.md)). Not customer analytics: system-wide, 404 in
production, linked only from `/dev`.

**What was added**

- DB: `SearchRun.requestLatencyMs` (migration `..._search_run_request_latency`) - the slowest
  source request per run, measured by the worker (failed runs too).
- Contracts `diagnostics.ts`: query (`?hours=` 1-2160, default 24, or `?since=&until=`) and the
  `IngestionDiagnostics` response (sources, totals, per-Hunt cost).
- API `modules/diagnostics`: `GET /dev/diagnostics/ingestion` - PostgreSQL aggregates with
  `GROUPING SETS` (per source + total): runs, requests, Hunts served; listings returned / new /
  updated / duplicates / unreadable; candidate checks, matches, new matches, rejections + reasons;
  AI analyses (completed / failed / alert-eligible / providers / tokens / duration); alerts;
  request + run latency p50 / p95 / max; listing age at discovery; source cost (known, estimate
  flag, unknown runs), cost per run / new match / alert / Hunt-day; AI cost = unknown (not reported).
- API client `getIngestionDiagnostics`.
- Web `/dev/diagnostics`: window picker (1 h / 24 h / 7 d / 30 d or since/until), the three
  checkpoint answers (cost per Hunt per day, median listing age, returned -> alerted with filter
  rates), a metric x source table, cost per Hunt, and how each number is counted.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (API mapper / window / production-404 unit
  tests; web formatting tests).
- API int 49/49 (new `diagnostics.int-spec.ts`: throwaway marketplace in a fixed 2021 window -
  exact per-source and total numbers, percentiles, listing age, cost split between grouped Hunts,
  window validation, 401), e2e 52/52, worker int 40/40 (runs store request latency).
- Against the running local stack: the endpoint and page work; last 30 days = 118 development
  runs for one LIVE Hunt ("ps4"), all returning 0 listings (the development catalogue has no match).
  Page checked at 1280 px and 390 px (no horizontal page scroll).

**Not done / TODO**

- AI cost stays unknown until an AI provider reports usage / pricing is configured (prompt 37).
- No admin role: before running anywhere shared, gate it to staff, not just "signed in".
- Runs from before step 38 / 39 have no usage / latency (shown as unknown / no samples).
- Mobile has no diagnostics view (web only, by design for an internal tool).

### Step 38 - Facebook development data provider: Apify Marketplace scraper (Build Prompt 35)

Provider chosen for development on the owner's instruction ("use any for now"); documented first
in [`docs/providers/facebook-apify.md`](providers/facebook-apify.md) (authentication, query
capabilities, freshness, pagination, rate / cost behaviour, limitations, terms risk).

**What was added**

- marketplace-core:
  - `ApifyMarketplaceProvider` (provider id `apify-marketplace`) behind the existing
    `FacebookDataProvider` / `FacebookAdapter`: Apify API v2 `run-sync-get-dataset-items` for
    the published actor `apify/facebook-marketplace-scraper`; bearer-token auth (never in URLs);
    documented `/marketplace/<city>/search/?query=` start URL; per-run caps (`maxItems`,
    `maxTotalChargeUsd`, `timeout`); error mapping (401/403/404 not configured, 402 out of credit,
    429 rate limited, 408 / 5xx / network retryable, 400 not retryable, unreadable invalid);
    health checks the token + actor without running it.
  - Normalization keeps provider fields inside the provider: marketplace-level Listing only
    (price in the configured region currency, city / state, cover photo when present, SOLD /
    REMOVED / ACTIVE, metadata `displayedPrice`, `salePending`, `deliveryTypes`); seller names
    are not stored.
  - Generic `SourceUsage` on search results (requests, results, duration, USD cost and whether
    it's an estimate, provider details) - reported by Apify (estimated from the public price),
    eBay (quota, no cost) and the development sources (free).
  - Optional capability `expectedLatencyMs` for sources that are slow by nature.
  - `resolveFacebookSource` env helper; shared `adapters/http.ts`.
- `DevFacebookDataProvider` unchanged and still the default (`FACEBOOK_SOURCE=dev`).
- Worker: search runs store `sourceUsage` (migration `..._search_run_source_usage`, summed over
  pages, kept on failures); request timeout and the "slow" threshold respect a source's declared
  latency (Apify runs take tens of seconds).
- Config (API + worker): `FACEBOOK_SOURCE`, `APIFY_TOKEN`, `FACEBOOK_APIFY_CURRENCY`,
  `FACEBOOK_APIFY_ACTOR`, `FACEBOOK_APIFY_RESULTS_LIMIT`, `FACEBOOK_APIFY_PRICE_PER_1000_USD`,
  `FACEBOOK_APIFY_TIMEOUT_SECONDS`; `apify` is refused in production (terms - D12).
  `.env.example` placeholders; README table.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54. marketplace-core 202 (+5 skipped live):
  the shared adapter contract suite through FacebookAdapter against a fake Apify API, 13 provider
  tests (request shape and caps, bearer token, slug, usage / cost, normalization, no seller name,
  statuses / photos / currency, every error class, health without cost) and config tests. Worker
  45 (usage sums, slow-by-nature threshold).
- Worker int 40/40 (search runs record usage), API int 46/46, e2e 52/52.
- No provider field names in apps, contracts, client-core or the database schema.
- Live Apify tests (`apify-marketplace-provider.live.spec.ts`) **skipped** - no `APIFY_TOKEN` on
  this machine.

**Not done / TODO**

- D12 terms / legal for any production Facebook source; cost model and polling cadence (D7,
  prompt 36): about USD 5 a day per Hunt at 20 results every 15 minutes.
- City slugs guessed from free text (geocoding, decision 0001); no radius / price / condition
  push-down; no posting time (freshness = first seen); no single-listing refresh.
- Apify runs can outlast the default job lease (120 s): raise `WORKER_JOB_LEASE_MS` when using it.

### Step 37 - Real eBay source: Browse API adapter (Build Prompt 34)

Details in [decision 0010](decisions/0010-ebay-browse-api.md). Mock mode (the development eBay
source) is unchanged and remains the default outside production.

**What was added**

- marketplace-core `adapters/ebay/`:
  - `EbayAdapter` (provider `ebay-browse`) on eBay's official Buy > Browse API v1 (endpoints,
    fields and limits taken from eBay's published OpenAPI spec): search sorted `newlyListed`
    with offset pagination (opaque cursor, <= 200 per page, never past the 10,000 window),
    `conditionIds` and site-currency price filters, `fetchListing` (404 = gone);
  - normalization: `itemId` source id (+ `legacyItemId`), `itemWebUrl`, price / current bid,
    `itemCreationDate` freshness, SOLD / ENDED / ACTIVE, shipping as the buyer's cost, location,
    images, seller feedback metadata;
  - `EbayClient`: OAuth application token (client credentials), cached and refreshed once on
    401; 429 -> RATE_LIMITED (Retry-After), 5xx / network -> UNAVAILABLE, bad credentials ->
    NOT_CONFIGURED, 4xx -> UNSUPPORTED_CRITERIA, unreadable -> INVALID_RESPONSE; secrets never in
    errors. `fetch` is injected (testable; no DOM / Node typings in the package);
  - `resolveEbaySource` env helper shared by API and worker; shared `adapters/money.ts`.
- Registry: the real adapter when credentials are configured, else the development source
  (outside production).
- Config (API + worker): `EBAY_SOURCE`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`,
  `EBAY_ENVIRONMENT`, `EBAY_MARKETPLACE_ID`; production requires the real source. `.env.example`
  placeholders only; README table updated.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54. marketplace-core 176 (+3 skipped): the shared
  adapter contract suite and 19 eBay tests against a fake eBay server shaped like the spec
  (token flow and reuse, sandbox host, query / filters, currency gating, pagination + 10,000 cap,
  full normalization, auctions / free shipping / sold / ended, FAILED / SKIPPED, fetchListing,
  429 / 5xx / network / 400 / 401 refresh / bad credentials without leaking the secret /
  non-JSON, health without spending search quota) and 3 config tests.
- Live tests (`ebay-adapter.live.spec.ts`: health, search + normalize + paging, re-read) are
  **skipped** - no eBay credentials are configured on this machine.
- API int 46/46, e2e 52/52, worker int 40/40; API / worker config tests updated. The running
  app is unaffected (dev mode).

**Not done / TODO**

- D12: eBay licence / Buy API terms, production keyset, quota - the owner's call. To run the live
  tests: set `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` (and `EBAY_ENVIRONMENT=sandbox` for a sandbox
  keyset) in the shell or an untracked `.env`, then `pnpm --filter @rein-drop/marketplace-core test`.
- The worker searches one page of up to 200 eBay results per Hunt check; watch the daily quota
  (prompt 36, ingestion economics).

### Step 36 - Polished product states with semantic mascot tokens (Build Prompt 33)

**What was added**

- design-tokens `PRODUCT_STATE_MASCOTS`: product state -> semantic mascot token (firstScan ->
  working, noDealsYet -> waiting, reducedMonitoring -> afterHours, suggestion -> suggestion,
  cancellation -> cancellation, plus welcome / confirmed / emptyInventory).
- `MascotSlot` (web + mobile): approved art for a token, otherwise a NEUTRAL placeholder (dashed
  soft circle + plain system icon, marked `data-asset-todo` / `testID asset-todo-*`). No art is
  generated or invented. [`docs/ASSET_TODO.md`](ASSET_TODO.md) lists every missing pose with its
  guide description, where it shows and its placeholder.
- client-core `product-states.ts` + shared `ProductState` cards:
  - initial Hunt working (first scan; per-marketplace progress; polite live region),
  - no deals yet while healthy (never while a source is degraded; "Tune criteria", or "Broaden
    criteria" after 24 h),
  - Deals before the first deal (first scan / quiet-but-healthy instead of "nothing here"),
  - reduced monitoring placeholder (Home `monitoring` field - always "normal" until quiet hours /
    plan cadence are decided, D22 / D7),
  - actionable plan suggestion (at the live-Hunt limit with drafts: pause or upgrade, nothing
    lost) on the Hunts list and as Home's new `plan_limit` recommendation,
  - cancellation flow placeholder (Settings > Plan & billing > Cancel plan: what would happen,
    keep my plan, "not available yet - billing" (D2)).
- Settings shows the real plan and live-Hunt use. Dev galleries (web `/dev/ui`, mobile Developer)
  show every token and every state, including ones the API can't produce yet.
- "Next check in ..." reads in days beyond 48 h.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (client-core 103 incl. 13 product-state
  tests; api incl. the plan_limit rule).
- `pnpm --filter api test:int` 46/46 (Deals test hunts now never polled by a running worker),
  `test:e2e` 52/52, worker int 40/40.
- Browser e2e (Edge 390x844, temporary data, restored): 20/20 product states (first scan +
  working placeholder, no-deals-yet + waiting placeholder, Deals before first deal, plan
  suggestion on Hunts and Home, Settings plan card, cancellation placeholder, galleries), and the
  step 35 banners: 7/7 Facebook slow (calm info on Home / Hunts / Deals, Hunt not "healthy",
  "Slow right now" row) and 2/2 eBay down (warning, never error). No console errors.
- Fixed during testing: the web build failed on a per-request time in the prerendered gallery;
  far-future waits read in days.

**Not done / TODO**

- Mascot art for working / waiting / afterHours / suggestion / cancellation / profit / success /
  exceptionalDeal / analysis (ASSET_TODO.md). Sale Result and exceptional-deal banner still show
  nothing (not yet switched to MascotSlot).
- Reduced monitoring needs quiet hours / plan cadence (D22, D7); cancellation needs billing (D2).
- Mobile not run on a device.

### Step 35 - Marketplace source health, degradation and per-source backoff (Build Prompt 32)

Rules in [decision 0009](decisions/0009-source-health.md).

**What was added**

- Migration `..._marketplace_health`: `MarketplaceHealth` (status, reason, failures, latency, last
  success / failure, status since, `retryAfter` cool-down) and `PollStatus.DEGRADED`.
- marketplace-core: search results can be `partial`; development sources simulate latency
  (`*_DEV_LATENCY_MS`) and two new scenarios, `slow` and `flaky`; latency honours cancellation.
- Worker:
  - `health/source-health.ts`: pure state machine + per-source backoff policy (unit-tested).
  - `SourceHealthStore` (locked read-modify-write) behind a `SourceHealthPort`; in-memory variant
    for tests.
  - Search handler: skips a cooling source (DeferJobError: no attempt used), times out slow
    requests, records latency and outcomes, marks partial / slow polls DEGRADED; retries wait
    for the source's cool-down.
  - Scheduler: moves Hunts due on a cooling source to its retry time instead of queueing.
  - Queue `defer()`; runner outcome `deferred`; periodic health probe loop.
  - Config: `WORKER_SEARCH_TIMEOUT_MS`, `WORKER_SOURCE_SLOW_MS`, `WORKER_SOURCE_DOWN_AFTER`,
    `WORKER_SOURCE_BACKOFF_BASE_MS` / `_MAX_MS`, `WORKER_HEALTH_PROBE_MS`, `*_DEV_LATENCY_MS`
    (development only).
- Contracts `marketplace-health.ts`; hunt activity marketplaces and deal sources carry the
  source's state and a `degraded` last check; Home carries `sources`.
- API: `GET /marketplaces/health`; source state in hunt activity, Deals and Home ("unknown" when
  there's no report for an hour); Home's "checks are failing" recommendation only for Hunt-
  specific failures (a source-wide problem is the banner's job).
- client-core `source-view.ts`: calm banner copy, labels, `huntMonitoringHealth`; monitoring
  lines and marketplace rows never say "OK" while a source is degraded; deals say updates may be
  late.
- Web + mobile: the source banner on Home, Hunts and Deals; Hunt detail rows show "Slow right
  now" / "Not responding · tries again in 4 min".

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (marketplace-core 143 incl. slow / flaky /
  partial / abort; worker 42 incl. 8 state-machine and deferral tests; api 119; client-core 92
  incl. 10 source-view tests).
- `pnpm --filter worker test:int` 40/40 incl. 8 new on real Postgres: one source failing while the
  other is partial (neither "healthy"), cool-down + Hunts waiting instead of queueing, down after
  3 with doubling cool-down, deferral without using an attempt, recovery, slow = degraded, timeout
  = retryable failure, store persistence, concurrent outcomes under the row lock. The shared
  health rows are never touched by tests (in-memory health + a throwaway marketplace row).
- `pnpm --filter api test:int` 46/46 (incl. `/marketplaces/health` vs the database rows);
  `test:e2e` 52/52.
- Browser check of the banners: done in step 36 (9/9) after the user restarted the API.

**Not done / TODO**

- D31: thresholds. No jitter in the backoff (single local worker).
- Real providers' quotas / health endpoints - prompts 34-35.
- Mobile not run on a device.

### Step 34 - Analytics screens: overview, Hunts, Products, Missed potential (Build Prompt 31)

**What was added**

- client-core `analytics-view.ts`: period labels; overview cards that always say their basis
  (Realized / Activity / Now; Estimated where it applies); bar data for charts; Hunt funnel,
  product rows + loss review, marketplace rows, missed-potential view (estimate labelled, "not a
  loss", neutral colour); one data-grounded recommendation (first that applies: stale holding >= 30
  days -> a product with a realized loss -> a Hunt whose viewed deals are >= 60% ignored (5+ viewed)
  -> 3+ strong deals missed -> best product -> deals waiting with nothing bought -> log sales),
  always quoting the numbers. Thresholds in `ANALYTICS_RECOMMENDATION_RULES` (D30).
- Web: `/analytics` (period tabs 7 days ... All time; six cards; money in vs realized profit chart;
  the recommendation; top Hunt funnels; product profit chart; marketplaces; missed summary) and
  `/analytics/hunts`, `/analytics/products` (all products + loss review), `/analytics/missed`.
  Charts are CSS bars (no chart library): text carries the values, bars are decoration.
- Mobile: the Analytics tab with the same overview, and stack screens `analytics/hunts`,
  `analytics/products`, `analytics/missed` (period carried in the route).
- Mascot: none in the dense analytics. The thinking / idea (`suggestion`) token is wired only in
  the recommendation box; no approved art exists, so nothing renders there yet.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (client-core 82 incl. 11 analytics view tests).
- Browser e2e (Edge 390x844): 8/8 on the user's real account (empty state instead of zeros, no
  recommendation without data) and 25/25 with temporary data (labelled cards, realized profit 800 =
  1 400 profit - 600 loss in green, capital deployed, held "not a loss", money chart, the loss-
  product recommendation with its numbers, funnel bars, period switch, Hunts / Products (loss
  review) / Missed (estimate labelled, neutral, links to deals), no mascot, no horizontal scroll,
  no console errors). Temporary data removed; the user's account unchanged.
- Fixed during testing: amounts wrapping mid-number on phones; an "alerts bought" rate over 100%
  (activity counts) is no longer shown.
- Mobile: typecheck, lint, Expo export - not run on a device.

**Not done / TODO**

- No time-series chart (profit over time) - the API has no buckets yet.
- D30 recommendation thresholds; D29 (cohort funnel would make alert-to-buy exact).
- No approved thinking / idea mascot art.

### Step 33 - Period analytics backend (Build Prompt 30)

Backend only; the analytics screens are Build Prompt 31. Definitions in
[decision 0008](decisions/0008-period-analytics.md).

**What was added**

- Contracts `analytics.ts`: periods (7d / 30d default / 90d / 365d / all, rolling), per-currency
  realized results (revenue, comparable / excluded sales, realized profit, margin), overview,
  Hunt funnel, product performance, marketplace contribution, missed potential.
- API `AnalyticsModule` (was a scaffold): `GET /analytics/{overview,hunts,products,marketplaces,missed}?period=`.
  All aggregation in PostgreSQL (`analytics.sql.ts`: shared ledger CTEs + one query per view);
  `analytics.mapper.ts` only shapes rows. No warehouse.
- Migration `..._analytics_indexes`: `InventoryItem(userId, purchasedAt)`, `HuntMatch(huntId, matchedAt)`.
- api-client: `getAnalyticsOverview`, `getHuntAnalytics`, `getProductAnalytics`,
  `getMarketplaceAnalytics`, `getMissedPotential`.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (contracts, api mapper unit tests, api-client).
- `pnpm --filter api test:int` 45/45 incl. 7 new analytics tests on real Postgres: overview
  (spend incl. purchase costs, revenue, realized profit 115 000 = the TypeScript formula, margin
  17%, a USD-bought / ZAR-sold item counted but excluded from profit, holding snapshot), period
  windows (7d / 90d incl. an earlier loss / all / invalid = 400), Hunt funnel with rates, products
  (AI name, else title; losses last), marketplaces (sourced vs sold here, "other"), missed
  potential (ignored + gone, estimate summed, weak / open / bought excluded, profit unchanged),
  user isolation.
- `pnpm --filter api test:e2e` 52/52; `pnpm --filter worker test:int` 32/32. No test data left.
- The running API serves the endpoints; the user's account returns honest zeros (no matches yet).

**Not done / TODO**

- Analytics screens - Build Prompt 31 (the Analytics tab still shows the Inventory link).
- D28 missed definition, D29 funnel by activity vs cohort, D24 period / time zone.
- Home "spent" excludes purchase costs; Analytics includes them.
- No caching: every request aggregates live (fine at MVP scale; revisit with real volumes).

### Step 32 - Inventory, Mark Sold and Sale Result screens (Build Prompt 29)

**What was added**

- client-core `inventory-view.ts` (shared by web and mobile): list rows (cost, held N days,
  realized result only once sold, estimates labelled), detail (purchase lines, what was expected
  at Bought), purchase editor (sends only what changed), cost-row editor, Mark Sold defaults
  (today, the source marketplace, the usual fee rows; correcting a sale starts from it; the price
  is never pre-filled from an estimate - the estimate is a hint), validation (date not before the
  purchase / not in the future), a live preview using the shared `realizedResult`, and the Sale
  Result view (realized P/L first, margin / return / days, breakdown, expected-vs-actual rows,
  one deterministic insight). `celebrate` is true only for a realized profit > 0.
- Bought form (web + mobile) gains "Shipping to you", defaulted from the listing and editable; it
  becomes a purchase cost. A bought deal links to its Inventory item.
- Web: `/inventory` (Holding / Sold / All, Show more), `/inventory/[id]` (edit purchase + costs,
  In stock <-> Listed, sale summary, correct / undo sale with confirmation, expected at Bought,
  links to the deal and the listing), `/inventory/[id]/sell`, `/inventory/[id]/result`.
  Inventory sits under Analytics (screen map 21-24), so the Analytics nav item is active there.
  Analytics and Home's profit section link to it.
- Mobile: the same four screens as stack routes, the same entry points. The text input gains a
  `date` kind (YYYY-MM-DD + Today / Yesterday shortcuts; web uses the native date picker).
- Mascots: the empty inventory state uses the approved holding-box art. The success / profit
  token is shown only when `celebrate` is true - no approved profit art exists, so a realized
  profit gets a green branded panel and no picture; losses and estimates never get either.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (client-core 71 incl. 18 inventory tests:
  celebrate only on realized profit, loss / break-even / other-currency never celebrated, fee and
  shortfall insights, date rules, deterministic form keys).
- Browser e2e (Edge 390x844) on the running web + API with temporary data: 39/39 - empty state,
  Bought with listing shipping, edit costs, list, Mark Sold validation and live preview, Sale
  Result (profit in green, success panel, no invented art, expected vs actual, insight), Done,
  undo sale, a realized loss (red, not celebrated, only the buy price compared), entry points, no
  horizontal scroll. No dev-overlay issues. Temporary data removed; the user's account unchanged.
- Fixed during testing: a hydration mismatch on Mark Sold (cost-row keys from a module counter),
  purchase shipping mislabelled "Shipping to buyer", a loss insight that ignored fees.
- Mobile: typecheck, lint, Expo export - not run on a device.

**Not done / TODO**

- The default sale / purchase day is computed where the page renders; the server and browser
  must share a time zone (true locally). TODO: the user's time zone (with D24).
- Mobile date entry is typed (YYYY-MM-DD) - a native date picker needs a new dependency.
- No approved profit / success mascot yet (Mascot Usage Guide asks for one) - the slot is wired.
- `favicon.ico` 404 on web (brand icon still pending).

### Step 31 - Bought -> Inventory -> Sold ledger, realized P/L (Build Prompt 28)

Backend only; the inventory and sale screens are Build Prompt 29. Rules in
[decision 0007](decisions/0007-outcomes-ledger.md).

**What was added**

- Migration `20261008125924_outcomes_ledger`: `CostCategory.TAX`; `InventoryItem.expected`
  (JSONB, the expected snapshot frozen at Bought). Purchase costs sit on the item, selling costs
  on the sale - never both.
- Contracts `outcomes.ts`: purchase cost categories (tax, shipping, repair, supplies, other) and
  selling cost categories (marketplace fee, payment fee, shipping, other); the one P/L formula
  `realizedResult` (cost basis, net proceeds, realized profit, margin %, return %; integer minor
  units; "unavailable" on mixed currencies, never converted); `ExpectedSnapshot`;
  `compareAmounts`; `InventoryItem` (holding flag, purchase + costs + total, sale + costs, result
  only once sold, days held, expected, expected-vs-actual comparison for purchase price, sale
  price and profit); request schemas. `POST /deals/:id/bought` accepts optional `costs`.
- API Outcomes endpoints: `GET /inventory?status=holding|sold|all` (cursor paged, newest purchase
  first), `GET /inventory/:id`, `PATCH /inventory/:id` (title, purchase price / date, notes,
  In stock <-> Listed), `PUT /inventory/:id/purchase-costs` (replace), `PUT /inventory/:id/sale`
  (Mark Sold or correct: price, date not before purchase / not in the future, marketplace,
  selling costs), `DELETE /inventory/:id/sale` (undo -> In stock). Another user's item is 404.
- Bought now stores purchase costs and the expected snapshot (asking price, listing-stated costs,
  ESTIMATED resale / upside only when comparable sales produced them, strength, confidence).
  Repeating Bought never changes the item; corrections go through `/inventory`.
- Home's realized profit uses the same `realizedResult` formula.
- api-client: `listInventory`, `getInventoryItem`, `updateInventoryItem`, `replacePurchaseCosts`,
  `recordSale`, `undoSale`; `realizedResult` and the cost category lists exported for the UI.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 - contracts 13 new P/L tests (no costs, fees +
  shipping + tax + repair, losses incl. a loss purely from fees, break-even, minor units,
  currency mismatch, missed potential not an input), api ledger mapper 5, enum mirrors for
  InventoryStatus / CostCategory, api-client inventory routes.
- `pnpm --filter api test:int` 38/38 incl. 8 new ledger tests on real Postgres: Bought -> item linked
  to its deal with costs and snapshot; no invented estimates; Mark Sold validation; realized
  profit 650 000 - 95 000 selling costs - 475 000 cost basis = 80 000 vs 185 000 estimated upside
  (a comparison, not a loss); a realized loss of -52 000; correcting and undoing a sale; purchase
  corrections keep the snapshot; an ignored deal never enters the ledger; paging; 404 for others.
- `pnpm --filter api test:e2e` 52/52; `pnpm --filter worker test:int` 32/32. No test data left.

**Not done / TODO**

- Inventory / Mark Sold screens - Build Prompt 29.
- Undo a Bought entirely (delete the item and reopen the deal) - not built; the purchase can be
  corrected.
- Returns and write-offs (statuses exist, no endpoints).
- Estimated upside excludes selling fees, so "expected vs actual profit" compares an estimate
  without fees to a realized result with them (labelled; better once fees can be estimated).
- One currency per item for purchase + purchase costs; a sale in another currency is stored but
  has no result until FX exists (never converted).

### Step 30 - Home in priority order (Build Prompt 27)

**What was added**

- Contracts `home.ts` (replaces the unused `home-summary.ts`): `GET /me/home` = attention
  (unread alerts, deals to review, top 3 open deals in feed order) -> hunts (live / paused /
  drafts, up to 5 live hunts with activity) -> realized profit (last 30 days, per currency:
  spent, revenue, realized profit, sold; bought, holding; hasSales) -> recent (alerts, purchases,
  sales; newest 5) -> one recommendation (code, kind setup / issue / suggestion, copy, target).
- API `HomeModule` (composition, no tables): reuses DealsService (now exported), hunt activity,
  Seller Snapshot, alerts, outcomes and push devices. Pure, unit-tested rules:
  `profitSnapshot` (sale - purchase - recorded costs, sales in the period only, currencies never
  mixed, estimates / missed potential never counted) and `homeRecommendation` (first that
  applies: finish setup -> first hunt -> start a draft -> resume paused -> marketplace failing 3+
  checks -> live 24h+ with no deals: loosen -> 20+ to review and no alerts: tighten -> no phone
  registered: enable push; else none). Thresholds are proposed defaults.
- client-core `home-view.ts`: attention / hunts lines, realized profit view (honest captions
  before the first sale or in a quiet period; profit / loss tone), recent items, web paths for
  recommendation targets.
- Web and mobile Home: the five sections in order; a brand-new account sees only the welcome
  step (approved wave mascot); "nothing needs you" says what Rein Drop is doing instead; first
  scan uses the normal loading UI (no approved "working" art); no "thinking" art for the
  recommendation; Recent hidden until there is something. Placeholder notice removed.
- `DealCard` takes a heading level (h3 under Home's section headings).

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (client-core 52, api unit incl. 6 Home rule
  tests).
- `pnpm --filter api test:int` incl. 6 new Home tests on real Postgres (every section from real
  rows; profit 450 000 - 300 000 - 20 000 repair - 30 000 fee = 100 000; a sale 80 days old
  ignored; brand-new account shows no invented numbers).
- Browser e2e (Edge 390x844): 8/8 on the user's real data (ps4 watching, nothing needs you,
  honest profit caption, enable-push recommendation) and 10/10 with temporary deals, alerts and a
  purchase + sale (order, top 3 + See all, inbox count, realized profit in green, recent
  newest-first). Temporary data removed; the user's account back to "ps4" only.
- Mobile: typecheck, lint, Expo export - not run on a device.

**Not done / TODO**

- Sales can't be recorded yet (Build Prompt 28), so realized profit stays empty in real use.
- "Current period" is a rolling 30 days (user time zone unknown) - D24.
- Plan / usage status on Home only when relevant: not shown yet (no trigger defined).

### Step 29 - Hunts management: list by state, detail, edit, pause / resume / archive (Build Prompt 26)

**What was added**

- Contracts: `HuntActivity` (scanning flag, last checked overall and per marketplace with
  ok / failed, failing streak, next check; counts: deals, to review, new, alerts, saved, bought);
  `defaultHuntName` moved here (API + clients share the naming rule).
- API: `GET /hunts/activity` (all of the user's hunts, two queries in total) and
  `GET /hunts/:id/activity` (404 for another user's hunt). "Scanning" = LIVE and at least one
  enabled marketplace never checked.
- client-core `hunt-view.ts`: status labels (LIVE shown as "Active"), list tabs (All / Active /
  Paused / Draft / Archived; All hides archived), monitoring line ("Watching · last checked 5 min
  ago", "Checking eBay and Facebook Marketplace for the first time…", failing sources), counts
  line, per-marketplace rows, criteria (same sentence as the Create review), actions per state
  (Draft: Start watching / Edit / Archive; Active: Pause / Edit / Archive; Paused: Resume / Edit /
  Archive; Archived: Restore only), confirmation copy, history labels, `huntFormValues` +
  `editContext` (the hunt's own currency) + `buildUpdateHuntRequest` (a default name follows the
  query, a custom one is kept).
- Web: `/hunts` with status tabs and cards (state, marketplaces, monitoring line, counts, Start
  watching for drafts); new `/hunts/[id]` detail (first-scan state, actions with confirmation
  for Pause / Archive, Performance metrics + "Open deals" filtered to the hunt, Monitoring per
  marketplace, criteria, Priority: Normal, history; refreshes itself every 10 s while scanning;
  shows the hunt an action returned at once); `/hunts/[id]/edit` reuses the Create flow in edit
  mode (Review changes -> Save changes -> back to the detail with "Changes saved"); archived
  hunts can't be edited.
- Mobile: Hunts tab with state chips and the same cards; `hunts/[id]` detail (native confirm for
  Pause / Archive, auto-refresh while scanning) and `hunts/[id]/edit`; the create form moved to
  `src/components/HuntFormFlow.tsx` with an edit mode.
- First scan: no approved "working" mascot exists (token null), so a spinner + text; the
  approved asset would show automatically once mapped. No Hot Hunt purchase flow.
- Plan gate: the "Pause another hunt" link now opens the Active tab.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (client-core 49, +7 hunt view tests).
- `pnpm --filter api test:int` 24/24 (+3: scanning until every marketplace is checked, per-
  marketplace last check / failures / next check, counts, all-hunts call, cross-user 404),
  `pnpm --filter api test:e2e` 52/52.
- Browser e2e (Edge 390x844, temporary hunts due only in 2036 so the running worker never polled
  them; the user's own "ps4" hunt untouched), 21/21: tabs, cards, first-scan state without
  artwork, monitoring rows, counts, criteria + Priority Normal, history, Open deals filter,
  Resume blocked by the plan with the reason shown, Pause with confirmation, edit filled from the
  hunt and saved (same hunt, history "Edited"), archive with confirmation -> Restore only ->
  restore to Draft, archived edit refused. Temporary data removed.
- Mobile: typecheck, lint, Expo export - not run on a device.

**Not done / TODO**

- Hot Hunt (paid priority) purchase flow - deliberately not built.
- Counts are all-time; per-period performance comes with analytics (Build Prompts 30-31).

### Step 28 - Expo push notifications with a development device token flow (Build Prompt 25)

**What was added** (rules: addendum in `docs/decisions/0006-alerts-and-notifications.md`)

- DB migration `..._push_devices`: `PushDevice` (user, provider `expo` | `dev_simulated`,
  unique token, platform, device name, app version, lastSeenAt, disabledAt / disabledReason).
- Contracts: register request (token format checked per provider), device + list schemas.
- API: `GET/POST /me/push-devices`, `DELETE /me/push-devices/:id` (kept, marked unregistered;
  re-registering re-enables and moves a token to the signed-in user). Development tokens -> 403
  in production.
- Worker: `PushProvider` interface; `ExpoPushProvider` (Expo Push Service, batches of 100,
  optional access token, ticket errors mapped, outages retryable); `SimulatedPushProvider`;
  `PushNotificationSender` (all active devices, each through its provider; dead tokens disabled;
  no device -> SKIPPED `no_device`). Senders now report `{ provider, simulated }`;
  `DeliverySkipped` marks a delivery SKIPPED with a reason. Config `PUSH_PROVIDER`
  (simulator | expo | none; required in production, simulator refused), `EXPO_ACCESS_TOKEN`;
  `NOTIFICATION_DELIVERY` now covers email only.
- Mobile (`expo-notifications`, `expo-device`, AsyncStorage via `expo install`; config plugin):
  `src/notifications/push.ts` (permission, Android "alerts" channel, Expo token in a development
  build, stable `dev-simulated:` token in Expo Go / simulator / no EAS project in development,
  registration, refresh, disable); `NotificationsBridge` (foreground display, silent refresh on
  launch only when already allowed, tap -> opens the deal + marks the alert read, cold start
  included); `PushCard` - the ask on the "Hunt is live" screen (explainer, Turn on / Not now) and a
  "Notifications on this phone" card in Settings. client-core `push-view.ts` holds the copy.
- Web: the live screen points to the inbox and the phone app (no web push). The stale
  "monitoring engine isn't built yet" notes were removed from both live screens.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (contracts 43, client-core 42, api-client 13,
  api unit 98, worker unit 32 incl. Expo provider mapping / batching / auth / outages).
  `expo install --check`: up to date.
- `pnpm --filter worker test:int` 32/32 (+1): no device -> SKIPPED no_device; a development token
  (simulated) + an Expo token Expo reports as DeviceNotRegistered -> delivered (SIMULATED), Expo
  device disabled; re-enabled Expo device accepted -> SENT via expo; all devices gone -> SKIPPED.
- `pnpm --filter api test:e2e` 52/52 (+1), `pnpm --filter api test:int` 21/21 (+1: register,
  refresh, cross-user 404, unregister, token moves to another account, dev token accepted).
- Live against the running API: dev token registered, listed, unregistered (row removed after).
- **Not verified on a phone**: permission prompt, tap-to-open, and real Expo push (needs a
  development build with an EAS project id - not configured here).

**Not done / TODO**

- EAS project id + development build to receive real pushes (`eas init`, `eas build --profile
  development`) - needs the owner's Expo account.
- Expo push receipts check; badge counts; quiet hours (D22).

**Fix after step 28 - Expo Go on Android crashed on load**

- Symptom (user, Expo Go on Android): repeated "expo-notifications: Android Push notifications
  ... was removed from Expo Go with the release of SDK 53", then "Route ./_layout.tsx /
  ./settings.tsx / ./hunts/[id]/start.tsx is missing the required default export" and
  "Cannot read property 'ErrorBoundary' of undefined".
- Cause: in Expo Go on Android, merely loading `expo-notifications` throws; `push.ts` and
  `NotificationsBridge.tsx` imported it at module level, so every route importing them failed.
- Fix: `src/notifications/load-notifications.ts` loads the module on demand and never in Expo Go
  on Android (or web). There, development falls back to an in-app opt-in + the simulated device
  token (no OS prompt - Expo Go can't show push anyway). No file imports `expo-notifications` at
  module level any more. Verified: mobile typecheck, lint, Android + iOS export bundles;
  on-device check pending (user).

### Step 27 - Notification preferences, alerts, deliveries, local simulator + inbox (Build Prompt 24)

**What was added** (rules and rationale: `docs/decisions/0006-alerts-and-notifications.md`)

- DB migration `20261007180312_notifications`: `Alert` reshaped into one intended notification
  (category, hunt / match / analysis links, unique `dedupeKey`, title, body, readAt); new
  `NotificationDelivery` (one per channel: status PENDING / SENT / SIMULATED / SKIPPED / FAILED,
  provider, reason, attempts, outbox lease) and `NotificationPreference` (user, category, channel,
  enabled - stored only when changed). `AlertStatus` enum replaced by `DeliveryStatus`. No alert
  rows existed.
- Contracts `notifications.ts`: categories (deal alerts, exceptional deals, operational, weekly
  insight, marketing) in three groups (alerts / insights / marketing), channel rules per category
  (inbox always on for service alerts, never for marketing; push on, email off; weekly insight
  and marketing opt-in), `deliveryPlan()`, preferences / update / inbox / dev log schemas. Enum
  mirrors checked by test.
- Worker:
  - `writeDealAlert` in the same transaction as an eligible DealAnalysis: at most one alert per
    deal (`deal:<match>`, ON CONFLICT DO NOTHING), only while the match is still NEW; IN_APP
    delivered on write, turned-off channels SKIPPED, others PENDING.
  - `NotificationDispatcher` (outbox, 4th worker loop): claims due PENDING deliveries with
    `FOR UPDATE SKIP LOCKED`, sends through `NotificationSender`s, records SENT / SIMULATED /
    FAILED (backoff, max attempts) / SKIPPED not_configured.
  - `SimulatedSender` logs `[simulated push] to <email>: <title>`; config `NOTIFICATION_DELIVERY`
    (simulator default; required in production, simulator refused).
- API `NotificationsModule`: `GET/PATCH /me/notification-preferences` (only editable channels can
  change), `GET /alerts` (newest first, unread count, cursor, unread filter), `POST
  /alerts/:id/read`, `POST /alerts/read-all`, `GET /dev/notifications` (development-only log).
- api-client + client-core (`notification-view.ts`: sections, copy, optimistic toggle, alert view).
- Web: bell with unread count in the top bar (both layouts), `/alerts` inbox (open -> marks read
  and opens the deal, Mark all read), Settings > Notifications switches (alerts / insights /
  marketing sections, saved per switch), `/dev/notifications` simulator log.
- Mobile: bell in every tab header, `alerts` inbox screen, Settings notification switches.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (contracts 42, client-core 39, api-client 13,
  api unit 96, worker unit 29).
- `pnpm --filter worker test:int` 31/31, incl. 6 new (checkpoint): a strong eligible deal creates
  one alert with in-app SENT / push PENDING / email SKIPPED; preferences respected (push off ->
  SKIPPED, email on -> delivered; marketing consent changes nothing); running the worker again on
  the same fixture - redelivered jobs, next polling window and next-day re-analysis - creates no
  duplicate alert; the outbox delivers each pending push / email exactly once through the
  simulator; a failing channel backs off then FAILS; no provider -> SKIPPED not_configured; an
  ignored deal never alerts.
- `pnpm --filter api test:e2e` 51/51 (+6), `pnpm --filter api test:int` 20/20 (+4).
- Browser e2e (Edge 390x844) with alerts written by the real worker writer and sent by the real
  dispatcher (the third write for the same deal returned null - dedupe confirmed): 13/13 - bell
  count, inbox order + exceptional styling, open -> deal + read, mark all read clears the bell,
  separate preference sections, locked inbox switches, marketing without inbox, choices persist,
  simulator log rows. Test data removed afterwards.
- Mobile: typecheck, lint, Expo export - not run on a device.
- Note: during verification the user's API dev server (:4000) was not running; the built API was
  started temporarily (auto-stopped after 6 minutes). Restart it with `pnpm --filter api dev`.

**Not done / TODO**

- Operational alerts (source degraded long enough to matter) - Build Prompt 32; weekly insight.
- Quiet hours, per-Hunt caps / digests; strong -> exceptional upgrade doesn't alert again.
- Expo push (Build Prompt 25); email provider TBD.

**Fix after step 27 - worker integration tests vs a running worker**

- Symptom: `pnpm --filter worker test:int` failed once (pipeline spec: no `condition` rejections)
  while the user's worker was running.
- Cause: test hunts were created with `nextPollAt = null` ("due now" for any scheduler), so the
  real worker claimed them mid-test, wrote a search run after the test's cleanup, and left
  future-dated dev listings that changed the next run's results. (The 2036 test clock only
  protected later polls.)
- Fix: every worker integration spec creates its hunts due at the test clock
  (`nextPollAt: epoch`), so a real-time worker never claims them. Leftovers removed (1 orphan
  search run, 9 raw records, 9 listings). Verified: 31/31 twice in a row, no leftovers.

### Step 26 - Deals feed + Deal Detail on web and mobile (Build Prompt 23)

**What was added**

- `client-core/deal-view.ts` (shared by web + mobile): card / detail view models - status,
  strength, confidence and "Just dropped" labels with tones, price + known costs, freshness text
  ("Posted 3 h ago" / "Found ..."), upside (value + range + excluded costs, `estimated` only for a
  real estimate, otherwise the reason, e.g. "No resale price data yet"), source notes ("Sold on
  eBay", "Couldn't check Facebook Marketplace on the last try"), price breakdown, max-price /
  target notes, match checks, alert outcome in words, decisions, which actions apply, and the
  Bought / Ignore form rules (price starts at the asking price; required when there is none).
- Web `/deals`: status tabs (To review, Saved, Bought, Ignored, Unavailable, All) as links, Hunt
  and Source selects (URL-driven), ranked cards (one stretched link per card with an accessible
  summary), "Show more" via a server action, per-filter empty states, error banner with retry.
- Web `/deals/[id]` (new): exceptional banner, badges, View on <marketplace> (new tab, announced),
  Bought (inline price form), Save / Remove from Saved, Ignore (optional reason) / Undo ignore,
  "Why Rein Drop flagged it" (next step, headline, summary, in its favour, concerns), Price
  (breakdown, max price note, estimated upside metric, what's not included), Risk and condition
  (level, factors with severity, seller note, questions to ask), From the listing, and a "How Rein
  Drop scored it" disclosure (strength / confidence reasons, Hunt checks, alert outcome). Opening
  a new deal marks it seen. Unknown / foreign ids -> 404.
- Mobile: Deals tab (status / source / Hunt chips, ranked cards, Show more, reload on focus) and
  `deals/[id]` screen with the same content and actions (`Linking.openURL` for View source).
- Exceptional deals: the `exceptionalDeal` mascot token has no approved asset, so cards and the
  detail use a Drop Yellow border + wash and an "Exceptional" badge / banner - no artwork. If an
  approved asset is ever mapped to the token, the detail banner shows it automatically.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (client-core 36, +9 deal view tests).
- Browser e2e (Edge, 390x844, running web + API) with temporary deals for the dev user (a PAUSED
  hunt so the worker never touched it; real mock-AI analyses and scoring), 28/28: ranking
  (exceptional, then strong), exceptional styling without images, estimated vs "Not estimated",
  source / freshness / price / confidence / status on cards, pending card, one link per card,
  Unavailable tab with "Sold on ...", source filter + select, empty state with Clear filters,
  detail sections, View source in a new tab, risk factors + seller questions, Save, Ignore with a
  reason, Undo ignore, Bought prefilled and edited, Bought without a price asks for one, Bought /
  open tabs updated, 404. All temporary data removed afterwards (feed empty again).
- Mobile: typecheck, lint, Expo export build - **not run on a device**.

**Not done / TODO**

- Listing images (dev image URLs are fake hosts; real hosts need allowlisting).
- The AI explanation doesn't see comparables yet, so with an estimate it can still say "profit is
  estimated in a later step" (only reachable with seeded comparables today) - `TODO(ai)`.
- The dev user has no locale, so amounts show as "ZAR 3,800.00" (the `en` fallback).

### Step 25 - Deals API: ranked feed, filters, detail, Seen / Save / Ignore / Bought (Build Prompt 22)

**What was added**

- Contracts (`deals.ts` rewritten; no client used the old shape): one user-facing `DealStatus`
  (bought > ignored > unavailable > saved > new > seen), feed filter `status` (default `open` =
  new + seen + saved, still available), `huntId`, `marketplace`. Every deal carries `price`
  (asking, known costs, known total), `freshness` (posted / discovered, age, basis), `source`
  (listing status, available, last seen, last marketplace check ok / failed), `assessment`
  (pending / completed / failed, strength, confidence, score, alert eligibility), `estimate`
  (resale + upside, `estimated` only with comparable sales and labelled `basis: 'estimate'`,
  otherwise the reason), `reason` (grounded AI headline) and `rank`. Detail adds the explanation,
  product, risk + seller questions, strength / confidence reasons, economics, match checks, alert
  rules and the user's decisions (seen / saved / ignored + reason / bought + inventory item).
  Strength / confidence lists mirror `@rein-drop/scoring` (test).
- Ranking (`FEED_RANKING` / `feedRank` in `@rein-drop/scoring`, mirrored by the SQL): stored
  strength-banded score + a freshness bonus of up to 14 fading over 72h, so freshness reorders
  within a strength band but never lifts a deal over a stronger band; unanalysed deals rank at the
  bottom of "moderate". Keyset paging over (rank, id); the cursor pins "now", so pages don't shift.
- API `DealsModule`: `GET /deals`, `GET /deals/:id`, `POST /deals/:id/seen`, `POST|DELETE
  /deals/:id/save`, `POST|DELETE /deals/:id/ignore` (optional reason), `POST /deals/:id/bought`
  (price defaults to the asking price and is required when there is none; purchase time defaults
  to now, not in the future). All idempotent, all return the deal; another user's deal is 404.
  Ignore removes it from Saved; saving an ignored deal un-ignores it; a bought deal can't be saved
  or ignored (409). Bought creates exactly one InventoryItem (concurrent taps included).
  New `MatchingService` (user decisions on HuntMatch, all conditional updates) and
  `OutcomesService` (purchase record) own those writes.
- DB migration `20261007173440_deal_actions`: HuntMatchStatus `BOUGHT`; HuntMatch `seenAt`,
  `dismissedAt`, `dismissReason`, `boughtAt`; InventoryItem `huntMatchId` (unique).
- Worker MatchStage: every status change is now conditional, so a match the user ignored or
  bought meanwhile is never overwritten (BOUGHT, like DISMISSED, is never expired or re-analysed).
- api-client: `listDeals` (new filters), `markDealSeen`, `saveDeal`, `unsaveDeal`, `ignoreDeal`,
  `unignoreDeal`, `markDealBought`.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (contracts 38, api-client 12, scoring 19,
  api unit incl. 6 mapper tests that validate real mock-AI + scoring output against the contract).
- `pnpm --filter api test:e2e` 45/45 (+9: auth, bad filters, tampered cursor, bad ids / bodies).
- `pnpm --filter api test:int` 16/16 (+7 on real Postgres): exact ranking (a brand-new moderate
  deal stays below a 60h-old strong one; SQL rank = feedRank), card fields, 3-page cursor walk
  equals the full list, hunt / marketplace / status filters, archived hunts and other users
  excluded, detail + 404s, seen / save / unsave / ignore with reason / un-ignore / save
  un-ignores, bought at asking price once (two concurrent retries create nothing), 409s after
  bought, price required without an asking price, future purchase time rejected.
- `pnpm --filter worker test:int` 25/25 after the MatchStage change.
- Live: the running API serves `GET /deals` (200; the dev user has no matches yet).

**Not done / TODO**

- Deals feed + Deal Detail screens (web + mobile): Build Prompt 23.
- Editing / undoing a purchase, purchase costs, Mark Sold: Build Prompt 28.
- "Suppress similar noise" after Ignore (Blueprint section 10) - reasons are stored, not used yet.
- Saved deals aren't refreshed specially ("update if meaningful source changes are detected").
- Feed ranking window / bonus are proposed defaults (decision 0005 / D8).

### Step 24 - Deal scoring pipeline + alert eligibility (Build Prompt 21)

**What was added** (rules and rationale: `docs/decisions/0005-deal-scoring.md`)

- New `packages/scoring` (`@rein-drop/scoring`, pure, depends on ai-core types only):
  - `computeEconomics`: asking price + costs the listing states, max-price check (asking, and
    asking + known costs, with headroom), resale estimate and **estimated upside** (low / typical /
    high, `basis: 'estimate'`, margin) ONLY from comparable sales (>= 5), profit / margin target
    met / not met / unverified, and the costs never included yet (selling + payment fees, shipping to
    your buyer, repairs). No "profit" anywhere: realized P/L only comes from recorded sales.
  - `scoreCandidate`: strength (exceptional / strong / moderate / weak) and confidence
    (high / medium / low) from the economics + the AI's product and risk output, every rule as a
    reason (blocks / caps / supports / note); 0-100 ranking score in non-overlapping bands.
  - `evaluateAlertEligibility`: completed analysis, hunt LIVE, match NEW, listing ACTIVE, not a
    duplicate, strength >= strong, confidence >= medium, posted <= 48h ago; kind deal / exceptional.
  - `DEFAULT_SCORING_POLICY` + `SCORING_VERSION`: every threshold in one place, marked as proposed
    defaults (Blueprint section 22 leaves Strong vs Exceptional open).
- marketplace-core: optional `MarketplaceAdapter.buyerCosts()` (the adapter reads its own
  `sourceMetadata`); the dev eBay adapter states shipping (free = known zero) and now also records
  `shippingCurrency`. Facebook states none.
- DB migration `20261007171603_deal_scoring`: DealAnalysis `scoringVersion`, `economics`,
  `strength`, `confidence`, `score`, `scoring` (reasons + alert rule outcomes), `alertEligible`,
  `alertKind`; unique (huntMatchId, inputHash); index (alertEligible, createdAt). Strength /
  confidence are text, not DB enums (pending product decision).
- Worker: MatchStage returns the open matches it confirmed; the search handler enqueues one
  `deal.analyze` job per open match on the new `deal-analysis` queue (dedupe per match + run);
  `DealAnalysisHandler` re-checks the match (skips dismissed / expired / duplicate / paused), runs the
  AIProvider, scores, and upserts one DealAnalysis per (match, input hash) - unchanged inputs cost
  no AI call; the input uses "now" at day granularity. Retryable AI failures retry the job; the last
  attempt is stored FAILED (economics kept, never eligible). A second runner loop drives the
  analysis queue. New config `AI_PROVIDER` (mock default; required in production, mock refused).

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 54/54 (scoring 18 new tests incl. two end to end
  through the MockAIProvider; marketplace-core 137; worker unit 28).
- `pnpm --filter worker test:int`: 25/25 - 6 new against the real database: one analysis job per
  open match; one COMPLETED, scored DealAnalysis each (no resale source -> nothing estimated, never
  exceptional / high confidence; eBay shipping included as a known cost); only some matches are
  eligible, each with explained blocked rules; for-parts listings weak; a hunt with no max price or
  target never eligible; redelivered jobs and later searches of unchanged listings add nothing; AI
  outage retries, then FAILED, then replaced in place when it recovers; dismissed matches never analysed.
- `pnpm --filter api test:e2e` 36/36, `pnpm --filter api test:int` 9/9.

**Not done / TODO**

- Creating alerts (once per match, channels, preferences, per-hunt caps): Build Prompt 24.
- Deals API / screens exposing strength, confidence, economics: Build Prompts 22-23.
- `TODO(data)`: comparable-sales source; auctions score on their current bid.
- `TODO(product)`: confirm thresholds, margin definition (upside / resale price), 48h window.
- `TODO(ai)`: `analysisInputKey` is computed with `promptVersion: null` (versions are only known
  after a call), so a prompt change alone doesn't trigger re-analysis.
- An unchanged open match is re-analysed once per day (new "now"); cheap on the mock, to watch on Foundry.

### Step 23 - Seller Snapshot onboarding UI (Build Prompt 11, previously skipped)

**What was added**

- `client-core/seller-snapshot-flow.ts` (shared by web + mobile): step order (reseller gate ->
  5 questions -> summary; "no" -> coming soon), `resumeStep` (first unanswered question),
  answer draft, per-step validation building the PATCH body (incl. "Other" text and the optional
  Q4 target: money in the user's locale currency, or a whole percent), Q4 labels with the locale
  currency symbol instead of a hard-coded "$", `snapshotSummary` (echo sentence + "Rein Drop will
  prioritize..." listing only what the answers really drive: Hunt ideas, default marketplaces, deal
  threshold), `snapshotAnswerRows` for Settings. Re-exports the snapshot copy constants.
- Web `/onboarding` (outside the app shell, protected; added to the proxy matcher): one question
  per screen, "n of 5" progress bar, large choice chips (question asked once - the group legend is
  visually hidden but announced), Back / Next (disabled until answered), each answer saved before
  moving on, focus moved to the new heading, errors shown inline without losing answers. Wave
  mascot on the gate, thumbs-up on the summary (approved assets only). Summary -> "Create my first
  Hunt". `?edit=1` re-opens the questions with saved answers.
- Web Home redirects to `/onboarding` while it is not started / in progress (never for
  "not a reseller", never blocking if the API fails). Settings shows the five answers with
  Edit / Finish / Set up / Change-my-answer actions.
- Mobile `onboarding` modal screen with the same flow (header shows "n of 5", accessibility
  announcements and progressbar role); Home opens it once per app launch and otherwise shows a
  "Finish setting up" banner; Settings shows the answers with the same actions.
- `ChoiceGroup` (web + mobile): optional `hideLegend`.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 50/50 (client-core 27 incl. 10 new flow tests).
- Browser e2e (Edge, 390x844, running web + API), 20/20: Home -> /onboarding redirect; no app nav;
  mascots; gate "no" -> coming soon -> change answer; questions with progress and hidden legend;
  Next disabled until answered; Back keeps answers; refresh resumes at question 3; Q4 invalid
  target rejected, valid target saved; summary sentence and priorities; Create Hunt prefilled from
  the answers; Home no longer redirects; Settings lists answers; Edit re-opens at question 1. The
  dev user's original answers were backed up and restored afterwards.
- Mobile: typecheck, lint and the Expo export build pass; not yet tried on a device.

**Not done**

- Welcome / create-account screens (frames 01-02) come with managed auth (prompt 38).
- Non-reseller experience is still "coming soon" (product decision pending).

### Step 22 - AIProvider (structured, validated, grounded) + deterministic MockAIProvider

**What was added** (`packages/ai-core`, now depends on zod + `@rein-drop/matching`)

- `AIProvider` with three structured tasks:
  - `extractProduct` -> category, brand, model, attributes (storage, memory, edition,
    connectivity...), normalized name, query fit (matches / conflicts / unclear), confidence.
  - `assessConditionRisk` -> condition category, risk factors (damage, not working, locked,
    sold as is, missing accessories, vague description, no photos, no price, stale) with
    severity, overall risk level, questions to ask the seller, seller status.
  - `explainDeal` -> headline, summary, positives / concerns (each citing a match check, risk
    factor, product field or listing fact), valuation, next step (review / ask_seller / skip),
    questions for the seller.
  Inputs carry only what the source returned (photos as a count) plus explicit
  `EvidenceAvailability` (seller + comparables: `not_available`).
- Validation (`withValidation`, applied by `createAIProvider` / `createMockAIProvider`): zod
  schemas per task + grounding - every quote must appear verbatim in the cited listing field,
  every fact value must equal the listing's canonical value, the normalized name may only use
  extracted words, explanations may only cite checks that passed (positives) / didn't
  (concerns) and risks that were assessed. Seller assessment and valuation schemas only allow
  "not available" / "unavailable", so no provider can invent seller or comparable facts.
  Errors: INVALID_OUTPUT, UNGROUNDED_OUTPUT (not retryable), UNAVAILABLE / RATE_LIMITED
  (retryable), NOT_CONFIGURED.
- `MockAIProvider`: deterministic rules (brand / model patterns incl. aliases such as
  PS5 = PlayStation 5, risk phrases, category-aware seller questions); metadata
  `mock` / `mock-rules` / `1.0.0`, prompt versions per task, schema version 1.
- `analyzeCandidate()` -> a record mapping 1:1 onto DealAnalysis (status, result, provider,
  model, modelVersion, promptVersion, schemaVersion, providerMetadata per task, durationMs;
  failures become FAILED records with `retryable`). `analysisInputKey()` for `inputHash`.
  `createAIProvider('foundry')` -> NOT_CONFIGURED (TODO).
- Database (migration `..._deal_analysis_metadata`): DealAnalysis `modelVersion`,
  `promptVersion`, `schemaVersion`, `providerMetadata`, `inputHash` (indexed), `durationMs`.
- Turbo: `packages/db/turbo.json` and `apps/web/turbo.json` make `typecheck` wait for the
  package's own `build` (fixes the recurring parallel-regeneration failures).

**What works (verified)**

- `pnpm turbo run build typecheck lint test --force` (uncached): 50/50. ai-core 20 tests:
  extraction (incl. title-over-description, aliases, nothing invented when nothing found),
  risks (quotes, listing facts, unknowns), explanations and next steps, analysis record +
  metadata, stable input key, every seeded dev listing analysed without a validation failure,
  and the validator rejecting invented quotes, extra name words, wrong facts, seller history,
  estimated valuations, unsupported citations; unexpected errors -> retryable UNAVAILABLE.
  api e2e 36 + integration 9, worker integration 19.
- Real database round-trip: an analysis record inserted into DealAnalysis with every new field
  and read back (then deleted).

**Not done**

- Nothing runs analyses yet (worker stage after matching is next), and the Deals API doesn't
  expose them (contract still opaque).
- Mock text is English only; Foundry provider not built.

### Step 21 - Listing deduplication + deterministic Hunt matching (no AI)

**What was added**

- `@rein-drop/matching` (new pure package, used by the worker; the API can reuse it):
  - `evaluateMatch(hunt, listing, context)` runs every check and records outcome
    (pass / fail / unverified / not_applicable) + code + plain detail: availability, marketplace,
    relevance (significant query words; anything with a digit is a model code that must be in the
    title - "13" exactly, "xm4" inside "1000xm4"; <=3 words all required, longer queries 75%;
    description counts at half weight), accessory guard ("case for ...", "compatible with",
    "box only"), condition (free text classified; "Used - like new" = used; for-parts only for
    any-condition hunts), geography (`enforced_by_source` when the search applied location +
    radius, else `not_checked` - no geocoding yet, never rejects), max price (no price / other
    currency = unverified, never rejects), exclusions (whole phrases in title + description),
    economics inputs (acquisition price + target; `awaiting_valuation`, never judged without a
    resale estimate). `MATCHER_VERSION` stored per match. Unicode/accent-insensitive text.
  - `dedupeKeyFor`: same significant title words + exact price/currency + same location;
    without a location only within one marketplace; none for unpriced or < 3-word titles.
    `canonicalOf`: first-seen active listing.
- Database (migration `..._matching_dedupe`): Listing `dedupeKey`, `duplicateOfId`; HuntMatch
  `reasons`, `relevanceScore`, `economics`, `matcherVersion`, `lastEvaluatedAt`, `statusReason`,
  `firstSearchRunId`; HuntMatchStatus `EXPIRED`; SearchRun `matchedCount`, `newMatchCount`,
  `rejectedCount`, `duplicateCount`, `rejectionSummary`. Contracts: `EXPIRED` match status.
- Worker `MatchStage` (after normalization, inside the search job): recomputes touched duplicate
  groups; evaluates each (hunt, listing) with the hunt's own criteria (grouped searches used the
  widest filters); upserts HuntMatch. Status rules: new match -> NEW; stops matching -> NEW/SEEN
  become EXPIRED with the failed checks as reason (`duplicate` for duplicates); matches again ->
  NEW (`matches_again`); DISMISSED never changed (reasons refreshed). Idempotent per (hunt,
  listing); run counts are absolute.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 49/49 (matching 28: text, conditions, every check,
  model codes, accessories, dedupe safety; worker 27; api 85; contracts 35); api e2e 36,
  integration 9.
- `pnpm --filter worker test:int` - 19 on real Postgres, incl.: per-hunt filters after grouped
  searches (B "used only" gets no for-parts, A does), reasons persisted, geography codes per
  source; a cross-posted copy becomes a duplicate and its match EXPIRES, then revives when the
  original sells; a new exclusion expires open matches but not a DISMISSED one; removing it
  revives them. Test data removed.
- Live: built worker + temporary hunt (Galaxy S23, used, $400 max, ignore "for parts", profit
  target) -> 6 matches, for-parts rejected (condition + exclusions), economics
  `awaiting_valuation`. Data removed. (The dev sources produced one synthetic cross-marketplace
  duplicate - identical title/price/location - which the heuristic merged as designed.)

**Not done / known limits**

- `TODO(worker)`: listings that sell or drop out of search results are not re-checked, so their
  matches stay NEW until a refresh job (via `fetchListing`) exists. The same applies when a hunt
  narrows a filter the source applies (e.g. lower max price): those listings aren't returned,
  so they aren't re-evaluated.
- Editing a hunt doesn't re-evaluate existing matches immediately (next poll does, for listings
  still returned).
- Relevance is lexical: "PS5" won't match "PlayStation 5" (AI / synonyms later). Stopwords are
  English only (`TODO(i18n)`).
- Matches aren't exposed through the API / UI yet (Deals screens).

### Step 20 - Scheduler / worker pipeline (local, no Azure / Redis)

**What was added** (decision record: `docs/decisions/0004-local-job-queue.md`)

- Database (migration `20261007103658_worker_pipeline`): `Job` (local queue: dedupe key unique
  per queue, status, attempts / maxAttempts, runAt, lease token + expiry, lastError);
  `SearchRun` (one per executed search, keyed by job id: provider, group key, merged criteria,
  hunt ids, attempts, pages, result / new / updated / unreadable counts, error code, timings);
  `RawListing.provider` (existing rows backfilled `unknown`) and `RawListing.searchRunId`
  (unique with marketplace + externalId); `HuntMarketplace` polling metadata (`nextPollAt`,
  `lastPolledAt`, `lastPollStatus`, `lastPollErrorCode`, `lastPollError`,
  `consecutiveFailures`).
- Queue abstraction (`apps/worker/src/queue`): `JobQueue` interface (Storage Queue / Service Bus
  mapping documented), `PostgresJobQueue` (`FOR UPDATE SKIP LOCKED`), `InMemoryJobQueue`, shared
  contract suite, `JobRunner` (exponential backoff 30s..15m, honours a source's `retryAfter`,
  dead-letters after max attempts / permanent errors / unknown types, detects lost leases).
- Scheduler: claims due rows (LIVE hunt, enabled marketplace, `nextPollAt` null or past) in one
  `UPDATE ... SKIP LOCKED` that moves `nextPollAt` forward; groups hunts that one search can serve
  (same marketplace + normalized query + location + radius; conditions/max price merged, widest
  wins); dedupe key = group + exact hunts + polling window; releases the claim if enqueue fails.
- `marketplace.search` handler: skips hunts no longer LIVE; searches via the registry; stores raw
  records (duplicates from retries ignored); normalizes PENDING ones (one transaction each; Listing
  created or refreshed, never moved back in time); FAILED/SKIPPED raws kept with the reason;
  records SearchRun, per-hunt polling metadata and a `hunt_poll` UsageEvent per hunt (idempotency
  key per run + hunt). Retryable MarketplaceErrors -> retry; others -> dead-letter; both recorded.
- Shared `createMarketplaceRegistry()` in marketplace-core/adapters (API + worker); worker config
  for poll interval (dev default 15 min, required in production), ticks, lease, attempts, pages and
  dev scenarios. `.env.example`, README updated.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 45/45. worker unit 27 (planning/grouping/dedupe
  windows, runner retry/backoff/dead-letter/lease loss, queue contract in memory, config); api 85,
  e2e 36, integration 9.
- `pnpm --filter worker test:int` - 16 on real Postgres: queue contract + 4 concurrent consumers
  never share a job; full pipeline (3 due rows -> 2 grouped jobs; second scheduler tick claims
  nothing; raw + normalized listings, runs, polling metadata, 3 usage events; redelivered jobs
  change nothing; next window refreshes listings without duplicates; rate limit -> FAILED metadata
  + retry after retryAfter -> recovery resets the failure streak; NOT_CONFIGURED dead-letters;
  malformed payloads stored as FAILED raws; paused-before-run hunts skipped). Test data removed.
- Live: built worker with a 1-minute poll interval and a temporary LIVE hunt: 2 jobs scheduled
  and run, 14 listings stored, both polls SUCCEEDED, 2 usage events. Process stopped, data removed.

**Not done**

- Hunt matching (HuntMatch), deal analysis and alerts - next pipeline stages.
- Editing a LIVE hunt doesn't reset `nextPollAt` (new criteria apply from the next poll).
- `TODO(worker)`: job retention, lease renewal; real poll interval per plan / priority
  (TODO(product)).
- Development listings age from each worker start (adapter epoch), so restarting the worker
  shifts their `listedAt`.

### Step 19 - Deterministic development marketplace sources

**What was added** (`packages/marketplace-core/src/adapters/dev/`; replaces step 18's generic mocks)

- Seeded catalogue: 15 products - phones (iPhone 12/13/14 Pro, Galaxy S23/A54, Pixel 7), iPad,
  consoles (Switch OLED, PS5, Xbox Series X), audio (AirPods Pro 2, Sony XM4), MacBook Air M1,
  GoPro, DJI drone - each in up to 9 listing cases: deal, just-listed hot deal, fair, overpriced,
  new sealed, refurbished, for parts, auction (eBay) / no price "message me" (Facebook), stale.
  Prices are SYNTHETIC (rough typical value x case factor x small jitter, rounded the way people
  type them; rough per-currency multipliers for USD/EUR/GBP/CAD/AUD/NZD/ZAR, others fall back to
  USD). Labelled as development-only, not market data.
- `DevEbayAdapter` implements `MarketplaceAdapter`; `DevFacebookDataProvider` implements
  `FacebookDataProvider` and runs through the real `FacebookAdapter`. Each has its own invented
  development payload format (eBay: decimal price strings, auction/bids, shipping, seller
  feedback, returns; Facebook: whole-unit asks, condition labels, distance, delivery, seller
  joined year). Neither imitates a real API format.
- Freshness: listings are aged from an epoch (adapter start) and sell / end / get removed as the
  clock moves; search returns active listings newest first; `fetchListing` shows the new status
  (SOLD, ENDED for auctions, REMOVED for withdrawn Facebook listings).
- Pagination: keyset cursors - no repeats or skips when a listing sells between pages.
- Source metadata on every normalized listing (`synthetic: true` plus the fields above).
- Scenarios (`DEV_SCENARIOS`): normal, empty, degraded (short first page, health degraded),
  rate_limited (RATE_LIMITED + retryAfter), unavailable, not_configured, invalid_response
  (adapter rejects with INVALID_RESPONSE), malformed_payloads (every 4th record FAILS
  normalization).
- API: `EBAY_DEV_SCENARIO` / `FACEBOOK_DEV_SCENARIO` (validated; refused in production) select
  the scenario; registry uses the dev sources outside production. `.env.example` and README
  updated. Config may import `/adapters` (boundary test allowlist), nothing else may.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 45/45. marketplace-core 136 tests: the adapter
  contract suite on dev eBay (plain, ZAR + filters, degraded) and Facebook (dev provider,
  alternate provider with other capabilities, degraded); every seeded listing on both
  marketplaces normalizes; price/condition cases; ZAR rounding and currency fallback; filters
  and radius; determinism; freshness transitions; keyset paging across a sale; all 8 scenarios
  on both marketplaces. api 85 (+config scenario tests, +registry scenario test), e2e 36,
  integration 9.
- Live: built API exits with a clear message for `EBAY_DEV_SCENARIO=chaos`; starts with
  `FACEBOOK_DEV_SCENARIO=rate_limited`.

**Not done**

- Nothing calls the sources yet (ingestion worker is next). No HTTP endpoint exposes them.
- Listings are not written to the database (no RawListing `provider` column yet - TODO(db)).

### Step 18 - Marketplace adapter boundary (marketplace-core)

**What was added**

- `@rein-drop/marketplace-core` (main entry - what domain code may use):
  - `MarketplaceAdapter` interface (identity, capabilities, `health`, `search`, optional
    `fetchListing`, `normalize`) with its rules written on the interface.
  - `MarketplaceCapabilities` (location required/optional/unsupported, radius, price filter,
    condition filter, single-listing refresh, max page size). Filters are pushdown hints;
    `applicableCriteria()` drops unsupported ones and reports them so Hunt matching re-checks.
    Only a required location is a hard rule (`criteriaProblems()`).
  - `MarketplaceSearchCriteria` / `MarketplaceSearchResult` (raw records + opaque cursor).
  - `SourceHealth` (healthy / degraded / down / not_configured, retryAfter).
  - `MarketplaceError` with codes UNSUPPORTED_CRITERIA, NOT_CONFIGURED, RATE_LIMITED,
    UNAVAILABLE, INVALID_RESPONSE, ABORTED and a `retryable` flag.
  - `RawListingRecord` (marketplace, provider, externalId, JSON payload, fetchedAt) and
    `normalizeRawListing()` - never throws; results NORMALIZED / FAILED / SKIPPED mirror the
    RawListingStatus enum; output is validated against `normalizedListingSchema` (zod, mirrors
    the Listing table) and must keep marketplace + externalId.
  - `MarketplaceRegistry` (one adapter per marketplace, NOT_CONFIGURED when missing, health of
    every launch marketplace without rejecting).
  - `LISTING_STATUSES` / `LISTING_CONDITIONS` now defined here; contracts re-uses them.
- `@rein-drop/marketplace-core/adapters` (wiring only): `FacebookAdapter` over a
  `FacebookDataProvider` sub-interface (provider owns its payload format; the adapter enforces
  location-required, stamps the provider id, wraps errors and health, and SKIPs raw records
  written by a different provider). `MockMarketplaceAdapter` (used for eBay) and
  `MockFacebookDataProvider`: deterministic, no network, `.invalid` URLs, options for empty
  results, degraded health and simulated failures.
- `@rein-drop/marketplace-core/testing`: `describeMarketplaceAdapterContract()` - 14 checks every
  adapter must pass (identity, capability sanity, health, valid/unique/within-limit raw records,
  every record normalizes, purity, FAILED not throw on bad payloads, foreign records refused,
  cursor paging without repeats, limit / blank query / required location rejected, ABORTED,
  fetchListing).
- API: `MarketplacesModule` provides and exports `MarketplaceRegistry`; mock sources outside
  production, nothing in production (all `not_configured`). `src/architecture.spec.ts` fails if
  any API/worker file other than `marketplace-registry.provider.ts` imports concrete adapters,
  or application code imports the test kit.

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 45/45 tasks. marketplace-core 78 tests (contract
  suite run against mock eBay, mock eBay with filters, Facebook via the mock provider and via an
  alternate provider with different capabilities; FacebookAdapter swap / errors / health;
  criteria, normalization, registry). api 82 (+registry provider, +boundary guard), e2e 36,
  integration 9.
- Mutation checks: an adapter with three planted faults failed exactly those 3 contract tests; a
  planted adapter import in the Hunts module failed the boundary test. Both removed.

**Not done**

- `TODO(marketplace)`: real `EbayAdapter` and a real `FacebookDataProvider` (sources, credentials
  and terms not decided). No network code exists.
- `TODO(db)`: RawListing has no `provider` column yet - needed when ingestion stores records.
- Nothing calls the registry yet (ingestion/matching worker is a later step).

### Step 17 - Plan gate + DEVELOPMENT-ONLY fake billing

**What was added**

- Contracts: `SubscriptionSummary` {planCode, status, provider, isDevelopment};
  `POST /billing/dev/confirm` request/response; `GET /me/entitlements` now includes `subscription`
  (null = no plan chosen yet, Free applies).
- API: `DevBillingController` `POST /billing/dev/confirm` {planCode} - **404 in production**
  (checked on both `config.nodeEnv` and `process.env.NODE_ENV`, before any database access). In a
  transaction it cancels other active subscriptions and upserts one `dev-fake:<userId>` ACTIVE
  subscription. Real activation still goes through the normal entitlement checks.
- client-core `plan-gate.ts`: `planGateOptions()` (price label `Free` / `Price TBD`, plain
  entitlement lines, per-plan "can't run this Hunt" reasons via `evaluateActivation`, recommended =
  first plan that can run the Hunt, current plan), `describeEntitlements()`, `RESOLUTION_LABEL`.
  Everything comes from `/plans` + `/me/entitlements` - no plan names or limits in the clients.
- Web: `/hunts/[id]/start` (server-loaded hunt, plans, entitlements, activation-check). Views:
  quick start (already on a plan that allows it) / plan gate ("Development data" banner,
  "Price TBD", "Placeholder limits", block reasons) / development confirmation ("no card, no
  charge") / live. Review "Start watching" saves the draft then opens the gate; draft cards on
  Hunts link to it. Shell nav now reads the pathname inside `<Suspense>` (needed for this dynamic
  route with Cache Components).
- Mobile: `hunts/[id]/start` modal with the same four views; Review "Start watching" saves then
  replaces the Create modal with the gate; draft cards in the Hunts tab get "Start watching".

**What works (verified)**

- `pnpm turbo run build typecheck lint test`: 44/44 tasks (incl. mobile export). Tests: contracts
  35, client-core 17, api-client 11, api 76 + e2e 36 + **integration 9** on real Postgres (dev
  billing: null -> free -> pro, one active sub, unknown/retired plan 404, empty body 400; limit
  enforcement), web 6, mobile 7.
- Browser e2e (Edge, 390x844, against the running web + API), 16/16: Review -> Start watching
  saves and opens the gate; Free/Pro/Ultimate with Price TBD and placeholder labels; Free ->
  development confirmation -> hunt LIVE and dev subscription recorded; a second hunt is blocked
  (reason shown, Free "Current" and disabled, hunt still DRAFT); upgrade to Pro -> LIVE. Test
  hunts and subscription deleted afterwards.

**Not done**

- `TODO(billing)`: real checkout (Stripe / App Store / Play) not integrated; prices TBD.
- Mobile plan gate typechecks/lints/exports but has not been run on a device or simulator.

**Fix after step 17 - Expo Go "status 500"**

- Cause: Metro could not resolve `@expo/metro-runtime` (imported first by the expo-router entry).
  It and `@expo/log-box` are required peers of expo-router that `apps/mobile` never declared, and
  pnpm's strict layout does not link undeclared peers. Added both via `expo install` (SDK 57
  versions). Verified: a fresh Metro serves the Android and iOS dev bundles (HTTP 200); mobile
  build/typecheck/lint/test pass; `expo install --check` is clean.
- An already running Metro keeps the old module map - restart it with `--clear`.
- Monitoring engine not built: a LIVE hunt is not actually checked yet (the live screen says so).
- No Hunt detail screen yet for pause / archive / restore from the UI.

### Step 16 - Plans, entitlements, activation enforcement

**What was added** (decision record: `docs/decisions/0003-plans-entitlements-placeholders.md`)

- Contracts (`plans.ts`): `ENTITLEMENT_KEYS`, typed `PlanEntitlements` (active hunts, marketplaces,
  Hot Hunts {available, limit} as a future flag, monitoring priority, analytics history days,
  seats), `Plan` (pricing `free` | `tbd`, `limitsFinal`), `EntitlementEvaluation`,
  `ActivationBlock` reasons (`ACTIVE_HUNT_LIMIT_REACHED` {limit, used}, `MARKETPLACE_NOT_IN_PLAN`,
  `PRIORITY_NOT_IN_PLAN`, `NOT_READY`) with resolutions (`pause_another_hunt`, `upgrade_plan`,
  `edit_hunt`), pure `evaluateActivation()` shared by API and clients. New error code
  `ACTIVATION_BLOCKED` (409) with `activationBlock` on the error body.
- Database: migration `..._plan_entitlements` (Plan `isFree`, `sortOrder`, `limitsFinal`;
  Entitlement `value`). Seed: Free / Pro / Ultimate with **placeholder** limits in one marked
  `PLAN_CATALOGUE`, no prices; old `dev-free` / `dev-pro` deactivated (not deleted). Seed keeps
  each plan's entitlements exactly in sync with the catalogue.
- API: Billing `SubscriptionsService` (active/trialing, unexpired subscription -> plan, else Free);
  Plans `PlansService` + `GET /plans`; entitlement rows fail closed when missing;
  Hunts enforces on activate/resume (per-user advisory lock against concurrent activations) and on
  edits to LIVE hunts; `GET /hunts/:id/activation-check`; Entitlements composition module with
  `GET /me/entitlements` (plan, entitlements, usage, remaining).
- api-client: `listPlans`, `getEntitlements`, `checkHuntActivation`; `ApiError.activationBlock`.

**What works (verified)**

- `pnpm build` 12/12, `pnpm typecheck` 19/19, `pnpm lint` 19/19; tests: contracts 35, api 75
  (+entitlement mapping) + e2e 36 + **integration 8 on real Postgres** (plans list without prices;
  Free limit reached -> 409 with structured reason, draft untouched with only a CREATED event;
  activation-check preview; pause frees a slot; resume gated; subscription to Pro lifts the
  limit; eBay-only plan blocks Facebook on activate and on live edit), api-client 11.
- Seed run twice: 3 active plans with 8 entitlements each; integration cleanup verified.

**Not done**

- No plan-gate / payment UI and no subscription creation (billing provider TBD); everyone is on
  Free unless a subscription row exists.
- Review screen does not yet call `activation-check` (Start watching stays disabled).


### Step 15 - Create Hunt flow (web + mobile), Review, save as draft

**What was added**

- New package `@rein-drop/client-core` (platform-neutral, no UI): Create Hunt form model,
  `huntFormDefaults()` (Seller Snapshot + locale -> defaults), `buildCreateHuntRequest()`
  (money text -> minor units in the user's currency, radius in the user's unit -> km, location only
  when a local marketplace is chosen, canonical marketplace order, shared contract validation),
  `mapHuntErrors()` (API/schema details -> form fields), `huntReview()` (plain-English sentence +
  labelled details + go-live warnings), money parsing/formatting, `queryPlaceholder()`.
- Defaults from the Seller Snapshot, always **visible and editable** ("From your Seller Snapshot
  ... - change it anytime"): marketplaces from sourcing answers (both when no signal), deal rule ->
  profit / margin target or max price (only when the currency matches the user's), category ->
  example placeholder. Non-reseller answers are ignored. Currency falls back to USD only when the
  user has no locale yet (fallback, not a product decision).
- Form (mobile-first, both platforms): product/description, eBay / Facebook chips,
  location + radius shown only when Facebook is chosen, condition chips (Any/New/Used/Refurbished),
  max price, target (none / minimum profit / minimum margin), "More filters" disclosure with words
  to ignore. Errors per field; on web, focus moves to the first invalid field.
- Review screen: plain-English summary, details list, warning when the hunt cannot go live yet
  (Facebook without location), **Save as draft**, Edit, and a disabled **Start watching** with
  "Monitoring starts after you choose a plan - coming soon". No activation call anywhere.
- Web: `/hunts/new` (server loads snapshot + locale, client flow, save via Server Action so API
  credentials stay server-side), `/hunts` lists real hunts with status badges + "saved as a draft"
  confirmation. New web primitives `ChoiceGroup` (native checkbox/radio chips) and `Disclosure`.
- Mobile: `hunts/new` modal (same model and review), header title switches to "Review Hunt",
  `router.dismissTo('/hunts')` after save; Hunts tab lists real hunts (reloads on focus, loading /
  error + retry / empty states). New mobile primitives `ChoiceGroup` and `Disclosure`.

**What works (verified)**

- `pnpm build` 12/12, `pnpm typecheck` 19/19, `pnpm lint` 19/19; tests: client-core 13 (+13),
  contracts 31, api 72, api-client 10, web 6, mobile 7, design-tokens 11, worker 3.
- **Browser end-to-end on web (headless Edge via puppeteer-core, 390x844 phone viewport), 15/15
  checks:** Snapshot defaults preselected and labelled (Facebook, R 500 profit), ZAR + km from
  locale, placeholder from categories, empty submit -> error + focus, fill + change a default,
  review sentence, disabled Start watching, save -> `/hunts` with confirmation and Draft badge.
  Saved record checked via API: DRAFT, `activatedAt` null, ZAR minor units, km. Test data
  (2 hunts, snapshot, locale) removed afterwards.
- **Mobile:** typecheck, lint and iOS/Android bundles only - **not yet run on a device/emulator**.

**Known limitations**

- No hunt detail / edit screen yet (list cards are not links).
- Onboarding (reseller gate + Seller Snapshot screens) is not built, so defaults only appear once
  the snapshot exists (via API for now).


### Step 14 - Locale preferences, restore archived hunts, geocoding decision

**Decisions (product owner, 2026-10-07)** - recorded in `docs/decisions/`:

- 0001: geocoding/maps provider = **Azure Maps** (free 5,000 search transactions/month,
  autocomplete billed 1 per 10 requests, fits the Azure target); fallback Geoapify. Not
  implemented yet - check Azure's terms on storing results first.
- 0002: **currency, distance unit and language follow the user's locale** (device / browser),
  storage stays canonical (minor units + currency, km).
- Archived hunts **can be restored**.
- Plan limits at go-live stay `TODO(plan-gate)` until the cost calculations are done.

**What changed**

- Contracts: `locale.ts` (country -> currency/unit defaults via `country-to-currency`, locale-tag
  parsing, km/mi conversion, `SUPPORTED_LANGUAGES = ['en']` + `uiLanguage()` fallback, `UserLocale`
  + `PUT /me/locale` request, `detectedLocaleRequest()`); `AccountIdentity.locale`; hunts gain the
  `restore` action, `RESTORED` event and `restoredStatus()`.
- Database: migrations `..._region_and_restore` (User locale columns, `HuntEventType.RESTORED`)
  and `..._user_language`.
- API: `GET/PUT /me/locale` (detection fills an empty locale only; user choice wins); `GET /me`
  includes `locale`; `POST /hunts/:id/restore` -> DRAFT (never activated) or PAUSED, never straight
  to LIVE, clears `archivedAt` (archive time stays in history).
- Web: `verifySession()` reports the browser locale (Accept-Language) once while it is empty.
  Mobile: `SessionProvider` reports the device locale (`expo-localization`) once. Both best effort.
- api-client: `getLocale`, `updateLocale`; `transitionHunt(id, 'restore')`.
- **Migration ordering fix:** two hand-made migration folders (step 10 `auth_identity`, step 13
  `hunt_lifecycle`) were named with local time (UTC+2) and sorted after later UTC-named
  migrations, which broke replay on a fresh database. Renamed to their UTC times
  (`20261007030200_auth_identity`, `20261007033819_hunt_lifecycle`) and updated the local
  `_prisma_migrations` rows; `migrate dev`'s shadow replay now passes. Anyone who already applied
  them under the old names must update those two rows the same way.

**What works (verified)**

- `pnpm build` 11/11, `pnpm typecheck` 17/17, `pnpm lint` 17/17; tests: contracts 31, api 72 +
  e2e 36 + integration 5 (real Postgres: restore paths + events, locale detection/override rules),
  api-client 10, others unchanged.
- Live: web request with `Accept-Language: zu-ZA` stored ZA / ZAR / km / zu (detected) for the
  dev user; reset afterwards so the real browser's locale is detected next.


### Step 13 - Hunt CRUD + lifecycle

**What was added**

- Lifecycle: `DRAFT -> LIVE <-> PAUSED`, `DRAFT|LIVE|PAUSED -> ARCHIVED` (server-enforced; invalid
  moves 409). Endpoints (current user only; another user's hunt = 404):
  `GET/POST /hunts`, `GET/PATCH /hunts/:id`, `GET /hunts/:id/events`,
  `POST /hunts/:id/{activate,pause,resume,archive}`. **No DELETE** - archived hunts are kept,
  read-only and hidden from the default list (`?status=ARCHIVED` shows them).
- Fields (contract `hunts.ts` -> explicit columns; unused `criteria` JSON dropped): `query`
  (product / natural language), optional `name` (defaults to the query), `marketplaces` (>= 1),
  `location` {text, radiusKm 1-500} where relevant, `conditions` (new/used/refurbished; empty =
  any), `maxPrice` (money), optional `target` (dollar `profit` OR `margin` %), `priority`
  (`NORMAL` only for MVP), `exclusions` (<= 20), timestamps `createdAt`, `updatedAt`,
  `lastEditedAt`, `activatedAt` (first live), `pausedAt`, `archivedAt`.
- Meaningful-criteria validation (shared in contracts, used by client and server): query 2-200
  chars with letters/digits; unique marketplaces; positive amounts; one currency for max price and
  profit target; unique exclusions; an exclusion may not be a word of the query. PATCH merges with
  the stored hunt and re-validates the whole result.
- Going live (activate / resume, and edits to a LIVE hunt): Facebook Marketplace requires a
  location (local pickup). `TODO(product)` confirm; `TODO(plan-gate)` entitlement checks at
  activation (Blueprint sections 6, 14).
- History: new `HuntEvent` table (CREATED, EDITED with field-level before/after, ACTIVATED,
  PAUSED, RESUMED, ARCHIVED; actor + from/to status), written in the same transaction as each
  change. Edits keep the hunt id; removing a marketplace disables the `HuntMarketplace` row instead
  of deleting it. Status changes are guarded against concurrent updates.
- Database: migration `..._hunt_lifecycle` (HuntStatus DRAFT/LIVE/PAUSED/ARCHIVED, HuntPriority,
  HuntEventType, hunt criteria + lifecycle columns, HuntEvent, HuntMarketplace.updatedAt).
  Generated with `migrate diff`; the generated SQL had an ordering bug (altered HuntEvent columns
  before the table existed) - fixed by hand, applied with `migrate deploy`, and `migrate diff`
  confirms no drift. No hunt rows existed, so the enum change lost nothing.
- Pagination: newest first, cursor = last id (UUIDv7 is time-ordered).
- api-client: `createHunt` (input type with defaults), `transitionHunt(id, action)`,
  `listHuntEvents(id)`.
- New real-database integration suite: `pnpm --filter api test:int` (`test/*.int-spec.ts`,
  separate from `pnpm test`; uses a throwaway user and deletes it).

**What works (verified)**

- `pnpm build` 11/11, `pnpm typecheck` 17/17, `pnpm lint` 17/17; tests: api 72 + e2e 36 (+10
  hunts HTTP: auth, 7 validation cases, bad id, no DELETE) + **integration 3 against Docker
  Postgres** (full lifecycle incl. not-ready 409, edit keeps id, marketplace disabled not deleted,
  live edit guard, archive read-only + hidden, 6-event history, cursor paging, cross-user 404);
  contracts 24, api-client 10. Integration cleanup verified (0 leftover rows). The running API
  serves `GET /hunts`.

**Open decisions** _(updated in step 14)_

- Location for local marketplaces is free text until Azure Maps geocoding is implemented
  (decision 0001); radius stored in km and displayed in the user's unit (decision 0002).
- ~~Archived hunts cannot be restored~~ - restore added in step 14.


### Step 12 - "Are you a reseller?" gate before the Seller Snapshot

**Product decision (user, 2026-10-07):** ask "Are you a reseller?" before the five Seller
Snapshot questions. Yes -> the five questions. No -> "coming soon" (non-reseller experience not
designed yet - `TODO(product)`). **Deliberate deviation** from App Flow Blueprint section 1
("maximum five questions"): resellers now see six onboarding screens. The profile itself still has
exactly five questions; the gate is not one of them.

**What changed**

- Contracts: `isReseller` (PATCH, boolean) + `RESELLER_INTENT_COPY` (question, yes/no labels,
  coming-soon title/body), response gains `isReseller` and server-derived `status`
  (`not_started` | `not_reseller` | `in_progress` | `complete`), `sellerSnapshotStatus()`.
- Database: migration `..._reseller_gate` adds `SellerProfile.isReseller` (nullable boolean).
- API rules: the five answers require `isReseller = true` (stored or in the same PATCH) - else
  409 CONFLICT; PUT (all five) records `isReseller: true`; "complete" requires a reseller with all
  five answers; answering "no" keeps earlier answers so switching back restores them.

**What works (verified)**

- `pnpm build` 11/11, `pnpm typecheck` 17/17, `pnpm lint` 17/17; tests: api 67 + e2e 26,
  contracts 19, api-client 9, others unchanged.
- Live (running API + Postgres): not_started -> "no" = not_reseller -> profile answer 409 ->
  "yes" + Q1 = in_progress -> PUT all five = complete. Dev user reset to not_started afterwards.


### Step 11 - Seller Snapshot persistence + API

**What was added**

- API (`apps/api/src/modules/seller-profile/`), current user only (`@CurrentUser()`):
  - `GET /me/seller-snapshot` - answers so far; empty snapshot if no profile (no write).
  - `PATCH /me/seller-snapshot` - save any subset of the five answers (progressive onboarding);
    creates the profile on first save.
  - `PUT /me/seller-snapshot` - save all five at once (all required; "Other" text optional).
  - Rules: deal rule rewrites all deal columns (non-applicable targets null); deselecting
    "Other" clears its text; `completedAt` stamped in a transaction when all five are first
    answered and kept on later edits; stored values that are no longer valid options are read
    as unanswered (Q4 options are an open decision).
  - Mapper (`seller-snapshot.mapper.ts`) is pure; service uses an interactive transaction.
- Contracts: `saveSellerSnapshotRequestSchema` (PUT); shared "Other" text rule for PATCH and PUT.
  No geography in the profile - location/radius stay with Hunts (asserted by a test; unknown body
  fields such as `location` are stripped).
- api-client: `saveSellerSnapshot()` (PUT); `PUT` method support.
- `createZodDto` now stores the schema under a plain `zodSchema` static (a symbol key broke
  declaration emit with TS4020 once DTOs were declared in feature modules).

**What works (verified)**

- `pnpm build` 11/11, `pnpm typecheck` 17/17, `pnpm lint` 17/17; tests: api 62 (+mapper 7,
  +service 4), api e2e 24 (+12 Seller Snapshot: 401, empty GET, progressive PATCH to completion,
  PUT, six 400 validation cases, incomplete PUT, location stripped), contracts 16, others unchanged.
- Live against the running API + Docker Postgres: GET empty -> 4 PATCHes -> `completedAt` set on
  the fifth answer; invalid margin target -> 400; DB columns verified with psql. The dev user's
  answers were reset to empty afterwards so onboarding starts fresh.


### Step 10 - Auth boundary + DEVELOPMENT-ONLY auth

**What was added**

- Contracts: `AUTH_PROVIDER_IDS` (`['dev']` only - managed provider not chosen),
  `DEV_AUTH_HEADER` (`x-dev-auth-subject`), `DEV_AUTH_SUBJECT`, `DEV_AUTH_USER_EMAIL`.
- Database: migration `..._auth_identity` adds `User.authProvider` + `User.authSubject`
  (unique pair) - how any provider maps its identity to a Rein Drop user. Created with
  `prisma migrate diff` + `migrate deploy` (migrate dev cannot confirm the unique-index prompt
  non-interactively). Seed creates `dev@reindrop.local` (+ SellerProfile) outside production only.
- API (`apps/api/src/auth`): `AuthProvider` interface, `AuthService`, global `AuthGuard`
  (APP_GUARD; protected by default), `@Public()`, `@CurrentUser()`. `DevAuthProvider`: no
  passwords (header names the seeded user), loopback/private-network clients only (403 otherwise),
  401 for missing/unknown subject ("run pnpm db:seed"), 503 when the DB is down. `/health` and
  `/ready` are `@Public()`. First protected endpoint: `GET /me` (users module).
- Production prevention (layered): API config requires `AUTH_PROVIDER` in production and rejects
  `dev` (startup exits 1); `DevAuthProvider` constructor throws under production; web provider
  refuses `dev` when `NODE_ENV=production`; mobile dev provider only exists when `__DEV__`.
- Web: `src/auth` boundary (`WebAuthProvider`, dev provider, `verifySession()` DAL with React
  `cache`, `getServerApiClient()`), `<Protected>` on every app page (Suspense + request-time
  check, per the Next 16 auth + Cache Components guides), optimistic `src/proxy.ts`, placeholder
  `/sign-in` explaining why sign-in is unavailable, `(app)/error.tsx` with retry, shell account
  area streamed behind Suspense. `server-only` added. Web-local `.prettierrc` (double quotes).
- Mobile: `src/auth` boundary (`MobileAuthProvider`, dev provider), `SessionProvider` (GET /me),
  `SessionGate` (loading / not signed in / can't reach API, with Try again + Open Settings) on the
  tabs and the Create Hunt modal; `getApiClient()` sends the provider's headers; Settings shows
  session state.
- Old placeholder sessions (web + mobile) removed.

**What works (verified)**

- `pnpm build` 11/11, `pnpm typecheck` 17/17, `pnpm lint` 17/17; tests: api 51 (+auth/config)
  + e2e 12 (public routes, 401 without/unknown subject, 200 as seeded user, 404 when
  authenticated), contracts 13, api-client 9, web 6, mobile 7, design-tokens 11, worker 3.
- Live: API with `NODE_ENV=production AUTH_PROVIDER=dev` refuses to start (exit 1).
  Running API: `/ready` 200 without credentials; `/me` 401 without, 200 with the dev subject from
  localhost and from the LAN IP. Web dev server: `/home` and `/settings` show the seeded user from
  `GET /me`. Web production build: `/home`, `/settings` -> 307 `/sign-in`, which explains the
  reason for both "AUTH_PROVIDER unset" and "AUTH_PROVIDER=dev".
- **Not verified live:** the web error page when the API is down (the user's API was running and
  was not stopped), and the mobile app on a device.

**Known limitations**

- `pnpm --filter web start` (production mode) cannot sign in - intended until a managed provider
  exists. Use `pnpm --filter web dev` locally.
- No sign-out (nothing to sign out of in development).


### Step 9 - Expo app shell (native navigation) + device-friendly API URL

**What was added**

- Expo Router (SDK 57, versions via `expo install`; structure checked against the official SDK 57
  tabs template). Entry `expo-router/entry`, routes in `apps/mobile/src/app/`, scheme
  `reindrop`, `@/*` -> `src/*` alias. Old `App.tsx`/`index.ts` removed.
  - Root native **Stack**: `(tabs)`, `settings` (push), `hunts/new` (**modal**), `dev` (gallery).
  - Native **bottom tabs**: Home, Hunts, central **Create** (custom orange button that opens the
    Create Hunt modal over the current tab; not a destination), Deals, Analytics. **Settings** =
    gear button in every tab's native header (Screenbook section 1).
  - Platform-native icons via `expo-symbols` (SF Symbols on iOS, Material Symbols on Android).
  - Styled from design tokens (white canvas, navy active tint, muted inactive, Inter labels and
    header titles). Splash held until fonts load; system-font fallback if Inter fails.
  - Placeholder screens mirror web (PlaceholderNotice, empty states with next actions; welcome
    mascot on Home only). Placeholder session mirrors web (`src/auth/session.ts`).
  - `Screen` no longer adds safe-area padding (native header/tab bar own insets) and no longer
    renders a title (native header does).
- API base URL (`src/config/api-base-url.ts`, pure + 7 tests; `src/config/api.ts` runtime):
  1. `EXPO_PUBLIC_API_BASE_URL` if set; 2. in development, the Metro dev server host from Expo's
  `hostUri` + `EXPO_PUBLIC_API_PORT` (default 4000) - a physical phone gets the PC's LAN IP
  automatically; tunnel hosts rejected with an explanation; 3. otherwise "not configured".
  Settings > Developer shows the URL, its source, and a "Check connection" (health + ready) button.
- Vitest added to mobile.

**What works (verified)**

- mobile typecheck, lint, 7 tests, iOS + Android bundles; `expo-doctor` 21/21 checks passed.
  Full repo: typecheck 17/17, lint 17/17, all test suites pass.
- `expo start --lan`: manifest requested via the LAN IP reports `hostUri` `192.168.0.200:8091`
  -> app resolves `http://192.168.0.200:4000`; the API answered `/health` on that LAN address.
  Network profile is Private and Node.js is allowed through Windows Firewall.
- **Not yet run on a physical device or emulator** - needs the user with Expo Go.

**Known limitations**

- Splash and app icon still use Expo's default images (brand icon awaits store approval).
- Bottom-tab active state uses the platform tint (navy); no orange indicator bar as on web.


### Step 8 - Seller Snapshot corrected to the App Flow Blueprint definition

**What changed**

- Contracts:
  - Step 5's dashboard counts renamed **`HomeSummary`** (`GET /me/home-summary`; returning-user
    home, Blueprint section 8). Same fields as before.
  - New **`SellerSnapshot`** = the five progressive onboarding answers (Blueprint section 4):
    Q1 `categories` (multi, + `categoriesOther`), Q2 `stage`, Q3 `sources` (multi, +
    `sourcesOther`), Q4 `dealRule` (criterion + optional target: money for min profit / max buy
    price, whole percent for min margin, none otherwise), Q5 `improvementGoal`. `completedAt`
    is set by the server when all five are answered.
  - `PATCH /me/seller-snapshot` saves any subset of answers (resumable onboarding); "Other" text
    only accepted when Other is selected; multi-selects need >= 1 unique option.
  - Shared option keys, Blueprint wording (`SELLER_SNAPSHOT_COPY`) and
    `answeredQuestionCount()` for "n of 5" progress - web and mobile use these, nothing duplicated.
- Database: migration `20261007024615_seller_snapshot` adds Seller Snapshot columns to
  `SellerProfile` (additive, nullable / empty-array defaults). Answer columns are text, not DB
  enums: option lists are product copy and Q4 is an open decision (Blueprint section 22).
- api-client: `getSellerSnapshot()` (now `/me/seller-snapshot`), new `updateSellerSnapshot()`,
  new `getHomeSummary()`.

**What works (verified)**

- `pnpm build` 11/11, `pnpm typecheck` 17/17, `pnpm lint` 17/17; tests: contracts 13 (+7 Seller
  Snapshot), api-client 9, api 25 + e2e 8, web 6, design-tokens 11, worker 3.
- Migration applied to the local Docker DB; `pnpm db:status` up to date (2 migrations).

**Not done (by design)**

- No API endpoints or onboarding screens yet - next steps.


### Step 7 - Authenticated web shell (placeholder auth)

**What was added**

- Placeholder auth: `apps/web/src/auth/session.ts` - `getSession()` always returns a fixed local
  user (`dev@reindrop.local`, typed with the shared `AccountIdentity` contract,
  `isPlaceholder: true`). The UI shows a "Placeholder session" badge; Sign out is disabled.
  `TODO(auth)`: real session + redirect signed-out users to sign-in.
- Routes: `(app)` route group with the shell layout - `/home`, `/hunts`, `/hunts/new`
  (Create Hunt), `/deals`, `/analytics`, `/settings`, each with intentional placeholder content
  marked by a "Placeholder screen" banner and empty states that always offer a next action.
  `/` redirects to `/home`. Developer pages moved out of the shell: `/dev` (system status, was
  `/`) and `/dev/ui`.
- Shell (`apps/web/src/components/shell/`), one nav config (`nav.ts`) for every layout:
  - >= 768px: left sidebar (wordmark, persistent orange **Create Hunt**, Home, Hunts, Deals,
    Analytics, Settings) + top bar (placeholder-session badge, avatar, email).
  - < 768px: top bar (wordmark + Settings) + fixed bottom nav: Home, Hunts, central **+ Create**,
    Deals, Analytics (Mobile UI Screenbook sections 1 and 11). Safe-area insets respected.
  - Active state: `aria-current="page"`; sidebar = Sky Wash + navy + orange marker; bottom nav =
    orange bar + bold label; Create = navy focus-style ring. `/hunts/new` activates Create, not Hunts.
  - Accessibility: skip link, single `<main id="main-content">`, labelled `nav` landmarks (only one
    visible/in the a11y tree at a time), text labels on every icon, 48px targets, focus-visible
    outlines, per-page `<title>` (`%s · Rein Drop`) for route announcements.
- UI: `ButtonLink` primitive; `Page` no longer renders `<main>` (layouts own the landmark).
- Icons: `lucide-react` (generic UI icons). Vitest added to web.

**What works (verified)**

- web build (10 routes), typecheck, lint; `pnpm typecheck`/`pnpm lint` 17/17; tests: web 6
  (active-route logic, every destination reachable on both layouts), plus existing suites.
- Served build: `/` -> 307 `/home`; every destination 200 with one `<main>`, one `<h1>`, skip
  link, correct title, and `aria-current` on exactly the matching links.
- Screenshots (headless Edge): desktop 1280px and phone 390px (via iframe - headless windows
  have a minimum width) show the correct layout and active states.

**Known limitations**

- Mobile web has no "More"/drawer: Settings is reachable via the top-bar icon only (matches the
  Screenbook's 5-slot bottom nav).
- ~~The native mobile app (Expo) does not have this navigation yet.~~ Done in step 9.


### Step 6 - Design tokens, brand assets, web + mobile UI primitives

**Inputs:** Brand Identity v2.1, App Flow Blueprint v1.0 (shared by the user), plus from the
user's `Downloads/ReinDrop` kit: Mascot Usage Guide v1.0, Mobile UI Screenbook v1.0 (component
variants), Mascot Branding Kit (wash colours), and the production asset files.

**What was added**

- `@rein-drop/design-tokens` rewritten: brand palette (incl. Sky Wash, Loss Red), washes (Soft
  Orange `#FFF0E8`, Soft Yellow `#FFF8D9` from the branding kit; green/red washes derived),
  navy-derived neutrals (brand defines no greys), semantic tones + roles, Inter typography
  (weights per brand doc), spacing/radius/touch target (engineering defaults, marked), component
  variant types (Screenbook section 10), mascot tokens (Usage Guide section 10), `cssVariables()`.
  Contrast-driven choices: navy text on orange buttons; destructive = red wash + red border +
  navy text. 11 tests enforce palette and AA contrast.
- `packages/brand-assets/`: 11 production files from `Downloads/ReinDrop/branding assets`,
  renamed semantically (logo/, app-icon/, mascot/) with README (source->file table, usage,
  how to add). Concept sheets copied to `docs/brand/reference/` (not production). Brand Identity
  v2.1 (pdf/docx) and Mascot Usage Guide copied to `docs/brand/`.
  Mapped mascot tokens: `welcome` (wave), `confirmed` (thumbs-up), `inventory` (holding box);
  the other 9 tokens are `null` (render nothing) until assets are approved.
- Web primitives (`apps/web/src/components/ui`, CSS Modules on `--rd-*` variables): Button,
  TextInput (text/email/password with show-hide/money/search, hint, error), Card, Badge,
  Metric (profit/loss/estimated/comparison), EmptyState (optional mascot token), SystemBanner,
  Page, LoadingState/Spinner. Inter via `@fontsource-variable/inter` (self-hosted). Wordmark
  component. Home page uses them; gallery at `/dev/ui`.
- Mobile primitives (`apps/mobile/src/ui`, StyleSheet): same set with `Screen` instead of Page;
  Inter via `@expo-google-fonts/inter` (5 weights only) with system-font fallback;
  `react-native-safe-area-context`. App.tsx shows API status + a primitives gallery.

**What works (verified)**

- `pnpm build` 11/11 (web routes `/`, `/dev/ui`; mobile iOS + Android bundles with 5 PNG + 5 TTF
  assets), `pnpm typecheck` 17/17, `pnpm lint` 17/17, tests: design-tokens 11, contracts 6,
  api-client 8, api 25, worker 3.
- Built web served: `/` and `/dev/ui` 200; wordmark and mascot images served through Next image
  optimization (mascot 34 KB at 384 px).
- **Not yet viewed on a device/emulator or in a browser by a human** - layout/visual polish needs
  your eyes (`pnpm --filter web dev` -> /dev/ui, `pnpm --filter mobile start`).

**Divergence found (from App Flow Blueprint)** - _resolved in step 8._

- The Blueprint defines Seller Snapshot as the 5-question onboarding profile; step 5 had used
  the name for dashboard counts.


### Step 5 - Shared contracts (zod) + typed API client

**What was added**

- `@rein-drop/contracts` is now zod schemas with inferred types (was plain interfaces), split
  per flow:
  - `common`: uuid ids, ISO timestamps, money (integer minor units + ISO-4217), marketplace key
    (from marketplace-core), cursor pagination (`limit` 1-100, default 20; `{ items, nextCursor }`).
  - `account`: `AccountIdentity` (`GET /me`) - **placeholder** until the auth provider is chosen
    (userId, email, displayName only).
  - _(Superseded in step 8: renamed `HomeSummary`, `GET /me/home-summary`.)_
    `seller-snapshot`: `SellerSnapshot` (`GET /me/snapshot`) - dashboard counts derivable from
    existing tables (activeHunts, newMatches, savedDeals, inventoryOnHand = IN_STOCK + LISTED).
    Decided with the user: dashboard summary; profit/revenue metrics TODO.
  - `hunts`: create (name, query, marketplaces; trimmed, length-limited, unique marketplaces),
    update (partial, at least one field, can change status), read, list query (status filter).
    Hunt criteria intentionally omitted (TODO).
  - `listings`: `ListingSummary` / `ListingDetail` - only cross-marketplace fields.
  - `deals`: a deal = HuntMatch + listing + latest analysis (`id` = HuntMatch id).
    `DealSummary` / `DealDetail`; `analysis.result` is opaque (`unknown`) until the AIProvider
    output is defined. List query: huntId, matchStatus.
  - `errors` / `health`: existing contracts converted to schemas.
- `@rein-drop/api-client`: typed methods for all of the above; validates request bodies/queries
  client-side (server-identical error details), validates responses against the contract,
  `getHeaders` hook as the auth placeholder. Only throws `ApiError`.
- api: `contracts-enums.spec.ts` fails if contract enums drift from Prisma enums.
- Vitest added to contracts and api-client; spec files excluded from `dist` but typechecked
  (`tsconfig.spec.json`).

**What works (verified)**

- `pnpm build` 11/11 (mobile bundle includes zod), `pnpm typecheck` 17/17, `pnpm lint` 17/17.
- Tests: contracts 6, api-client 8 (fake fetch: validation, query serialization, error
  mapping, contract mismatch, 503 readiness, network failure), api 25 + e2e 8, worker 3.
- One zod 4 copy for all our code (zod 3 exists only inside Expo's CLI tooling).

**Not done (by design)**

- No API endpoints for `/me`, `/me/snapshot`, `/hunts`, `/deals` yet - the client methods will get
  `404 NOT_FOUND` until the modules implement them.


### Step 4 - API domain modules + cross-cutting concerns

**What was added**

- 14 domain module scaffolds in `apps/api/src/modules/` (registered via `DOMAIN_MODULES`):
  users (User), seller-profile (SellerProfile), hunts (Hunt, HuntMarketplace), marketplaces
  (Marketplace + adapter boundary), listings (RawListing, Listing), matching (HuntMatch),
  deal-intelligence (DealAnalysis, via AIProvider), deals (SavedDeal), outcomes (InventoryItem,
  Sale, Cost), analytics (no tables, read-only), plans (Plan, Entitlement), billing
  (Subscription), notifications (Alert), usage (UsageEvent). Empty on purpose - no controllers,
  services or endpoints yet; header comments record ownership and TODOs.
- Global validation: `createZodDto(schema)` + global `ZodValidationPipe` (zod, consistent with
  env config; unknown keys stripped; errors -> `VALIDATION_FAILED` with per-field `details`).
- Consistent error shape: `ApiErrorBody` + `API_ERROR_CODES` in `@rein-drop/contracts`; global
  `AllExceptionsFilter` maps AppException, Nest HttpExceptions, Prisma P2002 -> 409 / P2025 -> 404,
  malformed JSON / oversized body, and hides unexpected errors as `500 INTERNAL_ERROR`.
  `AppException(code, message, status, details?)` for module code.
- Request logging middleware with request id (`x-request-id`: reused if safe, else UUID; echoed
  in the response and in error bodies). Logs path only (no query strings).
- `GET /health` is now pure liveness (no DB). New `GET /ready`: readiness with DB check,
  200 `ready` / 503 `not_ready`. (Changed from step 3, where /health carried the DB status.)
- api-client: parses `ApiErrorBody` into `ApiError` (`code`, `details`, `requestId`); new
  `getReadiness()` (resolves on 503). Web status page shows liveness + readiness.

**What works (verified)**

- `pnpm build` 11/11, `pnpm typecheck` 17/17, `pnpm lint` 17/17.
- api unit tests 20 (filter mapping, validation pipe, request id, health/ready); api e2e 8
  (health, request-id echo, ready 503 without DB, 404 shape, valid/invalid body, malformed
  JSON, 500 without leaking). Worker 3.
- Built API against Docker Postgres (port 5433): all 14 modules load, `/ready` -> 200 ready,
  unknown route -> standard 404 body, one log line per request with request id.


### Step 3 - Prisma data layer + initial schema

**What was added**

- `packages/db` (`@rein-drop/db`, server-only): Prisma **7.10** (latest stable; the npm `latest`
  tag of the `prisma` CLI points at 8.0.0-rc, deliberately not used). `prisma-client` generator
  (ESM) into `src/generated/prisma` (gitignored, regenerated by build/typecheck), node-postgres
  driver adapter, `createPrismaClient(url)`. `prisma.config.ts` reads `DATABASE_URL` from
  `packages/db/.env` or falls back to the shared local default from `@rein-drop/env`.
- Schema (`prisma/schema.prisma`) - 18 models, 10 enums: User, SellerProfile, Marketplace,
  RawListing, Listing, Hunt, HuntMarketplace, HuntMatch, DealAnalysis, Alert, SavedDeal,
  InventoryItem (doubles as the purchase record), Sale, Cost, Plan, Entitlement, Subscription,
  UsageEvent. Conventions: UUIDv7 ids (`uuid` type), money as integer minor units + `char(3)`
  currency, `timestamptz(3)`.
  - RawListing (append-only source snapshots, verbatim `payload` JSON, processing status) is
    separate from Listing (normalized, unique per marketplace + externalId) and from HuntMatch
    (hunt <-> listing, user-facing status).
  - No marketplace-specific columns on Listing: source data stays in `RawListing.payload` and
    `Listing.sourceMetadata`. Marketplaces are rows (`key` = `MarketplaceId`), not an enum.
  - Enums only for lifecycle/status: HuntStatus, RawListingStatus, ListingStatus,
    HuntMatchStatus, DealAnalysisStatus, AlertChannel, AlertStatus, InventoryStatus,
    CostCategory, SubscriptionStatus.
  - Pending product decisions kept as `Json`/TODO rather than invented columns: Hunt.criteria,
    DealAnalysis.result, SellerProfile preferences, entitlement keys/limits, plan prices,
    billing provider, auth provider link, normalized condition/location, quantity/lots.
- Migration `20261007013930_init`. Seed (`prisma/seed.ts`, idempotent upserts): marketplaces
  `ebay` / `facebook`; development plans `dev-free` / `dev-pro` (`isDevelopmentOnly`, no prices
  or entitlements; skipped when `NODE_ENV=production`).
- Root scripts: `db:generate`, `db:migrate`, `db:deploy`, `db:status`, `db:seed`, `db:reset`,
  `db:studio` (port 5555).
- api: global `DatabaseModule` (`PRISMA` token, lazy connect, disconnect on shutdown).
  `GET /health` now returns `database: "up" | "down"` and `status: "ok" | "degraded"` - still
  HTTP 200 when the DB is down. Contract updated; web page shows the DB state.
- `allowBuilds`: `@prisma/engines`, `prisma`, `esbuild` (tsx) allowed to run install scripts.

**What works (verified)**

- `pnpm build` 11/11, `pnpm typecheck` 17/17, `pnpm lint` 17/17, `pnpm test` (api 10, worker 3),
  api e2e passes.
- `prisma migrate dev` created and applied the init migration (18 tables, 10 enums, 29 FKs,
  31 indexes); `db:status` up to date; seed run twice -> exactly 2 marketplaces + 2 plans.
- `/health`: `up` with DB running -> `degraded`/`down` (HTTP 200) after `docker compose stop`
  -> `up` again after restart, without restarting the API.
- `pnpm db:studio` serves http://localhost:5555.
- All DB verification ran against Docker Postgres on **host port 5433** (5432 conflict, below).

**Commands**

```powershell
pnpm infra:up
pnpm db:migrate; pnpm db:seed; pnpm db:studio
pnpm --filter api dev     # /health shows database up/down
```


### Step 2 - Local infrastructure + typed environment config

**What was added**

- `docker-compose.yml`: PostgreSQL only (`postgres:18-alpine`), bound to `127.0.0.1`, named
  volume `rein-drop_postgres-data`, `pg_isready` healthcheck. Credentials/port overridable via
  root `.env` (`.env.example`); defaults `reindrop`/`reindrop`/`reindrop` on port 5432.
- Root scripts: `infra:up` (waits for healthy), `infra:down`, `infra:status`, `infra:logs`,
  `infra:psql`, `infra:reset` (deletes data).
- `packages/env` (`@rein-drop/env`): shared server-side helpers - `NODE_ENV` and `DATABASE_URL`
  schemas, integer/port parsing, `parseEnv` (reports every problem at once, never echoes
  `DATABASE_URL`), `EnvValidationError`, `.env` loading, URL redaction. Local default
  `DATABASE_URL` lives here once, matching docker-compose.
- api: `src/config/api-config.ts` (zod schema -> frozen typed `ApiConfig`, injected via
  `API_CONFIG`). `AppModule.forRoot(config)`. Validated before Nest starts; invalid env exits 1.
- worker: same pattern (`WorkerConfig`, `WORKER_CONFIG`, `WorkerModule.forRoot(config)`);
  heartbeat interval now comes from validated config. Vitest added to worker.
- Env vars: `NODE_ENV` (default development), `PORT` (api, default 4000), `DATABASE_URL`
  (defaults to local Docker DB outside production; required in production),
  `WORKER_HEARTBEAT_MS` (default 60000, >= 1000). `.env.example` files updated.
- Health-friendly: api/worker boot and `/health` responds with no `.env` and no DB running -
  nothing connects to the DB yet.
- README: Windows/PowerShell setup, port table, env table, troubleshooting.

**What works (verified)**

- `pnpm build` 10/10, `pnpm typecheck` 14/14, `pnpm lint` 14/14.
- `pnpm test`: api 9 tests (config + health), worker 3 tests (config); api e2e passes.
- `pnpm infra:up` -> container healthy, PostgreSQL 18.6, data in the mounted volume;
  `infra:psql` connects as `reindrop`. **Verified on host port 5433** (see known issues).
- Invalid env -> process exits 1 listing all problems; valid env -> api serves `/health` and logs
  `DATABASE_URL` with the password redacted; worker boots and heartbeats.

**Commands**

```powershell
pnpm infra:up; pnpm infra:status; pnpm infra:psql; pnpm infra:down
pnpm --filter api dev; pnpm --filter worker dev
pnpm build; pnpm typecheck; pnpm lint; pnpm test
```

### Step 1 - Monorepo initialization

pnpm workspaces + Turborepo with 4 apps and 6 packages. No business features.

**What works (verified)**

- `pnpm build` - all 9 buildable workspaces build (web `next build`, api/worker `nest build`,
  packages `tsc`, mobile `expo export` for android + ios).
- `pnpm typecheck` - 12/12 tasks pass.
- `pnpm lint` - 12/12 tasks pass (oxlint for api/worker/packages, ESLint for web/mobile).
- `pnpm test` - api unit test passes; `pnpm --filter api test:e2e` passes.
  _(Step 1 snapshot - see Step 2 for current numbers.)_
- Runtime check: `pnpm --filter api dev` serves `GET /health`; `pnpm --filter web start` renders
  "API reachable" via `@rein-drop/api-client`; `pnpm --filter worker start` boots and logs heartbeats.
- Mobile: JS bundles for android + ios build via Metro with workspace packages. **Not yet run on a
  device/emulator.**

**Resolved versions** (latest stable at time of scaffolding, via official generators / `pnpm add`)

| | |
|---|---|
| pnpm | 12.9.1 |
| Turborepo | 2.11.7 |
| Next.js / React (web) | 16.4.0 / 19.3.0 |
| Expo SDK / React Native / React (mobile) | 57 / 0.86.3 / 19.2.3 |
| NestJS (api, worker) | 12.1.x, Vitest 4 for tests |
| TypeScript | 6.0.3 (api, worker, mobile, packages); 5.9.3 in web (chosen by create-next-app) |

**Decisions made in this step**

- TypeScript pinned to `~6.0.3`, not the newer 7.0: typescript-eslint supports `<6.1` and the
  Nest CLI ships with TS 6.0.
- Shared packages are ESM (`"type": "module"`) to match the Nest 12 scaffold, which is ESM.
- Lint: oxlint (Nest 12 default) for api/worker/packages; ESLint for web (`eslint-config-next`) and
  mobile (`eslint-config-expo`). Mobile pins ESLint 9 because `eslint-plugin-react` does not
  support ESLint 10 yet.
- Worker = Nest standalone application context (DI + lifecycle, no HTTP server).
- Removed Nest's `deploy` script / `@nestjs/mau` (paid hosting; conflicts with local-first rule).
- No Tailwind in web (not requested). Styling uses `@rein-drop/design-tokens` directly for now.

**Commands**

```sh
pnpm install
pnpm build | pnpm typecheck | pnpm lint | pnpm test
pnpm --filter api dev       # :4000
pnpm --filter worker dev
pnpm --filter web dev       # :3000
pnpm --filter mobile start
```

## Known issues

- ~~Port 5432 conflict~~ **Resolved (option A):** the native Windows PostgreSQL 18 service
  (`postgresql-x64-18`) is stopped and set to Manual; Docker Postgres now runs on 5432 with the
  default config (no `.env` files needed). Restart it with `Start-Service postgresql-x64-18` only
  if needed - it will conflict with `pnpm infra:up` again.
- ~~Worker validates `DATABASE_URL` but does not use the database yet~~ **Stale since step 20** (the worker's scheduler, queue and pipeline use it).
- Mobile shows liveness only ("API reachable"); it does not call `/ready`.
- Global pipe only validates DTOs built with `createZodDto`; a handler typed with a plain class
  or interface is not validated - convention to follow when adding endpoints.
- Prisma CLI prints an "update available 7.10.0 -> 8.0.0-rc" banner; ignore until 8.0 is stable.

- `pnpm-workspace.yaml` has a `minimumReleaseAgeExclude` list that pnpm wrote itself during
  install: pnpm 12's supply-chain guard blocks very new releases, and the scaffolders picked
  versions published within the last day. The list can be removed once those versions age past the
  threshold.
- `allowBuilds` denies install scripts for `sharp` and `unrs-resolver` (both ship prebuilt
  binaries; this matches create-next-app's choice).
- Peer warnings (harmless so far): `tsconfck` (via `vite-tsconfig-paths` in api) wants TS ^5;
  web's `@types/react-dom@19.3` wants `@types/react@^19.3` but 19.2.x is installed.
- ESLint 9 shows a deprecation warning on install (ESLint 10 exists, but the React plugin isn't
  compatible yet).
- No CORS policy on the API yet (`TODO(api)` in `apps/api/src/main.ts`): web calls the API
  server-side, and native mobile is not subject to CORS.
- Git: repo initialized (branch `master`), nothing committed yet.

## TODOs carried forward

- `TODO(marketplace)`: real EbayAdapter + real FacebookDataProvider (source TBD); normalized
  condition scale on Listing.
- ~~Turbo ran build and typecheck of `@rein-drop/db` / `web` in parallel (both regenerate
  `prisma` / `.next/types`), occasionally failing on Windows~~ **Fixed in step 22** with package
  `turbo.json` files: their `typecheck` now depends on their own `build`.
- `TODO(ai)`: Foundry provider (models per task, credentials TBD); seller facts and comparable
  sales as analysis evidence (schemas currently only allow "not available").
- `TODO(worker)`: job runner / scheduler abstraction; queue choice TBD.
- `TODO(brand)`: font size scale, spacing and neutral greys are engineering defaults - confirm in
  the high-fidelity design pass.
- `TODO(assets)`: export optimized @1x/@2x/@3x mascot PNGs for mobile (originals are 1-2 MB);
  wire `app-icon-mascot.png` into `app.json` once approved for stores; SVG wordmarks if available.
- Product docs are still only on the developer machine (`Downloads/ReinDrop/`, Product Blueprint
  v0.1 in `Downloads/`) - consider copying them to `docs/product/`.

## Alignment with the product documents (reviewed 2026-10-07)

All docs re-read: App Flow Blueprint, Screenbook + screen map, Technical Architecture, Build
Prompts (01-44), Brand Identity v2.1, Mascot Usage Guide. The old Product Blueprint v0.1 is not
used (owner decision).

- Build Prompts done: 01-44 (our steps 1-47 include extra fix / reseller-gate / locale steps, so
  our numbers run ahead of the prompt numbers).
- ~~Gap - Prompt 11 skipped (Seller Snapshot onboarding UI)~~ **Built in step 23.**
- **Gap - OpenAPI:** Technical Architecture locks "REST + OpenAPI"; the API has no OpenAPI spec yet
  (the zod contracts could generate it).
- Required by the App Flow and not yet built (scheduled in later prompts): listing removed/sold ->
  match "unavailable" (needs the refresh job noted in step 21), welcome + email/password account
  screens (with managed auth, prompt 38), payment step (fake now), downgrade never deletes Hunts,
  marketplace economics/latency/cost per request (prompt 36), AI cost metadata and golden datasets.
- Confirmed in line: stack and boundaries, two launch marketplaces behind adapters with a
  replaceable Facebook provider, scheduler/queue/worker model, deterministic filters before AI,
  grounded AI outputs, server-side entitlements with placeholder plans, palette incl. soft
  orange / soft yellow / sky wash / loss red, Inter, wordmark-only logo, semantic mascot tokens with
  only approved assets.

## Next step

All Build Prompts (01-44) are done; landing-page track in progress (next: Landing 14 = step 61; Landing 05 = step 52 not sent yet). Next: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), then
[POST_MVP_BACKLOG.md](POST_MVP_BACKLOG.md) by priority.
(Await the next prompt.)
