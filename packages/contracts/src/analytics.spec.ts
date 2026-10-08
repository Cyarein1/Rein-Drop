import { describe, expect, it } from 'vitest';
import { ANALYTICS_PERIOD_DAYS, ANALYTICS_PERIODS, analyticsQuerySchema } from './analytics.js';

describe('analytics query', () => {
  it('defaults to the last 30 days and only accepts known periods', () => {
    expect(analyticsQuerySchema.parse({})).toEqual({ period: '30d' });
    expect(analyticsQuerySchema.parse({ period: 'all' })).toEqual({ period: 'all' });
    expect(analyticsQuerySchema.safeParse({ period: '2y' }).success).toBe(false);
  });

  it('every period has a length (all = none)', () => {
    expect(ANALYTICS_PERIODS.map((p) => ANALYTICS_PERIOD_DAYS[p])).toEqual([7, 30, 90, 365, null]);
  });
});
