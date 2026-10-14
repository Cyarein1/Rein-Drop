import { placeKey } from '../distance.js';
import { GEO_SUGGEST_DEFAULT_LIMIT, type GeocodingProvider, type GeoPlace, type GeoQueryOptions } from '../provider.js';
import { MOCK_PLACES, type MockPlace } from './places.js';

const norm = (text: string) => placeKey(text).slice(1);

const toPlace = (p: MockPlace): GeoPlace => ({
  label: `${p.name}, ${p.parent}`,
  point: { lat: p.lat, lng: p.lng },
  postalCode: p.postalCode,
  countryCode: p.countryCode,
});

/** How well a place fits typed text (higher is better, 0 = no match). */
function score(place: MockPlace, typed: string, rest: string): number {
  const names = [place.name, ...place.aliases].map(norm);
  let best = 0;
  for (const name of names) {
    if (name === typed) best = Math.max(best, 100);
    else if (name.startsWith(typed)) best = Math.max(best, 80);
    else if (name.split(' ').some((word) => word.startsWith(typed))) best = Math.max(best, 60);
  }
  if (place.postalCode && norm(place.postalCode).startsWith(typed)) best = Math.max(best, 50);
  // "Sandton, Jo" - the part after the comma must fit the parent / region.
  if (best > 0 && rest && !norm(`${place.parent} ${place.countryCode}`).includes(rest)) return 0;
  return best;
}

/**
 * Deterministic development geocoder over a built-in list of real places (mock/places.ts).
 * Same inputs, same answers - no network, no key. Prefers the user's country.
 */
export class MockGeocodingProvider implements GeocodingProvider {
  readonly id = 'mock' as const;

  async suggest(query: string, options: GeoQueryOptions = {}): Promise<GeoPlace[]> {
    const [first = '', ...others] = query.split(',');
    const typed = norm(first);
    const rest = norm(others.join(' '));
    if (!typed) return [];
    const country = options.countryCode?.toUpperCase() ?? null;
    return MOCK_PLACES.map((place, index) => ({ place, index, s: score(place, typed, rest) }))
      .filter((m) => m.s > 0)
      .sort((a, b) => (b.s + (b.place.countryCode === country ? 30 : 0)) - (a.s + (a.place.countryCode === country ? 30 : 0)) || a.index - b.index)
      .slice(0, options.limit ?? GEO_SUGGEST_DEFAULT_LIMIT)
      .map((m) => toPlace(m.place));
  }

  /**
   * Best place for free text ("Cape Town, WC", "Austin, Texas"): the part before the first comma
   * must be a whole name / alias / postal code (never a prefix of one). The rest only breaks ties -
   * marketplaces abbreviate regions ("WC", "TX") in ways the built-in list doesn't spell out.
   */
  async geocode(text: string, options: GeoQueryOptions = {}): Promise<GeoPlace | null> {
    const [first = '', ...others] = text.split(',');
    const typed = norm(first);
    if (!typed) return null;
    const rest = norm(others.join(' '));
    const country = options.countryCode?.toUpperCase() ?? null;
    const exact = MOCK_PLACES.filter((p) => [p.name, ...p.aliases, p.postalCode ?? ''].map(norm).includes(typed));
    const rank = (p: MockPlace) =>
      (rest && norm(`${p.parent} ${p.countryCode}`).includes(rest) ? 2 : 0) + (p.countryCode === country ? 1 : 0);
    const best = [...exact].sort((a, b) => rank(b) - rank(a))[0];
    return best ? toPlace(best) : null;
  }
}
