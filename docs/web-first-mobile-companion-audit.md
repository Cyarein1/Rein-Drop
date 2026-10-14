# Web-first billing & mobile companion - repository audit

_Audit date: 2026-10-14. Read-only; no feature was rebuilt, deleted or refactored for this document._

**Related documents:**
- Strategy, decisions and progress: [strategy/WEB_FIRST_COMPANION.md](strategy/WEB_FIRST_COMPANION.md).
- Decision record: [decisions/0018](decisions/0018-web-first-billing-mobile-companion.md).

**Labels used throughout:**
- **[VERIFIED]** - checked in the code / tests on the audit date (file references given).
- **[RECOMMENDATION]** - proposed change; needs approval.
- **[ASSUMPTION]** - believed but not proven by this audit (e.g. behaviour on a real device or a
  real provider account).

**Already done before this document** (owner-approved, recorded in the tracker): the first audit,
**phase A** (step 76, server-side access) and **phase B** (step 77, mobile no longer sells). The
findings below describe the repository **as it is now, including those steps**. Where something
was a gap and was fixed in step 76/77, it is marked _(fixed in step N)_.

---

## 1. Current architecture [VERIFIED]

pnpm + Turborepo monorepo, TypeScript throughout.

| Part | What it is | State |
|---|---|---|
| `apps/web` | Next.js 16 (App Router, Cache Components, standalone output). Public landing page (`(marketing)`), signed-in app (`(app)`: Home, Hunts, Deals, Alerts, Inventory, Analytics, Settings), onboarding, sign-in, `/dev/*` tools | Functional; landing check 256/256 and 21 unit specs |
| `apps/mobile` | Expo SDK 57 + expo-router, React Native 0.86. Real app (not a scaffold): 23 routes | Functional in typecheck / lint / unit tests; **never run end to end on a device** [ASSUMPTION: works on device] |
| `apps/api` | NestJS REST API. The only database writer for the landing; all business logic | Functional; 26 unit specs + 15 integration / e2e specs (74 int tests pass on a fresh database) |
| `apps/worker` | NestJS worker: Postgres job queue, Hunt scheduler, marketplace search, matching, deal analysis, alerts and push | Functional; 7 unit + 7 integration specs (53 int tests pass) |
| `packages/db` | Prisma 7 schema, 25 migrations, seed | Applied cleanly on a fresh Postgres 18 |
| `packages/contracts` | zod request / response schemas shared by API and clients | |
| `packages/api-client` | Typed client used by web (server side) and mobile | |
| `packages/client-core` | Shared view logic for web and mobile (forms, deal / Hunt / plan views, companion wording) | |
| `packages/access` | **New in step 76:** server-side access rules shared by API and worker | |
| Other packages | `marketplace-core` (eBay / Facebook adapters), `matching`, `scoring`, `ai-core` (mock / Foundry), `geo` (mock / Azure Maps), `telemetry`, `env`, `design-tokens`, `brand-assets`, `config` | |
| Deployment | `Dockerfile` targets `api`, `worker`, `web`, `migrate`. `infra/` Bicep (Container Apps, Postgres module, migrate job, budget) - never deployed. `docker-compose.preview.yml` local preview. `.github/workflows/ci.yml` checks only (not yet run on GitHub) | Manual deploy by design (decision 0015) |

**Authentication** [VERIFIED]: Microsoft Entra External ID in production (decision 0013), with
development sign-in locally. Web uses server-side sessions; mobile uses the Entra hosted page plus
tokens in secure storage. The API verifies every request (global AuthGuard).

---

## 2. Answers to the nine questions

### 2.1 Which applications exist and work [VERIFIED]

- Web, API and worker are functional, with automated tests at the levels in the table above.
- The API and worker integration suites pass on a fresh database (steps 74-77).
- The web app has browser-check scripts (landing, waitlist end to end).

### 2.2 Mobile: real or scaffold [VERIFIED]

