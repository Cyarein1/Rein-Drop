# Subscriptions, entitlements and effective access - rules and API contract

_Step 79, 2026-10-14. Decision 0018. Tracker: [WEB_FIRST_COMPANION.md](WEB_FIRST_COMPANION.md).
Code: [`packages/access`](../../packages/access/src) (shared by API and worker)._

## 1. Model

- **Account-aware, never device-aware.**
  - Access belongs to the **user account** (`User`); subscriptions hang off the user.
  - Web, iOS and Android ask the same API and get the same answer.
  - Devices (`PushDevice`) only receive notifications; they never carry access.
- **Products and families:**
  - Rein Drop has two products, **Source** and **Sell**.
  - A plan belongs to one **family**: `SOURCE` (grants Source), `SELL` (grants Sell), `COMPLETE`
    (grants both).
  - An account can hold one subscription per product (e.g. Source Pro + Sell), or one Complete
    subscription.
- **Tier limits** are `Entitlement` rows on the plan (configurable data, not code), keyed by
  `ENTITLEMENT_KEYS` in `packages/contracts/src/plans.ts`:

  | Key | Product | Meaning |
  |---|---|---|
  | `hunts.active.max` | Source | Live Hunts (null = unlimited; no row = 0, fails closed) |
  | `hunts.saved.max` | Source | Saved (non-archived) Hunts - drafts, live, paused (null = unlimited; **no row = unlimited**, so plans seeded before this key keep working) |
  | `marketplace.<key>` | Source | Marketplaces the plan may search |
  | `hunts.hot.enabled` / `hunts.hot.max` | Source | Hot Hunts (off on every plan) |
  | `monitoring.priority` | Source | Highest monitoring priority |
  | `analytics.history_days` | Source | Analytics history (not enforced yet - OUTSTANDING) |
  | `seats.max` | both | People on the account (teams are roadmap) |
  | `sell.listings.max` | Sell | Active listings (Sell isn't built) |

- **Seeded catalogue** (`packages/db/prisma/seed.ts`, all limits **PLACEHOLDERS**, no prices):

  | Plan | Family | Active? | Live Hunts | Saved Hunts | Sell listings |
  |---|---|---|---|---|---|
  | Free | SOURCE | yes | 1 | 10 | - |
  | Pro | SOURCE | yes | 10 | 100 | - |
  | Ultimate | SOURCE | yes | 25 | unlimited | - |
  | Sell | SELL | **no** | - | - | 100 |
  | Complete | COMPLETE | **no** | 25 | unlimited | unlimited |

  Inactive plans are configured but can't be offered or held (Sell isn't built - backlog B-04).

## 2. Effective access states

Per product, evaluated by `evaluateSubscription` (pure, unit-tested) and `resolveProductAccess`
(newest granting subscription wins):

| Subscription | State | Access | Notes |
|---|---|---|---|
| none (Source) | `free` | Free plan | Default |
| none (Sell) | `none` | no | |
| ACTIVE, period running | `active` | yes | |
| TRIALING, period running | `trialing` | yes | Trial length is set at Stripe |
| PAST_DUE, period running | `past_due` | **yes** | The provider is retrying the renewal (D36) |
| ACTIVE + `cancelAtPeriodEnd`, period running | `active` (+ `cancelsAtPeriodEnd: true`) | **yes, until the period ends** | A scheduled cancellation never removes access early |
| period over after a scheduled cancellation | `canceled` | no -> Free | No grace for the user's own cancellation |
| CANCELED | `canceled` | no -> Free | |
| UNPAID (retries exhausted) | `expired` | no -> Free | Decision 0018 |
| EXPIRED / period over without renewal | `expired` | no -> Free | |
| any of the two rows above, within grace | `grace_period` | **yes** (paid plan) | Only when `BILLING_GRACE_DAYS` > 0 |
| PAUSED (at the provider) | `expired` | no -> Free | |
| INCOMPLETE (checkout never paid) | ignored | - | Never had access |
| account suspended | `suspended` | **nothing** (both products) | Overrides everything |

**Grace period:**
- Applies when paid access ends for a reason **other than the user's own cancellation**.
- It runs `BILLING_GRACE_DAYS` from the end:
  - UNPAID: from when that status was recorded;
  - otherwise: from the period end.
- **Default 0 = no grace** until the owner sets a billing policy (OUTSTANDING). The setting is in
  the API and worker environments - keep them equal.

**When paid access ends:**
- Source falls back to **Free** limits.
- The worker's access sweep (every 5 min) pauses LIVE Hunts above the live limit, newest first,
  history reason `plan_limit`.
- **Nothing is deleted:** Hunts, deals, inventory, sales and history stay (retention, D38).

**Suspension:**
- Set `User.accessSuspendedAt` + `accessSuspendedReason` (support action; no endpoint yet - SQL
  below).
- Every LIVE Hunt pauses (reason `account_suspended`).
- Protected operations are refused (403 `ACCOUNT_SUSPENDED`).
- Reading data, pausing and archiving still work; the data is kept.
- Lift it by setting both columns to NULL; Hunts stay paused until the person resumes them.

```sql
-- Suspend (reason is internal, never returned by the API)
UPDATE "User" SET "accessSuspendedAt" = now(), "accessSuspendedReason" = 'chargeback 2026-10-14' WHERE id = '<user id>';
-- Lift
UPDATE "User" SET "accessSuspendedAt" = NULL, "accessSuspendedReason" = NULL WHERE id = '<user id>';
```

## 3. Enforcement (backend - never by hiding UI)

