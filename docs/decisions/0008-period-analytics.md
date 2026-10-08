# 0008 - Period analytics from PostgreSQL aggregates

Status: accepted (step 33, Build Prompt 30). Date: 2026-10-08.

## Context

The App Flow Blueprint (section 12) asks for analytics from actual behaviour and outcomes:
revenue, realized profit, margin, capital deployed, buys, sells, inventory held; per Hunt
(alerts -> views -> buys -> sales, missed potential, ignore rate), per product and per
marketplace. Build Prompt 30: use PostgreSQL queries / aggregates, no warehouse.

## Decision

- **Live aggregates** in `apps/api/src/modules/analytics/analytics.sql.ts`, scoped to one user and
  one window. No warehouse, no copies, no scheduled roll-ups. Two indexes added for the period
  filters: `InventoryItem(userId, purchasedAt)` and `HuntMatch(huntId, matchedAt)`.
- **Periods** are rolling windows ending now: 7, 30 (default, same as Home), 90, 365 days, or
  all time. (A calendar month / user time zone is open - D24.)
- **Money** is per currency and never converted.
- **Capital deployed (spent)** = purchase price + purchase costs of items bought in the period.
- **Realized profit** = sale price - selling costs - purchase price - purchase costs, for sales in
  the period; the same formula as `realizedResult` (the integration test compares them). A sale
  whose purchase or costs are in another currency counts as a sale and as revenue but is left out
  of profit (`excludedSales`). **Margin** = realized profit / revenue of the comparable sales.
- **Held inventory** is a snapshot as of now (count, cost basis, oldest days held). Never a loss.
- **Hunt funnel** counts each event in the period by its own date: found (matchedAt), alerted
  (alert createdAt), viewed (seenAt), saved, ignored (dismissedAt), bought (purchasedAt), sold
  (soldAt). It is activity in the period, not a cohort of the deals found in the period. Rates:
  ignore rate = ignored / viewed; alert-to-buy = bought / alerted.
- **Products** are grouped by the AI-normalized product name of the deal's latest analysis,
  otherwise the inventory item's title (case-insensitive). Best realized result first, losses
  last (the loss review).
- **Marketplaces**: "sourced" = the listing's marketplace (found, alerted, bought, how it sold);
  "sold here" = the marketplace recorded on the sale. Bought outside Rein Drop = "other".
- **Missed potential** is its own endpoint and never part of profit or loss: strong / exceptional
  deals (latest analysis) found in the period, never bought, and no longer open - ignored, or gone
  (expired / listing sold, removed, ended). Their ESTIMATED upside is summed per currency only
  where comparable sales produced an estimate.

## Open

- D28: is "missed" the right definition (strength threshold; whether ignored deals count)?
- D29: funnel by activity (now) or by cohort of deals found in the period?
- Home's "spent" is purchase price only; Analytics' includes purchase costs (to align later).
