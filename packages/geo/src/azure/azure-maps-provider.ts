import { roundPoint, isValidPoint } from '../distance.js';
import {
  GEO_SUGGEST_DEFAULT_LIMIT,
  GeocodingError,
  type GeocodingProvider,
  type GeoPlace,
  type GeoQueryOptions,
} from '../provider.js';

/**
 * Azure Maps Geocoding (REST, api-version 2025-01-01) - decision 0001.
 *
 * TODO(geo): NOT YET RUN AGAINST A REAL ACCOUNT. Written from the published API reference and
 * covered by unit tests with recorded-shape fake responses; the owner creates the Azure Maps
 * account and sets AZURE_MAPS_KEY, then run the live check (OUTSTANDING "Hunt location"). Also
 * confirm the terms on storing results (decision 0001, "Before implementing" 1).
 *
 * Only areas are requested (neighbourhood, town / city, postal code) - never street addresses
 * (decision 0017). Results are restricted to the user's country when known.
 */
export const AZURE_MAPS_DEFAULTS = {
  baseUrl: 'https://atlas.microsoft.com',
  apiVersion: '2025-01-01',
  timeoutMs: 5_000,
  resultTypes: 'Neighborhood,PopulatedPlace,Postcode1',
} as const;

export interface AzureMapsConfig {
  /** Subscription key (secret - never logged, never sent to clients). */
  key: string;
  timeoutMs?: number;
  baseUrl?: string;
}

export interface GeoHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  headers: { get(name: string): string | null };
}
export type GeoFetch = (url: string, init: { headers: Record<string, string>; signal?: unknown }) => Promise<GeoHttpResponse>;

/** This package has no DOM / Node typings: the few globals it uses, typed minimally. */
type Globals = {
  fetch?: GeoFetch;
  AbortController?: new () => { signal: unknown; abort(reason?: unknown): void };
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};
const g = globalThis as unknown as Globals;

/** "a=1&b=x%20y" without URLSearchParams (not in this package's typings). */
const query = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/** Runs a request with an abort timer. */
async function withTimeout<T>(ms: number, run: (signal: unknown) => Promise<T>): Promise<T> {
  const controller = g.AbortController ? new g.AbortController() : null;
  const timer = g.setTimeout(() => controller?.abort(), ms);
  try {
    return await run(controller?.signal);
  } finally {
    g.clearTimeout(timer);
  }
}

interface AzureFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    type?: string;
    address?: {
      locality?: string;
      neighborhood?: string;
      postalCode?: string;
      formattedAddress?: string;
      adminDistricts?: { name?: string; shortName?: string }[];
      countryRegion?: { ISO?: string; name?: string };
    };
  };
}

/** A feature -> GeoPlace ("Sandton, Johannesburg, Gauteng"), or null if it lacks a usable point. */
export function azureFeatureToPlace(feature: AzureFeature): GeoPlace | null {
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const point = { lat: coords[1], lng: coords[0] };
  if (!isValidPoint(point)) return null;
  const a = feature.properties?.address ?? {};
  const region = a.adminDistricts?.[0]?.shortName ?? a.adminDistricts?.[0]?.name;
  const parts = [a.neighborhood, a.locality, region].filter((p): p is string => Boolean(p));
  const label = [...new Set(parts)].join(', ') || a.formattedAddress || (a.postalCode ? `${a.postalCode}` : '');
  if (!label) return null;
  return {
    label: feature.properties?.type === 'Postcode1' && a.postalCode && !label.includes(a.postalCode) ? `${a.postalCode}, ${label}` : label,
    point: roundPoint(point),
    postalCode: a.postalCode ?? null,
    countryCode: a.countryRegion?.ISO?.toUpperCase() ?? null,
  };
}

export class AzureMapsGeocodingProvider implements GeocodingProvider {
  readonly id = 'azure' as const;
  private readonly fetchImpl: GeoFetch;

  constructor(
    private readonly config: AzureMapsConfig,
    fetchImpl?: GeoFetch,
  ) {
    const f = fetchImpl ?? g.fetch?.bind(globalThis);
    if (!f) throw new GeocodingError('NOT_CONFIGURED', 'No fetch implementation available');
    this.fetchImpl = f;
  }

