# Build Status

_Last updated: 2026-10-07_

## Completed steps

### Step 1 - Monorepo initialization

pnpm workspaces + Turborepo with 4 apps and 6 packages. No business features.

**What works (verified)**

- `pnpm build` - all 9 buildable workspaces build (web `next build`, api/worker `nest build`,
  packages `tsc`, mobile `expo export` for android + ios).
- `pnpm typecheck` - 12/12 tasks pass.
- `pnpm lint` - 12/12 tasks pass (oxlint for api/worker/packages, ESLint for web/mobile).
- `pnpm test` - api unit test passes; `pnpm --filter api test:e2e` passes.
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
- PostgreSQL / Prisma / docker-compose not added yet (not part of this step).
- Git: repo initialized (branch `master`), nothing committed yet.

## TODOs carried forward

- `TODO(marketplace)`: normalized Listing model + MarketplaceProvider interface; Facebook data provider TBD.
- `TODO(ai)`: AIProvider interface + deterministic MockAIProvider; Foundry models per task TBD.
- `TODO(worker)`: job runner / scheduler abstraction; queue choice TBD.
- `TODO(brand)`: typography, spacing, radius tokens.

## Next step

Database foundation: `docker-compose.yml` with PostgreSQL on :5432, Prisma in the monorepo,
API connection + health check that includes DB status. (Await the next prompt.)
