# Azure beta deployment - runbook

First Azure-hosted beta of Rein Drop: what gets created, what it costs, and the exact steps to
deploy, migrate, budget and tear down. Decision record: [0015](../decisions/0015-azure-beta-hosting.md).
Infrastructure as code: [`infra/`](../../infra) (Bicep). Container images: [`Dockerfile`](../../Dockerfile).

> **Nothing in this repository deploys by itself.** Every command below is run by a person,
> on purpose, against a subscription they chose. No pipeline, script or test provisions Azure.

## 1. What runs where

| Piece | Azure resource | Size / scale | Why |
|---|---|---|---|
| API (NestJS) | Container App `<prefix>-api`, Consumption | 0.5 vCPU / 1 GiB, **0-1 replicas** (scales to zero) | HTTP; max 1 while rate-limit counters are in memory (hardening report) |
| Web (Next.js 16) | Container App `<prefix>-web`, Consumption | 0.5 vCPU / 1 GiB, **0-2 replicas** | Needs a Node server - see section 9 |
| Worker (scheduler + queue) | Container App `<prefix>-worker`, Consumption, no ingress | 0.25 vCPU / 0.5 GiB, **always 1 replica** | Polls Hunts continuously |
| Migrations | Container Apps **Job** `<prefix>-migrate`, manual trigger | 0.25 vCPU / 0.5 GiB while running | `prisma migrate deploy`, run before each release |
| Secrets | Key Vault (Standard, RBAC, soft delete + purge protection) | - | Apps read secrets with a managed identity |
| Identity | One user-assigned managed identity `<prefix>-apps-id` | - | Role *Key Vault Secrets User* on the vault only |
| Logs | Log Analytics `<prefix>-logs` | **0.2 GB/day cap**, 30-day retention | Container console logs (JSON) |
| Database | **Not created by default** (`deployPostgres=false`) | - | See section 5 |
| Images | **GitHub Container Registry** (ghcr.io) | - | Azure Container Registry has no free tier |

Not created: Azure Container Registry, Front Door, VNet / private endpoints, a Dedicated workload
profile, Redis, Application Insights. Custom domains are not configured (the apps use their
`*.azurecontainerapps.io` addresses).

Files:

```
Dockerfile                      targets: api, worker, web, migrate (one build stage)
.dockerignore
infra/main.bicep                resource-group deployment (two phases)
infra/modules/foundation.bicep  logs, managed identity, Key Vault, role assignments
infra/modules/environment.bicep Container Apps environment (Consumption workload profile)
infra/modules/container-app.bicep  one app (Key Vault secret references, probes, scale)
infra/modules/migrate-job.bicep    manual migration job
infra/modules/postgres.bicep    OPTIONAL PostgreSQL Flexible Server (B1ms) - off by default
infra/budget.bicep              subscription-scope Cost Management budget
infra/beta.example.bicepparam   parameter template (identifiers only, no secrets)
```

## 2. Prerequisites

- An Azure subscription you are allowed to spend on, and the **Owner** or **User Access
  Administrator + Contributor** role on the resource group (the template creates role assignments).
- Azure CLI with Bicep (`az bicep version`), Docker, a GitHub account for ghcr.io.
- The external services already set up as for the local "real providers" run
  ([LOCAL_MVP_ACCEPTANCE.md](../LOCAL_MVP_ACCEPTANCE.md) "Configurations"):
  Entra External ID tenant + API and web app registrations (decision 0013), Stripe account with
  prices (decision 0014), eBay production keyset (D12), Microsoft Foundry deployment (decision 0012).
- A PostgreSQL database reachable from the internet over TLS (section 5).
- **Set the budget first** (section 7) - it takes up to a day for cost data to appear.

```bash
az login
az account set --subscription "<subscription name or id>"
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
az group create --name rg-reindrop-beta --location <region>
```

