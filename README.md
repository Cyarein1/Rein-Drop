<p align="center">
  <img src="packages/brand-assets/app-icon/app-icon-package-search.png" width="96" alt="Rein Drop app icon">
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="packages/brand-assets/logo/wordmark-white.png">
    <img src="packages/brand-assets/logo/wordmark-navy.png" width="300" alt="Rein Drop">
  </picture>
</p>

<p align="center">
  <strong>AI-powered sourcing and selling for resellers.</strong><br>
  Rein Drop watches the marketplaces for you, scores every deal and tracks each item from purchase to profit.
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-12233F?logo=typescript&logoColor=white">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-12233F?logo=nextdotjs&logoColor=white">
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-API%20%2B%20worker-12233F?logo=nestjs&logoColor=white">
  <img alt="Expo SDK 57" src="https://img.shields.io/badge/Expo-SDK%2057-12233F?logo=expo&logoColor=white">
  <img alt="PostgreSQL + Prisma" src="https://img.shields.io/badge/PostgreSQL-Prisma%207-12233F?logo=postgresql&logoColor=white">
  <img alt="Turborepo + pnpm" src="https://img.shields.io/badge/Turborepo-pnpm-12233F?logo=turborepo&logoColor=white">
  <img alt="Status: pre-release" src="https://img.shields.io/badge/status-pre--release-FF6B35">
</p>

<p align="center">
  <a href="#-what-rein-drop-does">Product</a> ·
  <a href="#-quick-start">Quick start</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-local-development">Local development</a> ·
  <a href="#-testing-and-quality">Testing</a> ·
  <a href="#-conventions">Conventions</a> ·
  <a href="#-documentation">Docs</a>
</p>

---

## ✦ What Rein Drop does

Resellers make money in the gap between what something is listed for and what it really sells
for. Rein Drop finds that gap and keeps the whole flip in one place.

| | Step | What happens |
|---|---|---|
| 🎯 | **Hunt** | Describe what you're looking for - product, max price, area, condition. Rein Drop searches eBay and Facebook Marketplace on a schedule. |
| ⚡ | **Deals** | Every match is checked, scored and explained: price vs resale value, estimated upside, risks and questions for the seller. Strong deals send an alert. |
| 🛒 | **Buy** | Mark a deal bought - it lands in your stock with what Rein Drop expected, frozen for comparison later. |
| 🏷️ | **Sell** | List it in a few clicks (write it yourself or use AI), cross-list on several marketplaces, record the sale. One item, one listing - a sale ends the others. |
| 📈 | **Insights** | Realized profit, time to sell, fees, returns and missed deals - as clear numbers and charts. |

Nothing is ever hard-deleted: every purchase, listing and sale keeps a full history.

**Two apps, one account**

- **Web** - the full workspace: Hunts, deals, Sell, Insights, Analytics, billing (Stripe) and settings.
- **Mobile** (iOS / Android) - the companion for acting fast: deal alerts, quick decisions,
  Hunts, Sell and account. It never sells subscriptions ([decision 0018](docs/decisions/0018-web-first-billing-mobile-companion.md)).

Built for the United States, United Kingdom, Canada, Australia and Germany - currency, units and
language follow the user (English; German in review).

## ✦ Quick start

Requires **Node.js 20+**, **pnpm** and **Docker Desktop**. From the repo root:

```powershell
pnpm install            # dependencies
pnpm infra:up           # PostgreSQL in Docker
pnpm db:migrate         # create the schema
pnpm db:seed            # marketplaces, plans and the development user
pnpm --filter api dev   # API     -> http://localhost:4000/health
pnpm --filter web dev   # web app -> http://localhost:3000
```

Then, in their own terminals: `pnpm --filter worker dev` (finds deals) and
`pnpm --filter mobile start` (scan the QR code with Expo Go).

In development you're signed in automatically as **dev@reindrop.local**, and the marketplaces and
AI are local simulations - no keys or accounts needed.
Want a guided tour? [docs/LOCAL_MVP_ACCEPTANCE.md](docs/LOCAL_MVP_ACCEPTANCE.md) walks through the
whole product (`pnpm db:reset-demo` gives a clean database).

## ✦ Architecture

