# 0001 - Geocoding / maps provider: Azure Maps

- **Status:** Accepted (2026-10-07). Implementation pending (no code calls a provider yet).
- **Decided by:** product owner delegated the choice ("any good one that is free or cheap
  enough"); recommendation recorded here.

## Context

Hunts on local marketplaces (Facebook Marketplace) need a location and radius. Today the
location is free text (`Hunt.locationText`, `radiusKm`). To turn it into coordinates (and offer
address autocomplete when creating a Hunt) we need a geocoding provider.

Usage profile: geocode **once when a Hunt's location is saved** and store the result; autocomplete
while the user types. Monitoring checks reuse the stored location - no per-check geocoding. So
results must be **storable**, and volume scales with Hunt creation/edits, not with monitoring.

## Options considered (pricing as published around 2026-10; verify before signing up)

| Option | Free allowance | Notes |
|---|---|---|
| **Azure Maps (Gen2) Search** | 5,000 search transactions / month | Same cloud and billing as the long-term Azure target. Geocode **autocomplete is billed as 1 transaction per 10 requests**. Volume discounts from 100k transactions/month. |
| Mapbox Geocoding | 100,000 / month, then ~$0.75 per 1,000 | Free tier is *temporary* geocoding - results may not be stored long-term; storing needs the more expensive Permanent Geocoding API. Poor fit for saved Hunt locations. |
| Geoapify | 3,000 credits / day | Paid from $59/month. Free plan allows only limited commercial use. Good fallback. |
| OSM Nominatim (public) | Free | Usage policy forbids heavy use and autocomplete; no SLA. Not suitable for production. |

## Decision

Use **Azure Maps Search** (geocode + autocomplete) behind a `GeocodingProvider` interface, with a
deterministic local/mock provider for development (no key needed, matching the AIProvider
pattern). Fallback if limits or terms do not fit: Geoapify.

## Before implementing

1. **Check Azure Maps terms on storing / caching geocoding results** (the pricing page does not
   say). If storage is not allowed, reconsider Geoapify.
2. Create the Azure Maps account; key goes in API env config (never in clients).
3. Geocode server-side only (API), store lat/lng with the Hunt; keep `locationText` as the label.
4. Decide what location granularity is shown/stored for privacy (city vs exact address).

## Sources

- Azure Maps pricing: https://azure.microsoft.com/en-us/pricing/details/azure-maps/
- Mapbox geocoding pricing / temporary vs permanent: https://www.woosmap.com/blog/mapbox-pricing,
  https://www.mapbox.com/geocoding/evaluation
- Geoapify pricing: https://geoapify.com/pricing