Real app. Routes (`apps/mobile/src/app`):

| Group | Routes |
|---|---|
| Tabs | `(tabs)/index` Home, `hunts`, `create`, `deals`, `analytics` |
| Stack | `hunts/new`, `hunts/[id]`, `hunts/[id]/edit`, `hunts/[id]/start`, `deals/[id]`, `alerts`, `inventory`, `inventory/[id]`, `inventory/[id]/sell`, `inventory/[id]/result`, `analytics/hunts|products|missed`, `onboarding`, `settings`, `dev` |

- Uses the same API client and `client-core` view logic as web.
- [ASSUMPTION] It has only been exercised by typecheck, lint and unit tests - no device run yet
  (KNOWN_LIMITATIONS).

### 2.3 Subscription and billing components [VERIFIED]

- **Data model** (`packages/db/prisma/schema.prisma`):
  - `Plan` (code, isFree, isActive, limitsFinal - no prices);
  - `Entitlement` (planId, key, limit / value);
  - `Subscription`:
    - user, plan, status;
    - provider `stripe | free | dev-fake`;
    - provider ids, `cancelAtPeriodEnd`, period start / end, `canceledAt`;
  - `BillingCustomer`, `BillingEvent` (idempotent webhook ledger), `UsageEvent` (table only -
    nothing writes it).
  - Statuses: TRIALING, ACTIVE, PAST_DUE, CANCELED, EXPIRED, INCOMPLETE, PAUSED, **UNPAID** _(added
    in step 76)_.
- **Plans** (`seed.ts`): Free / Pro / Ultimate with **placeholder** limits (decision 0003) - live
  Hunts 1 / 10 / 25, eBay + Facebook, Hot Hunts off, analytics history 30 days / full, seats
  1 / 1 / 3.
- **Billing** (decision 0014, `apps/api/src/modules/billing`):
  - `BillingProvider` boundary with a Stripe implementation (dev fake refused in production);
  - checkout, Customer Portal (manage / change plan / cancel);
  - signature-verified webhooks, processed once, the subscription always re-read from Stripe;
  - prices come from Stripe via `STRIPE_PRICE_IDS` (none set yet - "Price TBD").
  - [ASSUMPTION] Never run against a real Stripe account (tests use a fake Stripe API).
- **Web purchase surfaces:**
  - the Hunt plan gate `/hunts/[id]/start` ("Continue to secure checkout");
  - Settings "Manage billing" and `/settings/cancel`.
  - No standalone pricing page; the landing FAQ says pricing isn't final.
- **Mobile purchase surfaces:** none _(removed in step 77; guarded by
  `apps/mobile/src/companion-copy.spec.mjs`)_.

### 2.4 Source / Sell / Complete entitlements [VERIFIED]

**Not implemented.**
- No product-family concept on plans or entitlements.
- No Sell workspace, listing creation, cross-listing or photo capture code.
- The only "sell" features are inventory status changes (Mark listed / Mark sold) and the
  sale / cost records in the Source workspace.
- Cross-listing is backlog B-04.

### 2.5 Workflows shared between web and mobile [VERIFIED]

Both clients use the same API, contracts and `client-core` view logic for:
- sign-in;
- onboarding (Seller Snapshot);
- Hunt create / edit / start / pause / resume / archive;
- Hunt location (suggestions, map, "Your area" - step 74);
- deals feed and detail (full economics: asking price, costs, upside labelled as an estimate,
  confidence, risks, "View on {marketplace}");
- save / ignore / bought;
- alerts inbox;
- inventory (bought -> listed -> sold, sale result);
- notification preferences.

Billing is **web-only** _(mobile billing UI removed in step 77)_.

### 2.6 Advanced features duplicated on mobile [VERIFIED]

