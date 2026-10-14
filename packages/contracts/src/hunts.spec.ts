import { describe, expect, it } from 'vitest';
import {
  createHuntRequestSchema,
  HUNT_TRANSITIONS,
  huntLiveReadinessProblems,
  restoredStatus,
  updateHuntRequestSchema,
} from './index.js';

const paths = (result: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((i) => i.path.map(String).join('.')) ?? [];

describe('createHuntRequestSchema', () => {
  it('accepts the minimum (query + marketplace) and fills defaults', () => {
    expect(createHuntRequestSchema.parse({ query: '  iPhone 13 Pro 256GB ', marketplaces: ['ebay'] })).toEqual({
      query: 'iPhone 13 Pro 256GB',
      marketplaces: ['ebay'],
      location: null,
      conditions: [],
      maxPrice: null,
      target: null,
      exclusions: [],
      priority: 'NORMAL',
    });
  });

  it('accepts a full natural-language hunt', () => {
    const result = createHuntRequestSchema.safeParse({
      name: 'Cheap Switch',
      query: 'Nintendo Switch OLED, boxed if possible',
      marketplaces: ['facebook', 'ebay'],
      location: { text: 'Cape Town', radiusKm: 50 },
      conditions: ['used', 'refurbished'],
      maxPrice: { amountMinor: 200_00, currency: 'USD' },
      target: { kind: 'profit', amount: { amountMinor: 60_00, currency: 'USD' } },
      exclusions: ['broken', 'for parts'],
    });
    expect(result.success).toBe(true);
  });

  it('requires meaningful search terms and at least one marketplace', () => {
    expect(paths(createHuntRequestSchema.safeParse({ query: 'x', marketplaces: [] }))).toEqual([
      'query',
      'marketplaces',
    ]);
    expect(paths(createHuntRequestSchema.safeParse({ query: '!!! ???', marketplaces: ['ebay'] }))).toEqual(['query']);
    expect(paths(createHuntRequestSchema.safeParse({ query: 'switch', marketplaces: ['ebay', 'ebay'] }))).toEqual([
      'marketplaces',
    ]);
  });

  it('rejects exclusions that would hide every result', () => {
    const result = createHuntRequestSchema.safeParse({
      query: 'iphone 13',
      marketplaces: ['ebay'],
      exclusions: ['cracked', 'iPhone'],
    });
    expect(paths(result)).toEqual(['exclusions.1']);
  });

  it('validates prices, targets and radius', () => {
    const base = { query: 'switch oled', marketplaces: ['ebay'] };
    expect(paths(createHuntRequestSchema.safeParse({ ...base, maxPrice: { amountMinor: 0, currency: 'USD' } }))).toEqual([
      'maxPrice',
    ]);
    expect(paths(createHuntRequestSchema.safeParse({ ...base, target: { kind: 'margin', percent: 0 } }))).toEqual([
      'target.percent',
    ]);
    expect(
      paths(
        createHuntRequestSchema.safeParse({
          ...base,
          maxPrice: { amountMinor: 100_00, currency: 'USD' },
          target: { kind: 'profit', amount: { amountMinor: 20_00, currency: 'EUR' } },
        }),
      ),
    ).toEqual(['target.amount.currency']);
    expect(
      paths(createHuntRequestSchema.safeParse({ ...base, location: { text: 'Durban', radiusKm: 9999 } })),
    ).toEqual(['location.radiusKm']);
  });
});

describe('updateHuntRequestSchema', () => {
  it('needs at least one field and cannot change status directly', () => {
    expect(updateHuntRequestSchema.safeParse({}).success).toBe(false);
    expect(updateHuntRequestSchema.parse({ maxPrice: null })).toEqual({ maxPrice: null });
    // Unknown keys (like status) are stripped - lifecycle changes use the action endpoints.
    expect(updateHuntRequestSchema.safeParse({ status: 'LIVE' }).success).toBe(false);
  });
});

describe('lifecycle', () => {
  it('defines the allowed moves', () => {
    expect(HUNT_TRANSITIONS.activate).toEqual({ from: ['DRAFT'], to: 'LIVE' });
    expect(HUNT_TRANSITIONS.resume).toEqual({ from: ['PAUSED'], to: 'LIVE' });
    expect(HUNT_TRANSITIONS.archive.from).not.toContain('ARCHIVED');
    expect(HUNT_TRANSITIONS.restore.from).toEqual(['ARCHIVED']);
  });

  it('restores to DRAFT or PAUSED, never straight to LIVE', () => {
    expect(restoredStatus('DRAFT')).toBe('DRAFT');
    expect(restoredStatus('LIVE')).toBe('PAUSED');
    expect(restoredStatus('PAUSED')).toBe('PAUSED');
    expect(restoredStatus(null)).toBe('PAUSED');
  });

  it('requires a location to go live on local marketplaces', () => {
    expect(huntLiveReadinessProblems({ marketplaces: ['ebay'], location: null })).toEqual([]);
    expect(huntLiveReadinessProblems({ marketplaces: ['facebook'], location: null })).toHaveLength(1);
    expect(
      huntLiveReadinessProblems({ marketplaces: ['facebook'], location: { text: 'Cape Town', radiusKm: 25, point: null } }),
    ).toEqual([]);
  });
});
