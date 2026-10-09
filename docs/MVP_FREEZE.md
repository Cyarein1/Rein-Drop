# MVP freeze - scope review (2026-10-09, step 47)

The implemented product reviewed against the **technical definition of MVP** (Technical
Architecture v1.0, section 28) and the App Flow Blueprint's "Must work in MVP" list (section 20).
From here on, scope is frozen: see the rules at the end. Companion documents:
[POST_MVP_BACKLOG.md](POST_MVP_BACKLOG.md) (everything deferred),
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) (what must happen before the beta), and
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) (what testers will notice).

## 1. Verdict

**The MVP is functionally complete in code**: every clause of the definition is built and covered
by automated tests against a real PostgreSQL, and the whole loop runs locally (the
[acceptance guide](LOCAL_MVP_ACCEPTANCE.md)).

It is **not yet verified with the real providers or by a person end to end**, and one clause
depends on an open decision rather than code:

- **Facebook in production (D12)** - the definition says "a Hunt across eBay **and Facebook**". The
  Facebook boundary is built (replaceable data provider), but the only real provider is the Apify
  development integration, which is refused in production pending legal review. Release options
  are in the checklist: decide a production source, or explicitly launch the beta with eBay live
  and Facebook shown as unavailable.
- **Live runs** of Entra, Stripe, eBay, Foundry and real push have not happened (all tested against
  fakes / mocks); they are release-checklist items, not missing features.

No critical flow depends on a future (backlog) feature - section 4.

## 2. Technical definition of MVP, clause by clause

> "A user can create an account, complete the Seller Snapshot, configure a Hunt across eBay and
> Facebook, pass plan/entitlement logic, activate monitoring, receive normalized/analyzed deal
> alerts, record a purchase and sale, and see realized profit/basic Hunt analytics - with provider
> failures observable and without manually running one process per customer."

| Clause | Built (steps / decisions) | Automated evidence | Still to verify for release |
|---|---|---|---|
| Create an account (email + password) | Entra External ID behind the auth boundary: API token verification, web PKCE + cookie session, mobile PKCE + secure storage; dev auth impossible in production (step 41, decision 0013) | `entra-auth.int-spec`, auth unit tests, `security.e2e-spec` (every non-public route 401) | Create the tenant; live tenant test; real sign-up on web and a device |
| Complete the Seller Snapshot | Reseller gate + 5 questions, web + mobile (steps 8, 11, 23) | seller-snapshot unit / int tests | Device pass |
| Configure a Hunt across eBay and Facebook | Hunt create / edit / lifecycle; eBay Browse API adapter (step 37); Facebook adapter + replaceable provider, Apify development provider (step 38) | `hunts.int-spec`, adapter contract tests, worker int tests | eBay live test with production keys; **D12** for Facebook |
| Pass plan / entitlement logic | Server-side entitlements, plan gate incl. Free, Stripe web billing with verified idempotent webhooks, downgrade pauses (never deletes) Hunts (steps 16-17, 42) | `plans.int-spec`, `billing.int-spec` (incl. redelivery / out-of-order), activation-block tests | Stripe products / prices / portal / webhook in test mode, then live |
| Activate monitoring | Activation with go-live checks; scheduler + PostgreSQL job queue + worker (steps 17, 20) | `hunts.int-spec`, worker scheduler / queue int tests | Azure: worker running against the hosted database |
| Receive normalized / analyzed deal alerts | Normalization, dedupe, deterministic matching before AI, Foundry `AIProvider` with strict structured output, deterministic scoring, one alert per deal, in-app inbox + Expo push (steps 20-28, 40) | worker `deal-analysis` / `alerts` int tests, notifications int tests | Foundry live test; real push on a development build (D23) |
| Record a purchase and sale | Bought -> inventory, purchase costs, Mark sold, selling costs (steps 25, 31-32) | `deals.int-spec`, `outcomes.int-spec` | Device pass |
| See realized profit / basic Hunt analytics | Realized P/L, Home, period analytics: overview, Hunt funnel, products, marketplaces, missed potential (steps 30-34) | `analytics.int-spec`, `home.int-spec` | - |
| Provider failures observable | Source health per marketplace with backoff / cool-down, user-facing degraded banners, internal ingestion diagnostics, structured logs (steps 35-36, 39, 43) | source-health tests, degradation step in the acceptance guide | Log Analytics queries on Azure |
| No manual process per customer | One scheduler / worker polls every LIVE Hunt through the queue; nothing per customer (step 20, decision 0004) | worker int tests (many users, one worker) | - |

