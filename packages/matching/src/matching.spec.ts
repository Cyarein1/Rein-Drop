import { describe, expect, it } from 'vitest';
import { classifyCondition } from './condition.js';
import { canonicalOf, dedupeKeyFor } from './dedupe.js';
import { evaluateMatch, type MatchContext, type MatchHunt, type MatchListing } from './match.js';
import { containsPhrase, significantTokens } from './text.js';

const ZAR = (amountMinor: number) => ({ amountMinor, currency: 'ZAR' });

const hunt: MatchHunt = {
  query: 'iPhone 13',
  marketplaces: ['ebay', 'facebook'],
  conditions: [],
  location: { text: 'Cape Town', radiusKm: 40, point: { lat: -33.9249, lng: 18.4241 } },
  maxPrice: ZAR(450_000),
  exclusions: [],
  target: null,
};
const listing: MatchListing = {
  marketplace: 'facebook',
  title: 'Apple iPhone 13 128GB',
  description: 'Works perfectly, minor scuffs. Box and cable included.',
  price: ZAR(400_000),
  conditionText: 'Used - good',
  status: 'ACTIVE',
};
const ctx: MatchContext = { locationEnforcedBySource: true };
const check = (h: Partial<MatchHunt>, l: Partial<MatchListing> = {}, c: MatchContext = ctx) => evaluateMatch({ ...hunt, ...h }, { ...listing, ...l }, c);
const outcome = (e: ReturnType<typeof evaluateMatch>, name: string) => e.checks.find((c) => c.check === name)!;

describe('text helpers', () => {
  it('drops filler and condition words from queries, keeps model numbers', () => {
    expect(significantTokens('Looking for a cheap USED iPhone 13 in good condition')).toEqual(['iphone', '13']);
  });

  it('finds whole phrases regardless of case, accents and punctuation', () => {
    expect(containsPhrase('Sold FOR PARTS or repair', 'for parts')).toBe(true);
    expect(containsPhrase('forparts', 'for parts')).toBe(false);
    expect(containsPhrase('Écran cassé', 'ecran casse')).toBe(true);
  });
});

describe('classifyCondition', () => {
  it.each([
    ['New', 'new'],
    ['Brand new, sealed', 'new'],
    ['Used - like new', 'used'],
    ['Pre-owned', 'used'],
    ['Seller refurbished', 'refurbished'],
    ['Refurbished', 'refurbished'],
    ['For parts or not working', 'for_parts'],
    ['For parts', 'for_parts'],
    ['Mint', null],
    [null, null],
  ] as const)('%s -> %s', (text, expected) => {
    expect(classifyCondition(text)).toBe(expected);
  });
});

