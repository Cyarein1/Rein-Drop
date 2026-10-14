# Billing - web subscription management

How Rein Drop sells and manages subscriptions. Billing is **web only** (decision 0018). The mobile
companion never shows prices, plan pickers or purchase links; it reads access only.

- Provider: **Stripe** (decision 0014, owner-approved 2026-10-09). It was kept and extended in
  step 80, not replaced.
- Access rules (what a subscription grants): [ACCESS_RULES.md](ACCESS_RULES.md).
- Initiative tracker: [WEB_FIRST_COMPANION.md](WEB_FIRST_COMPANION.md).

## 1. What the web supports

Page: **`/settings/billing`** ("Plans & billing"), linked from Settings.

| Need | How |
|---|---|
| See plans | One card per active plan: the price read from Stripe ("Price TBD" when none is configured), what the plan includes, and the right action |
| Start a subscription | "Subscribe to X" opens a server action, which starts **Stripe Checkout** (hosted) |
| Current plan and access | "Current plan" card from `GET /me/access`: state badge, live / saved Hunt use, renewal or end date |
| Change plan | "Switch to X" opens the **Customer Portal** on its plan-change flow |
| Cancel | "Cancel plan" goes to `/settings/cancel` and then the Portal cancel flow, at the period end. Access stays until the period ends |
| Renewal information | "Renews on …", "stays active until … then you move to Free", "Payment retrying", "Grace period until …" |
| Payment method / invoices | "Manage billing" opens the Portal. When a payment needs attention, "Update payment method" is shown as the primary button |
| Check status now | "Refresh status" (Stripe mode only) calls `POST /billing/sync` |

All of the page's wording comes from `packages/client-core/src/billing-view.ts`. That module is
web only; the mobile guard test bans it from the app.

## 2. API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /billing` | user | Mode (`stripe` / `development`), whether the Portal is available |
| `POST /billing/checkout` | user, strict throttle | Creates the Stripe customer once (idempotency key) and a Checkout Session. Returns its URL. Grants nothing |
| `POST /billing/portal` | user, strict throttle | Portal session (`manage` / `change_plan` / `cancel`), returning to a validated same-site path |
| `POST /billing/sync` | user, strict throttle | **Reconcile**: re-reads all of the user's Stripe subscriptions and mirrors them. A no-op in development mode |
| `POST /billing/free` | user | Records the Free choice (no card). Refused while a paid plan is current |
| `POST /billing/webhooks/stripe` | public, **signature-verified** | Stripe events |
| `GET /me/access` | user | Effective access per product. No provider ids or secrets |

## 3. Guarantees

- **Nothing is granted on the browser's word.** `?checkout=success` only makes the page ask the
  server to re-check with Stripe (`/billing/sync`). Paid access appears only once Stripe reports
  the subscription active. Until then the page says "Confirming your payment".
- **Verified webhooks.** The Stripe SDK checks the signature over the raw body (HMAC with a 5-minute
  timestamp tolerance). An invalid signature gets 400.
- **Duplicates.** Every event is claimed once in `BillingEvent` (unique provider event id).
  Redelivered PROCESSED or IGNORED events are acknowledged without doing any work.
- **Retries.** A processing error returns 500 and marks the event FAILED, so Stripe retries and the
  retry processes it again. A PROCESSING claim stuck for 5 minutes can be taken over.
- **Out-of-order events.** Events never apply their own payload. They trigger a **re-read of the
  subscription from Stripe**, so any order of delivery ends in Stripe's current state.
- **Reconciliation.** `BillingService.reconcile(userId)` lists the customer's subscriptions at
  Stripe and syncs each one. This repairs lost webhooks and hand-edited rows. One failing
  subscription doesn't stop the others. It runs on "Refresh status", on return from checkout, and
  can be scheduled later (see section 5).
