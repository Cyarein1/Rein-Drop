# 0011 - Internal ingestion diagnostics (economics and freshness)

Status: accepted (step 39, Build Prompt 36)

## Context

Before adding marketplaces we need to answer, per marketplace source: what does one active Hunt
cost, how fresh are results, and how much noise is filtered? Most raw facts already existed
(SearchRun counts and `sourceUsage`, Listing `listedAt` / `firstSeenAt`, HuntMatch, DealAnalysis,
Alert); request latency was only kept as the latest value on MarketplaceHealth.

## Decision

- **Internal, development only.** `GET /dev/diagnostics/ingestion` (signed in; 404 in
  production, like `/dev/notifications`) and the web page `/dev/diagnostics`, linked only from
  `/dev` - not from the app shell, Settings or mobile. It is system-wide (every user's Hunts), so it
  must never become customer analytics as-is; an admin role is needed before it runs anywhere shared.
- **Live PostgreSQL aggregates**, no new tables: grouped by (marketplace, provider) plus a totals
  row (`GROUPING SETS`). One new column, `SearchRun.requestLatencyMs` (slowest source request per
  run, measured by the worker, failures included).
- **Window**: `?hours=` (1 to 2160, default 24) rolling to now, or `?since=&until=` for a controlled
  test window.
- **Attribution**: search activity by the run's provider; candidates, analyses and alerts by the
  search run that first produced the match (`HuntMatch.firstSearchRunId`); listing age by the run
  that first fetched the listing.
- **Metrics**: runs / requests (reported usage, else pages fetched) / Hunts served; listings
  returned (repeats included), new, updated, duplicates, unreadable; candidate checks, matches
  (repeats included), new matches, rejections and their reasons; AI analyses (completed, failed,
  alert-eligible, providers, tokens when reported, duration); alerts; request and whole-run latency
  (p50 / p95 / max); listing age at discovery = first seen - posted (only where the source exposes
  a posting time; Apify doesn't).
- **Cost** is only what sources report: USD sum, whether any is an estimate, runs with unknown
  cost (free / quota-based / not reported - never treated as zero in the ratios' meaning). Ratios:
  per run, per new match, per alert, and per Hunt-day = known cost / Hunts served / window days.
  Grouped runs split their cost evenly between their Hunts. **AI cost is reported as unknown**:
  the mock reports no usage and no AI pricing exists yet (with Foundry, prompt 37).

## Consequences

- Answers the checkpoint questions from real runs without new infrastructure.
- Per Hunt-day assumes every Hunt served was active for the whole window, so it understates the
  daily cost of Hunts that ran for only part of it; use a test window that matches when the Hunts
  ran.
- Aggregates run on each request over `startedAt` / `firstSeenAt` / `createdAt` without dedicated
  indexes - fine for development volumes; revisit before using on large data.