describe('evaluateMatch', () => {
  it('matches a relevant, available, affordable listing and explains every check', () => {
    const result = check({});
    expect(result.matched).toBe(true);
    expect(result.relevanceScore).toBe(100);
    expect(result.checks.map((c) => [c.check, c.outcome])).toEqual([
      ['availability', 'pass'],
      ['marketplace', 'pass'],
      ['relevance', 'pass'],
      ['accessory', 'pass'],
      ['condition', 'not_applicable'],
      ['geography', 'pass'],
      ['price', 'pass'],
      ['exclusions', 'not_applicable'],
      ['economics', 'not_applicable'],
    ]);
  });

  it('requires model numbers exactly, in the title', () => {
    const wrongModel = check({}, { title: 'Apple iPhone 12 64GB' });
    expect(wrongModel.matched).toBe(false);
    expect(outcome(wrongModel, 'relevance')).toMatchObject({ outcome: 'fail', code: 'missing_model_number' });
    expect(check({}, { title: 'iPhone 130 clone' }).matched).toBe(false);
    expect(check({}, { title: 'Apple iPhone', description: 'It is a 13' }).matched).toBe(false);
  });

  it('tolerates prefixes / plurals, and uses the description at half weight for longer queries', () => {
    expect(check({ query: 'galax s23' }, { title: 'Samsung Galaxy S23' }).matched).toBe(true);
    expect(check({ query: 'Sony headphones XM4' }, { title: 'Sony WH-1000XM4 headphones' }).matched).toBe(true);
    expect(outcome(check({ query: 'Sony headphones XM4' }, { title: 'Sony WH-1000XM3 headphones' }), 'relevance').code).toBe('missing_model_number');
    expect(check({ query: 'Galaxy S23' }, { title: 'Samsung Galaxy S23 Ultra' }).matched).toBe(true);
    expect(check({ query: 'Galaxy S23' }, { title: 'Samsung Galaxy S22' }).matched).toBe(false);
    const ok = check({ query: 'sony wireless noise cancelling headphones' }, { title: 'Sony WH-1000XM4 Wireless Headphones', description: 'Noise cancelling works' });
    expect(ok.matched).toBe(true);
    expect(ok.relevanceScore).toBe(80);
  });

  it('rejects accessories unless the hunt is for one', () => {
    expect(outcome(check({}, { title: 'Silicone case for iPhone 13' }), 'accessory')).toMatchObject({ outcome: 'fail', code: 'looks_like_accessory' });
    expect(check({}, { title: 'iPhone 13 with case' }).matched).toBe(true);
    expect(check({ query: 'iPhone 13 case' }, { title: 'Silicone case for iPhone 13' }).matched).toBe(true);
    expect(check({}, { title: 'iPhone 13 box only' }).matched).toBe(false);
  });

  it('applies conditions, keeping for-parts listings out of hunts that chose conditions', () => {
    expect(check({ conditions: ['used'] }).matched).toBe(true);
    expect(outcome(check({ conditions: ['new'] }), 'condition')).toMatchObject({ outcome: 'fail', code: 'condition_not_wanted' });
    expect(outcome(check({ conditions: ['used'] }, { conditionText: 'For parts' }), 'condition').code).toBe('for_parts');
    expect(outcome(check({}, { conditionText: 'For parts' }), 'condition')).toMatchObject({ outcome: 'pass', code: 'for_parts_any_condition' });
    expect(outcome(check({ conditions: ['used'] }, { conditionText: 'Mint' }), 'condition').outcome).toBe('unverified');
  });

  it('applies the max price, but never rejects what it cannot compare', () => {
    expect(outcome(check({}, { price: ZAR(450_001) }), 'price')).toMatchObject({ outcome: 'fail', code: 'above_max_price' });
    expect(check({}, { price: ZAR(450_000) }).matched).toBe(true);
    expect(outcome(check({}, { price: null }), 'price')).toMatchObject({ outcome: 'unverified', code: 'no_price' });
    expect(outcome(check({}, { price: { amountMinor: 1, currency: 'USD' } }), 'price')).toMatchObject({ outcome: 'unverified', code: 'other_currency' });
    expect(check({}, { price: null }).matched).toBe(true);
  });

  it('applies exclusions to title and description', () => {
    const excluded = check({ exclusions: ['for parts', 'cracked'] }, { description: 'Cracked screen, sold as is' });
    expect(outcome(excluded, 'exclusions')).toMatchObject({ outcome: 'fail', detail: 'Mentions "cracked"' });
    expect(check({ exclusions: ['broken'] }).matched).toBe(true);
  });

  it('only rejects unavailable listings and other marketplaces', () => {
    expect(check({}, { status: 'SOLD' }).failed).toEqual(['availability']);
    expect(outcome(check({}, { status: 'UNKNOWN' }), 'availability').outcome).toBe('unverified');
    expect(check({ marketplaces: ['ebay'] }).failed).toEqual(['marketplace']);
  });

  describe('geography (distance checks, decision 0017)', () => {
    const local = { locationEnforcedBySource: false, localPickup: true };
    const BELLVILLE = { lat: -33.8995, lng: 18.6292 }; // ~19 km from Cape Town centre
    const STELLENBOSCH = { lat: -33.9321, lng: 18.8602 }; // ~40 km
    const DURBAN = { lat: -29.8587, lng: 31.0218 }; // ~1,270 km

    it('passes a listing inside the radius, with its distance', () => {
      const result = check({}, { point: BELLVILLE }, local);
      expect(result.matched).toBe(true);
      expect(outcome(result, 'geography')).toMatchObject({ outcome: 'pass', code: 'within_radius', detail: 'About 19 km from Cape Town (within 40 km)' });
    });

    it('rejects a listing outside the radius', () => {
      const result = check({}, { point: DURBAN }, local);
      expect(result.failed).toEqual(['geography']);
      expect(outcome(result, 'geography')).toMatchObject({ outcome: 'fail', code: 'outside_radius' });
      expect(outcome(result, 'geography').detail).toMatch(/^About 1\d{3} km from Cape Town - outside your 40 km$/);
      expect(check({ location: { ...hunt.location!, radiusKm: 35 } }, { point: STELLENBOSCH }, local).matched).toBe(false);
    });

    it('without a radius: passes and reports the distance', () => {
      expect(outcome(check({ location: { ...hunt.location!, radiusKm: null } }, { point: DURBAN }, local), 'geography')).toMatchObject({ outcome: 'pass', code: 'distance_known' });
    });

    it('never rejects on missing coordinates (unverified, with the reason)', () => {
      expect(outcome(check({}, { point: null }, local), 'geography')).toMatchObject({ outcome: 'unverified', code: 'listing_not_placed' });
      expect(outcome(check({ location: { ...hunt.location!, point: null } }, { point: BELLVILLE }, local), 'geography')).toMatchObject({ outcome: 'unverified', code: 'hunt_not_placed' });
      expect(check({}, { point: null }, local).matched).toBe(true);
    });

    it('shipped marketplaces are not distance-checked; a source-enforced search passes', () => {
      expect(outcome(check({}, { marketplace: 'ebay', point: DURBAN }, { locationEnforcedBySource: false, localPickup: false }), 'geography')).toMatchObject({ outcome: 'not_applicable', code: 'ships' });
      expect(outcome(check({}, { point: DURBAN }), 'geography')).toMatchObject({ outcome: 'pass', code: 'enforced_by_source' });
      expect(outcome(check({ location: null }), 'geography').outcome).toBe('not_applicable');
    });
  });

  it('records target economics inputs for the valuation stage without judging them', () => {
    const result = check({ target: { kind: 'profit', amount: ZAR(50_000) } });
    expect(result.matched).toBe(true);
    expect(outcome(result, 'economics')).toMatchObject({ outcome: 'unverified', code: 'awaiting_valuation' });
    expect(result.economics).toEqual({
      acquisition: ZAR(400_000),
      target: { kind: 'profit', amount: ZAR(50_000) },
      resaleEstimate: null,
      estimatedProfit: null,
      status: 'awaiting_valuation',
    });
  });

  it('collects every failure, not just the first', () => {
    expect(check({ conditions: ['new'], exclusions: ['scuffs'] }, { price: ZAR(999_999) }).failed).toEqual(['condition', 'price', 'exclusions']);
  });
});

