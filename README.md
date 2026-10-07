# Rein Drop

AI-powered reseller sourcing platform. TypeScript monorepo (pnpm workspaces + Turborepo):
a modular-monolith API, separate background worker, web app and mobile app.

Current progress and next step: [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md).

## Ports

| Service | Address | Configured by |
|---|---|---|
| Web (Next.js) | http://localhost:3000 | `apps/web/package.json` (`--port 3000`) |
| API (NestJS) | http://localhost:4000 (health: `/health`) | `PORT` in `apps/api/.env` |
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
| `packages/contracts` | `@rein-drop/contracts` | Shared API request/response types |
| `packages/api-client` | `@rein-drop/api-client` | Typed fetch client for the API (web + mobile) |
| `packages/db` | `@rein-drop/db` | Prisma schema, migrations, seed, client (server-only) |
| `packages/env` | `@rein-drop/env` | Server-side env validation helpers (api + worker) |
| `packages/marketplace-core` | `@rein-drop/marketplace-core` | Marketplace adapter boundary (eBay, Facebook Marketplace) |
| `packages/ai-core` | `@rein-drop/ai-core` | `AIProvider` boundary (mock locally, Microsoft Foundry later) |
| `packages/design-tokens` | `@rein-drop/design-tokens` | Brand colors |
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
| `DATABASE_URL` | api, worker, Prisma CLI (`packages/db`) | `postgresql://reindrop:reindrop@localhost:5432/reindrop` | Required in production (api/worker). Set it in each `.env` you use. |
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
pnpm --filter api dev       # http://localhost:4000/health (includes "database": "up" | "down")
pnpm --filter worker dev    # logs a heartbeat
pnpm --filter web dev       # http://localhost:3000 - shows API reachability
pnpm --filter mobile start  # scan the QR code with Expo Go
```

Physical phone: set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` to your computer's LAN IP
(find it with `ipconfig`, "IPv4 Address"), e.g. `http://192.168.1.50:4000`, and allow Node.js
through Windows Firewall on private networks when prompted.

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
pnpm test       # api + worker unit tests
pnpm clean      # remove build output
```

Single workspace: `pnpm --filter <name> <script>`, e.g. `pnpm --filter api test:e2e`.
