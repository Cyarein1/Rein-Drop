# Build Status

_Last updated: 2026-10-07_

## Completed steps

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

- **Port 5432 conflict on the dev machine:** a native Windows PostgreSQL 18 service
  (`postgresql-x64-18`, automatic start) already listens on 5432, so `pnpm infra:up` fails there
  until the user either stops that service or sets `POSTGRES_PORT=5433` (+ matching
  `DATABASE_URL`). See README troubleshooting. Decision pending with the user.
- The database is not connected by any app yet - `DATABASE_URL` is validated only.

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
- `TODO(brand)`: typography, spacing, radius tokens.

## Next step

Resolve the port 5432 conflict (stop native service vs. Docker on 5433), then the database
layer: Prisma in the monorepo, API/worker connection using the validated `DATABASE_URL`, and a
health check that reports DB status. (Await the next prompt.)