A TypeScript monorepo: a modular-monolith API, a separate background worker, a web app and a
mobile app, all sharing one set of contracts.

```mermaid
flowchart LR
  subgraph Clients
    web["Web<br/>Next.js 16"]
    mobile["Mobile<br/>Expo / React Native"]
  end
  subgraph Backend
    api["API<br/>NestJS"]
    worker["Worker<br/>NestJS, no HTTP"]
  end
  db[("PostgreSQL<br/>Prisma")]
  mkt["eBay · Facebook<br/>Marketplace"]
  ai["AI provider<br/>Microsoft Foundry"]
  ext["Stripe · Entra ID<br/>Expo Push · Azure Maps"]

  web --> api
  mobile --> api
  api --> db
  worker --> db
  worker --> mkt
  worker --> ai
  api --> ext
  worker -. push .-> ext
```

The worker runs the pipeline - search, normalize, match, analyse, score, alert - and the API
serves the apps. Every request and response is a zod contract shared by API, web and mobile.

<details>
<summary><strong>Repository layout</strong></summary>

| Path | Package | What it holds |
|---|---|---|
| `apps/web` | `web` | Next.js (App Router): landing page and the web app |
| `apps/api` | `api` | NestJS HTTP API, one module per domain |
| `apps/worker` | `worker` | Nest standalone background worker: monitoring pipeline, alerts, push |
| `apps/mobile` | `mobile` | Expo / React Native companion app |
| `packages/contracts` | `@rein-drop/contracts` | Zod schemas + inferred types for every API request / response (single source of truth) |
| `packages/api-client` | `@rein-drop/api-client` | Typed, validating fetch client (web + mobile) |
| `packages/client-core` | `@rein-drop/client-core` | Shared web + mobile view logic (view models, forms, formatting) - no UI |
| `packages/i18n` | `@rein-drop/i18n` | UI text in every language (English source, German) + a small ICU-style formatter |
| `packages/db` | `@rein-drop/db` | Prisma schema, migrations, seed, client (server-only) |
| `packages/access` | `@rein-drop/access` | Who can use what: subscription and access rules shared by API and worker |
| `packages/marketplace-core` | `@rein-drop/marketplace-core` | Marketplace adapters (eBay, Facebook Marketplace) + development sources |
| `packages/matching` | `@rein-drop/matching` | Deterministic Hunt matching and listing deduplication |
| `packages/scoring` | `@rein-drop/scoring` | Deal economics, strength / confidence and alert eligibility |
| `packages/ai-core` | `@rein-drop/ai-core` | `AIProvider` boundary: structured, validated, grounded AI outputs |
| `packages/geo` | `@rein-drop/geo` | Place suggestions, geocoding, map tiles and distance checks |
| `packages/telemetry` | `@rein-drop/telemetry` | Product events (beta telemetry) behind a replaceable provider |
| `packages/env` | `@rein-drop/env` | Server-side environment validation (API + worker) |
| `packages/design-tokens` | `@rein-drop/design-tokens` | Brand colours, tones, typography, spacing, component variants |
| `packages/brand-assets` | `@rein-drop/brand-assets` | Approved logos, app icon and mascot art (no code) |
| `packages/config` | `@rein-drop/config` | Shared tsconfig base |

Shared packages are ESM and compile to `dist/`; Turborepo builds them before any app that
depends on them, including before `dev`.

</details>

## ✦ Local development

Commands are for **PowerShell** from the repo root (macOS / Linux: the same, with `cp` instead of
`Copy-Item`).

### Prerequisites

- **Node.js 20+** (developed on Node 24) · **pnpm** (`npm install -g pnpm`) · **Git**
- **Docker Desktop** with the WSL 2 backend - start it and wait for "Engine running"
  (if it complains about WSL, run `wsl --update` in an admin PowerShell and restart)
- Mobile: **Expo Go** on your phone, or an Android emulator

Check: `node -v; pnpm -v; docker version; git --version` - `docker version` must show a
**Server** section.

### Services and ports

