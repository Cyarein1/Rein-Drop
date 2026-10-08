import { describe, expect, it } from 'vitest';
import { nextHealth } from '../health/source-health.js';
import { addUsage } from './marketplace-search.handler.js';

const page = (over: Partial<Parameters<typeof addUsage>[1] & object> = {}) => ({
  requests: 1,
  items: 20,
  durationMs: 1500,
  costUsd: 0.052,
  costIsEstimate: true,
  details: { provider: 'apify-marketplace', resultsLimit: 20 },
  ...over,
});

describe('source usage per search run', () => {
  it('sums requests, results, time and cost over pages', () => {
    const total = addUsage(addUsage(null, page()), page({ items: 10, durationMs: 500, costUsd: 0.026, details: { provider: 'apify-marketplace', offset: 20 } }));
    expect(total).toEqual({
      requests: 2,
      items: 30,
      durationMs: 2000,
      costUsd: 0.078,
      costIsEstimate: true,
      details: { provider: 'apify-marketplace', resultsLimit: 20, offset: 20 },
    });
  });

  it('no usage reported = nothing recorded; free / quota sources keep a null or zero cost', () => {
    expect(addUsage(null, undefined)).toBeNull();
    expect(addUsage(addUsage(null, page({ costUsd: null, costIsEstimate: false })), page({ costUsd: null, costIsEstimate: false }))).toMatchObject({ costUsd: null, requests: 2 });
  });
});

describe('slow-by-nature sources', () => {
  const at = new Date('2026-10-08T12:00:00Z');
  it('a provider that declares a long normal run time is not "slow" at that speed', () => {
    expect(nextHealth(null, { kind: 'success', latencyMs: 80_000, partial: false, slowAfterMs: 180_000 }, at).status).toBe('HEALTHY');
    expect(nextHealth(null, { kind: 'success', latencyMs: 200_000, partial: false, slowAfterMs: 180_000 }, at)).toMatchObject({ status: 'DEGRADED', reason: 'SLOW' });
    // Never more lenient than the policy for fast APIs.
    expect(nextHealth(null, { kind: 'success', latencyMs: 6_000, partial: false, slowAfterMs: 1_000 }, at).status).toBe('DEGRADED');
  });
});
