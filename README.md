# Rein Drop

AI-powered reseller sourcing platform. TypeScript monorepo (pnpm workspaces + Turborepo):
a modular-monolith API, separate background worker, web app and mobile app.

Current progress and next step: [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md).

## Ports

| Service | Address | Configured by |
|---|---|---|
| Web (Next.js) | http://localhost:3000 | `apps/web/package.json` (`--port 3000`) |
| API (NestJS) | http://localhost:4000 (`/health`, `/ready`) | `PORT` in `apps/api/.env` |
| PostgreSQL (Docker) | `localhost:5432` (loopback only) | `POSTGRES_PORT` in root `.env` |
| Prisma Studio | http://localhost:5555 (when running `pnpm db:studio`) | `packages/db/package.json` |
| Expo / Metro | http://localhost:8081 | Expo default |
| Worker | no port (background process) | |

## Layout

| Path | Package name | What |
|---|---|---|
| `apps/web` | `web` | Next.js (App Router) |
| `apps/api` | `api` | NestJS HTTP API |
| `apps/worker` | `worker` | Nest standalone background worker (no HTTP) |
| `apps/mobile` | `mobile` | Expo / React Native |
| `packages/contracts` | `@rein-drop/contracts` | Zod schemas + inferred types for every API request/response (single source of truth) |
| `packages/api-client` | `@rein-drop/api-client` | Typed, validating fetch client for the API (web + mobile) |
| `packages/db` | `@rein-drop/db` | Prisma schema, migrations, seed, client (server-only) |
| `packages/env` | `@rein-drop/env` | Server-side env validation helpers (api + worker) |
| `packages/client-core` | `@rein-drop/client-core` | Shared web + mobile client logic (form models, defaults, formatting) - no UI |
| `packages/marketplace-core` | `@rein-drop/marketplace-core` | Marketplace adapter boundary (eBay, Facebook Marketplace) |
| `packages/matching` | `@rein-drop/matching` | Deterministic hunt matching + listing deduplication (pure, no AI) |
| `packages/ai-core` | `@rein-drop/ai-core` | `AIProvider` boundary: structured, validated, grounded outputs (deterministic mock locally, Microsoft Foundry later) |
| `packages/scoring` | `@rein-drop/scoring` | Deal economics (deterministic), strength / confidence classification and alert eligibility (pure) |
| `packages/design-tokens` | `@rein-drop/design-tokens` | Colors, tones, typography, spacing, component variant types, mascot tokens |
| `packages/brand-assets` | `@rein-drop/brand-assets` | Approved logo / app icon / mascot image files (no code) |
| `packages/config` | `@rein-drop/config` | Shared tsconfig base |

Shared packages are ESM and compile to `dist/`. Turborepo builds them before any app that
depends on them, including before `dev`.

## Local setup on Windows

Commands below are for **PowerShell** from the repo root. (macOS/Linux: same commands, use
`cp` instead of `Copy-Item`.)

### 1. Install prerequisites (once)

- **Node.js 20+** (developed on Node 24): https://nodejs.org
- **pnpm**: `npm install -g pnpm`
- **Docker Desktop** with the WSL 2 backend: https://www.docker.com/products/docker-desktop.
  Start it and wait for "Engine running". If it complains about WSL, run `wsl --update` in an
  admin PowerShell and restart.
- **Git**: https://git-scm.com
- Mobile only: **Expo Go** on your phone, or an Android emulator.

Check: `node -v; pnpm -v; docker version; git --version` (`docker version` must show a
**Server** section - otherwise Docker Desktop is not running).

### 2. Install dependencies

```powershell
pnpm install
```

### 3. Env files (optional)

Every value has a working local default, so you can skip this. Copy only what you want to change:

```powershell
Copy-Item .env.example .env                          # docker compose: Postgres user/password/port
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/worker/.env.example apps/worker/.env
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/mobile/.env.example apps/mobile/.env
Copy-Item packages/db/.env.example packages/db/.env    # Prisma CLI (migrate/seed/studio)
```

The API and worker validate their environment on startup. If something is wrong they exit
immediately with every problem listed, e.g.:

