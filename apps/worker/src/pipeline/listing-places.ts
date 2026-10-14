import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@rein-drop/db';
import { placeKey, roundPoint, type GeocodingProvider } from '@rein-drop/geo';
import type { MatchPoint } from '@rein-drop/matching';
import type { Clock } from '../queue/job-queue.js';

/** A place that couldn't be found is asked again after this long (the provider may learn it). */
export const PLACE_MISS_RETRY_MS = 30 * 24 * 60 * 60_000;
/** New lookups per search run at most (cost ceiling); the rest are placed on later runs. */
export const PLACE_LOOKUPS_PER_RUN = 25;

/**
 * Listing place text ("Cape Town, WC") -> coordinates for the distance check (decision 0017).
 * Every distinct place is looked up once and cached in GeoPlaceCache (misses too), so the
 * geocoder is called per place, never per listing or per check. Without a geocoder (`none`)
 * nothing is placed and distance stays "not checked", exactly as before.
 */
export class ListingPlaces {
  private readonly logger = new Logger('ListingPlaces');

  constructor(
    private readonly prisma: PrismaClient,
    private readonly geocoder: GeocodingProvider | null,
    private readonly clock: Clock = () => new Date(),
  ) {}

  /** Coordinates for each text in `texts`, biased to `countryCode`. Keys are the input texts. */
  async resolve(texts: readonly string[], countryCode: string | null): Promise<Map<string, MatchPoint | null>> {
    const result = new Map<string, MatchPoint | null>();
    if (!this.geocoder) return result;
    const byKey = new Map<string, string>();
    for (const text of new Set(texts.map((t) => t.trim()).filter(Boolean))) byKey.set(placeKey(text, countryCode), text);
    if (byKey.size === 0) return result;

    const cached = await this.prisma.geoPlaceCache.findMany({ where: { key: { in: [...byKey.keys()] }, provider: this.geocoder.id } });
    const now = this.clock().getTime();
    const toLookUp: string[] = [];
    const cachedKeys = new Set<string>();
    for (const row of cached) {
      const text = byKey.get(row.key)!;
      if (row.lat !== null && row.lng !== null) {
        result.set(text, { lat: row.lat, lng: row.lng });
        cachedKeys.add(row.key);
      } else if (now - row.resolvedAt.getTime() < PLACE_MISS_RETRY_MS) {
        result.set(text, null);
        cachedKeys.add(row.key);
      }
    }
    for (const key of byKey.keys()) if (!cachedKeys.has(key)) toLookUp.push(key);

    for (const key of toLookUp.slice(0, PLACE_LOOKUPS_PER_RUN)) {
      const text = byKey.get(key)!;
      let place: Awaited<ReturnType<GeocodingProvider['geocode']>>;
      try {
        place = await this.geocoder.geocode(text, { countryCode });
      } catch (err) {
        // A failing geocoder leaves the place unplaced for now (unverified), never fails the run.
        this.logger.warn(`Place lookup failed (${(err as { code?: string }).code ?? 'error'}); distance unchecked for now`);
        result.set(text, null);
        continue;
      }
      const point = place ? roundPoint(place.point) : null;
      const data = { provider: this.geocoder.id, label: place?.label ?? null, lat: point?.lat ?? null, lng: point?.lng ?? null, countryCode: place?.countryCode ?? null, resolvedAt: this.clock() };
      await this.prisma.geoPlaceCache.upsert({ where: { key }, create: { key, ...data }, update: data });
      result.set(text, point);
    }
    return result;
  }
}
