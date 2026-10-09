# Hardening pass - October 2026 (step 43, Build Prompt 40)

Scoped review of the API, worker, web and mobile before the first Azure deployment. Each area:
what was checked, what was found, what changed, and what is deliberately left (with the reason).
No new architecture was introduced; nothing measured required it.

## Summary of changes

| Area | Change |
|---|---|
| Rate limiting | Global per-user limit (`RATE_LIMIT_PER_MINUTE`, default 600/min), 20/min on billing writes, webhook exempt. Counted by signed-in user (web users share the web server's IP), anonymous by client IP (`TRUST_PROXY_HOPS`). |
| HTTP headers | API: nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `CSP: default-src 'none'`, `Cache-Control: no-store`, CORP same-site, HSTS in production; no `X-Powered-By`. Web: nosniff, frame deny, referrer policy, Permissions-Policy, baseline CSP, HSTS in production, no `X-Powered-By`. |
| CORS | Explicitly off and tested: no browser calls the API directly. |
| Body limits | Explicit 100 kB JSON / urlencoded limit (413), raw body kept for webhook signatures. |
| Validation | Request money capped at the 32-bit column range (`moneyInputSchema`): an absurd amount is a 400, not a database 500. |
| Authorization | Inventory page cursor must be the caller's own item (another user's id leaked a timestamp ordering). |
| Secrets | Config errors never echo values of `*SECRET*`, `*TOKEN*`, `*PASSWORD*`, `*_KEY` variables (Stripe keys have format checks that echoed the value). |
| Structured logging | `LOG_FORMAT=json` (default in production) for API and worker: one JSON object per line; request lines carry method, path, status, durationMs, requestId, userId. |
| DB indexes | Alert (userId,id), (huntId,createdAt), huntMatchId, dealAnalysisId; HuntMatch firstSearchRunId; SavedDeal huntMatchId; InventoryItem listingId; Sale marketplaceId. |
| Bounded responses | Hunt history returns at most the latest 500 events. |
| Dependencies | `mysql2` override to a patched 3.x (Prisma CLI). |
| Accessibility | Web: loading buttons keep focus (`aria-disabled`), password toggle names, plan-gate focus moves to the new heading, one persistent live region while payment is confirmed, disabled plan buttons describe why. Mobile: errors / successes announced on iOS too, loading is `busy`, field errors stay in the hint, "Hunt is live" announced. |

## Areas

### Validation
Checked every controller parameter: all are zod DTOs through the global pipe; ids are UUIDs;
strings and arrays bounded. Found: money amounts unbounded (fixed). Left: the generic page
cursor has no length cap (decoded and regex-checked before use; bounded by the 16 kB header limit).

### Authorization
Every route reviewed (table in the review notes). No IDOR: every id lookup is filtered by the
caller or preceded by an ownership check (404 for others). Fixed: inventory cursor. **Accepted
risk:** registering a push token re-assigns it to the caller (`notifications.service.ts`) - this
is how a shared phone moves between accounts; abusing it needs the victim's Expo push token, which
isn't exposed. Defense in depth noted: some writes by id after an ownership check could also
filter by user. Dev-only routes are 404 in production; dev diagnostics show all users' hunts
outside production (a staff role is needed before any shared non-production environment).
Test: `security.e2e-spec.ts` enumerates every route and asserts only `GET /health`, `GET /ready`
and `POST /billing/webhooks/stripe` are public and all others answer 401 without credentials.

### Rate limiting
`@nestjs/throttler` (existing Nest ecosystem, in-memory). In-memory counters are per API instance:
several instances need a shared store (Azure Cache for Redis) - deferred until scale requires it.

### Secrets
No env files or keys committed (`.gitignore` covers `.env*`; scan for Stripe / Apify / AWS / PEM
patterns clean). Secrets come only from the environment; startup logs print `DATABASE_URL`
redacted and no keys. Production: keep them in Azure Key Vault (prompt 42).

### CORS
Not enabled, by design - the web app calls the API server-side and the mobile app is not a
browser. A browser on another origin can't read API responses (tested: no
`Access-Control-Allow-Origin`, also on preflight).

### Error leakage
Non-application errors return a generic `INTERNAL_ERROR` body (no message, stack or SQL) in every
environment; Prisma P2002 / P2025 map to friendly 409 / 404. Request logs contain no bodies,
headers or query strings. Left: server-side error logs include stacks (Prisma messages can carry
query arguments) - acceptable for operators; revisit with log retention.

### Webhook verification
Stripe: HMAC over the raw body + 5-minute timestamp tolerance; forged / tampered / replayed /
unsigned requests are 400 (tests in `stripe-billing.provider.spec.ts`, `billing.int-spec.ts`).
Rate limiting skips the webhook (Stripe retries and bursts). No other inbound webhooks exist.

### Idempotency
In place: job dedupe keys (search / analysis jobs), `UsageEvent.idempotencyKey`, one alert per
match (`Alert.dedupeKey`), one inventory item per bought match, one sale per item, `BillingEvent`
per Stripe event, Stripe customer creation with an idempotency key. Left: `POST /hunts` has no
idempotency key - a double submit could create two drafts (the UI disables the button while
saving); acceptable for drafts.

### DB indexes and slow queries
Indexes added (above). Deferred, with the batch alternative recorded in OUTSTANDING:
worker N+1 loops (match stage per pair, duplicate resolution per key, normalization per raw
record, analysis enqueue per match, outbox per delivery) - fine at current volumes, rewrite when
measurements show it; the deals feed ranks all of a user's matches per page (store the latest
score on HuntMatch when it gets slow); `DealAnalysis` latest-per-match ordering uses NULLS LAST
(an exact index needs raw SQL Prisma can't express); dev-only diagnostics range scans.

### Retention and backups
See [operations/data-lifecycle.md](../operations/data-lifecycle.md): nothing is cleaned up yet;
proposed periods are TBD (D38) and the backup plan targets Azure Database for PostgreSQL.

### Dependency audit (`pnpm audit`, 2026-10-09)
After the `mysql2` override: 5 advisories, none in the API / worker runtime:
`deepmerge-ts` (Prisma CLI), `node-forge`, `braces`, `uuid` (Expo CLI / Metro build tooling) and
`decode-uri-component` (expo-router query parsing in the mobile app - a client-side DoS on a
malformed link only). Re-audit with Expo / Prisma upgrades; `node-forge` and `braces` have no
patched version yet.

### Accessible UI states
Primitives were mostly right (live regions, `aria-invalid`, focus ring). Fixed the gaps listed in
the summary. Left: banners that appear dynamically elsewhere rely on `role="alert"` / mounted
live regions (works for errors; success / info announcements can be missed by some screen
readers) - move to persistent regions screen by screen.

### Structured logging
JSON lines in production (Nest `ConsoleLogger` json mode - no new dependency). Request id is
echoed in `x-request-id` and present in every request log and error body for correlation.