Supporting work outside the sentence but required by the architecture: hardening pass (step 43),
Azure beta infrastructure (step 45, decision 0015), product events (step 46, decision 0016).

## 3. App Flow Blueprint - "Must work in MVP" (section 20)

| Must work | State | Roadmap counterpart (deferred) |
|---|---|---|
| Email / password account | Built (Entra hosted page) | Social login - B-11 |
| 5-question Seller Snapshot | Built | Dynamic / repeated profiling - B-13 |
| Facebook + eBay Hunt | Built; Facebook production source = D12 | Many marketplace adapters - B-01 |
| Plan gate including Free | Built (Free needs no card) | Optimized paid tier catalogue - D3 |
| Live Hunt status | Built (monitoring state, last checked, source health) | Hot Hunt billing / priority tiers - B-02 |
| Deal feed + selective alerts | Built (ranked feed, one alert per eligible deal) | Sophisticated personalization - B-13 |
| Ignore / save / bought | Built | Advanced collaborative workflows - B-03 |
| Basic sold outcome + realized profit | Built | Full inventory / accounting suite - B-19 |
| Basic Hunt / product analytics | Built | AI profit coaching - B-18 |
| Web + iOS + Android core flows | Built; mobile **not yet run on a device** | Team organizations / seats - B-03 |

First-session flow (section 21): Open -> email + password -> 5 questions -> first Hunt -> review ->
Start watching -> plan gate -> LIVE. All built; the dedicated "understand value" welcome screen is
deferred (B-10) - signed-out visitors land on sign-in.

## 4. Do critical flows depend on a future feature?

| Critical flow | Depends on | Future feature needed? |
|---|---|---|
| Sign up / sign in | Entra External ID (built) | No - welcome screen and in-app forms are optional (B-10) |
| Plan gate -> Hunt LIVE | Server entitlements, Free plan (built) | No - Hot Hunts shown as "coming later", off on every plan (B-02); paid plans can stay "Price TBD" |
| Monitoring | PostgreSQL queue + one worker | No - Redis (B-05), Service Bus (B-32), microservices (B-09) not needed at beta scale |
| Deal analysis | Foundry Standard deployment + strict schemas | No - fine-tuning (B-08), comparable sales (B-18) not needed; estimates are labelled unavailable |
| Alerts | In-app inbox (always) + Expo push | No - email (B-16) optional; push needs a development build, not a feature |
| Purchase / sale / profit | Ledger (built) | No - lots, FX, returns (B-19) not needed |
| Analytics | Live SQL aggregates | No - warehouse (B-06) not needed |
| Facebook Hunts in production | A production data source | **Decision, not feature** - D12 (release checklist section 1) |
| Scaling the API past one replica | Shared rate-limit store | Only when traffic proves it - B-05 trigger |

## 5. Explicit deferrals (Build Prompt 44)

Additional marketplaces (B-01), Hot Hunts (B-02 - unfinished: NORMAL priority only), teams / seats
(B-03), cross-listing / delisting (B-04), Redis (B-05), data warehouse (B-06), advanced search
(B-07), fine-tuning (B-08) and microservices (B-09) are **out of the MVP**. None is required by a
proven blocker today; each backlog row states what would make it one.

## 6. Freeze rules (until the beta has run)

1. Allowed: bug fixes, items in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), configuration, docs,
   and fixes for anything that breaks a clause in section 2.
2. Not allowed: new features, new providers, new infrastructure - they go to the backlog first.
3. A backlog item enters only with its proven blocker written down (backlog section 4).
4. Every change still runs the full check (`pnpm turbo run build typecheck lint test`, the API /
   worker integration suites) and updates BUILD_STATUS / OUTSTANDING.
5. Before tagging the release: run [LOCAL_MVP_ACCEPTANCE.md](LOCAL_MVP_ACCEPTANCE.md) one final
   time and fill in its sign-off sheet.