| Mobile feature | Strategy says |
|---|---|
| **Home dashboard** tab (attention list, Hunts, realized profit, recent, recommendation) | Web-only (phase C) |
| **Analytics** tab + `analytics/hunts`, `analytics/products`, `analytics/missed` (period selection, charts, funnels) | Web-only (phase C) |
| Inventory: mark sold / sale result | Keep - "viewing inventory" + basic actions are in scope (owner chose an Inventory tab) |
| Settings "Developer" card (API address, connection check) and `/dev` UI gallery - **reachable in release builds** (no `__DEV__` gate found in `dev.tsx` or the Settings card) | Not product UI - hide in release builds |

### 2.7 Backend authorization and usage limits [VERIFIED]

- **Every request** is authenticated by a global AuthGuard; data is scoped to the signed-in user.
- **Live-Hunt limit:**
  - enforced on activate / resume / editing a LIVE Hunt (409 `ACTIVATION_BLOCKED`, per-user
    advisory lock);
  - downgrades pause the newest Hunts above the limit;
  - _since step 76_ the worker re-checks every owner before scheduling (`@rein-drop/access`), so
    lapsed periods, choosing Free and Stripe `unpaid` stop paid monitoring server-side.
- **Marketplaces in plan** and **priority in plan** are checked on activation.
- **Not enforced:**
  - analytics-history days (no use in `apps/api/src/modules/analytics`);
  - seats (no team model);
  - Hot Hunts (feature off everywhere);
  - usage metering (`UsageEvent` unused).
- **Rate limiting:** per user / IP, in memory per instance.

### 2.8 Notifications and deep links [VERIFIED]

- **Push registration:** Expo push tokens, refreshed on sign-in; the permission prompt appears
  after the first Hunt goes live.
- **Delivery:** the worker sends push. `device_not_registered` disables the device; **push receipts
  are not fetched** (TODO in `expo-push-provider.ts`).
- **Tap handling** (`NotificationsBridge.tsx`): cold start and running; marks the alert read; opens
  `/deals/[id]` or `/alerts`. Screens behind it require a session (`SessionGate`).
- **Payload:** `{ alertId, category, dealId }`. The visible text holds the listing title, AI
  headline, marketplace and Hunt name - no prices, emails or billing data.
- **Preferences:** per category (deal alerts, exceptional, operational, weekly insight, marketing)
  and channel (push / email / in-app).
- **Links into the app:** the `reindrop://` URL scheme exists (used for auth redirects). Universal /
  App Links (https) are not configured.
- [ASSUMPTION] Real push on a device needs an EAS project id and a development build (D23) - never
  exercised.

### 2.9 Gaps, risks and conflicts with the strategy

| # | Finding | Type |
|---|---|---|
| G1 | Mobile shows prices / plan picker / "subscribe on the web" | Conflict - **fixed in step 77** |
| G2 | Worker ignored access; lapsed periods / Free choice didn't pause Hunts; `unpaid` kept access | Risk (cost) - **fixed in step 76** |
| G3 | Mobile navigation is Home / Hunts / Create / Deals / Analytics, not Deals / Hunts / Inventory / Account | Conflict - phase C |
| G4 | Home dashboard and four analytics screens duplicated on mobile | Conflict - phase C |
| G5 | No product families (Source / Sell / Complete); plans are one flat list | Gap - phase D |
| G6 | No feature-flag mechanism (only env vars and entitlement keys) | Gap - phase D |
| G7 | Mobile Developer card and `/dev` screen reachable in release builds; web `/dev/*` pages also served by production builds (landing launch blocker B1) | Risk (exposes internals) |
| G8 | No trials or grace fields; PAST_DUE is the only grace | Gap - policy decision |
| G9 | Analytics history, seats and usage metering not enforced server-side | Gap |
| G10 | No team / workspace model (subscriptions hang off `User`) | Gap - backlog B-03 |
| G11 | Push receipts not fetched; no universal / app links; real push never run on a device | Gap / risk |
| G12 | Store compliance not reviewed (Apple companion / "reader" rules, Google Play payments, regional rules) | Risk - phase E |
| G13 | Stripe and Entra never run against real accounts; mobile never run on a device | Risk (release) |
| G14 | No web pricing page; landing says pricing isn't final (D3) | Gap |
| G15 | Rate limits in memory (one instance each) | Risk at scale (backlog B-05) |