| Operation | Rule | Error |
|---|---|---|
| Create a Hunt (`POST /hunts`) | Not suspended; saved Hunts < `hunts.saved.max` (per-user lock against races) | 403 `ACCOUNT_SUSPENDED` / 409 `LIMIT_REACHED` |
| Edit a Hunt (`PATCH /hunts/:id`) | Not suspended; a LIVE Hunt must stay within the plan | 403 / 409 `ACTIVATION_BLOCKED` |
| Activate / resume | Not suspended; live limit, marketplaces, priority (existing) | 403 / 409 `ACTIVATION_BLOCKED` |
| Restore an archived Hunt | Not suspended; saved-Hunt limit | 403 / 409 `LIMIT_REACHED` |
| Pause / archive | Always allowed (reduces usage) | - |
| Monitoring (worker) | Scheduler sweep before planning: Hunts above the current live limit pause; suspended = all pause. Queued searches skip non-LIVE Hunts | - |
| Sell operations | `@RequiresProduct('sell')` on every Sell route (global `ProductAccessGuard`, after auth). No Sell routes exist yet | 403 `PRODUCT_NOT_INCLUDED` |
| Billing | Checkout refused while a paid plan is current; Free refused while paid | 409 `CONFLICT` |

**No duplicate subscriptions for one purchase:**
- `Subscription.providerSubscriptionId` is unique: a Stripe subscription maps to exactly one row,
  and webhook redeliveries upsert it.
- `BillingEvent (provider, providerEventId)` is unique: each event is processed once.
- `BillingCustomer (provider, userId)` is unique: one Stripe customer per account.
- Choosing Free and the development plan upsert one row per account (`free:<userId>`,
  `dev-fake:<userId>`).

## 4. API contract - `GET /me/access`

- **Authentication:** required (web session / mobile token).
- **Schema:** `accessResponseSchema` in `packages/contracts/src/plans.ts`.
- **Client:** `api-client.getAccess()` is not added yet; web and mobile still use
  `GET /me/entitlements` + `GET /me/capabilities`. Switching the clients is a follow-up.

```json
{
  "suspended": false,
  "products": {
    "source": {
      "state": "active",
      "hasAccess": true,
      "paid": true,
      "plan": { "code": "pro", "name": "Pro", "family": "SOURCE" },
      "periodEndsAt": "2026-11-14T10:00:00.000Z",
      "cancelsAtPeriodEnd": false,
      "graceEndsAt": null,
      "limits": {
        "activeHunts": { "limit": 10, "used": 3, "remaining": 7 },
        "savedHunts": { "limit": 100, "used": 12, "remaining": 88 },
        "marketplaces": ["ebay", "facebook"],
        "monitoringPriority": "NORMAL",
        "hotHunts": { "available": false, "limit": 0 },
        "analyticsHistoryDays": null,
        "seats": 1
      }
    },
    "sell": {
      "state": "none",
      "hasAccess": false,
      "paid": false,
      "plan": null,
      "periodEndsAt": null,
      "cancelsAtPeriodEnd": false,
      "graceEndsAt": null,
      "limits": null
    }
  }
}
```

**Never returned:** provider names or ids (`sub_...`, `cus_...`), price ids or amounts, payment
methods, invoices, the suspension reason.

**Related endpoints (unchanged):**
- `GET /me/entitlements` - Source plan, entitlements, live usage; used by the web plan gate and
  the mobile "Your access" card. It now uses the same resolver, so grace and suspension apply.
- `GET /me/capabilities?platform=` - features per platform (step 78).

**New error codes** (`API_ERROR_CODES`):
- `ACCOUNT_SUSPENDED` (403);
- `PRODUCT_NOT_INCLUDED` (403);
- `LIMIT_REACHED` (409).

Messages are neutral ("Your current access includes ...") - never "upgrade", so the mobile apps
can show them as they are.

## 5. Database changes (all additive - no reset, no data rewritten)

| Migration | Change | Why | Existing data |
|---|---|---|---|
| `20261014181012_subscription_status_unpaid` (step 76) | `SubscriptionStatus` + `UNPAID` | Stripe `unpaid` = no paid access | Unchanged; rows re-sync on their next webhook |
| `20261014185724_product_families_access_suspension` (step 79) | New enum `ProductFamily` (SOURCE, SELL, COMPLETE); `Plan.family` NOT NULL DEFAULT 'SOURCE'; `User.accessSuspendedAt` (timestamptz, null), `User.accessSuspendedReason` (text, null) + CHECK (a suspension has a reason) | Product families; suspension | Existing plans become SOURCE; no user is suspended |

**Seed** (`pnpm --filter @rein-drop/db db:seed`, idempotent):
- adds `hunts.saved.max` to Free / Pro / Ultimate;
- adds the inactive Sell and Complete plans.

Until the seed runs, saved Hunts stay unlimited (no row = unlimited) and nothing else changes.

**Apply:**
```
pnpm --filter @rein-drop/db db:deploy
pnpm --filter @rein-drop/db db:seed
```

## 6. Tests

- **`packages/access/src/rules.spec.ts`** (15): every state, the grace window, no grace for own
  cancellation, the period boundary.
- **`apps/api/src/modules/access/requires-product.spec.ts`** (3): Sell route allowed / refused /
  anonymous.
- **`apps/api/test/access.int-spec.ts`** (15, real database):
  - all states via `GET /me/access`;
  - Source / Sell / Complete and Source + Sell together;
  - grace on / off;
  - saved-Hunt limit with archive and restore;
  - suspension (refusals, data kept, pause allowed);
  - no billing-sensitive fields;
  - same answer per account.
- **`apps/worker/test/access.int-spec.ts`** (13): sweep per state, suspension pauses everything,
  grace keeps monitoring until it ends, the scheduler queues only covered Hunts.
- **`apps/api/test/billing.int-spec.ts`:** Stripe lifecycle incl. unpaid (step 76).
