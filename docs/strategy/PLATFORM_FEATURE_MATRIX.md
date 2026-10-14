# Platform feature matrix - web vs mobile companion

_Step 78, 2026-10-14. Decision 0018. Tracker: [WEB_FIRST_COMPANION.md](WEB_FIRST_COMPANION.md)._

**Source of truth: the code, not this page.**
- The list is `FEATURES` in [`packages/contracts/src/capabilities.ts`](../../packages/contracts/src/capabilities.ts).
- The API evaluates it per user and platform at **`GET /me/capabilities?platform=web|mobile`**,
  using the rollout flags (`FEATURE_FLAGS`) and the user's plan.
- Update this page whenever that list changes - the tests in `capabilities.spec.ts` pin the
  resulting sets.

## How availability is decided

A feature is available on a platform only when **all** of these hold, checked in this order (the
first that fails is the `reason` returned):

1. **Built** - unbuilt features are never shown, even with their flag on (`not_built`).
2. **On this platform** (`not_on_platform`).
3. **Not development-only**, or the environment is development (`development_only`).
4. **Rollout flag on**, if the feature has one (`flag_off`).
5. **Entitled by the user's plan**, if it needs an entitlement (`not_entitled`).

**Flags:** `FEATURE_FLAGS` in the API environment, comma-separated, all off by default. Unknown
names are refused at startup. Known flags: `sell.workspace`, `inventory.photos`, `inventory.bulk`,
`hunts.hot`.

**Clients:**
- **Web:** server-rendered. Its navigation items each name their feature (`components/shell/nav.ts`),
  and a test proves every one is available on the web.
- **Mobile:** `CapabilitiesProvider` asks the API after sign-in. Until it answers, the same list is
  evaluated locally with **all flags off**, so a flagged feature can only appear once the server
  says so. Developer tools follow the build (`__DEV__`).

**Enforcement:** hiding is product design. The backend still enforces access and limits on every
endpoint (decision 0018 phase A). Billing endpoints are web-only by design, and the mobile app
contains no billing calls (guard test).

## Matrix

**Key:** ✅ available · ⚪ not on this platform · 🚩 behind a rollout flag (off) · ⛔ not built
(never shown).

| Feature (`key`) | Web | Mobile | Notes |
|---|---|---|---|
| Deals feed and deal evaluation (`deals`) | ✅ | ✅ | Full economics on both: price, costs, estimated upside, confidence, risks, open listing |
| Save, ignore, mark bought (`deals.actions`) | ✅ | ✅ | |
| Alerts inbox (`alerts.inbox`) | ✅ | ✅ | Mobile: bell in the Deals header |
| Hunts: view, pause, resume, archive, restore (`hunts.manage`) | ✅ | ✅ | |
| Create / edit a Hunt (`hunts.create`) | ✅ | ✅ | Mobile: "+" in the Hunts header; location suggestions + map on both |
| Start watching within current access (`hunts.activate`) | ✅ | ✅ | Web: plan gate and checkout; mobile: neutral, never sells (phase B) |
| Inventory: bought items, listed / sold, sale result (`inventory`) | ✅ | ✅ | Source purchase tracking - **not** the Sell workspace |
| Current access (`account.access`) | ✅ | ✅ | Mobile: read-only "Your access" |
| Notification preferences (`account.notifications`) | ✅ | ✅ | |
| "Your area" (`account.area`) | ✅ | ✅ | |
| Seller Snapshot (`account.sellerSnapshot`) | ✅ | ✅ | Onboarding works wherever a new user signs in |
| Sign out (`account.signOut`) | ✅ | ✅ | |
| Push notifications on this device (`push`) | ⚪ | ✅ | Web uses the inbox (email later) |
| Home dashboard (`home.dashboard`) | ✅ | ⚪ | Mobile opens on Deals |
| Analytics and reporting (`analytics`) | ✅ | ⚪ | Overview, Hunt funnel, products, missed potential |
| Subscription checkout and plan choice (`billing.checkout`) | ✅ | ⚪ | Web-only billing |
| Billing management, plan changes, cancellation (`billing.manage`) | ✅ | ⚪ | Stripe portal |
| Bulk inventory management (`inventory.bulk`) | ⛔ | ⚪ | Flag `inventory.bulk`; not built |
| Rein Drop Sell: listings, cross-listing (`sell.workspace`) | ⛔ | ⛔ | Flag `sell.workspace`; not built (backlog B-04) |
| Capture product photos (`inventory.photos`) | ⚪ | ⛔ | Flag `inventory.photos`; comes with Sell |
| Hot Hunts (`hunts.hot`) | 🚩 | 🚩 | Flag `hunts.hot` **and** a plan with Hot Hunts (none today - backlog B-02) |
| Developer tools (`dev.tools`) | dev only | dev only | Never in production / release builds |

## Mobile navigation (step 78)

| Tab | Feature | Contents |
|---|---|---|
| **Deals** | `deals` | Feed, filters, deal detail; bell -> alerts inbox |
| **Hunts** | `hunts.manage` | List, detail, start / pause; "+" -> Create Hunt |
| **Inventory** | `inventory` | Holding / listed / sold items, mark sold, sale result |
| **Account** | `account.access` | Your access, notifications on this phone, notification preferences, your area, Seller Snapshot, sign-out (developer card in development builds only) |

Tab order and availability come from `MOBILE_TABS` + capabilities; a tab whose feature isn't
available isn't shown.

**Links and deep links:**
- **Unchanged:** `/deals/[id]` (push notifications), `/alerts`, `/hunts/[id]`, `/hunts/new`,
  `/inventory/[id]`, `/onboarding`, `/settings` (still the signed-out sign-in screen; same content
  as the Account tab).
- **Redirects:** `/` and `/create` redirect to Deals / Create Hunt.
- **Retired:** `/analytics*` (now web-only) and any unknown route fall back to Deals (`+not-found`).
- **Moved:** the onboarding prompt (once per launch) moved from the old Home tab to the tab layout.

## Web

Unchanged: Home, Hunts, Create Hunt, Deals, Analytics (incl. Inventory), Settings (incl. billing).
The web is the complete platform.
