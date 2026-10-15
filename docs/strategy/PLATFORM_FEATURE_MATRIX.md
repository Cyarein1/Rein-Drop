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
names are refused at startup. Known flags: `sell.workspace` and `inventory.photos` (no longer needed - live since step 83, kept so existing settings stay valid), `inventory.bulk`,
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
| Sell: list bought items, AI drafts, cross-listing (`sell.workspace`) | ✅ | ✅ | Decision 0019 (step 83): open to every account during beta. eBay publishing simulated (TODO(sell)); Facebook assisted |
| Listing photos: camera / library / upload + the source listing's photos (`inventory.photos`) | ✅ | ✅ | Decision 0019. Local disk in development; production uploads off until Azure Blob (TODO(media)) |
| Bulk inventory management (`inventory.bulk`) | ⛔ | ⚪ | Flag `inventory.bulk`; not built |
| Hot Hunts (`hunts.hot`) | 🚩 | 🚩 | Flag `hunts.hot` **and** a plan with Hot Hunts (none today - backlog B-02) |
| Developer tools (`dev.tools`) | dev only | dev only | Never in production / release builds |

## Mobile navigation (step 78; central "+" restored in step 83)

| Tab | Feature | Contents |
|---|---|---|
| **Deals** | `deals` | Feed, filters, deal detail; bell -> alerts inbox |
| **Hunts** | `hunts.manage` | List, detail, start / pause |
| **+ Create** (centre, not a destination) | `hunts.create` | Opens Create Hunt over the current tab; hidden while suspended |
| **Inventory** | `inventory` | Holding / listed / sold items, **List for sale** (Sell), mark sold, sale result; header -> Your listings |
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

## Companion experience (step 82)

| Tab | Quick decisions and essentials |
|---|---|
| **Deals** | Feed cards: price, known costs, source, freshness, strength, confidence, upside labelled **Estimated**. **Save** and **Not for me** right on the card (with Undo); filters To review / Saved / Bought / Ignored / Unavailable. Deal detail: **Price and estimates** (asking price, known costs, estimated resale value with range and number of similar sales, potential upside with range and excluded costs, and "Estimates, not guaranteed profit…"), risk and condition, seller questions, **View on {marketplace} ↗**, Save / Ignore / Bought |
| **Hunts** | List with status and monitoring; Start watching for drafts; detail with pause / resume / archive; Create / Edit (hidden while suspended) |
| **Inventory** | Holding / listed / sold, holding time, Mark sold, sale result (realized - these are actuals, not estimates). **List for sale** (Sell, step 83): AI draft, camera / library / original photos, cross-listing |
| **Account** | Email, your access (read-only), notifications on this phone, notification preferences, your area, Seller Snapshot, sign-out |

**Unreliable connections:**
- Every tab is pull-to-refresh.
- A failed refresh keeps what's on screen with "Showing what was loaded earlier" (client-core `Refreshable`). Only a failed first load shows an error, with offline wording and Try again.
- The figures and the server's decisions (which list a deal belongs to after an action, access, limits) are never recalculated on the phone: actions reload from the API.

**Tests:**
- Component tests (jest-expo + Testing Library) for `DealCard`, `DealEconomics` and `LoadStatus`.
- Navigation tests (Expo Router `renderRouter`): the real tabs layout and redirects, tab order, tab switching, header shortcuts, retired / web-only routes landing on Deals, deep links, and hidden unavailable tabs.
- The guard test (no selling, no web-only calls).

## Moved to web only (intentionally)

| Was on mobile | Now | Since |
|---|---|---|
| Home dashboard (`/` tab) | Web Home. Mobile opens on Deals; `/` redirects | Step 78 |
| Analytics (overview, Hunt funnel, products, missed potential) | Web Analytics. `/analytics*` lands on Deals | Step 78 |
| Plan picker with prices, "subscribe / upgrade", development billing confirmation in Start watching | Web Plans & billing (`/settings/billing`) and the web plan gate | Step 77 |
| "Plan & billing" card and the cancel-plan screen | Web Plans & billing; Stripe Customer Portal | Step 77 |
| "Create an account" button | Accounts are created on the web (account deletion isn't built - Apple 5.1.1(v), see MOBILE_ACCOUNT_ACCESS.md) | Step 81 |
| Developer card and `/dev` in release builds | Development builds only | Step 78 |

Never built on mobile (web-only by design): bulk management, advanced integrations, team
administration and billing management. Step 82 moved nothing else to the web.

## Web

Unchanged: Home, Hunts, Create Hunt, Deals, Analytics (incl. Inventory), Settings (incl. billing).
The web is the complete platform.
