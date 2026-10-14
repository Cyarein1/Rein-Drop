import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { GeoConfig as GeoConfigResponse, GeoPlace, GeoPoint } from '@rein-drop/contracts';
import { fetchAzureMapTile, GeocodingError, isValidTile, roundPoint, type GeocodingProvider } from '@rein-drop/geo';
import { AppException } from '../../common/errors/app.exception.js';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { LocaleService } from '../users/locale.service.js';
import { GEOCODER } from './geo.tokens.js';

/** Attribution the web map must show for its tiles. */
const ATTRIBUTION = {
  osm: '© OpenStreetMap contributors',
  // TODO(geo): confirm the exact Azure Maps attribution wording once the account exists.
  proxy: '© Microsoft, © TomTom',
} as const;

/**
 * Place suggestions, placing free text, and web map tiles (decision 0017). The provider is the
 * mock in development, Azure Maps once AZURE_MAPS_KEY is set, or absent (`none`: free-text
 * locations, as before). Provider failures never block saving a Hunt or an area: they only mean
 * "not placed" (distance unchecked).
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger('Geo');

  constructor(
    @Inject(GEOCODER) private readonly geocoder: GeocodingProvider | null,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly locales: LocaleService,
  ) {}

  clientConfig(): GeoConfigResponse {
    const provider = this.config.geo.provider;
    const tiles = provider === 'mock' ? 'osm' : provider === 'azure' ? 'proxy' : null;
    return { provider, suggestions: this.geocoder !== null, tiles, attribution: tiles ? ATTRIBUTION[tiles] : null };
  }

  /** Suggestions while typing. No provider = none (the field stays free text). */
  async suggest(query: string, limit: number, countryCode: string | null): Promise<GeoPlace[]> {
    if (!this.geocoder) return [];
    try {
      const places = await this.geocoder.suggest(query, { countryCode, limit });
      return places.map((p) => ({ ...p, label: p.label.slice(0, 100), point: roundPoint(p.point) }));
    } catch (err) {
      throw this.unavailable(err, 'suggest');
    }
  }

  /** Coordinates for free text, or null (no provider, not found, or the provider failed). */
  async place(text: string, countryCode: string | null): Promise<GeoPoint | null> {
    if (!this.geocoder) return null;
    try {
      const place = await this.geocoder.geocode(text, { countryCode });
      return place ? roundPoint(place.point) : null;
    } catch (err) {
      this.logger.warn(`Couldn't place a location (${err instanceof GeocodingError ? err.code : 'error'}) - saved without coordinates`);
      return null;
    }
  }

  /**
   * A Hunt location with coordinates: the given point (rounded), else the text placed in the user's
   * country, else none. Never fails - an unplaced location is still a valid location.
   */
  async withPoint<L extends { text: string; point: GeoPoint | null }>(location: L | null, userId: string): Promise<L | null> {
    if (!location) return null;
    if (location.point) return { ...location, point: roundPoint(location.point) };
    const locale = await this.locales.get(userId);
    return { ...location, point: await this.place(location.text, locale?.countryCode ?? null) };
  }

  /** One web map tile from Azure Maps (proxy mode only). */
  async tile(z: number, x: number, y: number): Promise<{ contentType: string; body: Uint8Array }> {
    if (!isValidTile({ z, x, y })) throw new AppException('NOT_FOUND', 'No such map tile', HttpStatus.NOT_FOUND);
    if (this.config.geo.provider !== 'azure' || !this.config.geo.azure) {
      throw new AppException('NOT_FOUND', 'Map tiles are served by the web map only with Azure Maps', HttpStatus.NOT_FOUND);
    }
    try {
      return await fetchAzureMapTile(this.config.geo.azure, { z, x, y });
    } catch (err) {
      throw this.unavailable(err, 'tile');
    }
  }

  private unavailable(err: unknown, what: string): AppException {
    const code = err instanceof GeocodingError ? err.code : 'error';
    this.logger.warn(`Geocoding ${what} failed (${code})`);
    return code === 'RATE_LIMITED'
      ? new AppException('RATE_LIMITED', 'Place search is busy - try again in a moment', HttpStatus.TOO_MANY_REQUESTS)
      : new AppException('SERVICE_UNAVAILABLE', "Place search isn't available right now - you can still type the place", HttpStatus.SERVICE_UNAVAILABLE);
  }
}
