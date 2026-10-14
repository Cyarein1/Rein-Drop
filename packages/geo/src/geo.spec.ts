import { describe, expect, it } from 'vitest';
import {
  AzureMapsGeocodingProvider,
  azureFeatureToPlace,
  createGeocodingProvider,
  distanceKm,
  fetchAzureMapTile,
  GeocodingError,
  isValidTile,
  MOCK_PLACES,
  MockGeocodingProvider,
  placeKey,
  resolveGeoConfig,
  roundPoint,
  type GeoFetch,
} from './index.js';

describe('distance', () => {
  it('matches known straight-line distances', () => {
    const jhb = { lat: -26.2041, lng: 28.0473 };
    const pta = { lat: -25.7479, lng: 28.2293 };
    const cpt = { lat: -33.9249, lng: 18.4241 };
    expect(distanceKm(jhb, pta)).toBeGreaterThan(50);
    expect(distanceKm(jhb, pta)).toBeLessThan(58);
    expect(distanceKm(jhb, cpt)).toBeGreaterThan(1250);
    expect(distanceKm(jhb, cpt)).toBeLessThan(1280);
    expect(distanceKm(jhb, jhb)).toBe(0);
  });

  it('rounds kept coordinates to ~110 m (an area, not a doorstep)', () => {
    expect(roundPoint({ lat: -26.107612, lng: 28.056749 })).toEqual({ lat: -26.108, lng: 28.057 });
  });

  it('normalizes place text for the cache', () => {
    expect(placeKey('  Cape  Town, WC ', 'za')).toBe('ZA|cape town wc');
    expect(placeKey('Gqéberha')).toBe('|gqeberha');
  });
});

describe('MockGeocodingProvider', () => {
  const mock = new MockGeocodingProvider();

  it('every built-in place has valid coordinates and a country', () => {
    for (const p of MOCK_PLACES) {
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(p.lng)).toBeLessThanOrEqual(180);
      expect(p.countryCode).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('suggests while typing, preferring the user country', async () => {
    const sa = await mock.suggest('san', { countryCode: 'ZA' });
    expect(sa[0]?.label).toBe('Sandton, Johannesburg, Gauteng');
    const us = await mock.suggest('san', { countryCode: 'US' });
    expect(us.map((p) => p.label)).toEqual(expect.arrayContaining(['San Diego, CA', 'San Francisco, CA']));
    expect(us[0]?.countryCode).toBe('US');
  });

  it('matches aliases, words inside names, postal codes, and filters by the part after the comma', async () => {
    expect((await mock.suggest('port eliz'))[0]?.label).toBe('Gqeberha, Eastern Cape');
    expect((await mock.suggest('town', { countryCode: 'ZA' }))[0]?.label).toBe('Cape Town, Western Cape');
    expect((await mock.suggest('2196'))[0]?.postalCode).toBe('2196');
    expect((await mock.suggest('london, eng')).map((p) => p.label)).toEqual(['London, England']);
  });

  it('respects the limit and returns nothing for unknown text', async () => {
    expect(await mock.suggest('b', { limit: 2 })).toHaveLength(2);
    expect(await mock.suggest('zzzz')).toEqual([]);
  });

  it('geocodes only confident (whole-name) matches', async () => {
    expect((await mock.geocode('Cape Town, WC'))?.point).toEqual({ lat: -33.9249, lng: 18.4241 });
    expect((await mock.geocode('Nelspruit'))?.label).toBe('Mbombela, Mpumalanga');
    expect(await mock.geocode('Cap')).toBeNull();
    expect(await mock.geocode('Somewhere unknown')).toBeNull();
  });
});

const response = (status: number, body: unknown, contentType = 'application/json') => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  headers: { get: (name: string) => (name === 'content-type' ? contentType : null) },
});

const SANDTON_FEATURE = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [28.056749, -26.107612] },
  properties: {
    type: 'Neighborhood',
    address: {
      neighborhood: 'Sandton',
      locality: 'Johannesburg',
      adminDistricts: [{ name: 'Gauteng', shortName: 'GP' }],
      postalCode: '2196',
      countryRegion: { ISO: 'ZA', name: 'South Africa' },
      formattedAddress: 'Sandton, Johannesburg, Gauteng, 2196, South Africa',
    },
  },
};