- **Stored identifiers.** `BillingCustomer` holds the customer id (unique per provider and user).
  `Subscription.providerSubscriptionId` is unique, so there is never a duplicate row. `BillingEvent`
  stores event ids and status only, **no payloads**. Card data never reaches Rein Drop. The Stripe
  keys live only in API configuration and are never sent to clients.
- **One source of entitlements.** Subscription rows go through `@rein-drop/access`. The API
  (`/me/access`, `/me/entitlements`, `/me/capabilities`, Hunt limits) and the worker (monitoring
  sweep) read it, so a web purchase changes access on every client.

## 4. Tests

| Scenario | Where |
|---|---|
| Checkout success: nothing until Stripe confirms; sync grants it; the late webhook is idempotent (one row) | `apps/api/test/billing-lifecycle.int-spec.ts` |
| Incomplete checkout (payment failed at checkout) grants nothing | same |
| Renewal moves the period end | same |
| Failed renewal: past due keeps access; recovery restores it; unpaid drops to Free and nothing is deleted | same |
| Cancellation: scheduled keeps access until the period end; deleted drops to Free | same |
| Webhook retry after a 500, duplicate delivery, out-of-order delivery | same |
| Reconciliation repairs a lost webhook and a hand-edited row | same |
| Ultimate purchase updates `/me/access` and `/me/entitlements` | same |
| Signature, idempotency, portal, checkout (earlier steps) | `apps/api/test/billing*.int-spec.ts`, `stripe-billing.provider.spec.ts` |
| Page wording: renewal, cancellation, payment retrying, grace, suspended, plan actions, checkout return | `packages/client-core/src/billing-view.spec.ts` |

The tests drive the **real Stripe SDK** against an in-memory fake Stripe
(`fake-stripe.test-helper.ts`). They never contact Stripe.

## 5. Provider configuration still unresolved (owner)

Nothing below is invented in code. Until it is set, the API runs in development billing mode and
the page says so.

| # | Item | Notes |
|---|---|---|
| P1 | **Stripe account** (test mode first, then live) and the business details on it | Owner |
| P2 | **Products and prices** for Pro and Ultimate, then `STRIPE_PRICE_IDS=pro=price_…,ultimate=price_…` | Amounts and intervals come from Stripe. Final prices are not decided |
| P3 | **`STRIPE_SECRET_KEY`** (restricted key recommended) and **`STRIPE_WEBHOOK_SECRET`** in Key Vault (decision 0015), never in the repo | The API refuses `BILLING_PROVIDER=dev` in production |
| P4 | **Webhook endpoint** `https://<api>/billing/webhooks/stripe` subscribed to `checkout.session.completed` and `customer.subscription.created/updated/deleted/paused/resumed` | |
| P5 | **Customer Portal**: allow switching between the configured prices, cancellation **at period end**, payment-method update and invoices. Set the proration behaviour | Plan change and cancel deep links depend on it |
| P6 | **Failed-payment (dunning) settings**: retry schedule, and what Stripe does when retries run out (cancel vs mark unpaid) | Rein Drop: past due keeps access, unpaid and canceled don't |
| P7 | **`BILLING_GRACE_DAYS`** (default 0): extra days of access after a paid period lapses without a renewal | Owner policy |
| P8 | **Tax** (Stripe Tax / VAT registration), invoice branding, receipts | Stripe-side |
| P9 | **Trials / coupons**: none built. Supported as Stripe-side configuration (`trialing` is already an access state) | |
| P10 | **`WEB_APP_URL`** for the checkout and portal return links | Per environment |
| P11 | **Scheduled reconciliation**: a nightly worker job calling `reconcile` for paid users, as a safety net beyond webhooks and on-demand sync | Not built. Optional |
| P12 | **End-to-end test against Stripe test mode** (Stripe CLI `stripe listen`) before launch | Needs P1-P5 |
| P13 | Sell / Complete products: per-product checkout once Sell is sold | Plans are modelled but inactive (step 79) |
