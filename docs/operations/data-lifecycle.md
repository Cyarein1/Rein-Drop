# Data lifecycle: retention TODOs and backup plan

Status: plan (step 43). Periods marked TBD need a product / legal decision (D38); nothing below is
automated yet.

## Retention (TODO)

Nothing is deleted today. Tables that grow with use, with a **proposed** policy:

| Table | Grows by | Proposed policy (TBD - D38) | Needs |
|---|---|---|---|
| Job | every search / analysis job | delete SUCCEEDED after 7 days, DEAD after 30 | index `(status, completedAt)` |
| RawListing | one full payload per fetch per run | keep the latest snapshot per listing; delete older after 30 days | index on `fetchedAt` |
| SearchRun | one per search | keep 90 days (diagnostics windows are 90 days max) | existing `startedAt` indexes |
| DealAnalysis | one per open match per day | keep the latest per match + any referenced by an Alert / InventoryItem | - |
| UsageEvent | one per hunt per run | aggregate to daily totals after the billing period closes | - |
| NotificationDelivery | 1-3 per alert | 90 days | index on `createdAt` |
| BillingEvent | one per Stripe webhook | 13 months (support / disputes) | index `(status, updatedAt)` exists |
| HuntEvent | per edit / transition | keep for the hunt's life (history is a feature) | - |
| Logs | per request | per the Azure Log Analytics workspace retention (30-90 days) | - |

User deletion: deleting a `User` cascades to their hunts, matches, alerts, inventory, sales,
costs, subscriptions and billing customer; shared `Listing` rows stay (not personal data). The
Stripe customer and Entra account must be deleted at the provider too (not built).

## Backups (plan for Azure Database for PostgreSQL - Flexible Server)

- **Automated backups**: enabled by the service (daily snapshots + transaction logs) with
  point-in-time restore. Set the retention to the maximum the tier allows that the budget
  accepts (the service allows 7-35 days); use **geo-redundant backup storage** for production.
- **Restore drill**: quarterly, restore to a new server at a point in time, run
  `prisma migrate status` and the API readiness check against it, record the time it took (RTO)
  and the data gap (RPO).
- **Before risky migrations**: an on-demand backup / restore point; migrations are forward-only
  SQL files reviewed in the PR.
- **Logical exports**: monthly `pg_dump` (custom format) to an Azure Storage account with
  immutability (WORM) for a longer history than PITR - TBD with D38.
- **Secrets**: Key Vault soft-delete + purge protection on (keys can be recovered).
- **Local development**: `docker compose down -v` deletes the local database - it is never a backup.

RPO / RTO targets are a product decision (TBD); PITR gives minutes-level RPO.