| Service | Address | Start with |
|---|---|---|
| Web (Next.js) | http://localhost:3000 - landing page; `/home` the app | `pnpm --filter web dev` |
| API (NestJS) | http://localhost:4000 - `/health`, `/ready` | `pnpm --filter api dev` |
| Worker | no port (background process) | `pnpm --filter worker dev` |
| Mobile (Expo / Metro) | http://localhost:8081 | `pnpm --filter mobile start` |
| PostgreSQL (Docker) | `localhost:5432` (loopback only) | `pnpm infra:up` |
| Prisma Studio | http://localhost:5555 | `pnpm db:studio` |

Internal pages on the web app: `/dev` (system status), `/dev/ui` (component gallery),
`/dev/diagnostics` (ingestion cost and freshness).

### Database

```powershell
pnpm infra:up       # start Postgres and wait until healthy   · infra:down stops it (data kept)
pnpm db:migrate     # apply migrations                         · db:status shows pending ones
pnpm db:seed        # marketplaces, plans, development user    · idempotent
pnpm db:studio      # browse the data
```

Changing the schema: edit `packages/db/prisma/schema.prisma`, then
`pnpm db:migrate --name describe_the_change` and commit the new folder under
`packages/db/prisma/migrations/`. Other commands: `pnpm db:deploy` (no prompts, for servers),
`pnpm db:generate`, `pnpm infra:logs`, `pnpm infra:psql`, and the destructive
`pnpm db:reset` / `pnpm infra:reset` (**delete all local data**).

### Mobile on a real phone

No setup needed in development: the app reaches the API through the address of the computer
running Expo, so a phone on the same Wi-Fi just works. Check it in the app under
Account > Developer > **Check connection**. Requirements: same network, Windows network profile
**Private**, Node.js allowed through the firewall on private networks. Override with
`EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` (needed for `expo start --tunnel` and
non-development builds).

### Environment

Every value has a working local default, so you can skip this. Copy only what you want to change:

```powershell
Copy-Item .env.example .env                          # docker compose: Postgres user / password / port
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/worker/.env.example apps/worker/.env
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/mobile/.env.example apps/mobile/.env
Copy-Item packages/db/.env.example packages/db/.env    # Prisma CLI (migrate / seed / studio)
```

The API and worker validate their environment on startup and exit with every problem listed:

```
Invalid environment configuration for api:
  - PORT: must be an integer between 1 and 65535 (got "abc")
  - DATABASE_URL: is required when NODE_ENV=production
```

