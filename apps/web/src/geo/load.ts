import "server-only";
import type { ApiClient, GeoConfig, UserArea } from "@rein-drop/api-client";

/** No suggestions, no map: what the form falls back to when the API can't say. */
export const NO_GEO: GeoConfig = { provider: "none", suggestions: false, tiles: null, attribution: null };

/** Place / map features + the user's area for a location form. Never fails the page. */
export async function loadLocationSupport(api: ApiClient): Promise<{ geo: GeoConfig; area: UserArea | null }> {
  const [geo, area] = await Promise.all([api.getGeoConfig().catch(() => NO_GEO), api.getMyArea().catch(() => null)]);
  return { geo, area };
}