describe('dedupeKeyFor', () => {
  const base = { marketplace: 'facebook' as const, title: 'Apple iPhone 13 128GB', price: ZAR(400_000), locationText: 'Cape Town' };

  it('is the same for the same item regardless of word order, case or marketplace when located', () => {
    expect(dedupeKeyFor(base)).toBe(dedupeKeyFor({ ...base, title: 'iphone 13 128gb APPLE' }));
    expect(dedupeKeyFor(base)).toBe(dedupeKeyFor({ ...base, marketplace: 'ebay', locationText: ' cape  town ' }));
  });

  it('differs on any price or location difference', () => {
    expect(dedupeKeyFor(base)).not.toBe(dedupeKeyFor({ ...base, price: ZAR(400_100) }));
    expect(dedupeKeyFor(base)).not.toBe(dedupeKeyFor({ ...base, price: { amountMinor: 400_000, currency: 'USD' } }));
    expect(dedupeKeyFor(base)).not.toBe(dedupeKeyFor({ ...base, locationText: 'Durban' }));
  });

  it('never merges across marketplaces without a location', () => {
    expect(dedupeKeyFor({ ...base, locationText: null })).not.toBe(dedupeKeyFor({ ...base, marketplace: 'ebay', locationText: null }));
  });

  it('refuses to fingerprint unpriced or generic listings', () => {
    expect(dedupeKeyFor({ ...base, price: null })).toBeNull();
    expect(dedupeKeyFor({ ...base, title: 'iPhone for sale' })).toBeNull();
  });

  it('picks the first-seen listing as canonical (stable on ties)', () => {
    const t = new Date('2026-10-07T00:00:00Z');
    expect(
      canonicalOf([
        { id: 'b', firstSeenAt: t },
        { id: 'c', firstSeenAt: new Date(t.getTime() - 1) },
        { id: 'a', firstSeenAt: new Date(t.getTime() - 1) },
      ])?.id,
    ).toBe('a');
    expect(canonicalOf([])).toBeNull();
  });
});