<details>
<summary><strong>All environment variables</strong></summary>

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | api, worker | `development` | `development` \| `test` \| `production` |
| `PORT` | api | `4000` | |
| `DATABASE_URL` | api, worker, Prisma CLI | `postgresql://reindrop:reindrop@localhost:5432/reindrop` | Required in production. Set it in each `.env` you use. |
| `AUTH_PROVIDER` | api, web | `dev` outside production | `dev` (development only, refused in production) or `entra` (Microsoft Entra External ID, decision 0013). |
| `ENTRA_AUTHORITY`, `ENTRA_TENANT_ID`, `ENTRA_API_CLIENT_ID`, `ENTRA_REQUIRED_SCOPE` | api | -, -, -, `access_as_user` | Token verification for `entra` (identifiers, not secrets). |
| `ENTRA_WEB_CLIENT_ID`, `ENTRA_WEB_CLIENT_SECRET`, `APP_BASE_URL`, `AUTH_SESSION_SECRET`, `AUTH_SESSION_MAX_AGE_HOURS` | web | `AUTH_SESSION_MAX_AGE_HOURS=168` | Web sign-in for `entra`. **Client secret and session secret are secrets.** |
| `EXPO_PUBLIC_AUTH_PROVIDER`, `EXPO_PUBLIC_ENTRA_*` | mobile | `dev` in development, `entra` in release builds | Mobile sign-in (public client IDs only). |
| `RATE_LIMIT_PER_MINUTE`, `TRUST_PROXY_HOPS` | api | `600`, `0` | Per-user request limit; trusted proxies ([hardening notes](docs/security/hardening-2026-10.md)). |
| `LOG_FORMAT` | api, worker | `json` in production, `text` otherwise | |
| `BILLING_PROVIDER` | api | `dev` outside production | `dev` (fake confirmation, refused in production) or `stripe` (decision 0014). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | api | - | Required for `stripe`. **Secrets.** Test-mode keys locally. |
| `STRIPE_PRICE_IDS`, `WEB_APP_URL` | api | - | Plan code -> Stripe price id (`pro=price_...,ultimate=price_...`; prices live in Stripe, never in code) and the web origin for return URLs. |
| `HUNT_POLL_INTERVAL_MINUTES` | worker | `15` (development only) | How often each live Hunt is searched per marketplace. Required in production. |
| `WORKER_SCHEDULER_INTERVAL_MS`, `WORKER_RUNNER_INTERVAL_MS`, `WORKER_JOBS_PER_TICK`, `WORKER_JOB_LEASE_MS`, `WORKER_JOB_MAX_ATTEMPTS`, `WORKER_SEARCH_MAX_PAGES` | worker | `30000`, `2000`, `5`, `120000`, `5`, `1` | Pipeline tuning - see `apps/worker/.env.example`. |
| `WORKER_HEARTBEAT_MS` | worker | `60000` | Integer >= 1000. |
| `EBAY_DEV_SCENARIO`, `FACEBOOK_DEV_SCENARIO` | api, worker | `normal` | Development sources only: `normal` \| `empty` \| `degraded` \| `rate_limited` \| `unavailable` \| `not_configured` \| `invalid_response` \| `malformed_payloads` \| `slow` \| `flaky`. |
| `EBAY_SOURCE` | api, worker | `dev` (`api` in production) | `api` = the real eBay Browse API (decision 0010). |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | api, worker | - | eBay developer keyset for `EBAY_SOURCE=api`. **Secrets - never commit.** |
| `EBAY_ENVIRONMENT`, `EBAY_MARKETPLACE_ID` | api, worker | `production`, `EBAY_US` | `sandbox` must match the keyset; site e.g. `EBAY_GB`, `EBAY_AU`. |
| `FACEBOOK_SOURCE` | api, worker | `dev` | `apify` = Apify Marketplace scraper, **development only**, refused in production ([notes](docs/providers/facebook-apify.md)). |
| `APIFY_TOKEN`, `FACEBOOK_APIFY_CURRENCY` | api, worker | - | Required for `apify`. Token is a secret. |
| `FACEBOOK_APIFY_RESULTS_LIMIT`, `FACEBOOK_APIFY_PRICE_PER_1000_USD`, `FACEBOOK_APIFY_TIMEOUT_SECONDS`, `FACEBOOK_APIFY_ACTOR` | api, worker | `20`, `2.60`, `240`, `apify~facebook-marketplace-scraper` | Results per search, cost cap, timeout, actor id. |
| `AI_PROVIDER` | worker | `mock` | `mock` = deterministic local AI (refused in production); `foundry` = Microsoft Foundry (decision 0012). |
| `FOUNDRY_ENDPOINT`, `FOUNDRY_API_KEY`, `FOUNDRY_DEPLOYMENT` | worker | - | Required for `foundry` (key is a **secret**); per-task deployments via `FOUNDRY_DEPLOYMENT_*`. |
| `FOUNDRY_TIMEOUT_MS`, `FOUNDRY_MAX_RETRIES`, `FOUNDRY_MAX_OUTPUT_TOKENS` | worker | `25000`, `1`, `1500` | One analysis must fit `WORKER_JOB_LEASE_MS`. |
| `FOUNDRY_PRICE_INPUT_PER_1M_USD`, `FOUNDRY_PRICE_OUTPUT_PER_1M_USD` | worker | - | Your Azure prices; without them AI cost is reported as unknown. |
| `API_BASE_URL` | web (server-side) | `http://localhost:4000` | |
| `EXPO_PUBLIC_API_BASE_URL` | mobile | the Expo host in development | Your LAN IP on a physical phone if overriding. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | docker compose | `reindrop` / `reindrop` / `reindrop` / `5432` | Root `.env`. |

Push notifications, Azure Maps and media storage have their own variables in each app's
`.env.example`.

</details>

## ✦ Testing and quality

```powershell
pnpm build        # every workspace (mobile = expo export for Android + iOS)
pnpm typecheck
pnpm lint
pnpm test         # unit and component tests across the repo
```

