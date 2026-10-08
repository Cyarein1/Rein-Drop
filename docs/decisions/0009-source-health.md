# 0009 - Marketplace source health, degradation and per-source backoff

Status: accepted (step 35, Build Prompt 32). Date: 2026-10-08.

## Context

Rein Drop depends on marketplace sources (eBay, Facebook Marketplace) that can be slow, return
partial results, rate-limit, or fail. Before this step a failure was only visible per Hunt as
"couldn't check X last time", a slow or partial search counted as a clean success, and a failing
source kept receiving every Hunt's searches (each retrying with its own backoff).

## Decision

- **MarketplaceHealth** (one row per marketplace) is written by the worker from every real search
  outcome, plus a periodic health probe of each adapter (`WORKER_HEALTH_PROBE_MS`). A probe only
  fills in when there is no recent search evidence, notices "not configured", and lets a source
  that recovered out of its cool-down early.
- **States**: healthy; degraded = working but slow (> `WORKER_SOURCE_SLOW_MS`), partial results,
  rate limited, or failing fewer than `WORKER_SOURCE_DOWN_AFTER` times in a row; down = failing
  repeatedly; not configured.
- **Per-source backoff (local worker)**: each failure sets a cool-down (`retryAfter`) of 30 s,
  doubling per consecutive failure, capped at 15 min, never earlier than the source's own
  retry-after. While a source cools down:
  - the scheduler doesn't queue searches for it; those Hunts' next check moves to the end of the
    cool-down (so screens show a true "tries again in ..."),
  - a job that still reaches it is deferred without using up an attempt (DeferJobError), so one bad
    source can't exhaust every Hunt's retries,
  - other sources are unaffected.
  A success clears failures and the cool-down. Search requests time out after
  `WORKER_SEARCH_TIMEOUT_MS` (a retryable failure).
- **Polls that worked but not fully** are recorded as `DEGRADED` on the Hunt's marketplace (with
  PARTIAL / SLOW), so a Hunt never shows "OK" for them.
- **What users see** (client-core `source-view.ts`): a calm line on Home, Hunts and Deals naming
  the affected source, saying the others continue and that retrying is automatic. Info tone when
  degraded, warning when not responding, never an error. Hunt monitoring lines and per-marketplace
  rows reflect the source's state; deals from it say updates may be late. A source the API has
  no recent report for (missing row, or older than an hour - e.g. the worker is off) is "unknown",
  never "healthy".
- **Simulation**: development sources gain `EBAY_DEV_LATENCY_MS` / `FACEBOOK_DEV_LATENCY_MS` and
  scenarios `slow` (+6 s per request) and `flaky` (every other request fails), alongside degraded,
  rate_limited, unavailable and not_configured.

## Open

- Thresholds (slow 5 s, down after 3, 30 s - 15 min backoff) are proposed defaults (D31).
- Jitter is not added (one local worker); add it with several workers / real APIs.
- Real providers' quotas and health endpoints come with prompts 34-35.
