# Facebook data provider (development): Apify "Facebook Marketplace Scraper"

_Step 38, Build Prompt 35. Chosen for development by the owner's instruction ("use any for now -
final decisions later"). Swappable behind `FacebookDataProvider`; the development provider
(`DevFacebookDataProvider`, provider id `dev`) stays the default._

**Status: development integration only. Not approved for production (D12).**

## What it is

- **Provider:** [Apify](https://apify.com), actor `apify/facebook-marketplace-scraper`
  (published by Apify), called through the official Apify API v2.
- **Why a third party:** Facebook Marketplace has no official public API for listing search
  (the actor's own documentation says so). Every option is a third-party data provider.
- **How the provider gets data:** the actor loads public Facebook Marketplace pages
  (location / category / search URLs) and extracts the listings.
- **Rein Drop provider id:** `apify-marketplace` (stored on every raw record).

> **Terms / legal - owner decision (D12).** The data is collected by a third party from public
> Facebook pages. Meta's terms restrict automated collection; whether, how and where this may be
> used commercially must be decided (legal review) before any production use. The integration is
> development-only until then.

## Authentication

- One Apify API token, from Apify Console > Settings > Integrations.
- Sent as `Authorization: Bearer <token>` (Apify's recommended method; the `?token=` query form
  is never used, so the token can't end up in URLs or logs).
- Configuration: `APIFY_TOKEN` (environment / secret store only - never committed).
- No Facebook login or cookies are needed or sent by Rein Drop.

## Request

`POST https://api.apify.com/v2/actors/apify~facebook-marketplace-scraper/run-sync-get-dataset-items`
(the `/v2/acts/` prefix is deprecated but equivalent), JSON body = the actor input:

```json
{
  "startUrls": [{ "url": "https://www.facebook.com/marketplace/capetown/search/?query=iphone%2013" }],
  "resultsLimit": 20,
  "includeListingDetails": false
}
```

Query parameters used: `maxItems` (cap on chargeable results), `maxTotalChargeUsd` (cost cap per
run), `timeout` (run timeout, seconds), `clean=true`, `format=json`.

## Query capabilities

| Hunt criterion | Pushed to the provider? | Notes |
|---|---|---|
| Query | Yes - `search/?query=` in the Marketplace URL | |
| Location | Yes - the city slug in the URL (`/marketplace/<slug>/`) | Slug derived from the Hunt's free-text location (letters only, lower case: "Cape Town" -> `capetown`). Facebook may not know every slug; unknown places return few or no results. Proper place ids need geocoding (decision 0001, TBD). |
| Radius | No | Facebook applies its default radius for the city. |
| Max price | No | Re-applied by Hunt matching. |
| Conditions | No | Re-applied by Hunt matching. |

Only the documented URL shape (`/marketplace/<city>/search/?query=`) is used - no undocumented
Facebook URL parameters.

## Result fields used (from the actor's documented output)

`id`, `listingUrl`, `marketplace_listing_title`, `listing_price.amount` (decimal string) /
`.formatted_amount`, `location.reverse_geocode.city` / `.state`, `is_live`, `is_sold`,
`is_pending`, `delivery_types`, and the cover photo when present (`primary_listing_photo`;
its exact shape isn't in the published example, so it's read leniently and a missing / different
shape just means no image). Seller names are **not** stored (personal data we don't need).

- **Currency:** the documented output has no ISO currency code (only a formatted amount such as
  `"$65"`). Prices are read in the configured `FACEBOOK_APIFY_CURRENCY` (the currency of the
  searched region), or `listing_price.currency` if the provider ever returns an ISO code.
- **Status:** `is_sold` -> SOLD; not `is_live` -> REMOVED; otherwise ACTIVE (`is_pending` is kept
  as `salePending` metadata).

## Freshness

- Search results come back in Facebook's own order (relevance), not strictly newest first.
- The posting time is only available with `includeListingDetails` (slower, and its field isn't
  in the published example), so it isn't requested: `listedAt` is null and Rein Drop's freshness
  uses the time it first saw the listing (`firstSeenAt`), as for any source without a date.
- Data is as fresh as the run: each search is a new scrape of the live page.

## Pagination

None across calls: each run scrapes the search page from the top, up to `resultsLimit` results
(`FACEBOOK_APIFY_RESULTS_LIMIT`, default 20). `nextCursor` is always null; new listings appear at
the next scheduled check.

## Rate limits, latency and cost

- **Latency:** a run starts a browser and loads Facebook - typically tens of seconds to a few
  minutes. The synchronous endpoint waits at most **300 s** (HTTP 408 after). Rein Drop declares
  an expected latency for this provider so the worker uses a longer request timeout and doesn't
  call it "slow" for normal run times.
- **API rate limits (Apify):** 60 requests / second per resource, 250,000 / minute per user;
  HTTP 429 when exceeded (Apify recommends exponential backoff). Mapped to RATE_LIMITED and the
  per-source backoff (decision 0009).
- **Cost:** pay per result - **USD 2.60 per 1,000 listings** on Apify's public pricing (subscription
  tiers can be cheaper; Apify includes USD 5 / month of free usage). Configurable as
  `FACEBOOK_APIFY_PRICE_PER_1000_USD`.
  - Example: 20 results per check = about USD 0.052; a Hunt checked every 15 minutes = 96 checks
    a day = about **USD 5 a day per Hunt**. Polling cadence and limits need the cost model
    (D7, prompt 36) before real use.
  - Every run is capped: `maxItems` = results limit and `maxTotalChargeUsd` = expected cost x 1.5.
- **Errors:** 401 / 403 / 404 (bad token, no access, actor not found) -> NOT_CONFIGURED;
  402 (out of credit / over the spending limit) -> RATE_LIMITED for an hour; 408 (run > 300 s) and
  5xx / network -> UNAVAILABLE (retryable); 429 -> RATE_LIMITED (Retry-After if given); 400 ->
  UNSUPPORTED_CRITERIA; unreadable body -> INVALID_RESPONSE. Error bodies `{ error: { type,
  message } }` are surfaced without the token.

## What Rein Drop records per search

On the SearchRun (`sourceUsage`, generic - no provider fields leak into Hunt or Listing):
requests made, results returned, duration, **estimated cost (USD)** and provider details
(actor, results limit, cost cap, start URL count). Raw provider records stay in `RawListing`
(as for every source); the normalized `Listing` only carries marketplace-level metadata
(delivery types, sale pending, the displayed price text).

## Limitations

- Development-only until D12 (terms) and the cost model are decided.
- City slugs are guessed from free text; no radius / price / condition push-down.
- No posting time (freshness = first seen); no description (listing details off).
- No single-listing refresh (`fetchListing` not offered).
- Long runs: keep `WORKER_JOB_LEASE_MS` above the run time (default 120 s vs up to 300 s runs).

## Configuration

| Variable | Default | |
|---|---|---|
| `FACEBOOK_SOURCE` | `dev` | `dev` = development provider; `apify` = this provider. |
| `APIFY_TOKEN` | - | Required for `apify`. Secret. |
| `FACEBOOK_APIFY_CURRENCY` | - | Required for `apify`: ISO currency of the searched region, e.g. `ZAR`. |
| `FACEBOOK_APIFY_ACTOR` | `apify~facebook-marketplace-scraper` | Actor id (`username~name`). |
| `FACEBOOK_APIFY_RESULTS_LIMIT` | `20` | 1-100 results per search. |
| `FACEBOOK_APIFY_PRICE_PER_1000_USD` | `2.60` | For cost estimates and the per-run cost cap. |
| `FACEBOOK_APIFY_TIMEOUT_SECONDS` | `240` | Actor run timeout (< 300 s, the sync limit). |

Sources: [actor page](https://apify.com/apify/facebook-marketplace-scraper),
[Apify API v2](https://docs.apify.com/api/v2),
[run-sync-get-dataset-items](https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post).