One workspace: `pnpm --filter <name> <script>`, e.g. `pnpm --filter api test`.

**Integration tests** run against a real database: `pnpm --filter api test:int` and
`pnpm --filter worker test:int`. They create throwaway users and clean up after themselves - point
`DATABASE_URL` at a separate test database rather than the one you develop with.

## ✦ Conventions

<details>
<summary><strong>Contracts and the API client</strong></summary>

- **DTOs are defined once**, as zod schemas in `packages/contracts/src/` (one file per flow).
  Types are inferred with `z.infer`; web, mobile and the API import them - never redeclare a
  request / response type in an app.
- **Wire format:** UUID ids · ISO-8601 UTC timestamps · money as
  `{ amountMinor: integer, currency: "USD" }` · cursor pagination (`?limit=&cursor=` ->
  `{ items, nextCursor }`) · status enums use the database's upper-case values (a test fails if
  they drift).
- **API client:** `createApiClient({ baseUrl })` from `@rein-drop/api-client`. It validates request
  bodies before sending (same `VALIDATION_FAILED` format as the server, so forms show the errors
  directly), validates responses against the contract, and throws only `ApiError`.
- In the API the same schemas validate input:
  `class CreateHuntDto extends createZodDto(createHuntRequestSchema) {}`.

</details>

<details>
<summary><strong>API (apps/api)</strong></summary>

- **Domain modules** live in `apps/api/src/modules/<name>/`, each with a header comment saying
  what it owns. Modules talk through exported providers, never each other's tables.
- **Health:** `GET /health` = liveness (always 200); `GET /ready` = database reachable (200 or 503).
- **Errors:** every non-2xx response has one shape -
  `{ statusCode, code, message, details?, requestId, path, timestamp }`. Unexpected errors return
  `500 INTERNAL_ERROR` without internal details (the stack trace is logged server-side).
- **Logging:** one line per request (`GET /path 200 3.1ms [request-id]`); send `x-request-id` to
  correlate.
- **Lifecycle:** records are never hard-deleted - mistakes and endings are statuses with an item
  history ([decision 0021](docs/decisions/0021-lifecycle-without-deleting.md)). Account deletion is
  the one real erase.

</details>

<details>
<summary><strong>Design system and brand</strong></summary>

Sources of truth live in [`docs/brand/`](docs/brand/): Brand Identity v2.1, Mascot Usage Guide and
the Mobile UI Screenbook.

- **Tokens** (`@rein-drop/design-tokens`), shared by web and mobile:

  | Canvas White | Rein Navy | Rein Orange | Drop Yellow | Profit Green | Sky Wash | Loss Red |
  |---|---|---|---|---|---|---|
  | `#FFFFFF` | `#12233F` | `#FF6B35` | `#FFC928` | `#16A66A` | `#EAF4FF` | `#D64545` |

  Plus semantic tones (`neutral`, `info`, `action`, `fresh`, `profit`, `loss`), Inter typography,
  spacing and radius. The web gets them as `--rd-*` CSS variables.
- **UI primitives per platform**: web `apps/web/src/components/ui` (gallery at `/dev/ui`), mobile
  `apps/mobile/src/ui` - a native, list-first design ([decision 0020](docs/decisions/0020-native-mobile-redesign.md)).
- **Accessibility is built in** and enforced by tests: navy text on orange buttons (white fails
  contrast), colour is never the only signal, estimates are always labelled as estimates.
- **Brand assets** live only in [`packages/brand-assets/`](packages/brand-assets/README.md). UI picks
  a mascot token (`welcome`, `working`, `profit`, ...) and never references image files directly.

</details>

<details>
<summary><strong>Languages</strong></summary>

All visible text goes through `@rein-drop/i18n`: English is the source and German must have every
key and placeholder (checked by tests). The language follows the device or browser, with a switch
in Account. See [docs/i18n/README.md](docs/i18n/README.md) and the German glossary.

</details>

<details>
<summary><strong>Sign-in and billing</strong></summary>

- **Development** (`AUTH_PROVIDER=dev`, the default outside production): you're signed in as the
  seeded **dev@reindrop.local** - no passwords. Accepted only from this machine or the private
  network, and refused in production builds.
