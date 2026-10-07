# Build Status

_Last updated: 2026-10-07_

## Completed steps

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
- Worker validates `DATABASE_URL` but does not use the database yet (no jobs need it).
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
- Product docs (App Flow Blueprint, Mobile UI Screenbook, Technical Architecture, Build Prompts,
  Product Blueprint) are still only in `Downloads/` - consider copying them to `docs/product/`.

## Next step

Likely: run deal analysis in the worker for new matches (mock provider, inputHash to skip
unchanged ones), listing refresh (expire sold matches), then the Deals API + screens showing
matches, reasons and analyses; or Hunt detail / edit / pause / archive / restore screens (so a user blocked by the
live-Hunt limit can pause another Hunt from the UI), or onboarding screens (reseller gate + five
Seller Snapshot questions) on web and mobile.
(Await the next prompt.)