describe('AzureMapsGeocodingProvider (fake HTTP - TODO(geo): live check needs the owner key)', () => {
  it('maps features to rounded places and sends key, country and area-only result types', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetch: GeoFetch = async (url, init) => {
      calls.push({ url, headers: init.headers });
      return response(200, { type: 'FeatureCollection', features: [SANDTON_FEATURE, { geometry: {} }] });
    };
    const azure = new AzureMapsGeocodingProvider({ key: 'test-key' }, fetch);
    const places = await azure.suggest('sandton', { countryCode: 'za', limit: 3 });
    expect(places).toEqual([{ label: 'Sandton, Johannesburg, GP', point: { lat: -26.108, lng: 28.057 }, postalCode: '2196', countryCode: 'ZA' }]);
    expect(calls[0]!.url).toContain('/geocode?api-version=2025-01-01&query=sandton&top=3&resultTypes=Neighborhood%2CPopulatedPlace%2CPostcode1&countryRegion=ZA');
    expect(calls[0]!.headers['subscription-key']).toBe('test-key');
  });

  it('turns HTTP failures into typed errors without leaking the key', async () => {
    for (const [status, code] of [[401, 'NOT_CONFIGURED'], [429, 'RATE_LIMITED'], [500, 'UNAVAILABLE']] as const) {
      const azure = new AzureMapsGeocodingProvider({ key: 'secret-key' }, async () => response(status, {}));
      const err = await azure.geocode('x').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(GeocodingError);
      expect((err as GeocodingError).code).toBe(code);
      expect((err as Error).message).not.toContain('secret-key');
    }
    const bad = new AzureMapsGeocodingProvider({ key: 'k' }, async () => response(200, { nope: true }));
    expect(((await bad.suggest('x').catch((e: unknown) => e)) as GeocodingError).code).toBe('BAD_RESPONSE');
  });

  it('labels postal-code results with the code', () => {
    const place = azureFeatureToPlace({
      geometry: { coordinates: [18.4241, -33.9249] },
      properties: { type: 'Postcode1', address: { postalCode: '8001', locality: 'Cape Town', countryRegion: { ISO: 'ZA' } } },
    });
    expect(place?.label).toBe('8001, Cape Town');
  });

  it('fetches map tiles server-side and validates tile coordinates', async () => {
    let url = '';
    const tile = await fetchAzureMapTile({ key: 'k' }, { z: 3, x: 4, y: 2 }, async (u) => {
      url = u;
      return response(200, null, 'image/png');
    });
    expect(url).toContain('/map/tile?api-version=2024-04-01&tilesetId=microsoft.base.road&zoom=3&x=4&y=2&tileSize=256');
    expect(tile.contentType).toBe('image/png');
    expect(tile.body).toEqual(new Uint8Array([1, 2, 3]));
    expect(isValidTile({ z: 3, x: 7, y: 0 })).toBe(true);
    expect(isValidTile({ z: 3, x: 8, y: 0 })).toBe(false);
    expect(isValidTile({ z: 20, x: 0, y: 0 })).toBe(false);
  });
});

describe('config', () => {
  it('development defaults to the mock; production to none (free text) and refuses the mock', () => {
    expect(resolveGeoConfig({}, 'development').geo.provider).toBe('mock');
    expect(resolveGeoConfig({}, 'production').geo.provider).toBe('none');
    expect(resolveGeoConfig({ GEOCODING_PROVIDER: 'mock' }, 'production').problems[0]).toMatch(/development-only/);
  });

  it('azure needs a key; the problem message never includes one', () => {
    expect(resolveGeoConfig({ GEOCODING_PROVIDER: 'azure' }, 'production').problems).toEqual(['AZURE_MAPS_KEY: required when GEOCODING_PROVIDER=azure']);
    const ok = resolveGeoConfig({ GEOCODING_PROVIDER: 'azure', AZURE_MAPS_KEY: 'k' }, 'production');
    expect(ok.problems).toEqual([]);
    expect(createGeocodingProvider(ok.geo, async () => response(200, { features: [] }))?.id).toBe('azure');
    expect(createGeocodingProvider(resolveGeoConfig({}, 'production').geo)).toBeNull();
  });
});
