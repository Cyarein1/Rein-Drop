# 0014 - Web billing with Stripe (server-owned entitlements)

Status: accepted (step 42, Build Prompt 39) - resolves D2 for web; native store billing not decided

## Context

Plans and entitlements already existed (decision 0003) with a development-only fake checkout. The
web beta needs real payments for paid plans without hard-coding prices (final pricing may change),
while Free keeps working without a card. The owner approved **Stripe** for web billing (2026-10-09).

## Decision

- **`BillingProvider` boundary** (`apps/api/src/modules/billing/billing-provider.ts`): customer,
  hosted checkout, hosted portal, webhook verification, subscription read, prices. Implementation:
  `StripeBillingProvider` (official `stripe` SDK, pinned API version `2026-09-30.endive`). The
  development fake stays for local work (`BILLING_PROVIDER=dev`, refused in production).
- **Prices are configuration, not code**: `STRIPE_PRICE_IDS=pro=price_...,ultimate=price_...`
  maps plan codes to Stripe prices; amounts and intervals are read from Stripe (cached 10 min) and
  shown on the plan gate. A plan without a configured / active price shows "Price TBD" and can't be
  bought. Plan limits stay in the database (still placeholders).
- **Checkout**: `POST /billing/checkout` creates (once, idempotency key per user) the Stripe
  customer and a Checkout Session (mode subscription) with return URLs built from `WEB_APP_URL` +
  a validated same-site path. **Nothing is granted on return** - only a verified webhook changes
  a paid plan. The web page waits for it (polling the server) after `?checkout=success`.
- **Webhooks** (`POST /billing/webhooks/stripe`, public): signature verified over the raw body
  (HMAC + 5-minute timestamp tolerance) -> 400 when invalid. Each event is recorded once in
  `BillingEvent` (unique provider event id): PROCESSED / IGNORED redeliveries are acknowledged
  without work; FAILED ones are processed again; a stuck PROCESSING claim can be retaken after 5
  minutes. Relevant events (`checkout.session.completed`, `customer.subscription.*`) **re-read the
  subscription from Stripe** and mirror it - so duplicates and out-of-order deliveries converge on
  Stripe's current state. Processing errors return 500 so Stripe retries. Subscriptions of
  customers that aren't Rein Drop users are recorded and ignored.
- **Server-owned entitlements**: `Subscription` rows are written only by Rein Drop (webhook sync,
  Free choice, development fake); entitlements are derived from them + `Plan`/`Entitlement`.
  Entitled statuses: ACTIVE, TRIALING and **PAST_DUE** (grace while Stripe retries a failed
  renewal - D36); INCOMPLETE, PAUSED, CANCELED, EXPIRED are not. A cancellation scheduled for the
  period end keeps the plan until then (`cancelAtPeriodEnd`).
- **Plan changes and cancellation**: Stripe Customer Portal (`POST /billing/portal`, deep links for
  change plan / cancel). When a webhook changes the plan, Hunts (subscribed via
  `BillingService.onPlanChanged`, so Billing never writes hunts) pauses LIVE hunts above the new
  limit - the most recently started first - as a recorded system action.
- **Free plan unchanged**: no subscription = Free; `POST /billing/free` records the choice (no
  card, no provider) and is refused while a paid plan is current (cancel it in the portal).
- **Mobile**: Free works; paid plans are bought and cancelled on the web (no in-app purchase,
  no link to an external purchase). Native App Store / Google Play billing is not built.

## Consequences

- Production needs `BILLING_PROVIDER=stripe` with `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_IDS`, `WEB_APP_URL`, a webhook endpoint subscribed to `checkout.session.completed`
  and `customer.subscription.created/updated/deleted/paused/resumed`, and the Customer Portal
  configured (switch between the configured prices; cancel at period end).
- Downgrade enforcement covers the active-Hunt limit only; marketplaces / priority not in the new
  plan are not yet enforced on running hunts (OUTSTANDING).
- Tax, trials, coupons and proration settings are Stripe-side configuration, not code.
