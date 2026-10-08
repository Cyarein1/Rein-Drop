import { SOURCE_STALE_AFTER_MS, toSourceHealth, toSourceStatus, type SourceHealthRow } from './source-health.js';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const row = (over: Partial<SourceHealthRow> = {}): SourceHealthRow => ({
  status: 'HEALTHY',
  reason: null,
  statusSince: ago(3_600_000),
  lastSuccessAt: ago(60_000),
  retryAfter: null,
  checkedAt: ago(60_000),
  ...over,
});

describe('source health for the API', () => {
  it('maps the worker row', () => {
    expect(toSourceHealth('ebay', row(), NOW)).toEqual({
      marketplace: 'ebay',
      status: 'healthy',
      reason: null,
      since: ago(3_600_000).toISOString(),
      lastSuccessAt: ago(60_000).toISOString(),
      nextAttemptAt: null,
      checkedAt: ago(60_000).toISOString(),
    });
    expect(toSourceHealth('facebook', row({ status: 'DEGRADED', reason: 'PARTIAL' }), NOW)).toMatchObject({ status: 'degraded', reason: 'partial' });
    expect(toSourceHealth('ebay', row({ status: 'NOT_CONFIGURED', reason: 'NOT_CONFIGURED' }), NOW)).toMatchObject({ status: 'not_configured', reason: 'not_configured' });
  });

  it('a cool-down shows when the next attempt is - only while it is in the future', () => {
    const until = new Date(NOW.getTime() + 120_000);
    expect(toSourceHealth('ebay', row({ status: 'DOWN', reason: 'UNAVAILABLE', retryAfter: until }), NOW)).toMatchObject({ status: 'down', reason: 'unavailable', nextAttemptAt: until.toISOString() });
    expect(toSourceHealth('ebay', row({ status: 'DOWN', retryAfter: ago(1) }), NOW).nextAttemptAt).toBeNull();
  });

  it('no row, or no report for an hour (worker not running), is unknown - never "healthy"', () => {
    expect(toSourceHealth('ebay', null, NOW)).toMatchObject({ status: 'unknown', checkedAt: null });
    expect(toSourceHealth('ebay', row({ checkedAt: ago(SOURCE_STALE_AFTER_MS + 1) }), NOW)).toMatchObject({ status: 'unknown', lastSuccessAt: ago(60_000).toISOString() });
    expect(toSourceHealth('ebay', row({ reason: 'SOMETHING_NEW' }), NOW).reason).toBeNull();
  });

  it('the short form attached to hunts and deals', () => {
    expect(toSourceStatus(toSourceHealth('ebay', row({ status: 'DEGRADED', reason: 'SLOW' }), NOW))).toEqual({ status: 'degraded', reason: 'slow', nextAttemptAt: null });
  });
});