---

## 3. Recommendations [RECOMMENDATION]

1. **Phase C - mobile navigation:**
   - tabs **Deals** (feed + alerts inbox), **Hunts** (list + Create), **Inventory** (existing
     purchase tracking), **Account** (access, notifications, area, sign-out);
   - remove the Home and Analytics tabs and their stack routes from mobile;
   - keep the web versions untouched;
   - hide the Developer card and `/dev` in release builds (`__DEV__`) - fixes G7 for mobile.
2. **Phase D - product families and flags:**
   - add a `family` (SOURCE | SELL | COMPLETE) to `Plan` (additive migration, existing plans =
     SOURCE);
   - family-scoped entitlement keys (e.g. `source.hunts.active.max`, future `sell.*`), with the
     current keys kept as aliases;
   - a small server-driven flag list (`GET /me/features`, derived from entitlements + environment)
     so clients hide unfinished features (Sell, Inventory photo capture) and the API refuses them.
3. **Phase E - compliance and launch:**
   - store-review notes for Apple and Google;
   - decide the optional account line (`EXPO_PUBLIC_ACCOUNT_SITE`);
   - push receipts, and https app links if wanted;
   - a release checklist covering the cross-platform scenario in the strategy's "definition of
     success".
4. **Policy decisions to take:**
   - trial (yes / no, length) and grace beyond Stripe's retries;
   - whether analytics-history and seat limits are enforced (needs the team model for seats);
   - web pricing page timing (D3).
5. **Gate web `/dev/*` in production** (landing blocker B1) - same risk class as G7.

---

## 4. Files and modules likely to be affected

| Phase | Files / modules |
|---|---|
| C | `apps/mobile/src/app/(tabs)/_layout.tsx`, `(tabs)/index.tsx` (Home -> removed or folded into Deals), `(tabs)/analytics.tsx` + `app/analytics/*` (removed from mobile), `(tabs)/deals.tsx` (+ inbox entry), `app/_layout.tsx` (stack routes), `app/settings.tsx` (-> Account tab; Developer card behind `__DEV__`), `app/dev.tsx`, `NotificationsBridge.tsx` (fallback route), `companion-copy.spec.mjs` (extend guard) |
| D | `packages/db/prisma/schema.prisma` + migration (Plan.family), `seed.ts`, `packages/contracts/src/plans.ts` (family, keys), `packages/access` (family-aware limits), `apps/api/src/modules/plans`, `entitlements` (features endpoint), `packages/api-client`, `client-core` (feature-aware nav), web plan gate (show families), mobile tabs (feature-aware) |
| E | `apps/worker/src/notifications/push/*` (receipts), `apps/mobile/app.json` / `app.config.ts` (associated domains, intent filters - if app links), `docs/RELEASE_CHECKLIST.md`, new store-review notes |
| Web `/dev` gating | `apps/web/src/app/dev/**` |

---

## 5. Dependency order

1. **Phase A - server access** (done) -> everything else relies on the backend being the authority.
2. **Phase B - mobile billing-free** (done).
3. **Phase C - mobile navigation.** Independent of D for Source-only; must not expose Sell.
4. **Phase D - families + flags.** Before any Sell work; the C tabs can become flag-aware after D.
5. **Phase E - compliance review + launch prep.** Last; needs B, C, D in place to review the final
   app.

Policy decisions (trial / grace, limits, pricing page) can be taken at any time; their
implementation slots into D.

---

## 6. Migration considerations