- **Production** (`AUTH_PROVIDER=entra`): Microsoft Entra External ID - email + password with
  verification and reset on the tenant's hosted page; the API verifies every access token. Setup
  checklist in [decision 0013](docs/decisions/0013-entra-external-id-auth.md).
- **Billing:** paid plans use Stripe on the web only (Free never needs a card). Locally, without
  Stripe settings, a development fake confirms plans. To try Stripe test mode:
  1. Create a product + recurring price per paid plan and enable the Customer Portal.
  2. In `apps/api/.env`: `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY=sk_test_...`,
     `STRIPE_PRICE_IDS=pro=price_...,ultimate=price_...`, `WEB_APP_URL=http://localhost:3000`.
  3. `stripe listen --forward-to localhost:4000/billing/webhooks/stripe` and copy the `whsec_...`
     into `STRIPE_WEBHOOK_SECRET`.
  4. Restart the API and pay with the test card `4242 4242 4242 4242`.

  Details: [docs/strategy/BILLING.md](docs/strategy/BILLING.md) and
  [access rules](docs/strategy/ACCESS_RULES.md).

</details>

## ✦ Documentation

| Topic | Where |
|---|---|
| What's built, step by step | [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md) |
| Everything still open | [docs/OUTSTANDING.md](docs/OUTSTANDING.md) |
| Architecture and product decisions | [docs/decisions/](docs/decisions/) |
| Strategy: web-first SaaS + mobile companion | [docs/strategy/WEB_FIRST_COMPANION.md](docs/strategy/WEB_FIRST_COMPANION.md) |
| Guided local demo | [docs/LOCAL_MVP_ACCEPTANCE.md](docs/LOCAL_MVP_ACCEPTANCE.md) |
| MVP scope · release · limitations · backlog | [MVP freeze](docs/MVP_FREEZE.md) · [release checklist](docs/RELEASE_CHECKLIST.md) · [known limitations](docs/KNOWN_LIMITATIONS.md) · [post-MVP backlog](docs/POST_MVP_BACKLOG.md) |
| App Store / Google Play readiness | [docs/release/APP_STORE_READINESS.md](docs/release/APP_STORE_READINESS.md) |
| Push notifications and deep links | [docs/PUSH_NOTIFICATIONS.md](docs/PUSH_NOTIFICATIONS.md) |
| Azure beta hosting (nothing deploys automatically) | [docs/azure/BETA_DEPLOYMENT.md](docs/azure/BETA_DEPLOYMENT.md) |
| Security hardening | [docs/security/hardening-2026-10.md](docs/security/hardening-2026-10.md) |
| Product events (telemetry) | [docs/telemetry/product-events.md](docs/telemetry/product-events.md) |
| Landing page | [docs/LANDING_BUILD_STATUS.md](docs/LANDING_BUILD_STATUS.md) |

## ✦ Troubleshooting (Windows)

<details>
<summary><strong><code>pnpm infra:up</code> fails: "ports are not available ... 5432"</strong></summary>

Something else uses port 5432 - usually a native PostgreSQL install. Check with:

```powershell
Get-NetTCPConnection -LocalPort 5432 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }
Get-Service postgresql*
```

Then either set `POSTGRES_PORT=5433` in the root `.env` and
`DATABASE_URL=postgresql://reindrop:reindrop@localhost:5433/reindrop` in `apps/api/.env`,
`apps/worker/.env` and `packages/db/.env` - or stop the native service (admin PowerShell):
`Stop-Service postgresql-x64-18; Set-Service postgresql-x64-18 -StartupType Manual`.

</details>

<details>
<summary><strong>Port 3000 or 4000 already in use</strong></summary>

An earlier dev server is still running. Find it with
`Get-NetTCPConnection -LocalPort 4000 -State Listen` and close that window (or
`Stop-Process -Id <OwningProcess>`).

</details>

<details>
<summary><strong>Docker: "failed to connect to the docker API"</strong></summary>

Docker Desktop isn't running. Start it and wait for "Engine running".

</details>

---

<p align="center">
  <sub>Made for resellers who'd rather be flipping than refreshing.<br>
  <strong>Rein Drop</strong> · private repository · © 2026</sub>
</p>
