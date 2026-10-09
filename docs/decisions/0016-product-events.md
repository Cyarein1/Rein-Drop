# 0016 - Product events behind a provider, logged until a vendor is approved

Status: accepted (step 46, Build Prompt 43) - vendor choice still open (D15)

## Context

The beta needs to know whether people get through onboarding, create and activate Hunts, act on
deals, record outcomes and choose / cancel plans. No product analytics vendor is approved yet
(D15, PostHog the candidate), and the prompt asks for a local logger first, without sensitive
marketplace payloads or unnecessary personal data.

## Decision

- **One catalog, strict schemas** (`packages/contracts/src/product-events.ts`): 13 events, each
  with an exact property schema (`z.strictObject`). Anything not in the schema drops the event.
  Ids only - no listing content, money, free text, email, IP or device data.
- **Server-side recording where the state changes**, after the transaction commits, once per
  change (idempotent requests, webhook redeliveries and re-analyses don't repeat events). The
  worker records `deal_alerted`. Only `plan_viewed` comes from the apps, through
  `POST /telemetry/events`, which accepts nothing else - clients can't forge server events.
- **Provider abstraction** (`@rein-drop/telemetry`): `ProductEventProvider` with `log` (default -
  a structured `product_event` log line, which the Azure beta keeps in Log Analytics) and `none`;
  a memory provider for tests. `ProductEvents.track()` validates, never throws, never waits.
  `PRODUCT_EVENTS_PROVIDER` selects it in the API and worker.
- **Identity** = the internal user id (opaque UUID). Pseudonymising it is decided with the vendor.
- No client SDK, no third-party script in the web app (CSP unchanged), no cookies.

## Consequences

- Funnels can be read with Log Analytics queries during the beta (30-day retention, capped).
- A vendor is one new provider class plus configuration; call sites and the catalog stay.
- Adding an event or property means changing the catalog and its tests - deliberate friction.
- `deal_opened` counts opens reported by the apps (`/deals/:id/seen`); a client that skipped that
  call would not be counted.
- Two concurrent first saves of the Seller Snapshot could both record `onboarding_started`
  (no lock for a telemetry-only count) - acceptable.

Details and the KQL example: [docs/telemetry/product-events.md](../telemetry/product-events.md).
