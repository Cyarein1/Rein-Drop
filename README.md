# Rein Drop

AI-powered reseller sourcing platform. TypeScript monorepo (pnpm workspaces + Turborepo):
a modular-monolith API, separate background worker, web app and mobile app.

Current progress and next step: [docs/BUILD_STATUS.md](docs/BUILD_STATUS.md).

## Layout

| Path | Package name | What | Local address |
|---|---|---|---|
| `apps/web` | `web` | Next.js (App Router) | http://localhost:3000 |
| `apps/api` | `api` | NestJS HTTP API | http://localhost:4000 |
| `apps/worker` | `worker` | Nest standalone background worker (no HTTP) | - |
| `apps/mobile` | `mobile` | Expo / React Native | Expo dev server |
| `packages/contracts` | `@rein-drop/contracts` | Shared API request/response types | |
| `packages/api-client` | `@rein-drop/api-client` | Typed fetch client for the API (web + mobile) | |
| `packages/marketplace-core` | `@rein-drop/marketplace-core` | Marketplace adapter boundary (eBay, Facebook Marketplace) | |
| `packages/ai-core` | `@rein-drop/ai-core` | `AIProvider` boundary (mock locally, Microsoft Foundry later) | |
| `packages/design-tokens` | `@rein-drop/design-tokens` | Brand colors | |
| `packages/config` | `@rein-drop/config` | Shared tsconfig base | |

Shared packages are ESM and compile to `dist/`. Turborepo builds them before any app
that depends on them (`dependsOn: ["^build"]`), including before `dev`.

## Prerequisites

- Node.js 20+ (developed on Node 24)
- pnpm (`npm install -g pnpm`)
- Docker Desktop (needed once PostgreSQL is added)
- For mobile: Expo Go on a phone, or an Android emulator / iOS simulator

## Setup

```sh
pnpm install
# optional: copy env examples - every value has a working local default
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

## Running locally (one terminal per process)

```sh
pnpm --filter api dev       # http://localhost:4000/health
pnpm --filter worker dev    # logs a heartbeat
pnpm --filter web dev       # http://localhost:3000 - shows API reachability
pnpm --filter mobile start  # scan the QR code with Expo Go
```

On a physical phone, set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` to your computer's
LAN IP (e.g. `http://192.168.1.50:4000`) - `localhost` there means the phone itself.

## Whole-repo commands

```sh
pnpm build      # build every workspace (mobile = expo export for android + ios)
pnpm typecheck
pnpm lint
pnpm test       # currently: api unit tests
pnpm clean      # remove build output
```

Single workspace: `pnpm --filter <name> <script>`, e.g. `pnpm --filter api test:e2e`.
