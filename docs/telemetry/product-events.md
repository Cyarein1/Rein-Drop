# Product events (beta telemetry)

What Rein Drop records about how the product is used, where each event comes from, and what an
event may carry. Decision: [0016](../decisions/0016-product-events.md). Catalog in code:
[`packages/contracts/src/product-events.ts`](../../packages/contracts/src/product-events.ts).

## Events

| Event | Recorded by | When (exactly once per change) | Properties |
|---|---|---|---|
| `onboarding_started` | API - Seller Snapshot | The first answer creates the profile | - |
| `onboarding_completed` | API - Seller Snapshot | The fifth answer completes it (later edits don't count) | - |
| `hunt_created` | API - Hunts | A Hunt is created (draft) | `huntId`, `marketplaces`, `hasMaxPrice`, `hasTarget` |
| `hunt_activated` | API - Hunts | DRAFT -> LIVE through the plan gate (resume is not counted; a blocked activation is not) | `huntId`, `planCode` |
| `deal_alerted` | Worker - deal analysis | The deal's alert is created (at most once per deal, after the transaction commits) | `dealId`, `huntId`, `kind` (deal / exceptional), `marketplace` |
| `deal_opened` | API - Deals | Each time the deal detail opens (both apps call `POST /deals/:id/seen`) | `dealId`, `firstOpen` |
| `deal_saved` | API - Deals | Saved (saving again is not counted) | `dealId` |
| `deal_ignored` | API - Deals | Becomes ignored (repeating Ignore is not counted) | `dealId`, `hasReason` |
| `deal_bought` | API - Deals | The purchase is recorded (once per deal) | `dealId`, `marketplace`, `strength` |
| `sale_recorded` | API - Outcomes | A held item is marked sold (correcting the sale is not another sale) | `inventoryItemId`, `fromDeal`, `result` (profit / loss / break_even / unavailable), `daysHeld` |
| `plan_viewed` | Web + mobile -> `POST /telemetry/events` | The plan comparison is shown on Start watching (once per visit) | `context` (hunt_activation) |
| `plan_selected` | API - Billing | Free chosen, a paid checkout started, or the development plan confirmed - not when re-choosing the current plan | `planCode`, `method` (free / checkout / development) |
| `cancellation` | API - Billing (verified Stripe webhooks) | Cancel-at-period-end switched on (`scheduled`), or an entitled paid plan cancelled / expired (`ended`) - redelivered webhooks never count twice | `planCode`, `kind` |

Every event also has `distinctId` (the internal user id), `occurredAt` (ISO time) and `source`
(`api` or `worker`). `plan_selected` with `checkout` means the checkout was **started**; the plan
changes only when Stripe confirms payment.

Not recorded: page views in general, pause / resume / archive, purchase-cost edits, undo sale,
Seller Snapshot answers themselves.

## Privacy rules (enforced, not just documented)

- Every event's properties are a **strict schema**: an unknown key, a wrong type or a non-UUID user
  id **drops the event** (logged as a warning with the property path only, never the value). A
  careless call site can't leak a listing title by adding a field.
- **No marketplace payloads**: no listing titles, descriptions, URLs, photos, seller names or
  locations; records are referenced by internal ids only.
- **No money**: no prices, costs or profit - `sale_recorded` has the direction only.
- **No free text**: not the ignore reason (`hasReason` only), notes, Hunt queries or names.
- **No personal data**: no email, name, IP address, user agent or device id. The person is the
  internal user id (an opaque UUID), the same one already in request logs.
- Apps can report only `plan_viewed` (the server owns every other event, so clients can't forge
  them), for the signed-in user only, rate-limited to 60 per minute.

Tests that hold these rules: `packages/contracts/src/product-events.spec.ts` (every event rejects
titles, URLs, email, money, free text), `packages/telemetry/src/telemetry.spec.ts` (drop on
invalid properties without echoing values; provider failures never reach the caller),
`apps/api/test/product-events.int-spec.ts` (each event once, nothing forbidden in a whole run),
`apps/api/test/billing.int-spec.ts` (plan_selected / cancellation through redelivered webhooks),
`apps/worker/test/alerts.int-spec.ts` (one `deal_alerted` per alert, none on re-analysis).

## Providers

`PRODUCT_EVENTS_PROVIDER` (API and worker):

- `log` (default) - one structured log line per event: `{"event":"product_event","name":...,
  "distinctId":...,"occurredAt":...,"source":...,"properties":{...}}` (JSON in production; a
  readable line in development).
- `none` - recording off.

Recording is fire-and-forget: it never throws, never waits, and runs after the database
transaction commits, so telemetry can't fail or slow a user's request or a worker job.

### Reading the events in the Azure beta

The beta's container logs go to Log Analytics (runbook [BETA_DEPLOYMENT.md](../azure/BETA_DEPLOYMENT.md)).
For example, a weekly funnel:

```kusto
ContainerAppConsoleLogs_CL
| where Log_s has '"event":"product_event"'
| extend e = parse_json(Log_s)
| extend m = iff(isnotnull(e.message), e.message, e)   // Nest wraps the object in "message"
| where tostring(m.event) == "product_event"
| summarize users = dcount(tostring(m.distinctId)) by name = tostring(m.name), bin(TimeGenerated, 7d)
| order by TimeGenerated desc, users desc
```

Log retention is 30 days with a 0.2 GB/day cap (decision 0015): fine for the beta's volumes, not
for long-term analytics - that is what a vendor or an export is for (D15).

### Adding a vendor (after D15)

1. Implement `ProductEventProvider` in `packages/telemetry` (e.g. `PostHogProductEventProvider`):
   queue and send in the background, `shutdown()` flushes. Map `distinctId`, `name`,
   `properties`, `occurredAt`; disable the SDK's automatic IP / geo / person-profile capture.
2. Add its id to `PRODUCT_EVENT_PROVIDER_IDS` and its settings to `productEventsEnvShape`; the key
   comes from the environment (Key Vault in Azure) and is never logged.
3. Decide whether `distinctId` should be pseudonymised (e.g. an HMAC of the user id) before it
   leaves Rein Drop, and add the vendor to the privacy notice.
Nothing outside `packages/telemetry` changes; the catalog and its tests keep guarding what is sent.
