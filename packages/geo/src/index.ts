/**
 * Geo boundary (decisions 0001 / 0017): place suggestions, geocoding and map tiles behind a
 * GeocodingProvider - a deterministic mock in development, Azure Maps in production (once the
 * owner adds AZURE_MAPS_KEY; until then `none` = free-text locations). Plus distance maths for the
 * radius checks in matching.
 */
export {
  GEO_ERROR_CODES,
  GEO_SUGGEST_DEFAULT_LIMIT,
  GEO_SUGGEST_MAX_LENGTH,
  GEO_SUGGEST_MIN_LENGTH,
  GEOCODING_PROVIDER_IDS,
  GeocodingError,
  type GeocodingProvider,
  type GeocodingProviderId,
  type GeoErrorCode,
  type GeoPlace,
  type GeoPoint,
  type GeoQueryOptions,
} from './provider.js';
export { distanceKm, isValidPoint, placeKey, roundPoint } from './distance.js';
export { MockGeocodingProvider } from './mock/mock-geocoding-provider.js';
export { MOCK_PLACES, type MockPlace } from './mock/places.js';
export {
  AZURE_MAPS_DEFAULTS,
  AzureMapsGeocodingProvider,
  azureFeatureToPlace,
  fetchAzureMapTile,
  isValidTile,
  type AzureMapsConfig,
  type GeoFetch,
  type GeoHttpResponse,
} from './azure/azure-maps-provider.js';
export { createGeocodingProvider, geoEnvShape, resolveGeoConfig, type GeoConfig, type GeoEnv } from './config.js';