  async suggest(query: string, options: GeoQueryOptions = {}): Promise<GeoPlace[]> {
    return this.search(query, options.limit ?? GEO_SUGGEST_DEFAULT_LIMIT, options.countryCode ?? null);
  }

  async geocode(text: string, options: GeoQueryOptions = {}): Promise<GeoPlace | null> {
    const [best] = await this.search(text, 1, options.countryCode ?? null);
    return best ?? null;
  }

  private async search(text: string, top: number, countryCode: string | null): Promise<GeoPlace[]> {
    const params: Record<string, string> = {
      'api-version': AZURE_MAPS_DEFAULTS.apiVersion,
      query: text,
      top: String(Math.min(Math.max(top, 1), 20)),
      resultTypes: AZURE_MAPS_DEFAULTS.resultTypes,
    };
    if (countryCode) params.countryRegion = countryCode.toUpperCase();
    const body = await this.getJson(`${this.config.baseUrl ?? AZURE_MAPS_DEFAULTS.baseUrl}/geocode?${query(params)}`);
    const features = (body as { features?: AzureFeature[] } | null)?.features;
    if (!Array.isArray(features)) throw new GeocodingError('BAD_RESPONSE', 'Azure Maps returned no feature list');
    return features.map(azureFeatureToPlace).filter((p): p is GeoPlace => p !== null);
  }

  private async getJson(url: string): Promise<unknown> {
    try {
      return await withTimeout(this.config.timeoutMs ?? AZURE_MAPS_DEFAULTS.timeoutMs, async (signal) => {
        const res = await this.fetchImpl(url, { headers: { 'subscription-key': this.config.key, accept: 'application/json' }, signal });
        if (res.status === 429) throw new GeocodingError('RATE_LIMITED', 'Azure Maps rate limit reached');
        if (res.status === 401 || res.status === 403) throw new GeocodingError('NOT_CONFIGURED', `Azure Maps rejected the key (HTTP ${res.status})`);
        if (!res.ok) throw new GeocodingError('UNAVAILABLE', `Azure Maps returned HTTP ${res.status}`);
        return await res.json();
      });
    } catch (err) {
      if (err instanceof GeocodingError) throw err;
      throw new GeocodingError('UNAVAILABLE', `Azure Maps request failed: ${(err as Error).name}`);
    }
  }
}

/**
 * Raster map tiles for the web map, fetched server-side so the key never reaches a browser
 * (Azure Maps Render "Get Map Tile", api-version 2024-04-01, road style, 256 px).
 * TODO(geo): not yet run against a real account (see above).
 */
export async function fetchAzureMapTile(
  config: AzureMapsConfig,
  tile: { z: number; x: number; y: number },
  fetchImpl?: GeoFetch,
): Promise<{ contentType: string; body: Uint8Array }> {
  const f = fetchImpl ?? g.fetch?.bind(globalThis);
  if (!f) throw new GeocodingError('NOT_CONFIGURED', 'No fetch implementation available');
  const params = query({
    'api-version': '2024-04-01',
    tilesetId: 'microsoft.base.road',
    zoom: String(tile.z),
    x: String(tile.x),
    y: String(tile.y),
    tileSize: '256',
  });
  try {
    return await withTimeout(config.timeoutMs ?? AZURE_MAPS_DEFAULTS.timeoutMs, async (signal) => {
      const res = await f(`${config.baseUrl ?? AZURE_MAPS_DEFAULTS.baseUrl}/map/tile?${params}`, { headers: { 'subscription-key': config.key }, signal });
      if (!res.ok) throw new GeocodingError(res.status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE', `Azure Maps tile returned HTTP ${res.status}`);
      return { contentType: res.headers.get('content-type') ?? 'image/png', body: new Uint8Array(await res.arrayBuffer()) };
    });
  } catch (err) {
    if (err instanceof GeocodingError) throw err;
    throw new GeocodingError('UNAVAILABLE', `Azure Maps tile request failed: ${(err as Error).name}`);
  }
}

/** Valid slippy-map tile coordinates (zoom 0-19). */
export function isValidTile(tile: { z: number; x: number; y: number }): boolean {
  const { z, x, y } = tile;
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 19) return false;
  const n = 2 ** z;
  return x >= 0 && x < n && y >= 0 && y < n;
}
