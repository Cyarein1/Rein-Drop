# 0010 - Real eBay source: Buy > Browse API

Status: accepted (step 37, Build Prompt 34). Date: 2026-10-08. The data-source and terms question
(D12) still needs the owner's confirmation - see "Open".

## Context

Hunts need real eBay listings. The development eBay source stays available for local work and
tests ("mock mode").

## Decision

- **API**: eBay's official Buy > Browse API v1, from eBay's published OpenAPI spec
  (`buy_browse_v1_oas3.json`):
  - `GET https://api.ebay.com/buy/browse/v1/item_summary/search` for searches,
  - `GET .../item/{item_id}` to re-read one listing,
  - application access token via the OAuth client-credentials grant
    (`POST /identity/v1/oauth2/token`, scope `https://api.ebay.com/oauth/api_scope`),
  - header `X-EBAY-C-MARKETPLACE-ID` = the configured site; sandbox host
    `api.sandbox.ebay.com` when `EBAY_ENVIRONMENT=sandbox`.
- **Mapping** (`EbayAdapter`, provider `ebay-browse`):
  - source id = `itemId` (`legacyItemId` kept in metadata); link = `itemWebUrl`;
  - freshness: `sort=newlyListed`, `listedAt` = `itemCreationDate`;
  - price: `price`, or `currentBidPrice` for auction-only listings; shipping (first
    `shippingOptions` cost) becomes the buyer's known cost, `0.00` = free shipping;
  - status: `OUT_OF_STOCK` = SOLD, past `itemEndDate` = ENDED, otherwise ACTIVE; `GET /item`
    404 = gone (null);
  - condition text = eBay `condition`; location = city, state, country.
- **Filters**: `conditionIds` from eBay's condition reference (new 1000/1500/1750, refurbished
  2000/2010/2020/2030/2500, used 3000/4000/5000/6000 - never 7000 "for parts"); `price` +
  `priceCurrency` only when the max price is in the site's currency. Location is not pushed
  down (eBay ships; Hunt locations are free text). Hunt matching re-applies every criterion.
- **Pagination**: eBay `limit` (<= 200) / `offset` (a multiple of limit), as an opaque cursor;
  never beyond eBay's 10,000-result window.
- **Errors**: 429 -> RATE_LIMITED (Retry-After honoured, else 60 s) feeding the per-source
  backoff (decision 0009); 5xx / network -> UNAVAILABLE (retryable); rejected credentials /
  403 -> NOT_CONFIGURED; other 4xx -> UNSUPPORTED_CRITERIA; non-JSON / unreadable -> INVALID_RESPONSE;
  a 401 on an API call refreshes the token once.
- **Configuration**: `EBAY_SOURCE=dev|api` (dev by default outside production; production uses api
  and refuses dev), `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_ENVIRONMENT`,
  `EBAY_MARKETPLACE_ID`. Credentials only from the environment / secret store; `.env` files are
  git-ignored; errors and logs never include them.
- **Tests**: unit + the shared adapter contract suite against a fake eBay server shaped like the
  spec; live tests (`ebay-adapter.live.spec.ts`) run only when `EBAY_CLIENT_ID` and
  `EBAY_CLIENT_SECRET` are set and are skipped otherwise.

## Open

- D12: confirm the eBay API License Agreement / Buy API terms for this use, production keyset
  approval and the Browse API call quota (default limits are per application per day).
- Listings found with the development source keep provider `dev`; real-source records are
  provider `ebay-browse` (the two never mix).
- `X-EBAY-C-ENDUSERCTX` (buyer location for delivery estimates) and affiliate fields are not used.
