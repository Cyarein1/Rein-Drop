# Post-MVP backlog

Everything that is **not** part of the MVP, parked here at the MVP freeze (step 47, Build Prompt 44)
so it stops competing with the release. Scope rules and the review: [MVP_FREEZE.md](MVP_FREEZE.md).
Release work: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). What users will notice:
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

**Rule.** An item comes back into scope only with a **proven blocker** (a measured problem, a
customer need, or a legal / platform requirement) written next to it - not because it would be
nice. Each item names what would justify it. Open decisions (D-numbers) stay in
[OUTSTANDING.md](OUTSTANDING.md) section 1.

Priority: **P1** next after release (first customers, Azure phase C) - **P2** when a trigger
fires - **P3** someday / idea.

## 1. Explicitly deferred (Build Prompt 44)

| ID | Item | State today | Revisit when (the proven blocker) | Prio |
|---|---|---|---|---|
| B-01 | **Additional marketplaces** (Reverb, Swappa, Whatnot, Walmart, Amazon, ...) and category-specific normalization | eBay + Facebook only, behind the adapter / normalized Listing boundary (Tech Architecture section 8) | Customer demand (Seller Snapshot "sources" answers, requests) **and** feasible, licensed access meeting the support standard (access, freshness, normalization, reliability, cost) | P2 |
| B-02 | **Hot Hunts** - priority scheduling classes and their billing | **Unfinished**: `HuntPriority` has `NORMAL` only; `hunts.hot.*` entitlements exist but are off on every plan; the plan gate says "Hot Hunts: coming later"; no purchase flow | Measured demand for faster checks on high-value Hunts **and** the cost model per check (D7) shows a price that covers it | P2 |
| B-03 | **Teams / organizations / seats / roles / shared Hunts** | Not built; one user owns everything (account structure leaves room: Organizations module is future) | A paying customer needs shared access; "Ultimate / Team" plan defined | P3 |
| B-04 | **Cross-listing and automatic delisting** | Not built; Rein Drop records sales, never lists | Marketplace seller APIs permit it and resellers ask for it (seller-OS track) | P3 |
| B-05 | **Redis** (cache, shared rate-limit counters, queues) | Not used. Rate limits are in memory per API instance, so the API runs with `maxReplicas: 1`; the queue is PostgreSQL | **The API needs a second replica** (measured load) - then a shared throttler store (Redis, or a PostgreSQL table first); or cache misses measured as a bottleneck | P2 |
| B-06 | **Data warehouse / BI pipeline** | Analytics are live SQL aggregates on PostgreSQL | Operational PostgreSQL analytics measured as a bottleneck, or cross-customer reporting needs exceed it | P3 |
| B-07 | **Advanced search** (dedicated search index, semantic / fuzzy matching beyond lexical + AI) | Lexical relevance with English stopwords; synonyms only via the AI analysis | Missed-match rate measured on real Hunts shows PostgreSQL / lexical matching is insufficient | P2 |
| B-08 | **Fine-tuning, dedicated GPUs, provisioned throughput** | Foundry Standard deployments through `AIProvider`; prompts + strict JSON schemas | Golden-dataset quality (B-24) plateaus with prompting **and** volume makes provisioned throughput cheaper than Standard | P3 |
| B-09 | **Microservices** | Modular monolith + separate worker (LOCKED, Tech Architecture section 2) | A module needs independent scaling or deployment that the worker / Container Apps split can't give - with measurements | P3 |

## 2. Product features

