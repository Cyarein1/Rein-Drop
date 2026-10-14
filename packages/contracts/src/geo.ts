import { z } from 'zod';

/**
 * Places, "Your area" and the map (decision 0017). Coordinates are approximate (~110 m) - an area
 * for a pickup radius, never a street address.
 */

export const GEO_QUERY_MIN_LENGTH = 2;
export const GEO_QUERY_MAX_LENGTH = 100;
export const GEO_LABEL_MAX_LENGTH = 100;
export const GEO_SUGGEST_MAX = 8;

export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof geoPointSchema>;

export const geoPlaceSchema = z.object({
  /** "Sandton, Johannesburg, Gauteng". */
  label: z.string().trim().min(2).max(GEO_LABEL_MAX_LENGTH),
  point: geoPointSchema,
  postalCode: z.string().max(20).nullable(),
  countryCode: z.string().length(2).nullable(),
});
export type GeoPlace = z.infer<typeof geoPlaceSchema>;

/** `GET /geo/suggest?q=` - places while typing (signed in, rate limited). */
export const geoSuggestQuerySchema = z.object({
  q: z.string().trim().min(GEO_QUERY_MIN_LENGTH).max(GEO_QUERY_MAX_LENGTH),
  limit: z.coerce.number().int().min(1).max(GEO_SUGGEST_MAX).default(5),
});
export type GeoSuggestQuery = z.infer<typeof geoSuggestQuerySchema>;

export const geoSuggestResponseSchema = z.object({ places: z.array(geoPlaceSchema) });
export type GeoSuggestResponse = z.infer<typeof geoSuggestResponseSchema>;

/**
 * Map tiles for the WEB map (phones use Apple / Google maps natively):
 * - `osm`   : OpenStreetMap's public tiles - DEVELOPMENT ONLY (mock geocoder; OSM's tile policy
 *             allows light development use with attribution, not production traffic). TODO(geo).
 * - `proxy` : Azure Maps tiles through the web server (key stays server-side).
 * - null    : no map (production without a maps key - locations are free text).
 */
export const MAP_TILE_SOURCES = ['osm', 'proxy'] as const;
export type MapTileSource = (typeof MAP_TILE_SOURCES)[number];

/** `GET /geo/config` - what the clients may offer. */
export const geoConfigSchema = z.object({
  /** mock | azure | none. */
  provider: z.enum(['mock', 'azure', 'none']),
  /** Suggestions while typing are available. */
  suggestions: z.boolean(),
  tiles: z.enum(MAP_TILE_SOURCES).nullable(),
  /** Attribution the web map must show for its tiles. */
  attribution: z.string().nullable(),
});
export type GeoConfig = z.infer<typeof geoConfigSchema>;

/** "Your area" on the profile. */
export const userAreaSchema = z.object({
  label: z.string().trim().min(2, 'Enter a suburb, town or postal code').max(GEO_LABEL_MAX_LENGTH),
  /** Null when the place couldn't be found on the map (still usable as text). */
  point: geoPointSchema.nullable(),
  postalCode: z.string().max(20).nullable(),
  updatedAt: z.string().nullable(),
});
export type UserArea = z.infer<typeof userAreaSchema>;

export const userAreaResponseSchema = z.object({ area: userAreaSchema.nullable() });
export type UserAreaResponse = z.infer<typeof userAreaResponseSchema>;

/**
 * `PUT /me/area`. Send the picked suggestion's point; without one the API places the label itself
 * (or keeps it as text when it can't).
 */
export const updateUserAreaRequestSchema = z.object({
  label: z.string().trim().min(2, 'Enter a suburb, town or postal code').max(GEO_LABEL_MAX_LENGTH),
  point: geoPointSchema.nullable().default(null),
  postalCode: z.string().trim().max(20).nullable().default(null),
});
export type UpdateUserAreaRequest = z.infer<typeof updateUserAreaRequestSchema>;
export type UpdateUserAreaRequestInput = z.input<typeof updateUserAreaRequestSchema>;