```
Invalid environment configuration for api:
  - PORT: must be an integer between 1 and 65535 (got "abc")
  - DATABASE_URL: is required when NODE_ENV=production
```

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | api, worker | `development` | `development` \| `test` \| `production` |
| `PORT` | api | `4000` | |
| `AUTH_PROVIDER` | api, web | `dev` outside production | `dev` (development only, can't be enabled in production) or `entra` (Microsoft Entra External ID, decision 0013). Required in production. |
| `ENTRA_AUTHORITY`, `ENTRA_TENANT_ID`, `ENTRA_API_CLIENT_ID`, `ENTRA_REQUIRED_SCOPE` | api | -, -, -, `access_as_user` | Token verification for `entra` (identifiers, not secrets). |
| `ENTRA_WEB_CLIENT_ID`, `ENTRA_WEB_CLIENT_SECRET`, `APP_BASE_URL`, `AUTH_SESSION_SECRET`, `AUTH_SESSION_MAX_AGE_HOURS` | web | `AUTH_SESSION_MAX_AGE_HOURS=168` | Web sign-in for `entra` (+ `ENTRA_AUTHORITY`, `ENTRA_TENANT_ID`, `ENTRA_API_CLIENT_ID`). **Client secret and session secret are secrets.** |
| `EXPO_PUBLIC_AUTH_PROVIDER`, `EXPO_PUBLIC_ENTRA_*` | mobile | `dev` in development, `entra` in release builds | Mobile sign-in (public client IDs only). |
| `DATABASE_URL` | api, worker, Prisma CLI (`packages/db`) | `postgresql://reindrop:reindrop@localhost:5432/reindrop` | Required in production (api/worker). Set it in each `.env` you use. |
| `HUNT_POLL_INTERVAL_MINUTES` | worker | `15` (development only) | How often each LIVE hunt is searched per marketplace. Required in production (cost model TBD). |
| `WORKER_SCHEDULER_INTERVAL_MS`, `WORKER_RUNNER_INTERVAL_MS`, `WORKER_JOBS_PER_TICK`, `WORKER_JOB_LEASE_MS`, `WORKER_JOB_MAX_ATTEMPTS`, `WORKER_SEARCH_MAX_PAGES` | worker | `30000`, `2000`, `5`, `120000`, `5`, `1` | Pipeline tuning - see `apps/worker/.env.example` |
| `EBAY_DEV_SCENARIO`, `FACEBOOK_DEV_SCENARIO` | api, worker | `normal` | Development marketplace sources only: `normal` \| `empty` \| `degraded` \| `rate_limited` \| `unavailable` \| `not_configured` \| `invalid_response` \| `malformed_payloads` \| `slow` \| `flaky`. Refused in production. |
| `EBAY_SOURCE` | api, worker | `dev` (`api` in production) | `dev` = development eBay source; `api` = the real eBay Browse API (decision 0010). |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | api, worker | - | eBay developer keyset, required for `EBAY_SOURCE=api`. **Secrets: untracked `.env` / secret store only - never commit.** |
| `EBAY_ENVIRONMENT` | api, worker | `production` | `production` \| `sandbox` (must match the keyset). |
| `EBAY_MARKETPLACE_ID` | api, worker | `EBAY_US` | eBay site, e.g. `EBAY_GB`, `EBAY_AU`. |
| `FACEBOOK_SOURCE` | api, worker | `dev` | `dev` = development provider; `apify` = Apify Marketplace scraper - **development only** (terms D12), refused in production. See `docs/providers/facebook-apify.md`. |
| `APIFY_TOKEN`, `FACEBOOK_APIFY_CURRENCY` | api, worker | - | Required for `apify`. Token is a secret (never commit); currency = the searched region's ISO code. |
| `FACEBOOK_APIFY_RESULTS_LIMIT`, `FACEBOOK_APIFY_PRICE_PER_1000_USD`, `FACEBOOK_APIFY_TIMEOUT_SECONDS`, `FACEBOOK_APIFY_ACTOR` | api, worker | `20`, `2.60`, `240`, `apify~facebook-marketplace-scraper` | Results per search, cost estimate / cap, run timeout, actor id. |
| `AI_PROVIDER` | worker | `mock` | `mock` = deterministic local AI (refused in production); `foundry` = Microsoft Foundry (decision 0012). |
| `FOUNDRY_ENDPOINT`, `FOUNDRY_API_KEY`, `FOUNDRY_DEPLOYMENT` | worker | - | Required for `foundry`: resource endpoint, key (**secret - never commit**), deployment name (or `FOUNDRY_DEPLOYMENT_PRODUCT_EXTRACTION` / `_CONDITION_RISK` / `_DEAL_EXPLANATION` per task). |
| `FOUNDRY_TIMEOUT_MS`, `FOUNDRY_MAX_RETRIES`, `FOUNDRY_MAX_OUTPUT_TOKENS` | worker | `25000`, `1`, `1500` | Per-request timeout, retries, output cap; one analysis must fit `WORKER_JOB_LEASE_MS`. |
| `FOUNDRY_PRICE_INPUT_PER_1M_USD`, `FOUNDRY_PRICE_OUTPUT_PER_1M_USD` | worker | - | Your Azure prices; without them AI cost is reported as unknown. |
| `WORKER_HEARTBEAT_MS` | worker | `60000` | Integer >= 1000 |
| `API_BASE_URL` | web (server-side) | `http://localhost:4000` (via `.env.example`) | |
| `EXPO_PUBLIC_API_BASE_URL` | mobile | `http://localhost:4000` (via `.env.example`) | Use your LAN IP on a physical phone |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | docker compose | `reindrop` / `reindrop` / `reindrop` / `5432` | Root `.env` |

### 4. Start local infrastructure (PostgreSQL)

```powershell
pnpm infra:up       # start Postgres in Docker and wait until it is healthy
pnpm infra:status   # show container status
pnpm infra:logs     # follow Postgres logs (Ctrl+C to stop following)
pnpm infra:psql     # open psql inside the container
pnpm infra:down     # stop and remove the container (data is kept)
pnpm infra:reset    # stop AND DELETE all local database data
```

### 5. Create the database schema and seed it

```powershell
pnpm db:migrate     # apply migrations (first run creates all tables)
pnpm db:seed        # eBay + Facebook Marketplace, and development plans (idempotent)
pnpm db:studio      # browse data at http://localhost:5555 (Ctrl+C to stop)
```

Other database commands: `pnpm db:status` (pending migrations), `pnpm db:generate` (regenerate
the client after editing `schema.prisma` - `pnpm build` also does this), `pnpm db:deploy`
(apply migrations without prompts, for CI/servers), `pnpm db:reset` (**drops all data**,
re-applies migrations, then run `pnpm db:seed`).

Changing the schema: edit `packages/db/prisma/schema.prisma`, then
`pnpm db:migrate --name describe_the_change`. Commit the new folder under
`packages/db/prisma/migrations/`.

### 6. Run the apps (one PowerShell window per process)

```powershell
pnpm --filter api dev       # http://localhost:4000/health and /ready
pnpm --filter worker dev    # logs a heartbeat
pnpm --filter web dev       # http://localhost:3000 (app) - /dev for system status, /dev/ui for components, /dev/diagnostics for ingestion cost / freshness (internal)
pnpm --filter mobile start  # scan the QR code with Expo Go
```

**Mobile API address - no setup needed in development.** The app uses the address of the computer
running the Expo dev server (Expo's `hostUri`), so a physical phone on the same Wi-Fi reaches the
API at `http://<your-PC-LAN-IP>:4000` automatically; emulators work the same way. Check it in the
app: Settings (gear, top right) > Developer > **Check connection**. Requirements: phone and PC on
the same network, Windows network profile **Private**, Node.js allowed through Windows Firewall on
private networks. Override with `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` (required for
`expo start --tunnel` and non-development builds) - see `apps/mobile/.env.example`.

## Shared contracts and API client

- **DTOs are defined once**, as zod schemas in `packages/contracts/src/` (one file per flow:
  `account`, `seller-snapshot`, `hunts`, `listings`, `deals`, `health`, `errors`, plus `common`
  for ids, timestamps, money and pagination). Types are inferred from the schemas
  (`z.infer`). Web, mobile and the API import them - never redeclare a request/response type
  in an app.
- **Wire conventions:** UUID ids; ISO-8601 UTC timestamps; money as
  `{ amountMinor: integer, currency: "USD" }`; list endpoints use cursor pagination
  (`?limit=&cursor=` -> `{ items, nextCursor }`); status enums use the same upper-case values
  as the database (a test in `apps/api` fails if they drift).
- **API client:** `createApiClient({ baseUrl })` from `@rein-drop/api-client`. Methods:
  `getHealth`, `getReadiness`, `getMe`, `getSellerSnapshot`, `updateSellerSnapshot`,
  `saveSellerSnapshot`,
  `getHomeSummary`, `listHunts`, `getHunt`,
  `createHunt`, `updateHunt`, `listDeals`, `getDeal`. It validates request bodies before
  sending (same `VALIDATION_FAILED` + `details` format as the server, so forms can show the
  errors directly), validates responses against the contract, and throws only `ApiError`.
- In the API, use the same schemas for input validation:
  `class CreateHuntDto extends createZodDto(createHuntRequestSchema) {}`.

## Design system

Sources of truth (in `docs/brand/`): Brand Identity v2.1, Mascot Usage Guide v1.0. Component
variants follow the Mobile UI Screenbook v1.0, section 10.

- **Tokens** (`@rein-drop/design-tokens`) are shared by web and mobile: palette (Canvas White,
  Rein Navy `#12233F`, Rein Orange `#FF6B35`, Drop Yellow `#FFC928`, Profit Green `#16A66A`, Sky
  Wash `#EAF4FF`, Loss Red `#D64545`), washes, navy-derived neutrals, semantic **tones**
  (`neutral`, `info`, `action`, `fresh`, `profit`, `loss`), Inter typography, spacing/radius,
  component variant types and mascot tokens. Web gets them as `--rd-*` CSS variables.
- **UI primitives are implemented per platform** (only tokens/types are shared):
  - web: `apps/web/src/components/ui` (CSS Modules) - gallery at http://localhost:3000/dev/ui.
    App shell (sidebar / bottom nav) in `apps/web/src/components/shell`; destinations are defined
    once in `shell/nav.ts`. Authenticated routes live in `src/app/(app)/`.
  - mobile: `apps/mobile/src/ui` (StyleSheet) - gallery at Settings > Developer > UI primitives.
    Navigation uses Expo Router (`apps/mobile/src/app`): native tabs + stack, Create Hunt modal.
  - `Button`, `TextInput`, `Card`, `Badge`, `Metric`, `EmptyState`, `SystemBanner`,
    `Page` (web) / `Screen` (mobile), `LoadingState`.
- **Accessibility rules baked into tokens** (enforced by tests): primary buttons use navy text on
  orange (white fails contrast); yellow/green/orange are fills and accents, not small text;
  colour is never the only signal (badges always have text).
- **Brand assets** live only in `packages/brand-assets/` - see its README for the file table,
  naming and how to add one. UI never references files directly: it picks a mascot token
  (`welcome`, `confirmed`, `working`, ...) and `apps/*/src/brand/assets.ts` maps tokens to
  files. Tokens without an approved asset render nothing.

## Authentication (development-only for now)

The managed auth provider is **not chosen yet**. Everything goes through a provider boundary so
it can be swapped in without touching features:

- **API** (`apps/api/src/auth`): `AuthProvider` interface -> `AuthService` -> global `AuthGuard`.
  Every endpoint requires auth unless marked `@Public()` (only `/health`, `/ready`). Handlers get
  the caller via `@CurrentUser()`. Users are linked to providers by `User.authProvider` +
  `User.authSubject`.
- **Web** (`apps/web/src/auth`): `verifySession()` (Data Access Layer) in every protected page via
  `<Protected>`, plus an optimistic `src/proxy.ts` redirect. Signed-out -> `/sign-in`.
- **Mobile** (`apps/mobile/src/auth`): `SessionProvider` (loads `GET /me`) + `SessionGate` on the
  tabs and Create Hunt; Settings stays reachable when signed out.

**Development provider (`AUTH_PROVIDER=dev`, the default outside production):**

- Signs you in automatically as the seeded user **dev@reindrop.local** - run `pnpm db:seed` once.
  There are no passwords; clients send `x-dev-auth-subject: local-dev-user`, which only names the
  seeded user.
- The API accepts it only from this machine or the private network (phones on your Wi-Fi yes,
  internet no).
- **Cannot run in production:** the API refuses to start with `NODE_ENV=production` and
  `AUTH_PROVIDER=dev`; production web and release mobile builds don't contain the dev provider.

**Microsoft Entra External ID (`AUTH_PROVIDER=entra`, production)** - decision
[0013](docs/decisions/0013-entra-external-id-auth.md) has the tenant setup checklist:

- Email + password sign-up / sign-in (with email verification and password reset) on the
  tenant's hosted page; web uses `/auth/sign-in` -> `/auth/callback` (PKCE), mobile the system browser.
- The API verifies the bearer access token (issuer, audience, signature, expiry, tenant, scope)
  and maps the user's `oid` to a Rein Drop user (created on first sign-in, never linked by email).
- Web sessions are encrypted httpOnly cookies, refreshed by the Proxy, ending after
  `AUTH_SESSION_MAX_AGE_HOURS`; Settings -> Sign out ends the Entra session too.

## API conventions (apps/api)

- **Domain modules** live in `apps/api/src/modules/<name>/` - users, seller-profile, hunts,
  marketplaces, listings, matching, deal-intelligence, deals, outcomes, analytics, plans
  (plans + entitlements), billing, notifications, usage. Each module's header comment states
  what it owns. Modules talk to each other through exported providers, not each other's tables.
- **Health:** `GET /health` = liveness (process up, no dependency checks, always 200).
  `GET /ready` = readiness (database reachable): 200 `ready` or 503 `not_ready`, same body.
- **Validation:** request DTOs are zod schemas wrapped with `createZodDto(schema)`
  (`src/common/validation`); a global pipe validates `@Body/@Query/@Param` typed with them and
  strips unknown keys.
- **Errors:** every non-2xx response (except `/ready`) has one shape (`ApiErrorBody` in
  `@rein-drop/contracts`):
  `{ statusCode, code, message, details?, requestId, path, timestamp }`. Throw `AppException`
  for a specific `code`. Unexpected errors return `500 INTERNAL_ERROR` with no internal details
  (the stack trace is logged server-side).
- **Request logging:** one line per request: `GET /path 200 3.1ms [request-id]`. Send an
  `x-request-id` header to correlate; the API always returns one.

## Troubleshooting (Windows)

**`pnpm infra:up` fails with "ports are not available ... 5432"** - something else already uses
port 5432, usually a native PostgreSQL install (Windows service `postgresql-x64-<version>`).
Check with:

```powershell
Get-NetTCPConnection -LocalPort 5432 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }
Get-Service postgresql*
```

Then either:

- **Use another port for Docker** - in root `.env` set `POSTGRES_PORT=5433`, and in
  `apps/api/.env`, `apps/worker/.env` and `packages/db/.env` set
  `DATABASE_URL=postgresql://reindrop:reindrop@localhost:5433/reindrop`; or
- **Stop the native service** (admin PowerShell) if you don't need it:
  `Stop-Service postgresql-x64-18; Set-Service postgresql-x64-18 -StartupType Manual`.

**Port 3000 / 4000 already in use** - an earlier dev server is still running. Find it with
`Get-NetTCPConnection -LocalPort 4000 -State Listen` and stop that window (or
`Stop-Process -Id <OwningProcess>`).

**`docker` commands fail with "failed to connect to the docker API"** - Docker Desktop is not
running. Start it and wait for "Engine running".

## Whole-repo commands

```powershell
pnpm build      # build every workspace (mobile = expo export for android + ios)
pnpm typecheck
pnpm lint
pnpm test       # api, worker, contracts and api-client unit tests
pnpm clean      # remove build output
```

Single workspace: `pnpm --filter <name> <script>`, e.g. `pnpm --filter api test:e2e`.

Real-database integration tests (need `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed`):
`pnpm --filter api test:int`. They create a throwaway user and delete it afterwards.
