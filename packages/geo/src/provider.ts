/**
 * Geocoding boundary (decisions 0001 / 0017). Everything that turns place text into coordinates -
 * suggestions while typing, a Hunt's or profile's area, listing places for distance checks - goes
 * through a GeocodingProvider, so the app runs on a deterministic mock locally and on Azure Maps in
 * production without changing domain code.
 *
 * - `mock`  : built-in list of real places (development / tests). Refused in production.
 * - `azure` : Azure Maps (needs AZURE_MAPS_KEY - the owner creates the account; TODO(geo)).
 * - `none`  : no geocoding. Locations stay free text, as before step 74 (the production default
 *             until a key is configured - never fake places in front of real users).
 */
export const GEOCODING_PROVIDER_IDS = ['mock', 'azure', 'none'] as const;
export type GeocodingProviderId = (typeof GEOCODING_PROVIDER_IDS)[number];

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** A place a person can pick: what to show, and where it is. */
export interface GeoPlace {
  /** Display label, e.g. "Sandton, Johannesburg, Gauteng". */
  label: string;
  point: GeoPoint;
  postalCode: string | null;
  /** ISO 3166-1 alpha-2, upper case, when known. */
  countryCode: string | null;
}

export interface GeoQueryOptions {
  /** Prefer places in this country (ISO alpha-2) - the user's country. */
  countryCode?: string | null;
  /** Most suggestions to return (default 5). */
  limit?: number;
}

export interface GeocodingProvider {
  readonly id: GeocodingProviderId;
  /** Places matching what's been typed so far (best first). Empty when nothing fits. */
  suggest(query: string, options?: GeoQueryOptions): Promise<GeoPlace[]>;
  /** The single best place for free text (a saved location, a listing's "City, ST"), or null. */
  geocode(text: string, options?: GeoQueryOptions): Promise<GeoPlace | null>;
}

export const GEO_ERROR_CODES = ['NOT_CONFIGURED', 'UNAVAILABLE', 'RATE_LIMITED', 'BAD_RESPONSE'] as const;
export type GeoErrorCode = (typeof GEO_ERROR_CODES)[number];

export class GeocodingError extends Error {
  constructor(
    readonly code: GeoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GeocodingError';
  }
}

/** Suggestions need at least this many characters (cost and noise). */
export const GEO_SUGGEST_MIN_LENGTH = 2;
export const GEO_SUGGEST_MAX_LENGTH = 100;
export const GEO_SUGGEST_DEFAULT_LIMIT = 5;
