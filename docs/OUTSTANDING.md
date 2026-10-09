# Outstanding work - the running "still to do" trail

_Last updated: 2026-10-10, after step 56 (Landing 09)._

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
| D2 | Mobile store billing (App Store / Google Play) - web billing is Stripe (decision 0014) | Step 16 | Paid plans are bought on the web only; the app sells nothing |
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

### Matching, analysis, scoring
- Foundry live test skipped until FOUNDRY_ENDPOINT / FOUNDRY_API_KEY / FOUNDRY_DEPLOYMENT are set; the prompts are unproven on a real model (watch INVALID_OUTPUT / UNGROUNDED_OUTPUT rates) - step 40.
- AI cost appears only with FOUNDRY_PRICE_INPUT_PER_1M_USD / FOUNDRY_PRICE_OUTPUT_PER_1M_USD from your Azure price sheet - step 40.

### Deals and alerts
- Real push on a phone: EAS project id + development build (D23) - step 28.

### Plans and billing
- Stripe set-up for real: products / prices, Customer Portal configuration, webhook endpoint + secret, tax settings; test-mode run with the Stripe CLI - step 42.
- Stripe integration not exercised against Stripe itself (tests use a fake Stripe API) - step 42.

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
- App icon + splash still Expo defaults; brand icon awaits store approval - step 9. Web has no
  `favicon.ico` either (404 in the browser console) - step 32.

### Landing page (step 48+, docs/LANDING_BUILD_STATUS.md)
- Landing 05 (step 52, marketing primitives - not sent yet) and Landing 10-24 (steps 57-71) per the scoped plan - step 48.
- Gate A: owner approval of the landing design (the mockup is inspiration only) - step 48.
- Marketplace marks: replace site-icon downloads with brand / press-kit files where available - especially low-resolution Craigslist (57 px), Mercari (64), Depop and Amazon (48) and the four with no file (OfferUp, Swappa, Etsy, GOAT - text fallback); trademark review before public launch (decision L-D6) - step 55.
- Store URLs once the apps are published (no iOS bundle id / Android package in `app.json` yet) - step 48.
- Landing skeleton is public at `/` once deployed - don't deploy the web app publicly until the landing is finished (or keep the beta URL private) - step 49.
- Existing web `/dev` pages (`/dev`, `/dev/ui`, `/dev/diagnostics`, `/dev/notifications`) are served by production builds - gate them like `/dev/landing` (`notFound()` in production) before any public deploy; the release checklist assumes `/dev/*` is unreachable - step 50.
- Six landing mascot poses have no approved art (thinking, searching, phone / alert, planning, surprised / exceptional, celebration) - neutral visuals until approved; see docs/LANDING_ASSETS.md - step 51.
- The landing mockup shows a deer / reindeer mascot; the approved mascot is the orange droplet - confirm which character the landing uses (only approved art is used) - step 51.
- Browser tests: the nav has a script-based headless-Chrome check (`apps/web/scripts/check-landing-nav.mjs`); move it to Playwright with the landing QA steps (Technical Decisions: Vitest + Playwright + accessibility checks) - step 53.
- Screen-reader pass of the landing navigation by a person (NVDA / VoiceOver) - step 53.
- The app's `Wordmark` component (sign-in page etc.) still uses Next's deprecated `priority` prop - switch to `loading="eager"` / `fetchPriority` - step 54.
- Store URLs are read when the web app is built (static page): changing `APP_STORE_URL` / `GOOGLE_PLAY_URL` needs a rebuild / redeploy - step 54.
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
| "Working" / "waiting" / "thinking" mascot slots rendered nothing - now neutral placeholders tracked in ASSET_TODO.md | Steps 26-34 | Step 36 |
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
| Missing mascot art (working, waiting, afterHours, suggestion, cancellation, profit, success, exceptionalDeal, analysis): neutral placeholders until approved - see docs/ASSET_TODO.md - step 36. Sale Result / exceptional-deal banner still to switch to MascotSlot. | earlier | Step 47 - moved to post-MVP backlog B-25 |
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
