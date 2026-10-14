# Outstanding work - the running "still to do" trail

_Last updated: 2026-10-14, after step 79 (subscriptions and entitlements: products, access states, enforcement)._

Everything that has been left open since step 1, in one place. Updated at the end of every step,
together with `docs/BUILD_STATUS.md`. Rules:

- New open items are added with the step they came from.
- Finished items are not deleted: they move to **Resolved** at the bottom with the step that did
  them, so the trail stays complete.
- "Step N" = our step numbers in BUILD_STATUS; "Prompt N" = the Vibe Coding Build Prompts document.

## 1. Decisions needed from you

These block or shape work; the code uses placeholders until you decide.

| # | Decision | Raised | Placeholder in use |
|---|---|---|---|
| D2 | Mobile store billing (App Store / Google Play) - **decided in decision 0018 (web-first billing, mobile companion; the app doesn't mention buying)**; what remains open is the store-compliance review before public release (phase E) | Step 16 | Web-only billing; mobile copy cleanup is phase B |
| D3 | Plan prices and limits (Free / Pro / Ultimate) | Step 16 | Prices: Stripe prices mapped by STRIPE_PRICE_IDS ("Price TBD" until set); placeholder limits in the seed |
| D4 | What non-resellers get after answering "no" | Step 12 | "Coming soon" screen |
| D5 | Seller Snapshot question 4 wording / options per category (Blueprint section 22) | Step 8 | Blueprint wording |
| D6 | Facebook needs a location to go live - confirm | Step 13 | Required |
| D7 | Hunt poll interval per plan / priority (cost model) | Step 20 | 15 min in development; must be set in production |
| D8 | What counts as Strong vs Exceptional; how many comparable sales are trustworthy (Blueprint section 22) | Step 24 | Exceptional = 2x target; 5 sales minimum (decision 0005) |
| D9 | Margin definition: upside / resale price, or return on cost | Step 24 | Upside / resale price |
| D10 | How old a listing may be and still alert | Step 24 | 48 hours |
| D11 | Hunts with no max price and no target: should they ever alert before resale data exists? | Step 24 | No (feed only) |
| D12 | Real eBay data source and terms; Facebook data provider | Step 18 | eBay: Browse API built (decision 0010) - confirm licence / production keyset / quota; Facebook: Apify Marketplace scraper as a DEVELOPMENT provider (docs/providers/facebook-apify.md) - scraped public pages, Meta terms restrict this; legal review needed before any production source |
| D13 | Comparable-sales / resale price source | Step 22 | None - no estimates are made |
| D14 | Push and email providers | Step 4 | None (prompts 24-25) |
| D15 | Product analytics vendor (PostHog candidate), whether user ids are pseudonymised before they leave Rein Drop, and which funnels / metrics matter | Step 4 | Product events as structured log lines (`PRODUCT_EVENTS_PROVIDER=log`, decision 0016); 13 events, no dashboards |
| D16 | Seller profile location / budget preferences | Step 3 | Not stored |
| D17 | Inventory quantity / lots | Step 3 | One row per physical item |
| D18 | Whether "Save" and "Watch" are one action; what marks a deal "Missed" (Blueprint section 22) | Docs review | Save = watch (one action, step 25); "Missed" not built |
| D19 | Feed ranking: freshness bonus size and how fast it fades | Step 25 | Up to 14 points, fading over 72 hours (never lifts a deal over a stronger band) |
| D21 | Notification defaults (push on / email off for alerts; weekly insight + marketing opt-in) | Step 27 | Decision 0006 table |
| D22 | Quiet hours, per-Hunt caps / digests, and whether a later "exceptional" score should alert again | Step 27 | None; one alert per deal, never upgraded |
| D23 | Expo / EAS account for a development build (needed to receive real pushes) | Step 28 | Expo Go + simulated development tokens |
| D24 | Home "current period" for realized profit: rolling 30 days, calendar month, or user-chosen? | Step 30 | Rolling 30 days |
| D25 | Home recommendation thresholds (3 failed checks, 24h with no deals, 20 to review with no alerts) | Step 30 | As listed |
| D20 | Ignore reasons: free text, or a fixed list of choices? | Step 25 | Optional free text (200 chars) |
| D26 | Margin % on a sale: profit / sale price (and return % = profit / cost basis) - confirm both are wanted | Step 31 | Both shown (decision 0007) |
| D27 | Multi-currency reselling (buy in USD, sell in ZAR): convert with FX, or keep "result unavailable"? | Step 31 | Unavailable, never converted |
| D28 | What counts as "missed": which strengths, and do deals you ignored count? (Blueprint section 22 also open) | Step 33 | Strong / exceptional, never bought, ignored or gone (decision 0008) |
| D29 | Hunt funnel: activity in the period (each event by its date) or a cohort of deals found in the period? | Step 33 | Activity (so "alerts bought" over 100% is hidden - step 34) |
| D36 | Grace for failed renewals: keep paid access while Stripe retries (PAST_DUE), and for how long | Step 42 | PAST_DUE keeps access until Stripe gives up (its retry settings) |
| D37 | Collect payment details before activating even Free (App Flow Blueprint "billing details")? | Step 42 | No - Free needs no card (behaviour preserved) |
| D38 | Data retention periods (jobs, raw listings, search runs, analyses, deliveries, billing events, logs) and backup RPO / RTO | Step 43 | Nothing deleted; Azure PITR planned (docs/operations/data-lifecycle.md) |
| D34 | Session length: how long a sign-in lasts (web + mobile), and whether mobile should stay signed in longer | Step 41 | 7 days absolute (AUTH_SESSION_MAX_AGE_HOURS / EXPO_PUBLIC_AUTH_SESSION_MAX_AGE_HOURS) |
| D35 | Sign-in screens: Entra's hosted (brandable) page, or fully in-app email/password forms (Entra native authentication API) | Step 41 | Hosted page |
| D33 | Which Foundry model(s) / deployment type (Standard vs provisioned) and region for each AI task, and the AI budget per analysis | Step 40 | None - set by FOUNDRY_DEPLOYMENT* in the environment |
| D32 | Which diagnostics thresholds matter (acceptable cost per Hunt per day, freshness target, noise ratio) | Step 39 | None - the report shows raw numbers only |
| D31 | Source health thresholds: slow > 5 s, down after 3 failures, cool-down 30 s doubling to 15 min, search timeout 30 s | Step 35 | As listed (decision 0009) |
| D39 | Monthly Azure budget amount and alert recipients; which database option for the beta (free-account B1MS, external PostgreSQL, or paid B1ms) | Step 45 | None - `amount` has no default; `deployPostgres=false` |
| D40 | Azure region for the beta (latency to users, data residency, price) | Step 45 | Resource group's region |
| D30 | Analytics recommendation thresholds (held 30+ days, 60% ignored with 5+ viewed, 3 missed) and their order | Step 34 | As listed (`ANALYTICS_RECOMMENDATION_RULES`) |

## 2. Not built yet (by area)

Since the MVP freeze (step 47) this section holds only what the release still needs; everything
nonessential moved to [POST_MVP_BACKLOG.md](POST_MVP_BACKLOG.md) (listed under Resolved with its
backlog id). Release order: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

### Accounts and auth
- Create the Entra External ID tenant + three app registrations (checklist in decision 0013) and run the live tenant check - step 41.
- Real sign-in not exercised end to end against a tenant (only a fake tenant in tests); mobile sign-in needs a device / development build with the registered redirect URI - step 41.

### Monitoring worker
- Production Facebook data source (D12) - the Apify provider is development-only and refused in production - step 38.
- Apify live tests are skipped until APIFY_TOKEN + FACEBOOK_APIFY_CURRENCY are set (each live run costs about USD 0.013) - step 38.
- Apify provider limits: city slug guessed from free text, no radius / price / condition push-down, no posting time (freshness = first seen), no single-listing refresh - step 38.
- Apify runs (tens of seconds, up to 300 s) can outlast the default job lease (120 s): raise WORKER_JOB_LEASE_MS when using it - step 38.
- Cost: Apify about USD 5 a day per Hunt at 20 results every 15 min - needs the cost model / cadence (D7, prompt 36) - step 38.
- eBay live tests are skipped until eBay credentials are configured (set EBAY_CLIENT_ID / EBAY_CLIENT_SECRET to run them) - step 37.
- eBay Browse quota: one page of up to 200 results per Hunt check - size it with prompt 36 - step 37.
- Measure cost / freshness / noise with a controlled window of several Hunts (and Apify / eBay credentials) to decide D7 - step 39.

### Hunt location (decision 0017 - built in step 74 on mocks; these are the TODO(geo) items)
- **Apply the step 74 migration to your development database** (`pnpm --filter @rein-drop/db db:deploy`, then restart the API) - until then the dev API returns 500 on Hunts / Settings - step 74.
- **Azure Maps (you):** create the account, set `GEOCODING_PROVIDER=azure` + `AZURE_MAPS_KEY` (Key Vault in production) for API and worker, then run a live check of suggestions, geocoding and web map tiles - the Azure provider is unit-tested with fake responses only. Confirm the exact map attribution wording - step 74.
- **Azure Maps terms on storing / caching results** (decision 0001 point 1) - the place cache and saved coordinates rely on it - before production use - step 74.
- **Google Maps key for Android (you):** Google Maps Platform key with billing, restricted to the app's package + signing certificate, as `GOOGLE_MAPS_ANDROID_API_KEY` for EAS builds (`app.config.ts`); plus an Android package name and a development build (same prerequisite as D23). Expo Go works without it; iPhone uses Apple Maps - step 74.
- Development map tiles come from OpenStreetMap's public tile server (light development use with attribution only) - production uses Azure tiles via the API, or shows no map without a key - step 74.
- The mock place list is ~70 real places (development only); places outside it aren't suggested or placed until Azure is on - step 74.
- Mobile location field, map and "Your area" not yet run on a device (typecheck + lint only) - step 74.
- Privacy: "Your area" (approximate) is new personal data - add it to the app privacy notice / retention decisions (D38) with the legal review - step 74.
- The web map is a visual aid: the pin can't be moved by keyboard (Leaflet); the location field is the accessible way to set the centre. A manual screen-reader pass of the combobox is still to do - step 74.

### Matching, analysis, scoring
- Foundry live test skipped until FOUNDRY_ENDPOINT / FOUNDRY_API_KEY / FOUNDRY_DEPLOYMENT are set; the prompts are unproven on a real model (watch INVALID_OUTPUT / UNGROUNDED_OUTPUT rates) - step 40.
- AI cost appears only with FOUNDRY_PRICE_INPUT_PER_1M_USD / FOUNDRY_PRICE_OUTPUT_PER_1M_USD from your Azure price sheet - step 40.

### Deals and alerts
- Real push on a phone: EAS project id + development build (D23) - step 28.

### Web-first billing & mobile companion (decision 0018)
- **Apply the step 76 migration to your development database** (`pnpm --filter @rein-drop/db db:deploy`, restart the API) - adds the `UNPAID` subscription status - step 76.
- Phase B done in step 77 (see Resolved) - check the new mobile Start watching screen, "Your access" card and Hunts-list message on a phone - step 77.
- `EXPO_PUBLIC_ACCOUNT_SITE` (optional "You can manage your account at {site}" line): decide after the store review whether to turn it on - step 77.
- Phone check of the step 78 navigation: four tabs, "+" Create in Hunts, bell inbox in Deals, Account tab vs signed-out /settings, notification tap -> deal, old links (/, /analytics, /create) redirecting - step 78.
- **Apply step 79 to your development database:** `pnpm --filter @rein-drop/db db:deploy` then `pnpm --filter @rein-drop/db db:seed` (product families, suspension columns, saved-Hunt limits) - step 79.
- **Billing grace policy (you):** `BILLING_GRACE_DAYS` is 0 (no grace) - decide whether failed renewals / lapsed periods get N days before paid monitoring stops (set the same value for API and worker) - step 79.
- Suspension has no admin endpoint or UI - support sets `User.accessSuspendedAt` / `accessSuspendedReason` by SQL (ACCESS_RULES.md section 2); add staff tooling with the admin role (backlog B-34) - step 79.
- Clients still use `GET /me/entitlements` (+ capabilities); move web / mobile to `GET /me/access` (per-product states, saved-Hunt usage) when Sell or the access UI needs it. During a grace period `/me/entitlements` shows the paid plan but a null subscription summary - step 79.
- Checkout refuses a second paid plan of ANY family (`currentPaid`) - when Sell is sold, allow one paid subscription per product (Source + Sell) or Complete instead - step 79.
- Phase D - product families on plans (Source active; Sell / Complete inactive), family-scoped entitlement keys, a small server-driven feature-flag mechanism - step 76.
- Phase E - app-store compliance review (Apple free companion / reader rules, Google Play payments policy, regional rules), push / deep-link re-check, launch checklist. Not an exemption claim - step 76.
- Trials and a grace policy beyond Stripe's retries (no fields today); analytics-history and seat limits are not enforced on the backend; web pricing page (D3) - step 76. (Web plans / billing page: done in step 80, see Resolved.)
- The access sweep runs every 5 minutes per worker and checks every owner of LIVE Hunts one by one - fine at beta scale; batch it if owners reach the thousands - step 76.

### Plans and billing
- Stripe set-up for real: products / prices, Customer Portal configuration, webhook endpoint + secret, tax settings; test-mode run with the Stripe CLI - step 42. **Full list P1-P13 in [strategy/BILLING.md](strategy/BILLING.md) section 5** (account, prices + `STRIPE_PRICE_IDS`, keys in Key Vault, webhook events, Portal plan switching / cancel at period end / proration, dunning vs `BILLING_GRACE_DAYS`, tax, trials, `WEB_APP_URL`) - step 80.
- Stripe integration not exercised against Stripe itself (tests use a fake Stripe API) - step 42.
- Scheduled reconciliation (nightly `BillingService.reconcile` for paid users) as a safety net beyond webhooks + on-demand sync - optional, not built - step 80.
- Check `/settings/billing` in a browser after Stripe test mode is configured: subscribe, return, switch plan, cancel, update payment method - step 80.

### Platform and API
- Acceptance run on a real device (mobile) and with real providers (eBay API, Apify, Foundry, Entra, Stripe) - docs/LOCAL_MVP_ACCEPTANCE.md "Configurations" - step 44.

### Security and operations (hardening pass, step 43)
- Retention jobs and backup drills (D38, docs/operations/data-lifecycle.md) - step 43.
- Dependency advisories left in build tooling: deepmerge-ts (Prisma CLI), node-forge / braces / uuid (Expo CLI, Metro), decode-uri-component (expo-router) - re-audit on upgrades - step 43.

### Azure beta (step 45, decision 0015)
- First real deployment + acceptance run on Azure (runbook docs/azure/BETA_DEPLOYMENT.md) - not done by the agent by design - step 45.
- Azure template uses PostgreSQL 17; local development uses 18 - align when creating the server - step 45.
- Facebook source not configured in the beta until D12 is decided - step 45.

### Brand and assets
- App icon + splash still Expo defaults; brand icon awaits store approval - step 9. (The web part -
  no favicon, a 404 on every page - is resolved: step 70.)

- Profit mascot shows dollar signs while currency is locale-driven (ZAR users see R) - a currency-neutral variant may be wanted - step 72.
- Mascot originals (0.7-1.9 MB each, now 14 files) are bundled as-is in the mobile app - export @1x/@2x/@3x before a store build (backlog B-25) - step 72.
- Max-price slider on a real phone (mobile, step 73): drag, tap-to-step, VoiceOver / TalkBack value, no conflict with the form's scrolling - step 73.
- Owner check of the new mascot moments on a phone (first scan, waiting, quiet hours, suggestion, cancel plan, exceptional deal, Sale Result) - step 72.

### Landing page (step 48+, docs/LANDING_BUILD_STATUS.md)
- Landing 05 (step 52, marketing primitives - not sent yet) per the scoped plan - step 48.
- **Production launch: work through [LANDING_LAUNCH_CHECKLIST.md](LANDING_LAUNCH_CHECKLIST.md)** - 8 blockers (B1 `/dev` gating, B2 legal review, B3 `CONTACT_EMAIL`, B4 retention / access, B5 how sign-ups are contacted, B6 trademark review, B7 design + mascot approval, B8 demo figures), then hosting / database / region / budget / domain decisions - step 71.
- CI workflow (`.github/workflows/ci.yml`) has not run on GitHub yet - validated locally only; the first push / PR shows whether the preview-e2e job (Chrome sandbox sysctl, Postgres service) works on the hosted runner. Then turn on branch protection ("require CI to pass") in the repository settings - step 71.
- Each environment needs its own web image (public settings are inlined at build): build the production one with `--build-arg SITE_URL=... CONTACT_EMAIL=...`; a preview image can't be promoted - step 71.
- Preview database volume `rein-drop-preview_preview-postgres-data` kept after the step 71 run (test rows only: `preview.e2e+*@example.com`, `landing.check+*@example.com`) - delete with `docker compose -f docker-compose.preview.yml down --volumes` when no longer wanted - step 71.
- Performance (step 70): Lighthouse's *simulated* mobile LCP stays ~3.1 s (its model counts ~2.6 s of 'render delay') while real-throttled runs measure 2.1 s and lab runs ~1.2 s. Confirm with field data (Chrome UX Report / real-user LCP, INP, CLS) once the site is public - the lab can't settle it - step 70.
- Remaining measured items, deliberately not changed (step 70): ~13 KB of Next.js's own modern-JS polyfills (framework chunk, no supported switch); 3 render-blocking CSS files (~15 KB; `experimental.inlineCss` would inline them but is experimental, global to the signed-in app and duplicates styles); the Google Play badge PNG is 646 px shown at 154 px (5 KB; official file served unaltered, decision L-D6). Revisit if field data says they matter - step 70.
- Demo: choosing a product is the most expensive interaction (~150 ms at 4x CPU - under the 200 ms 'good' INP line, but the closest to it) - watch it in field INP - step 70.
- **Set `SITE_URL` (the public https origin) at build time for the public launch** - it is the switch that makes the landing indexable (canonical, sitemap, robots allow-list, structured data). Leave it unset on preview / beta deployments so they stay noindex. Set it as a build environment variable of the web app (declared in `apps/web/turbo.json`) - step 69.
- Add the legal pages to the sitemap / search automatically by setting `reviewed: true` after legal review (they are noindex until then) - step 69.
- Accessibility: automated axe-core audit is clean (step 69) but ran from a scratch install; make it a committed check with the landing QA / Playwright work, and still do a manual screen-reader (NVDA / VoiceOver), 200 % zoom and real-device keyboard pass - step 69.
- Validate the structured data with the Rich Results Test / Schema Markup Validator once `SITE_URL` points at the public site - step 69.
- **Choose a production analytics provider** for the landing (none is configured, so production sends nothing): add it to `PROVIDERS` in `apps/web/src/marketing/analytics/analytics.ts` with an honest `requiresConsent` (a provider that sets cookies or identifiers needs a consent banner first - none exists), then set `NEXT_PUBLIC_LANDING_ANALYTICS_PROVIDER` at build time. Prefer cookieless; ties in with D15 (app analytics vendor). Update the privacy draft before it goes live (it says no tracking cookies and lists analytics as To be confirmed) - step 68.
- **Legal review of the privacy notice and terms drafts** (`/privacy`, `/terms`, version 2026-10-12): every "To be confirmed" point (legal entity, officer, hosting / email providers and countries, legal basis, retention, rights, liability wording, governing law). Set `reviewed: true` in `legal-drafts.ts` only after review; until then the pages show the draft banner and stay noindex. Required before collecting real emails publicly - step 67.
- The success message says "We'll be in touch by email about early access" - there is no email provider yet (D14); contact sign-ups manually or wire a provider before launch - step 67.
- Consent is an explicit, unticked checkbox (safe default before legal review) - legal review may simplify or keep it; changing the words means a new `WAITLIST_CONSENT_VERSION` - step 67.
- Waitlist rate limits are in memory (web: 5 per 10 min per visitor; API: 120 per min per caller) - fine for one instance each; several instances need a shared store (same as the API's existing limiter) - step 66.
- Web visitor IP = rightmost `X-Forwarded-For` (one trusted ingress hop). Confirm the Azure ingress appends exactly one entry; with zero or two proxy hops the limiter keys on the wrong address - step 66.
- **Apply the waitlist migration to your development database** (`20261012211858_waitlist_signup`): the database was down when it was created - `pnpm infra:up`, then `pnpm --filter @rein-drop/db db:deploy` (or `db:migrate` to also check drift). Verified on a fresh Postgres 18 in the step 71 preview; your dev database (5432) was not touched - step 65.
- Waitlist data retention / deletion on request (and who on the team may read the table) - decide before collecting real emails - step 65.
- Marketplace requests are client state only (in memory, lost on reload) and are never sent: the waitlist backend (Landing 18-20) must accept `requestedMarketplaces` (keys or `other`) and `requestedMarketplaceOther` (max 60 characters), validate keys against the radar list, and never publish totals - step 64.
- A visitor who reloads before signing up loses their picks; keep it that way or persist them once there's a privacy-reviewed reason to - owner's call - step 64.
- Demo figures (resale ranges, number of similar sales, asking prices) are made-up but plausible US used / new prices - sanity-check them before launch; they're labelled illustrative, but they shouldn't look wrong to a reseller - step 61.
- The MacBook demo product has no example photo (`photo: null`) - add a licensed photo or keep the neutral visual - step 61.
- Gate A: owner approval of the landing design (the mockup is inspiration only) - step 48.
- Marketplace marks: replace site-icon downloads with brand / press-kit files where available - especially low-resolution Craigslist (57 px), Mercari (64), Depop and Amazon (48) and the four with no file (OfferUp, Swappa, Etsy, GOAT - text fallback); trademark review before public launch (decision L-D6) - step 55.
- Store URLs once the apps are published (no iOS bundle id / Android package in `app.json` yet) - step 48.
- Landing skeleton is public at `/` once deployed - don't deploy the web app publicly until the landing is finished (or keep the beta URL private) - step 49.
- Existing web `/dev` pages (`/dev`, `/dev/ui`, `/dev/diagnostics`, `/dev/notifications`) are served by production builds - gate them like `/dev/landing` (`notFound()` in production) before any public deploy; the release checklist assumes `/dev/*` is unreachable. Re-confirmed in step 71: launch blocker B1 - step 50.
- Two landing mascot poses have no approved art (phone / alert, planning / checklist) - neutral visuals until approved; see docs/LANDING_ASSETS.md. (Thinking, searching, surprised and celebration were supplied in step 72) - step 51.
- Landing placement of the step 72 poses: thinking, magnifier and surprised are registered (`landingImages`) but **not placed** in any section. Placing them is a landing design change (layout, motion, CLS / performance checks) - send it as a landing step if wanted. Celebration stays off the landing: its numbers are illustrative - step 72.
- The landing mockup shows a deer / reindeer mascot; the approved mascot is the orange droplet - confirm which character the landing uses (only approved art is used) - step 51.
- Browser tests: the nav has a script-based headless-Chrome check (`apps/web/scripts/check-landing-nav.mjs`); move it to Playwright with the landing QA steps (Technical Decisions: Vitest + Playwright + accessibility checks) - step 53.
- Screen-reader pass of the landing navigation by a person (NVDA / VoiceOver) - step 53.
- Screen-reader pass of the interactive demo by a person (NVDA / VoiceOver): focus moves to each step's heading and the scan is announced politely - checked in Chrome's accessibility tree only - step 62.
- Scroll-linked entrances (How it works mascot, deal-intelligence card) only play in browsers with scroll-driven animations (Chrome / Edge today); elsewhere the elements are simply shown - acceptable, revisit if Safari / Firefox support lands - step 63.
- The app's `Wordmark` component (sign-in page etc.) still uses Next's deprecated `priority` prop - switch to `loading="eager"` / `fetchPriority` - step 54.
- Store URLs are read when the web app is built (static page): changing `APP_STORE_URL` / `GOOGLE_PLAY_URL` needs a rebuild / redeploy - step 54.
- Alerts section lists push + in-app only; add email to the landing copy only once an email provider exists (D14) - step 59.
- Public contact address (`CONTACT_EMAIL` in the web app's environment) - owner chose to set it later (2026-10-13). One `ContactLink` feeds the footer, both legal drafts and the form's error help; until set they show "Contact details coming soon - Needs review". Set before launch: the privacy draft points people here to remove their sign-up - step 60 / 67.
- Example product photos (Unsplash License) show Apple / Sony products and logos - include them in the pre-launch trademark review; keep the footer credits - step 60b.
- Marketing display sizes / spacing are engineering defaults - confirm at the landing high-fidelity design (Gate C) - step 50.
- Web `minReplicas: 1` at landing launch to avoid cold starts for first visitors (decision 0015 has 0) - step 48.

## 3. Built but not yet verified by a person

- **Mobile on a real device / emulator**: shell (step 9), Create Hunt (step 15), plan gate
  (step 17), onboarding (step 23), Deals feed + detail (step 26), inbox + notification settings (step 27), push permission
  prompt + tap-to-open + real Expo push (step 28), Hunts list / detail / edit (step 29), Home (step 30),
  Inventory / Mark sold / Sale result (step 32), Analytics screens (step 34). Only typecheck / lint / bundle builds have been run.
- Web error page when the API is down - step 10.
- Visual polish of the UI primitives in a browser and on a phone - step 6.

## 4. Housekeeping

- `pnpm-workspace.yaml` `minimumReleaseAgeExclude` list can be removed once those versions age.
- Peer-dependency warnings (`tsconfck` wants TS 5; `@types/react-dom` vs `@types/react`).
- Prisma 8 is an RC - stay on 7.10 until stable.
- Product documents live only in `Downloads/ReinDrop/` - consider copying them into `docs/product/`.
- Anyone who applied the step 10 / 13 migrations under their old names must rename the two
  `_prisma_migrations` rows (step 14).

## 5. Remaining Build Prompts (planned)

None - Build Prompts 01-44 are done. Next: the release checklist, then the backlog by priority.

## Resolved

| Item | Raised | Resolved |
|---|---|---|
| Seller Snapshot meant dashboard counts instead of the 5 onboarding questions | Step 5 | Step 8 |
| No API for `/me`, Seller Snapshot, Hunts | Step 5 | Steps 10-13 |
| Native mobile app had no navigation | Step 7 | Step 9 |
| Archived hunts couldn't be restored | Step 13 | Step 14 |
| Migration folders named in local time broke fresh-database replay | Step 13 | Step 14 |
| Plan-gate / payment UI missing; Start watching disabled | Steps 15-16 | Step 17 (development checkout) |
| Expo Go "status 500" (missing `@expo/metro-runtime`) | Step 17 | Fix after step 17 |
| Port 5432 conflict with the Windows PostgreSQL service | Step 2 | Known issues (service set to Manual) |
| RawListing had no `provider` column | Step 18 | Step 20 |
| Nothing called the marketplace sources; no ingestion | Steps 18-19 | Step 20 |
| Hunt matching missing | Step 20 | Step 21 |
| Turbo build / typecheck race on db and web | Step 21 | Step 22 |
| Onboarding screens (reseller gate + 5 questions) missing - Build Prompt 11 skipped | Step 15 | Step 23 |
| Nothing ran AI analyses after matching | Step 22 | Step 24 |
| No scoring / alert eligibility | Step 22 | Step 24 |
| Deals API: ranked feed, filters, detail, Save / Ignore / Bought | Step 5 | Step 25 |
| Deal analysis was opaque in the contract (`analysis.result: unknown`) | Steps 5, 22 | Step 25 |
| Stale "TODO(product): matching rules" comment in the API matching module | Step 21 | Step 25 |
| Deals feed + Deal Detail screens (web + mobile) | Step 5 | Step 26 |
| Alerts: preferences, one alert per eligible deal, deliveries, simulator, inbox | Step 24 | Step 27 |
| Expo push: PushProvider, device tokens, permission after first live Hunt | Step 27 | Step 28 |
| Stale "monitoring engine isn't built yet" note on the live screens | Step 17 | Step 28 |
| Hunt detail / edit / pause / archive / restore screens | Steps 15, 17 | Step 29 |
| Home dashboard with real data, in Blueprint priority order | Step 5 | Step 30 |
| Worker could overwrite a user's decision made while a search was running | Step 25 (found) | Step 25 |
| Bought -> Inventory -> Sold backend: purchase costs, holding, Mark Sold, realized P/L, expected vs actual | Step 5 | Step 31 |
| Edit a purchase made with Bought (price, date, costs) | Step 25 | Step 31 |
| Home: sales couldn't be recorded, so realized profit stayed empty | Step 30 | Step 31 (API), step 32 (screens) |
| Inventory and sale screens (Inventory, Mark sold, Sale result) on web + mobile | Step 5 | Step 32 |
| Bought form said "Sale and profit tracking come later" | Step 26 | Step 32 |
| Analytics placeholder said purchases and sales couldn't be logged | Step 5 | Step 32 |
| Analytics backend: period overview, Hunt funnel, products, marketplaces, missed potential (SQL aggregates) | Step 5 | Step 33 |
| Analytics module was a scaffold with "TODO(product): metrics to report" | Step 5 | Step 33 |
| Analytics screens: overview, Hunt funnel, products + loss review, missed potential, one recommendation | Step 5 | Step 34 |
| Analytics placeholder notice on web and mobile | Step 5 | Step 34 |
| Source health / degraded UX: MarketplaceHealth, per-source backoff, calm banners, Hunts never falsely healthy | Step 18 | Step 35 |
| Adapter `health()` was never called; slow / partial searches counted as clean successes | Step 18 | Step 35 |
| Browser check of the source banners | Step 35 | Step 36 |
| Product states: first scan, no deals yet while healthy, reduced monitoring, plan suggestion, cancellation placeholder; semantic mascot slots | Step 6 | Step 36 |
| "Working" / "waiting" / "thinking" mascot slots rendered nothing - now neutral placeholders tracked in ASSET_TODO.md (now MASCOT_ASSETS.md) | Steps 26-34 | Step 36 |
| Settings "Plan & billing" said plans weren't decided - now shows the plan and live-Hunt use | Step 16 | Step 36 |
| Deals integration test hunts could be polled by a running worker | Step 25 | Step 36 |
| Real eBay adapter (Browse API, OAuth, rate / error handling, pagination, normalization) with mock mode kept | Step 18 | Step 37 |
| Facebook development data provider (Apify) documented and implemented behind FacebookDataProvider; dev provider kept | Step 18 | Step 38 |
| Provider request / result / cost metadata not recorded - now SearchRun.sourceUsage | Docs review | Step 38 |
| Development sources had no latency simulation | Step 19 | Step 35 |
| Ingestion economics, latency and cost per request (docs review; prompt 36) | Docs review | Step 39 (`/dev/diagnostics`) |
| Worker kept only the latest request latency (MarketplaceHealth) | Step 35 | Step 39 (`SearchRun.requestLatencyMs`) |
| Foundry AIProvider (models per task, credentials) | Step 22 | Step 40 (decision 0012) |
| AI cost metadata (docs review) | Docs review | Step 40 (`costUsd` per task when pricing is configured) |
| Diagnostics AI cost always unknown | Step 39 | Step 40 (sums reported `costUsd`) |
| D1 Managed auth provider (sign-in, sign-out, accounts) | Step 7 | Step 41 (Microsoft Entra External ID, decision 0013) |
| Sign-in / create-account screens (Screenbook 02) | Step 23 | Step 41 (web /sign-in + Entra hosted page; mobile sign-in gate) |
| Sign-out (web + mobile) | Step 7 | Step 41 |
| Web production mode can't sign in until D1 | Step 10 | Step 41 |
| Web Proxy matcher missed /inventory | Step 32 | Step 41 |
| Real checkout (D2, web) - prompt 39 | Step 17 | Step 42 (Stripe, decision 0014) |
| Cancellation flow placeholder (couldn't cancel) | Step 36 | Step 42 (Stripe portal; copy now matches what happens) |
| Cancellation copy promised "you choose which stay live" (not built) and nothing enforced the Free limit after a downgrade | Step 36 | Step 42 (hunts above the limit pause automatically, copy corrected) |
| Env errors could echo malformed secret-named values (only DATABASE_URL was masked) | Step 2 | Step 42 (SECRET / TOKEN / PASSWORD / *_KEY masked) |
| CORS policy (decided: off - no browser calls the API; tested) | Step 10 | Step 43 |
| No rate limiting | Docs review | Step 43 (per-user throttling) |
| Inventory cursor accepted another user's item id | Step 31 | Step 43 |
| Money inputs larger than the database columns caused 500s | Step 13 | Step 43 |
| Missing indexes on alert / match / saved-deal / inventory / sale foreign keys and lookups | Step 43 review | Step 43 |
| mysql2 advisory (Prisma CLI) | Step 43 audit | Step 43 (override) |
| Local MVP acceptance script + one-command reset / seed (prompt 41) | Step 10 | Step 44 (docs/LOCAL_MVP_ACCEPTANCE.md, `pnpm db:reset-demo`) |
| Azure deployment (infrastructure as code, images, runbook, budget) - prompt 42 | Plan | Step 45 (decision 0015; not deployed) |
| API used `@rein-drop/marketplace-core` without declaring it (broke the production image) | Step 45 (found) | Step 45 |
| Beta telemetry: product events behind a provider abstraction - prompt 43 | Plan | Step 46 (decision 0016; log provider until D15) |
| Welcome screen (Screenbook frame 01); sign-in / create-account is the Entra hosted page (D35) | step 41 | Step 47 - moved to post-MVP backlog B-10 |
| Signed-out visitors on `/` should go to welcome / sign-in | step 10 | Step 45 smoke test: `/` -> `/home` -> sign-in; the welcome screen itself is B-10 |
| Brand the Entra hosted pages (logo, colours, copy) | step 41 | Step 47 - moved to post-MVP backlog B-10 |
| Account deletion and Entra-side email / name changes are not synced to the Rein Drop user | step 41 | Step 47 - moved to post-MVP backlog B-34 |
| Managed identity / Key Vault for the web client secret and session secret in Azure | step 41 (prompts 40 / 42) | Step 45: Key Vault references via the user-assigned managed identity (decision 0015) |
| Mobile session check only tests liveness, not `/ready` | step 2 | Step 47 - moved to post-MVP backlog B-34 |
| Non-reseller experience (D4) | step 12 | Step 47 - moved to post-MVP backlog B-12 |
| Hot Hunt (paid priority) purchase flow - deliberately not built yet (prompt 26); priority shows as Normal | step 29 | Step 47 - moved to post-MVP backlog B-02 |
| Per-period Hunt performance (counts are all-time today) | prompts 30-31 | Step 47 - moved to post-MVP backlog B-22 |
| Editing a hunt doesn't re-evaluate existing matches immediately, and a LIVE edit doesn't reset the next poll | steps 20, 21 | Step 47 - moved to post-MVP backlog B-36 |
| Geocoding with Azure Maps (decision 0001): location is free text; distance is never verified for sources that can't filter by radius | steps 13, 14, 21 | Step 47 - moved to post-MVP backlog B-20 |
| Listing refresh job (via `fetchListing`): sold / removed listings and listings filtered out by a narrowed hunt keep their matches NEW instead of becoming unavailable | step 21 | Step 47 - moved to post-MVP backlog B-36 |
| Job retention (SUCCEEDED / DEAD rows grow forever) and lease renewal | step 20 | Step 47 - moved to post-MVP backlog B-37 |
| Development listings re-age every time the worker restarts | step 20 | Step 47 - moved to post-MVP backlog B-35 |
| Diagnostics are system-wide behind "signed in" only: add a staff / admin role before running them anywhere shared | step 39 | Step 47 - moved to post-MVP backlog B-34 |
| Diagnostics aggregate live without dedicated indexes on SearchRun.startedAt / Listing.firstSeenAt / DealAnalysis.createdAt - fine locally, revisit with volume | step 39 | Step 47 - moved to post-MVP backlog B-33 |
| Relevance is lexical (synonyms only via the AI); stopwords English only | step 21 | Step 47 - moved to post-MVP backlog B-07 |
| Foundry auth is the resource key only; managed identity (Entra ID, keyless) needs @azure/identity wiring | step 40 (prompts 40 / 42) | Step 47 - moved to post-MVP backlog B-24 |
| Output that fails validation (schema / grounding) is stored as FAILED and never re-asked; consider one repair attempt | step 40 | Step 47 - moved to post-MVP backlog B-24 |
| Golden test datasets for AI quality (docs review) | step 40 | Step 47 - moved to post-MVP backlog B-24 |
| Mock AI text is English only | step 22 | Step 47 - moved to post-MVP backlog B-24 |
| Seller facts and comparable sales as AI evidence (schemas only allow "not available") | step 22 (D13) | Step 47 - moved to post-MVP backlog B-18 |
| Resale estimates / upside (needs D13); auctions are scored on their current bid | step 24 | Step 47 - moved to post-MVP backlog B-18 |
| Changing an AI prompt version alone doesn't trigger re-analysis | step 24 | Step 47 - moved to post-MVP backlog B-24 |
| Unchanged open matches are re-analysed once a day (watch cost once Foundry is used) | step 24 | Step 47 - moved to post-MVP backlog B-33 |
| "Suppress similar noise" after Ignore (Blueprint section 10): reasons are stored, not used | step 25 | Step 47 - moved to post-MVP backlog B-17 |
| Saved deals aren't specially refreshed when the source listing changes (Blueprint section 10) | step 25 | Step 47 - moved to post-MVP backlog B-17 |
| Undo a Bought entirely (delete the item, reopen the deal) | earlier | Step 47 - moved to post-MVP backlog B-17 |
| Listing images on deal cards / detail (dev image URLs are fake; real image hosts need allowlisting) | step 26 | Step 47 - moved to post-MVP backlog B-22 |
| The AI explanation doesn't receive comparables, so with an estimate it can contradict the economics ("estimated in a later step") | step 26 (with D13) | Step 47 - moved to post-MVP backlog B-18 |
| Expo push receipts (errors reported after the ticket), badge counts | step 28 | Step 47 - moved to post-MVP backlog B-16 |
| Email provider for notifications | step 27 (D14) | Step 47 - moved to post-MVP backlog B-16 |
| Operational alerts (source degraded long enough to matter) and the weekly insight are not generated | prompt 32 | Step 47 - moved to post-MVP backlog B-16 |
| Exceptional-deal mascot asset (only if approved artwork exists) | prompt 23 | Step 47 - moved to post-MVP backlog B-25 |
| Profit / success mascot asset for a realized-profit Sale Result (slot wired, shows nothing until approved art exists) | step 32 | Step 47 - moved to post-MVP backlog B-25 |
| Thinking / idea mascot asset for the analytics recommendation (slot wired, nothing yet) | step 34 | Step 47 - moved to post-MVP backlog B-25 |
| Missing mascot art (working, waiting, afterHours, suggestion, cancellation, profit, success, exceptionalDeal, analysis): neutral placeholders until approved - see docs/ASSET_TODO.md (now MASCOT_ASSETS.md) - step 36. Sale Result / exceptional-deal banner still to switch to MascotSlot. | earlier | Step 47 - moved to post-MVP backlog B-25 |
| Downgrade must never delete Hunts - docs review (holds: hunts above the limit are paused, never deleted - step 42). | earlier | Step 42: hunts above the limit are paused, never deleted (billing.int-spec) |
| Downgrade enforcement covers the live-Hunt limit only; marketplaces / priority no longer in the plan aren't enforced on running hunts | step 42 | Step 47 - moved to post-MVP backlog B-15 |
| After a downgrade the most recently started hunts are paused automatically; a "choose which stay live" screen isn't built | step 42 | Step 47 - moved to post-MVP backlog B-15 |
| Native store billing (D2) and in-app plan purchase on mobile | step 42 | Step 47 - moved to post-MVP backlog B-14 |
| Invoices / receipts and billing emails are Stripe's (Customer Portal); nothing in Rein Drop | step 42 | Step 47 - moved to post-MVP backlog B-14 |
| Failed BillingEvents aren't surfaced anywhere but logs (diagnostics / alerting) | step 42 | Step 47 - moved to post-MVP backlog B-31 |
| Returns and write-offs (statuses exist, no endpoints) | step 31 | Step 47 - moved to post-MVP backlog B-19 |
| Estimated upside doesn't subtract selling fees, so expected-vs-actual profit compares an estimate without fees to a result with fees | step 31 (with D13) | Step 47 - moved to post-MVP backlog B-18 |
| Profit-over-time chart (needs time buckets from the API) | step 34 | Step 47 - moved to post-MVP backlog B-19 |
| Home "spent" is purchase price only; Analytics "spent" includes purchase costs - align | step 33 | Step 47 - moved to post-MVP backlog B-19 |
| Analytics aggregate live on every request (no caching) - revisit with real data volumes | step 33 | Step 47 - moved to post-MVP backlog B-33 |
| Default sale / purchase day uses the rendering device's time zone; server and browser must agree until the user's time zone is known (with D24) | step 32 | Step 47 - moved to post-MVP backlog B-21 |
| Mobile date fields are typed (YYYY-MM-DD + Today / Yesterday); a native picker needs a new dependency | step 32 | Step 47 - moved to post-MVP backlog B-22 |
| OpenAPI spec (Tech Architecture locks "REST + OpenAPI") | docs review | Step 47 - moved to post-MVP backlog B-30 |
| UI translations (only English exists) | step 14 | Step 47 - moved to post-MVP backlog B-21 |
| App-store storefront country to refine mobile locale detection | step 14 | Step 47 - moved to post-MVP backlog B-21 |
| Reduced-monitoring state is a placeholder: the API always reports normal until quiet hours / plan cadence exist (D22, D7) | step 36 | Step 47 - moved to post-MVP backlog B-16 |
| Hunt-activity integration test creates LIVE hunts a running worker could poll (it asserts a null next check) | step 36 | Step 47 - moved to post-MVP backlog B-35 |
| Backoff has no jitter (fine for one local worker; add with several workers / real APIs) | step 35 | Step 47 - moved to post-MVP backlog B-33 |
| MVP freeze | prompt 44 | Step 47: docs/MVP_FREEZE.md, POST_MVP_BACKLOG.md, RELEASE_CHECKLIST.md, KNOWN_LIMITATIONS.md |
| The acceptance sequence is manual (no browser automation script) | step 44 | Step 47 - moved to post-MVP backlog B-35 |
| Rate-limit counters are in memory per API instance; several instances need a shared store (Azure Cache for Redis) | step 43 | Step 47 - moved to post-MVP backlog B-05 |
| Web CSP is a baseline (framing, plugins, base, form targets); a strict script nonce CSP needs per-request rendering (conflicts with Cache Components) | step 43 | Step 47 - moved to post-MVP backlog B-34 |
| Worker N+1 loops (match stage per pair, duplicate resolution per key, normalization per raw record, analysis enqueue per match, outbox per delivery) - batch when measured | step 43 | Step 47 - moved to post-MVP backlog B-33 |
| Deals feed ranks all of a user's matches per page; store the latest score on HuntMatch when it gets slow | step 43 | Step 47 - moved to post-MVP backlog B-33 |
| Push token re-registration moves the token to the new account (shared phones) - accepted risk, documented | step 43 | Step 47 - moved to post-MVP backlog B-34 |
| POST /hunts has no idempotency key (double submit could create two drafts) | step 43 | Step 47 - moved to post-MVP backlog B-34 |
| Dynamic success / info banners elsewhere in the web app should move to persistent live regions | step 43 | Step 47 - moved to post-MVP backlog B-22 |
| Server error logs include stacks (Prisma messages may contain query arguments) - revisit with log retention | step 43 | Step 47 - moved to post-MVP backlog B-34 |
| Hunt-activity integration test occasionally fails in the full run (a running worker can poll its LIVE hunts) | step 36/43 | Step 47 - moved to post-MVP backlog B-35 |
| Move the database to Azure Database for PostgreSQL Flexible Server (dump / restore, PITR drills with D38); the free-account B1MS ends after 12 months | step 45 | Step 47 - moved to post-MVP backlog B-31 |
| Private networking (VNet-integrated environment, private endpoints for Key Vault / PostgreSQL) instead of public access + `AllowAzureServices` | step 45 | Step 47 - moved to post-MVP backlog B-31 |
| Worker always on (exceeds the Container Apps free grant): consider a scheduled Container Apps job or KEDA-driven scaling | step 45 | Step 47 - moved to post-MVP backlog B-31 |
| CI/CD pipeline (GitHub Actions with OIDC federation, image build + push, migration job, deploy) - deployment is manual today | step 45 | Step 47 - moved to post-MVP backlog B-31 |
| Migrate image is 3.5 GB (reuses the whole build stage); a slim stage with only Prisma + migrations | step 45 | Step 47 - moved to post-MVP backlog B-31 |
| Custom domains + managed certificates for web / API (Entra redirect URIs and the Stripe webhook change with them) | step 45 | Step 47 - moved to post-MVP backlog B-31 |
| Shared rate-limit store before the API's `maxReplicas` goes above 1 (see Security and operations) | step 45 | Step 47 - moved to post-MVP backlog B-05 |
| `EXPO_ACCESS_TOKEN` (only needed with Expo enhanced push security) is not wired into the worker app - add a Key Vault secret if enabled | step 45 | Step 47 - moved to post-MVP backlog B-16 |
| Application Insights / OpenTelemetry (traces, metrics) not set up - product events are log lines only (step 46) | step 45 | Step 47 - moved to post-MVP backlog B-31 |
| Vendor ProductEventProvider (after D15): background batching, flush on shutdown, SDK auto-capture (IP / geo / person profiles) off, key from Key Vault | step 46 | Step 47 - moved to post-MVP backlog B-23 |
| Saved Log Analytics queries / a simple funnel workbook for the beta (only a KQL example exists) | step 46 | Step 47 - moved to post-MVP backlog B-23 |
| Events live 30 days in Log Analytics (0.2 GB/day cap) - export or vendor for longer analysis | step 46 | Step 47 - moved to post-MVP backlog B-23 |
| `deal_opened` relies on the apps calling `POST /deals/:id/seen` on every open | step 46 | Step 47 - moved to post-MVP backlog B-23 |
| Not instrumented: alert / push opened, pause / resume / archive, Home / Analytics views, purchase edits, undo sale - add when a question needs them | step 46 | Step 47 - moved to post-MVP backlog B-23 |
| Two concurrent first Seller Snapshot saves could both record `onboarding_started` (accepted) | step 46 | Step 47 - moved to post-MVP backlog B-23 |
| Confirm font sizes, spacing and neutral greys in the high-fidelity design pass | step 6 | Step 47 - moved to post-MVP backlog B-25 |
| Optimised @1x/@2x/@3x mascot PNGs for mobile (originals are 1-2 MB) | step 6 | Step 47 - moved to post-MVP backlog B-25 |
| SVG wordmarks, if available | step 6 | Step 47 - moved to post-MVP backlog B-25 |
| Mobile tab bar has no orange active indicator like web | step 9 | Step 47 - moved to post-MVP backlog B-25 |
| Stale comments: raw-listing.ts `provider` TODO; BUILD_STATUS "worker does not use the database" | Housekeeping | Step 47 (fixed) |
| `/` redirected everyone to `/home` (TODO(auth): signed-out visitors to welcome / sign-in) | Step 7 | Step 49 (public landing; signed-in -> /home in the Proxy) |
| Verify production image optimization (`sharp` install scripts denied) | Step 48 | Step 51 (prebuilt sharp works in the web container; pre-optimized WebP) |
| Hero deal card named the marketplace as text | Step 54 | Step 55 (official Facebook mark via MarketplaceMark) |
| Deal intelligence used a listing-photo placeholder | Step 58 | Step 60b (licensed PS5 photo, tagged "Example photo") |
| `#demo` was a temporary placeholder | Step 60 | Step 62 (interactive illustrative demo, Landing 15) |
| Landing waitlist form shown disabled until wired | Step 60 | Step 67 (live form: validation, loading / success / error / retry, consent, optional marketplace) |
| `/privacy` and `/terms` were placeholders | Step 60 | Step 67 (drafts with conspicuous "requires legal review" banner - review itself still open) |
| Form must render the honeypot off-screen and send the matching consent version | Step 66 | Step 67 (off-screen, tab-skipped, aria-hidden; `WAITLIST_CONSENT_VERSION` shared with the privacy draft) |
| Stored consent version must match the text shown | Step 65 | Step 67 (one constant for the consent words + version; privacy draft carries the same version) |
| Demo usage events not tracked | Step 62 | Step 68 (demo_started / demo_completed in the anonymous landing analytics) |
| Build-time web env vars (`CONTACT_EMAIL`, store URLs) not declared to Turborepo (strict env mode could drop them; cache shared across values) | Steps 54 / 60 (found in step 69) | Step 69 (declared in `apps/web/turbo.json`; hash verified to change) |
| Web had no favicon (`/favicon.ico` 404 on every page) | Step 32 | Step 70 (approved app icon declared via metadata `icons`) |
| Brand font never loaded on the web (CSS asked for `Inter`, the package registered `Inter Variable`) | found in step 70 | Step 70 (`next/font/local`: self-hosted, preloaded latin variable Inter + size-adjusted fallback) |
| Landing 24 (deployment options, preview, CI, live end to end, launch checklist) | Step 48 | Step 71 (docs/deploy/LANDING_DEPLOYMENT.md, docker-compose.preview.yml, .github/workflows/ci.yml, docs/LANDING_LAUNCH_CHECKLIST.md) |
| Waitlist end to end with a real database write not verified | Step 66 | Step 71 (preview: browser -> web -> API -> Postgres 18, one normalized row, duplicate = same answer + one row, honeypot stores nothing; 7/7) |
| Production web image couldn't receive build-time settings (`SITE_URL`, `CONTACT_EMAIL`, store URLs, analytics provider) - a deployed image stayed noindex with the contact placeholder | found in step 71 | Step 71 (Dockerfile build args) |
| No CI | Step 45 (backlog B-31 covers CD) | Step 71 (checks-only workflow; deploy stays manual - B-31 unchanged) |
| Missing mascot art for 9 tokens (working, waiting, afterHours, suggestion, cancellation, profit, success, exceptionalDeal, analysis) - neutral placeholders in the app | Step 36 (backlog B-25) | Step 72 (owner-supplied poses, mapped on web + mobile; placeholders gone) |
| Sale Result profit mascot and exceptional-deal banner mascot rendered nothing | Steps 26 / 32 (backlog B-25) | Step 72 (approved profit / surprised poses) |
| Landing thinking / searching / surprised / celebration poses missing | Step 51 | Step 72 (registered in `landingImages`; placement still open) |
| Product families (Source / Sell / Complete), access states (trial, grace, past due, canceled, expired, suspended), backend enforcement beyond live Hunts (saved Hunts, suspension, Sell guard), effective-access endpoint (audit G5, G8 partly, G9 partly) | Step 76 audit | Step 79 (ACCESS_RULES.md) |
| Mobile navigation Home / Hunts / Create / Deals / Analytics with analytics dashboards; mobile Developer card and /dev reachable in release builds (audit G3, G4, G7); no feature-flag mechanism (G6) | Steps 76 audit | Step 78 (capability list + /me/capabilities + FEATURE_FLAGS, tabs Deals / Hunts / Inventory / Account, analytics + Home web-only, dev tools development-only) |
| No web page to see plans / current access / renewal and manage a subscription; subscription state reconciled only through webhooks; "web pricing page (D3)" | Step 76 / step 79 | Step 80 (`/settings/billing`, `POST /billing/sync` reconciliation, lifecycle tests - strategy/BILLING.md) |
| Mobile showed prices, a "Choose a plan" picker, "subscribe on the web", "upgrade" / "Choose a bigger plan" / "See plans" and a cancel-plan screen (decision 0018 phase B) | Step 76 audit | Step 77 (companion Start watching, "Your access" card, cancel-plan removed, companion wording, guard test) |
| Worker monitored any LIVE Hunt regardless of the owner's access; a paid period ending without a webhook (or choosing Free) never paused Hunts above the new limit; Stripe `unpaid` kept access | Found in step 76 audit (decision 0018) | Step 76 (`@rein-drop/access`: scheduler access sweep, Free / dev plan follow-up, `UNPAID` status) |
| How mobile renders the interactive Hunt map (raised in step 73 as D41) | Step 73 | Step 73: owner chose native maps (`react-native-maps`) - decision 0017 |
| Hunt location was free text only; distance never checked ("Distance not checked yet"); B-20. Also the step 73 plan items: "Your area" on the profile, GeocodingProvider + suggestions, interactive map (web + native mobile), distance checks with a place cache | Steps 13 / 21 / 73 | Step 74 (your area, suggestions, map, distance checks on mocks - live providers are the TODO(geo) items above) |
