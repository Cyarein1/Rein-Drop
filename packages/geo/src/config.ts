import { z } from 'zod';
import { AzureMapsGeocodingProvider, type AzureMapsConfig, type GeoFetch } from './azure/azure-maps-provider.js';
import { MockGeocodingProvider } from './mock/mock-geocoding-provider.js';
import { GEOCODING_PROVIDER_IDS, type GeocodingProvider, type GeocodingProviderId } from './provider.js';

/** Geocoding settings from the environment (API and worker). */
export const geoEnvShape = {
  /** mock (development default) | azure | none (production default until a key exists). */
  GEOCODING_PROVIDER: z.enum(GEOCODING_PROVIDER_IDS, { error: `must be one of: ${GEOCODING_PROVIDER_IDS.join(', ')}` }).optional(),
  /** Azure Maps subscription key (secret: never logged, never sent to clients). */
  AZURE_MAPS_KEY: z.string().trim().min(1).optional(),
  AZURE_MAPS_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).optional(),
};
export type GeoEnv = { [K in keyof typeof geoEnvShape]?: z.infer<(typeof geoEnvShape)[K]> };

export interface GeoConfig {
  provider: GeocodingProviderId;
  /** Present when provider is "azure". Holds the key - never log it. */
  azure: AzureMapsConfig | null;
}

/**
 * Which geocoder runs. Development defaults to the mock; production defaults to `none` (free-text
 * locations, exactly as before step 74) and refuses the mock - real users never see made-up places.
 */
export function resolveGeoConfig(env: GeoEnv, nodeEnv: string): { geo: GeoConfig; problems: string[] } {
  const production = nodeEnv === 'production';
  const provider = env.GEOCODING_PROVIDER ?? (production ? 'none' : 'mock');
  const problems: string[] = [];
  if (production && provider === 'mock') {
    problems.push('GEOCODING_PROVIDER: "mock" is development-only (made-up place list), not allowed when NODE_ENV=production');
  }
  if (provider === 'azure' && !env.AZURE_MAPS_KEY) problems.push('AZURE_MAPS_KEY: required when GEOCODING_PROVIDER=azure');
  const azure = provider === 'azure' && env.AZURE_MAPS_KEY ? { key: env.AZURE_MAPS_KEY, timeoutMs: env.AZURE_MAPS_TIMEOUT_MS } : null;
  return { geo: { provider, azure }, problems };
}

/** The provider for a config; null for `none`. */
export function createGeocodingProvider(config: GeoConfig, fetchImpl?: GeoFetch): GeocodingProvider | null {
  switch (config.provider) {
    case 'mock':
      return new MockGeocodingProvider();
    case 'azure':
      return config.azure ? new AzureMapsGeocodingProvider(config.azure, fetchImpl) : null;
    case 'none':
      return null;
  }
}
