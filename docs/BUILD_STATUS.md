# Build Status

_Last updated: 2026-10-07_

## Completed steps

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

- `TODO(marketplace)`: normalized Listing model + MarketplaceProvider interface; Facebook data provider TBD.
- `TODO(ai)`: AIProvider interface + deterministic MockAIProvider; Foundry models per task TBD.
- `TODO(worker)`: job runner / scheduler abstraction; queue choice TBD.
- `TODO(brand)`: font size scale, spacing and neutral greys are engineering defaults - confirm in
  the high-fidelity design pass.
- `TODO(assets)`: export optimized @1x/@2x/@3x mascot PNGs for mobile (originals are 1-2 MB);
  wire `app-icon-mascot.png` into `app.json` once approved for stores; SVG wordmarks if available.
- Product docs (App Flow Blueprint, Mobile UI Screenbook, Technical Architecture, Build Prompts,
  Product Blueprint) are still only in `Downloads/` - consider copying them to `docs/product/`.

## Next step

Likely: Seller Snapshot onboarding screens (one question per screen, "n of 5" progress,
personalized summary - Blueprint section 4) on web and mobile using the new endpoints; then Hunt
endpoints + the assisted first-Hunt flow (pre-filled from the snapshot).
(Await the next prompt.)