- **Database migrations are additive only:**
  - step 74: Hunt location / geo (applied in preview and CI test databases);
  - step 76: `UNPAID` enum value;
  - phase D: a `Plan.family` column with a default of `SOURCE`.

  None drop or rewrite data. Hand-made migration folders use UTC timestamps (team rule).
- **Owner's development database:** the step 74 and 76 migrations must be applied
  (`pnpm --filter @rein-drop/db db:deploy`) before the dev API runs this code.
- **Entitlement keys:** keep the current keys working while family-scoped keys are introduced (an
  alias, or a data migration in the seed). Clients read entitlements only from the API, so no
  client hard-codes them.
- **Mobile releases:**
  - removing tabs and screens only affects new builds;
  - deep links / notification routes must keep resolving: `/deals/[id]` and `/alerts` stay;
  - removed routes (`/analytics/*`, `/` Home) need a fallback route.
- **Stripe:** `unpaid` now maps to `UNPAID`. Existing rows stay as they are until their next
  webhook re-syncs them (a subscription currently stored as PAST_DUE but actually unpaid at Stripe
  keeps access until then). [ASSUMPTION] There are no real Stripe subscriptions yet, so nothing is
  affected today.

---

## 7. Phased implementation checklist

**Phase A - backend authority** _(done, step 76)_
- [x] Shared access rules (`@rein-drop/access`) used by API and worker.
- [x] Worker access sweep before scheduling; Hunts without access never monitored.
- [x] Lapsed period without webhook, choosing Free and the development plan pause the extra Hunts.
- [x] Stripe `unpaid` -> `UNPAID` (no paid access).
- [x] Lifecycle integration tests (9 subscription states + scheduler).

**Phase B - mobile billing-free** _(done, step 77; device check pending)_
- [x] No prices, plan picker, upgrade or "subscribe on the web" on mobile.
- [x] Start watching within current access; neutral block reasons.
- [x] "Your access" card; cancel-plan screen removed.
- [x] Optional account line behind `EXPO_PUBLIC_ACCOUNT_SITE` (off).
- [x] Guard test against selling words and billing calls.
- [ ] Check on a real phone.

**Phase C - mobile navigation** _(done, step 78; device check pending)_
- [x] Tabs Deals / Hunts / Inventory / Account; Create inside Hunts; inbox inside Deals.
- [x] Remove Home and Analytics (tab + stack routes) from mobile; web unchanged.
- [x] Fallback for removed routes; notification taps still open deals.
- [x] Developer card and `/dev` only in development builds.
- [x] Extend the guard test (no analytics dashboards on mobile).
- [x] Central platform capability list + `GET /me/capabilities` + rollout flags (`FEATURE_FLAGS`) - step 78.

**Phase D - product families and flags**
- [x] `Plan.family` (SOURCE / SELL / COMPLETE), additive migration, seed - step 79.
- [x] Product-scoped access (Source / Sell resolved per family) + new keys `hunts.saved.max`, `sell.listings.max`; existing keys unchanged - step 79.
- [x] Server-driven features endpoint (`GET /me/capabilities`, step 78). Unfinished features have no endpoints to refuse.
- [x] Clients hide flagged features (no Sell UI anywhere) - step 78.
- [x] Access states (trial, grace, past due, canceled, expired, suspended), `GET /me/access`, backend enforcement incl. `@RequiresProduct('sell')` - step 79.

**Phase E - compliance and launch**
- [ ] Store-review notes (Apple, Google, regional) - no exemption assumed.
- [ ] Decide the account line.
- [ ] Push receipts; https app links (optional).
- [ ] Cross-platform scenario test: subscribe on web -> sign in on phone -> alert -> evaluate ->
  same data.
- [ ] Release checklist update.

**Policy (owner)**
- [ ] Trial and grace policy.
- [ ] Analytics-history / seat enforcement.
- [x] Web pricing page (D3). Done in step 80: `/settings/billing` with plans, current access and management (strategy/BILLING.md).
