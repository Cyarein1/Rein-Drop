# 0017 - Hunt location: profile area, suggestions, interactive map, distance checks

- **Status:** Accepted (2026-10-14) by the product owner, including native maps on mobile.
  **Built in step 74** against the mock geocoder. Azure Maps and the Android Google Maps key are
  the owner's TODOs.
- **Change from the proposal:** the web map uses **Leaflet** (raster tiles, ~40 KB), not MapLibre -
  a pin and a circle don't need vector maps.
- **Builds on:** [0001](0001-geocoding-azure-maps.md) (Azure Maps behind a `GeocodingProvider`,
  mock provider in development, key on the server only).

## Context

The owner asked for:
- the profile's address offered as the Hunt location;
- suggestions while typing, like Uber / Facebook;
- an interactive map below with a pin and the radius, like Facebook Marketplace.

What the code does today:
- **Location** is free text (`Hunt.locationText`) and **radius** is a number (`radiusKm`). There
  are no coordinates anywhere.
- **Facebook search** (Apify) only uses the **city** from that text and **cannot apply a radius**.
  **eBay ignores location.**
- **Matching never checks distance:** a Facebook Hunt's radius is always "Distance not checked
  yet".

## Decisions (owner, 2026-10-14)

1. **Area, not a street address.**
   - **What is stored:** the profile stores a "Your area": a place label (suburb / city, optional
     postal code) and approximate coordinates.
   - **Why:** no search uses a street address, and home addresses are sensitive personal data that
     the privacy notice and legal review would have to cover.
   - **Use:** the area is editable in Settings and offered as one tap in Create Hunt. Any Hunt can
     still use a different area.
2. **Suggestions while typing** come from the API (`GeocodingProvider`: Azure Maps in production,
   a deterministic mock in development). The key is never in the apps.
   - **Choosing a suggestion** stores its label and coordinates with the Hunt or the profile.
   - **Free text** stays allowed: it is geocoded on save; if that fails, the Hunt keeps today's
     text-only behaviour.
3. **Interactive map** under the location, with a pin and the radius circle (pan / zoom / move
   the pin; the radius follows the radius field). It is chosen over a static image preview.
4. **Distance checks are built with it**, so the circle means what it shows:
   - listing locations (Facebook city / state, eBay item location) are geocoded with results
     **cached by place**, never per listing;
   - matching then passes or fails a listing on distance from the Hunt's coordinates;
   - "Distance not checked" remains only when a listing's place can't be resolved.
5. **Build against the mock provider first.** The owner creates the Azure Maps account and adds
   the key later (the agent never provisions Azure resources). Decision 0001's "before
   implementing" checks still apply, especially the **terms on storing / caching results**,
   before production use.

## Proposed architecture (to confirm with the build steps)

- **Data:**
  - `User` gets the area: label, lat / lng (rounded to ~100 m), postal code optional.
  - `Hunt` gets `locationLat` / `locationLng` next to `locationText`.
  - A `GeoPlaceCache` table stores normalized place text -> coordinates for listing places.
- **API:**
  - `GET /geo/suggest?q=` (signed in, rate limited, short query minimum);
  - `POST /geo/resolve` (suggestion id -> place);
  - `GET` / `PUT /me/area`.
- **Map tiles:** an open-source renderer (MapLibre) on web. Tiles come through the API (Azure
  Maps raster tiles in production, so the key stays server-side), and in development from a mock
  / OpenStreetMap source with attribution. The radius circle and pin are drawn on the client.
- **Steps (proposed):**
  1. "Your area" in the profile + Settings + Create Hunt one-tap;
  2. `GeocodingProvider` (mock + Azure) and suggestions while typing;
  3. the interactive map with pin + radius on web, then mobile;
  4. distance checks in matching (place cache) and honest copy.

## Mobile map (owner, 2026-10-14): native maps

**Chosen:** `react-native-maps` over a WebView of the web map.

What the choice brings:
- **iPhone:** Apple Maps, free, no key.
- **Android:** Google Maps. This needs:
  - a **Google Maps Platform API key with billing**, created by the owner (the agent never creates
    cloud accounts or keys);
  - restriction of the key to the app's Android package and signing certificate;
  - a **development build**, because Expo Go can't use the app's own key.
- **What stays shared with web:**
  - the suggestions, saved coordinates and distance checks go through the API (Azure Maps / mock);
  - only the map tiles differ: Apple / Google on phones, MapLibre on web.

Prerequisites before the Android map works:
- an Android package name and an EAS development build (D23, also needed for real push);
- the Google Maps key.
