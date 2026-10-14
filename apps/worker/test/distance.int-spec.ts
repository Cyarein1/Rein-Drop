/**
 * Distance checks (decision 0017) against a REAL PostgreSQL with the mock geocoder: a Facebook
 * Hunt around Cape Town (40 km) sees a Bellville listing (~19 km), a Durban listing (~1,270 km) and
 * one whose place can't be found. The source did NOT apply the radius (as with Apify), so the
 * worker checks distance itself through the place cache. Run with `pnpm --filter worker test:int`.
 */
import { randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { LOCAL_DATABASE_URL } from '@rein-drop/env';
import { MockGeocodingProvider, placeKey, type GeocodingProvider } from '@rein-drop/geo';
import { ListingPlaces } from '../src/pipeline/listing-places.js';
import { MatchStage } from '../src/pipeline/match-stage.js';

const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
const TAG = `int-dist-${randomUUID().slice(0, 8)}`;

describe('distance checks (integration, real database, mock geocoder)', () => {
  let prisma: PrismaClient;
  let userId: string;
  let huntId: string;
  let runId: string;
  let facebookId: string;
  const listingIds: string[] = [];
  const places = ['Bellville', 'Durban', `Nowhere ${TAG}`];

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL);
    facebookId = (await prisma.marketplace.findUniqueOrThrow({ where: { key: 'facebook' } })).id;
    const user = await prisma.user.create({ data: { email: `${TAG}@reindrop.test`, authProvider: 'dev', authSubject: TAG, countryCode: 'ZA' } });
    userId = user.id;
    const hunt = await prisma.hunt.create({
      data: {
        userId,
        name: 'iPhone 13',
        query: 'iPhone 13',
        status: 'LIVE',
        locationText: 'Cape Town',
        radiusKm: 40,
        locationLat: -33.925,
        locationLng: 18.424,
        marketplaces: { create: [{ marketplaceId: facebookId }] },
      },
    });
    huntId = hunt.id;
    const run = await prisma.searchRun.create({
      data: { jobId: `${TAG}-job`, marketplaceId: facebookId, provider: 'dev', groupKey: TAG, criteria: {}, huntIds: [huntId] },
    });
    runId = run.id;
    for (const [i, place] of places.entries()) {
      const listing = await prisma.listing.create({
        data: { marketplaceId: facebookId, externalId: `${TAG}-${i}`, url: `https://example.test/${TAG}/${i}`, title: `Apple iPhone 13 128GB (${i})`, locationText: place, status: 'ACTIVE' },
      });
      listingIds.push(listing.id);
      await prisma.rawListing.create({
        data: { marketplaceId: facebookId, provider: 'dev', searchRunId: runId, externalId: `${TAG}-${i}`, payload: {}, status: 'NORMALIZED', listingId: listing.id },
      });
    }
  });

  afterAll(async () => {
    await prisma.huntMatch.deleteMany({ where: { huntId } });
    await prisma.rawListing.deleteMany({ where: { searchRunId: runId } });
    await prisma.searchRun.deleteMany({ where: { id: runId } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.geoPlaceCache.deleteMany({ where: { key: { in: places.map((p) => placeKey(p, 'ZA')) } } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('keeps listings inside the radius, rejects the far one, never rejects an unplaced one; places are cached', async () => {
    let lookups = 0;
    const mock = new MockGeocodingProvider();
    const counting: GeocodingProvider = { id: 'mock', suggest: (q, o) => mock.suggest(q, o), geocode: (t, o) => (lookups++, mock.geocode(t, o)) };
    const stage = new MatchStage(prisma, () => new Date(), new ListingPlaces(prisma, counting));

    const first = await stage.run({ runId, huntIds: [huntId], marketplace: 'facebook', locationEnforcedBySource: false });
    expect(first.summary).toMatchObject({ matchedCount: 2, rejectedCount: 1, rejectionSummary: { geography: 1 } });

    const matches = await prisma.huntMatch.findMany({ where: { huntId }, include: { listing: { select: { locationText: true } } } });
    const geo = Object.fromEntries(
      matches.map((m) => [m.listing.locationText, (m.reasons as { check: string; code: string; detail: string }[]).find((r) => r.check === 'geography')]),
    );
    expect(geo.Bellville).toMatchObject({ code: 'within_radius', detail: 'About 19 km from Cape Town (within 40 km)' });
    expect(geo[`Nowhere ${TAG}`]).toMatchObject({ code: 'listing_not_placed' });
    expect(matches.find((m) => m.listing.locationText === 'Durban')).toBeUndefined(); // rejected: never stored as a match
    expect(lookups).toBe(3);

    // Every place (found or not) is cached: a second run asks the geocoder nothing.
    const cache = await prisma.geoPlaceCache.findMany({ where: { key: { in: places.map((p) => placeKey(p, 'ZA')) } } });
    expect(cache).toHaveLength(3);
    expect(cache.find((c) => c.key === placeKey(`Nowhere ${TAG}`, 'ZA'))).toMatchObject({ lat: null, lng: null, provider: 'mock' });
    await stage.run({ runId, huntIds: [huntId], marketplace: 'facebook', locationEnforcedBySource: false });
    expect(lookups).toBe(3);
  });

  it('without a geocoder (production `none`), distance stays unchecked and nothing is rejected for it', async () => {
    await prisma.huntMatch.deleteMany({ where: { huntId } });
    const stage = new MatchStage(prisma, () => new Date(), new ListingPlaces(prisma, null));
    const result = await stage.run({ runId, huntIds: [huntId], marketplace: 'facebook', locationEnforcedBySource: false });
    expect(result.summary).toMatchObject({ matchedCount: 3, rejectedCount: 0 });
  });
});