Pick a region that offers Container Apps, Key Vault and (if you'll use it) PostgreSQL Flexible
Server. The region also decides prices - check it in the pricing calculator.

## 3. Build and push the images

One image per target, tagged with the git commit. The web image has no build-time configuration
(no `NEXT_PUBLIC_*`), so the same image works in every environment.

```bash
SHA=$(git rev-parse --short HEAD)
OWNER=<github-user-or-org>              # lower case
for t in api worker web migrate; do
  docker build --target $t -t ghcr.io/$OWNER/rein-drop-$t:$SHA .
done

# A GitHub personal access token (classic) with write:packages
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
for t in api worker web migrate; do docker push ghcr.io/$OWNER/rein-drop-$t:$SHA; done
```

Packages on ghcr.io are **private** by default. Either:

- make the four packages public (GitHub -> Packages -> package settings -> visibility) and keep
  `registryUsername = ''`, or
- keep them private: set `registryUsername` to your GitHub user and store a token with only
  `read:packages` in Key Vault as `registry-password` (section 4, step 2).

Sizes when built (2026-10-09): api 834 MB, worker 815 MB, web 313 MB, migrate 3.5 GB (it reuses
the whole build stage - a slimmer image is in OUTSTANDING).

## 4. Deploy

### Step 1 - foundation (no apps yet)

```bash
cp infra/beta.example.bicepparam infra/beta.bicepparam    # git-ignored
# fill in: vaultWriterObjectId (az ad signed-in-user show --query id -o tsv), imagePrefix,
# imageTag, Entra ids, Stripe price ids, eBay client id, Foundry endpoint / deployment
az deployment group create -g rg-reindrop-beta -f infra/main.bicep -p infra/beta.bicepparam
```

`deployApps = false` creates only the log workspace, the managed identity, Key Vault (+ your
*Secrets Officer* role) and the Container Apps environment. `beta.bicepparam` holds identifiers,
never secrets - it is still environment-specific, so keep it out of git or in a private repository.

Note the outputs:

```bash
az deployment group show -g rg-reindrop-beta -n main --query properties.outputs
```

### Step 2 - put the secrets into Key Vault

Secrets never go into parameters, templates or app settings. Role assignments can take a few
minutes to apply; if `secret set` returns 403, wait and retry.

```bash
KV=<keyVaultName output>
az keyvault secret set --vault-name $KV --name database-url            --value "postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require"
az keyvault secret set --vault-name $KV --name stripe-secret-key       --value "<sk_live_... or sk_test_...>"
az keyvault secret set --vault-name $KV --name stripe-webhook-secret   --value "<whsec_... - after step 4, see below>"
az keyvault secret set --vault-name $KV --name entra-web-client-secret --value "<web app registration client secret>"
az keyvault secret set --vault-name $KV --name auth-session-secret     --value "$(openssl rand -base64 48)"
az keyvault secret set --vault-name $KV --name foundry-api-key         --value "<Foundry key>"
az keyvault secret set --vault-name $KV --name ebay-client-secret      --value "<eBay production cert id>"
# only for private images:
az keyvault secret set --vault-name $KV --name registry-password       --value "<GitHub token with read:packages>"
```

Every secret the apps reference must exist before step 3, or the revision fails to start. The
Stripe webhook secret is only known after the endpoint exists (step 4): set a placeholder value
now and replace it then.

Tip: avoid secrets in shell history - `--file <path>` reads the value from a file
(`az keyvault secret set --vault-name $KV --name x --file secret.txt`), then delete the file.

### Step 3 - apps and the migration job

Set `deployApps = true` in `beta.bicepparam` and deploy again:

```bash
az deployment group create -g rg-reindrop-beta -f infra/main.bicep -p infra/beta.bicepparam
```

Then apply the database migrations (also before every later release that adds migrations):

```bash
az containerapp job start -g rg-reindrop-beta -n rd-beta-migrate
az containerapp job execution list -g rg-reindrop-beta -n rd-beta-migrate -o table   # Succeeded?
```

Seed the marketplaces and plans once on a new database, from a trusted machine with the repository
checked out. With `NODE_ENV=production` the seed skips the development user (it only upserts
marketplaces, plans and entitlements, so it is safe to repeat):

```bash
NODE_ENV=production DATABASE_URL="<the database-url value>" pnpm --filter @rein-drop/db db:seed
```

The seeded plan limits are still placeholders (D3).

### Step 4 - wire the external services to the new URLs

From the deployment outputs:

| Output | Where it goes |
|---|---|
| `entraWebRedirectUri` (`https://<prefix>-web.<env domain>/auth/callback`) | Entra admin center -> web app registration -> Authentication -> Web redirect URI. Add the web URL as front-channel logout / post-logout URL as you did locally. |
| `stripeWebhookUrl` (`https://<prefix>-api.<env domain>/billing/webhooks/stripe`) | Stripe dashboard -> Developers -> Webhooks -> add endpoint with the events in decision 0014. Copy its signing secret into `stripe-webhook-secret`. |
| `webUrl` | Stripe Customer Portal default return URL (optional), Entra branding links |

After changing a secret, restart the app so it picks it up immediately (versionless Key Vault
references otherwise refresh within 30 minutes):

```bash
az containerapp revision restart -g rg-reindrop-beta -n rd-beta-api \
  --revision $(az containerapp show -g rg-reindrop-beta -n rd-beta-api --query properties.latestRevisionName -o tsv)
```

### Step 5 - check

```bash
API=<apiUrl output>; WEB=<webUrl output>
curl -s $API/health          # {"status":"ok",...}
curl -s $API/ready           # {"status":"ready","checks":{"database":"up"}}
curl -s -o /dev/null -w "%{http_code}\n" $API/me     # 401
az containerapp logs show -g rg-reindrop-beta -n rd-beta-worker --tail 20   # "Pipeline started ..."
```

Then open `$WEB`, sign up with email / password, and walk the acceptance sequence
([LOCAL_MVP_ACCEPTANCE.md](../LOCAL_MVP_ACCEPTANCE.md)) with the real providers. The first
request after the API / web have been idle takes a few seconds (cold start from zero replicas).

### Releasing a new version

Build and push with a new tag, run the migration job **with the new image**, then update the apps:

```bash
az containerapp job update -g rg-reindrop-beta -n rd-beta-migrate --image ghcr.io/$OWNER/rein-drop-migrate:$SHA
az containerapp job start  -g rg-reindrop-beta -n rd-beta-migrate
# then set imageTag=$SHA in beta.bicepparam and redeploy (step 3), or per app:
az containerapp update -g rg-reindrop-beta -n rd-beta-api --image ghcr.io/$OWNER/rein-drop-api:$SHA
```

Migrations must stay backwards compatible with the running version for the minutes between the
job and the app update (add columns before using them; remove later).

## 5. Database

The apps need PostgreSQL (tested locally with 18; Prisma migrations are plain SQL). Azure Database
for PostgreSQL Flexible Server has a **monthly baseline cost** even when idle (compute is billed
per hour while the server exists, plus storage) - so it is **off by default**.

Options, in order of cost:

1. **Azure free account** (new customers): 12 months of a Burstable **B1MS** server for up to
   750 hours a month + 32 GB storage + 32 GB backup at no charge; after 12 months it is billed at
   pay-as-you-go rates unless deleted. If your subscription is a free account, deploy it with
   `deployPostgres = true` (the template uses exactly B1ms / 32 GB / 7-day backup / no HA) - and
   check the free-services page of your subscription first, since only that tier and size is free.
2. **An external managed PostgreSQL** you already have or a provider's free / low-cost tier
   (any PostgreSQL 14+ that accepts TLS connections from the internet). Keep `deployPostgres =
   false` and put its connection string into `database-url` with `sslmode=require`. Check the
   provider's limits (connections, storage, inactivity suspension - a suspended database makes
   the worker's first ticks fail until it wakes up, which the worker tolerates) and where its data
   is stored.
3. **`deployPostgres = true` on a pay-as-you-go subscription**: B1ms Burstable, 32 GB, 7-day
   backups, public access limited to Azure services. **This has a monthly cost from the moment it
   is created** - look it up for your region in the
   [pricing calculator](https://azure.microsoft.com/pricing/calculator/) before you choose it.
   Pass the admin password at deploy time, never in the parameter file:
   `az deployment group create ... -p infra/beta.bicepparam -p postgresAdminPassword="$(read -s p; echo $p)"`.
   Then create the `database-url` secret from the `postgresHost` output:
   `postgresql://<admin>:<password>@<postgresHost>:5432/reindrop?sslmode=require`.

The firewall rule `AllowAzureServices` (0.0.0.0) lets **any** Azure-hosted client try to connect
(password still required); private networking needs a VNet-integrated environment, which costs
more - recorded in OUTSTANDING with the move to Azure PostgreSQL.

**Future migration to Azure PostgreSQL** (when the beta outgrows option 1 / 2):
`pg_dump --format=custom` from the old database, create the server (`deployPostgres = true`),
`pg_restore --no-owner` into `reindrop` (stop the worker first - section 7, "When a budget alert
fires", step 4 - so nothing is written during the copy), switch `database-url`, restart the apps,
start the worker again. Turn on point-in-time-restore
drills then (docs/operations/data-lifecycle.md, D38).

## 6. What it costs (shape, not numbers)

Prices change and depend on region and currency, so this runbook gives **no amounts** - use the
pricing calculator and Cost Management. What drives the bill:

- **Container Apps (Consumption)**: per second of vCPU and GiB while replicas run, plus requests.
  Every subscription gets a monthly free grant (180,000 vCPU-seconds, 360,000 GiB-seconds and
  2 million requests). Apps scaled to **zero cost nothing**.
  - API and web scale to zero when idle, so light beta traffic should stay inside the grant.
  - **The worker is always on** (1 replica x 0.25 vCPU x 0.5 GiB, around the clock). That alone
    uses more vCPU-seconds than the free grant in a month, so **expect a small, steady Container
    Apps charge** for the worker. To avoid it: stop the worker when nobody is testing
    (`az containerapp revision deactivate`), or convert it to a scheduled job (OUTSTANDING).
  - The migration job is billed only while it runs (seconds).
- **Log Analytics**: per GB ingested beyond the monthly free allowance; capped at **0.2 GB/day**
  (`logDailyCapGb`) - when the cap is hit, logs stop for the rest of the day (the apps keep
  running). Retention 30 days.
- **Key Vault (Standard)**: per secret operation; the apps read secrets at startup and on refresh,
  so this is very small.
- **Managed identity, the Container Apps environment (no Dedicated profile)**: no charge.
- **GitHub Container Registry**: free for public packages; private packages count against your
  GitHub plan's storage / transfer.
- **Not Azure**: Foundry tokens (decision 0012 - budget per analysis D33), eBay quota, Stripe fees,
  the external database (option 2).
- **Optional PostgreSQL** (section 5): hourly compute + storage + backup beyond the free amount.

The biggest variable cost is the **poll interval** (`huntPollIntervalMinutes`, default 30): each
check is an eBay call and possibly AI analyses. The development diagnostics report
(decision 0011) shows requests and AI cost per marketplace - it is a development route
(404 in production); read the same tables with SQL when needed.

## 7. Budget and cost alerts (Azure Cost Management)

Budgets **only notify** - they never stop or delete anything. Set one before deploying.

### In the portal

1. Azure portal -> **Cost Management + Billing** -> **Cost Management** -> **Budgets** -> **Add**.
2. Scope: your subscription (or the `rg-reindrop-beta` resource group).
3. Name `rein-drop-beta-monthly`, reset period **Monthly**, creation / expiration dates, amount -
   **your decision** (the forecast chart helps once there is a few days of data).
4. Filter (subscription scope): *Resource group name* = `rg-reindrop-beta`.
5. Alert conditions: **Actual** 50 %, 80 %, 100 %, and **Forecasted** 100 %; alert recipients
   (email). Language as you prefer.
6. Create. New subscriptions can take up to 48 hours before budgets are available, and cost data
   lags by several hours, so an alert can arrive after the threshold was crossed.

### As code (same budget)

```bash
az deployment sub create --location <region> --template-file infra/budget.bicep \
  --parameters amount=<whole currency units> startDate=$(date +%Y-%m-01) \
               contactEmails='["you@example.com"]' resourceGroupName=rg-reindrop-beta
```

`startDate` must be the first day of a month. The amount is in the subscription's billing
currency. Delete it with `az consumption budget delete --budget-name rein-drop-beta-monthly`.

Also useful: **Cost analysis** (group by *Service name* / *Resource*) daily for the first week,
and **Cost alerts -> Anomaly alerts** on the subscription.

### When a budget alert fires

In order of impact (cheapest first):

1. Look at Cost analysis by resource - what grew?
2. Logs: lower `logDailyCapGb`; check for an error loop in the worker (repeated "tick failed").
3. AI / source usage: raise `huntPollIntervalMinutes`; pause Hunts; check the Foundry deployment.
4. Stop the worker (`az containerapp revision deactivate -g rg-reindrop-beta -n rd-beta-worker
   --revision <name>`; `activate` to resume). Hunts simply aren't checked while it is stopped.
5. Stop everything: deactivate the active revision of all three apps the same way, or tear down
   (section 8). An optional PostgreSQL server can be **stopped** for up to 7
   days (`az postgres flexible-server stop`; storage is still billed, it restarts automatically
   after 7 days).

## 8. Tear down

```bash
az group delete --name rg-reindrop-beta --yes
az consumption budget delete --budget-name rein-drop-beta-monthly
```

Key Vault is soft-deleted with **purge protection** (90 days): its name stays reserved and a new
deployment in the same resource group gets the same name, so recreate in a different resource
group or recover it (`az keyvault recover --name <kv>`). Images on ghcr.io and the external
database are not touched.

## 9. Static Web Apps vs Container Apps for the web app (evaluation)

What the Next.js app actually needs (apps/web, Next.js 16, App Router):

- a **Node server at request time**: the auth proxy (`src/proxy.ts`) refreshes Entra tokens and
  rewrites cookies on every protected request; `/auth/sign-in`, `/auth/callback`, `/auth/sign-out`
  are route handlers; mutations are **Server Actions**; pages fetch the API server-side with the
  user's token;
- **runtime secrets** (`ENTRA_WEB_CLIENT_SECRET`, `AUTH_SESSION_SECRET`) - never baked into a build;
- Cache Components / dynamic rendering, security headers from `next.config.ts`;
- a server-to-server call to the API (`API_BASE_URL`).

| | Static Web Apps (Free) | Container Apps (Consumption) |
|---|---|---|
| Next.js support | Hybrid rendering is **preview**; supported features depend on the Next.js version; nothing confirms Next.js 16 proxy / Cache Components | Runs `next start` (standalone server) - exactly what was tested locally |
| App size | 250 MB limit for hybrid apps | Image size only |
| Server features | Managed backend only (Free); "bring your own" linked backends unsupported for hybrid Next.js | Full Node server, all features |
| Secrets | Environment variables in the SWA app settings (Key Vault references need the Standard plan) | Key Vault references via managed identity, like the API |
| Cost | Free plan | Scales to zero; inside the shared free grant at beta traffic |
| Operations | Separate platform, separate logs | Same environment, logs, identity and deploy path as API / worker |

**Decision: Container Apps.** SWA Free would only be cheaper on paper; its hybrid Next.js mode is
in preview and the app depends on exactly the server features (proxy-based token refresh, route
handlers, Server Actions, runtime secrets) that are least certain there. Revisit if the web app
ever becomes mostly static or SWA's Next.js support becomes generally available for the version
in use. The Dockerfile already builds the web app with `output: "standalone"`.

## Sources (Microsoft Learn, read 2026-10-09)

- Container Apps billing (free grant, scale to zero, idle rate, jobs):
  https://learn.microsoft.com/azure/container-apps/billing
- Container Apps secrets with Key Vault references:
  https://learn.microsoft.com/azure/container-apps/manage-secrets
- Static Web Apps hybrid Next.js (preview, limits):
  https://learn.microsoft.com/azure/static-web-apps/deploy-nextjs-hybrid
- PostgreSQL Flexible Server with an Azure free account:
  https://learn.microsoft.com/azure/postgresql/flexible-server/how-to-deploy-on-azure-free-account
- Container Registry service tiers: https://learn.microsoft.com/azure/container-registry/container-registry-skus
- Log Analytics cost and daily cap: https://learn.microsoft.com/azure/azure-monitor/logs/cost-logs
- Budgets with Bicep: https://learn.microsoft.com/azure/cost-management-billing/costs/quick-create-budget-bicep
- Budgets tutorial: https://learn.microsoft.com/azure/cost-management-billing/costs/tutorial-acm-create-budgets