| ID | Item | Revisit when | Prio |
|---|---|---|---|
| B-10 | Welcome screen (Screenbook frame 01) and fully in-app email / password forms (Entra native authentication, D35); branded Entra pages | First-session drop-off at sign-up measured (`onboarding_started` vs sign-ins) | P1 |
| B-11 | Social sign-in | It measurably improves conversion (Blueprint section 4) | P3 |
| B-12 | Experience for non-resellers who answer "no" (D4) - today a "coming soon" screen | Share of "no" answers is meaningful | P2 |
| B-13 | Dynamic / repeated profiling; deal ranking personalized from actual outcomes | Enough bought / sold / ignored outcomes per user | P3 |
| B-14 | Native store billing (App Store / Google Play, D2) and in-app plan purchase on mobile; Rein Drop-side receipts | Mobile-first paying users; store review requires it for digital goods sold in-app | P1 |
| B-15 | Downgrade: "choose which Hunts stay live" screen; enforce marketplace / priority entitlements on running Hunts (today only the live-Hunt count is enforced, newest paused first) | Paid plans with different marketplace limits exist (D3) | P2 |
| B-16 | Notifications beyond in-app + push: email provider (D14), operational alerts (source degraded), weekly insight, quiet hours / digests / re-alert on upgrade (D22), Expo push receipts and badges, reduced-monitoring state, `EXPO_ACCESS_TOKEN` in Azure if enhanced push security is enabled | Users miss alerts (push disabled), or alert volume complaints | P1 (email), P2 (rest) |
| B-17 | Deal workflow: suppress similar noise after Ignore; refresh saved deals when the listing changes; undo Bought entirely; automatic "Missed" (D18, D28) | Ignore reasons show repeated noise patterns | P2 |
| B-18 | Resale intelligence: comparable sales / resale estimates (D13), seller facts as AI evidence, estimated upside net of selling fees, AI profit coaching | A licensed comparable-sales source exists | P1 (source), P3 (coaching) |
| B-19 | Ledger depth: returns / write-offs, quantities / lots (D17), multi-currency with FX (D27), profit-over-time chart, full accounting | Users track inventory elsewhere because of it | P2 |
| B-20 | Geocoding with Azure Maps (decision 0001) and radius verification for sources that can't filter by distance | Distance complaints / wrong-area deals measured | P2 |
| B-21 | UI translations (English only), app-store storefront country for locale, time-zone-aware default dates (D24) | Non-English market launch | P3 |
| B-22 | UI depth: per-period Hunt performance, listing images on deal cards (image host allowlist), native date picker on mobile, persistent live regions for all success banners | Usability testing | P2 |
| B-23 | Product analytics vendor (D15) + pseudonymised ids, funnel workbook / saved queries, longer event retention, more events (alert / push opened, pause / resume, page views) | First beta cohort - the log provider is enough to start | P1 |
| B-24 | AI quality: golden datasets, one repair attempt on invalid output, re-analysis on prompt-version change, Foundry keyless auth (managed identity), non-English mock | Foundry live run shows INVALID / UNGROUNDED output rates worth fixing | P1 |
| B-25 | Brand polish: confirmed type / spacing / greys, optimized @1x/@2x/@3x mascots, SVG wordmarks, orange active tab indicator on mobile (mascot art for the remaining states: done 2026-10-14, step 72 - every token has approved art) | High-fidelity design pass | P2 |

## 3. Platform and operations (Azure phases C-E, Tech Architecture section 25)

| ID | Item | Revisit when | Prio |
|---|---|---|---|
| B-30 | **OpenAPI spec** generated from the zod contracts (Tech Architecture locks "REST + OpenAPI"; the typed api-client covers our own apps today) | Before any third-party / partner API consumer, or as the first post-MVP task | P1 |
| B-31 | Azure consolidation: Azure Database for PostgreSQL (PITR), private networking, custom domains, Application Insights / OpenTelemetry, CI/CD with OIDC, slim migrate image, worker as a scheduled job / KEDA, Foundry managed identity, failed billing events alerting | Revenue offsets persistent cost (phase D); free-account database nearing 12 months | P1 |
| B-32 | Queue technology: PostgreSQL job table today; Storage Queues vs Service Bus (Tech Architecture TBD) | Queue latency / throughput measured as a limit, or several worker replicas | P2 |
| B-33 | Performance: worker N+1 batching, denormalized feed score, analytics caching, diagnostics indexes, backoff jitter, job lease renewal, re-analysis cadence | Measured slow paths (p95) or AI cost per Hunt above budget | P2 |
| B-34 | Security extras: strict nonce CSP, `POST /hunts` idempotency key, staff / admin role (diagnostics outside development), account deletion and Entra profile sync, shared-phone push token policy, Prisma messages in error logs, mobile `/ready` check | Before opening to the public / first security review | P1 |
| B-35 | Test automation: browser-automated acceptance sequence, isolate the hunt-activity integration test from a running worker, stable development listing ages | Regressions slip through the manual acceptance run | P2 |
| B-36 | **Listing refresh**: sold / removed listings (and ones a narrowed Hunt no longer matches) become unavailable; a live edit re-evaluates matches and resets the next check | First beta feedback on stale deals - likely the first product fix after release | P1 |
| B-37 | Data lifecycle: retention jobs (jobs, raw listings, search runs, analyses, deliveries, billing events, logs - D38) and restore drills (docs/operations/data-lifecycle.md) | Before first paying customers; storage growth | P1 |

## 4. How items move

- Into scope: write the proven blocker in the row, move it to OUTSTANDING.md (with the step that
  takes it), and note it in BUILD_STATUS when done.
- New ideas during the beta land here first, not in the release.
- Items that came from OUTSTANDING.md are listed there under **Resolved** as "moved to backlog
  B-xx (step 47)", so the trail stays complete.
