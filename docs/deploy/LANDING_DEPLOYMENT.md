# Landing page - deployment, preview and CI

_Written 2026-10-13 (Landing 24 = step 71). Nothing in this document has been provisioned; deployment
stays manual (decision 0015). Prices are deliberately not quoted - check each provider's current
pricing page when deciding._

## 1. What actually has to run

The landing is not a static site. From the code:

| Piece | Why it must run | Where |
|---|---|---|
| **Web** - Next.js 16 Node server (`output: "standalone"`) | `POST /api/waitlist` route handler (validation, honeypot, per-visitor rate limit, server-to-server call); the proxy (signed-in visitors on `/` go to `/home`); auth route handlers; the prerendered pages, social image, `robots.txt` and sitemap | `apps/web`, Dockerfile target `web` |
| **API** - NestJS | The **only database writer** (decision L-D3): public `POST /waitlist`, write-only | `apps/api`, target `api` |
| **PostgreSQL** | `WaitlistSignup` (+ the app's tables). Migrations via `prisma migrate deploy` | `packages/db`, target `migrate` |
| Worker | Not needed for a landing-only launch (it runs Hunts for signed-in users) | target `worker` |

So static hosting (or a static export) cannot serve this: the waitlist route, the proxy and the server
API call need a Node server, and the API needs a database.

## 2. Low-cost options (compatible with the above)

| Option | Fits the code? | Cost shape | Operations | Notes |
|---|---|---|---|---|
| **A. Azure Container Apps, Consumption** (decision 0015 - Bicep in `infra/`) - **recommended** | Yes - the same Docker images; web + API scale to zero | Pay per use above a monthly free grant; Log Analytics capped at 0.2 GB/day; **no fixed-fee service** unless you opt into managed Postgres | Low: managed TLS, revisions, Key Vault references | Cold start after idle (first visitor waits a few seconds - see §6). The worker is always-on in the template; for a landing-only phase it can be left undeployed (would need a template switch - not done) |
| B. One small VM / container host running the preview compose (with TLS in front) | Yes - `docker-compose.preview.yml` is the shape | Fixed monthly VM price, regardless of traffic | Higher: OS patching, TLS, backups, monitoring are yours | Predictable bill; single point of failure |
| C. A general container PaaS with a free / hobby tier | Usually - needs two services (web, API) + Postgres | Free tiers commonly sleep, cap hours or forbid commercial use | Low | Read the terms: some hobby tiers exclude commercial use; check Next.js 16 + Node 24 support |

**Database** (any option): bring-your-own PostgreSQL by default (`deployPostgres = false`, a managed
Postgres with a free tier, `sslmode=require`), or Azure Database for PostgreSQL Flexible Server B1ms
(12 months free on a new Azure free account, billed otherwise). Migration path: dump / restore,
runbook §5.

**Recommendation:** A with an external free-tier Postgres while there is only a waitlist; add the
worker and re-check the database choice when the app beta starts. Set a **Cost Management budget
before the first deploy** (runbook §7).

## 3. Settings: build-time, runtime and secrets

The web app inlines some **public** values when it is built, so each environment gets its own web
image (Dockerfile `--build-arg`; declared to Turborepo in `apps/web/turbo.json`).

| Setting | Kind | Preview | Production |
|---|---|---|---|
| `SITE_URL` | web build arg (public) | **empty** -> noindex, block-all robots, no canonical / structured data | `https://<public domain>` -> indexable, canonical, sitemap, JSON-LD |
| `CONTACT_EMAIL` | web build arg (public) | optional (empty -> "Contact details coming soon") | **required** - the privacy draft tells people to use it |
| `APP_STORE_URL`, `GOOGLE_PLAY_URL` | web build arg (public) | empty ("coming soon") | only once the apps are published |
| `NEXT_PUBLIC_LANDING_ANALYTICS_PROVIDER` | web build arg (public) | `console` | empty (= none) until a provider is chosen and added in code |
| `API_BASE_URL`, `APP_BASE_URL`, `ENTRA_*` ids | runtime env (not secret) | per environment | per environment |
| `DATABASE_URL`, `ENTRA_WEB_CLIENT_SECRET`, `STRIPE_*` keys, `EBAY_CLIENT_SECRET` | **runtime secrets** | placeholders (preview never calls those services) | **Key Vault** references only (runbook §4 step 2) |

Rules: no secret in the repository, in Bicep / parameter files, in image build args or in CI logs.
Local real values (if ever needed) go in `.env.*` files, which git ignores.

## 4. Preview environment (no cloud, no cost)

`docker-compose.preview.yml` runs the **production images** on this machine - Postgres (5433, own
volume), migration job, API (4100), web (3100) - separate from local development (5432 / 4000 / 3000):

```
docker compose -f docker-compose.preview.yml up -d --build --wait
cd apps/web
ANALYTICS_MODE=console node scripts/check-landing.mjs http://localhost:3100 .browser-check
node scripts/check-waitlist-e2e.mjs http://localhost:3100
cd ../.. && docker compose -f docker-compose.preview.yml down          # add --volumes to delete the data
```

An Azure preview (if ever wanted) is a **separate resource group** with its own budget, deployed by a
person with the runbook and `SITE_URL` left empty - never created by CI.

## 5. CI (`.github/workflows/ci.yml`)

Runs on pull requests and pushes to `main` / `master`. **Checks only**: no deploy step, no cloud
credentials, `permissions: contents: read`, no repository secrets.

1. **checks** - `pnpm turbo run build typecheck lint test` (the whole monorepo).
2. **preview-e2e** - a Postgres service container, `prisma migrate deploy`, the API and web in
   production mode (placeholder settings, preview build), then the landing browser check
   (`check-landing.mjs`) and the **live waitlist end to end** (`check-waitlist-e2e.mjs`). Screenshots
   and logs are uploaded only on failure (7 days).
3. **images** - builds the `api`, `migrate` and `web` Docker targets (not pushed), so a broken
   Dockerfile fails the PR.

Branch protection ("require CI to pass") is a repository setting for the owner.

## 6. Release flow (manual, per runbook)

1. PR -> CI green -> merge.
2. Build and push images to GHCR with the **production** web build args (`SITE_URL`,
   `CONTACT_EMAIL`, ...) - runbook §3.
3. Run the migration job (adds `WaitlistSignup` on first release) - runbook §4 step 3.
4. Deploy the new image tag - runbook §4.
5. Smoke-test production **read-only** (§7) - then work through `docs/LANDING_LAUNCH_CHECKLIST.md`.

Cold starts: with web + API at 0 minimum replicas the first visitor after idle waits for both to
start. Decision 0015 / OUTSTANDING suggest `minReplicas: 1` for the web app at launch (a small
always-on cost) - the owner's call.

## 7. Never point the writing tests at production

`check-waitlist-e2e.mjs` creates rows and `check-landing.mjs` submits one real sign-up. Both refuse
non-local URLs unless `ALLOW_WRITES=1` is set explicitly. In production, smoke-test by hand (open the
page, the legal drafts, `robots.txt`, one sign-up with your own address) or run the landing check
without `ALLOW_WRITES` (the writing check is skipped there).
