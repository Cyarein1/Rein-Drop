# 0015 - Azure hosting for the first beta (Container Apps Consumption, no fixed-fee services)

Status: accepted (step 45, Build Prompt 42) - infrastructure as code only; nothing was provisioned

## Context

The MVP runs locally (step 44). The first hosted beta must run the API, the worker and the web
app on Azure (Technical Architecture), keep secrets out of code and configuration, and avoid
services with a monthly baseline cost before there are paying users. The owner's instruction:
"Do not provision expensive services automatically"; where a required service has a baseline
cost we are not ready to pay, keep a compatible free / low-cost alternative and record the
future Azure migration.

## Decision

- **Compute: Azure Container Apps, Consumption workload profile** for all three apps, one
  environment, one Docker build (`Dockerfile` targets `api`, `worker`, `web`, `migrate`).
  - API: scales 0-1 (scale to zero; one replica max until rate-limit counters move to a shared store).
  - Web: scales 0-2.
  - Worker: always 1 replica, no ingress (the scheduler and queue loop run continuously). This is
    the one component that exceeds the monthly free grant - an accepted small, steady cost.
  - Migrations: a manually triggered Container Apps **job** running `prisma migrate deploy`,
    started by a person before each release. Apps never migrate on start-up.
- **Web on Container Apps, not Static Web Apps Free.** The web app needs a Node server at request
  time (proxy-based Entra token refresh and cookie rewrite, auth route handlers, Server Actions,
  server-side API calls with the user's token) and runtime secrets. SWA hybrid Next.js is in
  preview with a 250 MB app limit and no confirmed support for Next.js 16 proxy / Cache
  Components; Key Vault references need SWA Standard. Next.js builds with `output: "standalone"`.
- **Secrets: Key Vault (RBAC) + one user-assigned managed identity.** Justified because there are
  seven runtime secrets shared across three apps and a job: the identity gets *Key Vault Secrets
  User* on this vault only; Container Apps secrets are Key Vault references (versionless, so
  rotation needs no redeploy). No secret appears in Bicep, parameter files or app settings. The
  person deploying gets *Secrets Officer* (parameter `vaultWriterObjectId`). Two-phase deploy:
  foundation first, then secrets, then apps.
- **Database: bring your own PostgreSQL by default** (`deployPostgres = false`, `database-url`
  secret with `sslmode=require`). Azure Database for PostgreSQL Flexible Server bills compute for
  every hour it exists. The template can create a B1ms / 32 GB / 7-day-backup server
  (`deployPostgres = true`), which is free for 12 months on an Azure free account and billed
  otherwise. **Future migration**: move to Azure PostgreSQL Flexible Server (dump / restore,
  runbook section 5) when the beta needs Azure-managed backups / PITR (D38), private networking,
  or the external option's limits are reached.
- **Images: GitHub Container Registry**, not Azure Container Registry (ACR has no free tier and
  bills per day). Public packages need no credentials; private ones use a read-only token from
  Key Vault.
- **Logs: Log Analytics** with a 0.2 GB/day ingestion cap and 30-day retention. No Application
  Insights yet (beta telemetry is Build Prompt 43, D15).
- **Cost control: a Cost Management budget** (`infra/budget.bicep` or portal), actual 50 / 80 /
  100 % and forecast 100 % email alerts, scoped to the beta resource group. The amount is the
  owner's decision - no default in code. Budgets notify only; the runbook lists what to switch off.
- **Not used**: Dedicated workload profiles, Front Door, VNet / private endpoints, Redis,
  Container Registry. Each would add a baseline cost; revisit with real traffic.
- **Facebook source is not configured in the beta** (D12 - legal review pending); eBay uses the
  Browse API with the production keyset.

## Consequences

- One deploy path and one log workspace for all apps; the same images run locally (`docker run`)
  and on Azure - all four were built and started locally in production mode.
- First requests after idle periods are slow (cold start from zero) for API and web.
- The API can't scale out until rate limiting uses a shared store.
- The external database (default) is outside Azure: latency between regions, and backups are the
  provider's. The free-account PostgreSQL ends after 12 months - a calendar item.
- Public network access everywhere (Key Vault, PostgreSQL with `AllowAzureServices`), protected
  by identity / passwords and TLS, not by network isolation.
- Deployment is manual (Azure CLI). A CI/CD pipeline with OIDC federation is future work.

Runbook: [docs/azure/BETA_DEPLOYMENT.md](../azure/BETA_DEPLOYMENT.md).
