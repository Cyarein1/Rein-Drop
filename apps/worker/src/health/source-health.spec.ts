import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOURCE_HEALTH_POLICY as P,
  isCoolingDown,
  nextHealth,
  probeIsUseful,
  sourceBackoffMs,
  type HealthOutcome,
  type HealthState,
} from './source-health.js';

const T0 = new Date('2026-10-08T12:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const ok = (latencyMs = 200, partial = false): HealthOutcome => ({ kind: 'success', latencyMs, partial });
const fail = (code: 'UNAVAILABLE' | 'RATE_LIMITED' | 'NOT_CONFIGURED' | 'TIMEOUT' = 'UNAVAILABLE', retryAfter: Date | null = null): HealthOutcome => ({
  kind: 'failure',
  code,
  message: code,
  latencyMs: 100,
  retryAfter,
});
/** Applies outcomes in order, one second apart. */
const run = (outcomes: HealthOutcome[], start: HealthState | null = null) =>
  outcomes.reduce<HealthState | null>((s, o, i) => nextHealth(s, o, at(i * 1000)), start)!;

describe('source health', () => {
  it('a normal search is healthy; slow or partial results are degraded (still working)', () => {
    expect(nextHealth(null, ok(), T0)).toMatchObject({ status: 'HEALTHY', reason: null, retryAfter: null, lastSuccessAt: T0, lastLatencyMs: 200 });
    expect(nextHealth(null, ok(P.slowMs + 1), T0)).toMatchObject({ status: 'DEGRADED', reason: 'SLOW', message: 'Slow response (5s)', retryAfter: null });
    expect(nextHealth(null, ok(100, true), T0)).toMatchObject({ status: 'DEGRADED', reason: 'PARTIAL', retryAfter: null });
  });

  it('failures: degraded first, down after the threshold; each failure cools the source down longer', () => {
    const one = run([fail()]);
    expect(one).toMatchObject({ status: 'DEGRADED', reason: 'UNAVAILABLE', consecutiveFailures: 1, retryAfter: at(30_000) });
    const three = run([fail(), fail(), fail()]);
    expect(three).toMatchObject({ status: 'DOWN', consecutiveFailures: 3, retryAfter: at(2000 + 120_000) });
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => sourceBackoffMs(n, P) / 1000)).toEqual([30, 60, 120, 240, 480, 900, 900, 900]);
  });

  it('a success clears failures and the cool-down; status-since only moves on a change', () => {
    const recovered = run([fail(), fail(), fail(), ok()]);
    expect(recovered).toMatchObject({ status: 'HEALTHY', consecutiveFailures: 0, retryAfter: null, statusSince: at(3000) });
    expect(run([ok(), ok(), ok()]).statusSince).toEqual(T0);
  });

  it("never retries earlier than the source asked (rate limit)", () => {
    const limited = nextHealth(null, fail('RATE_LIMITED', at(10 * 60_000)), T0);
    expect(limited).toMatchObject({ status: 'DEGRADED', reason: 'RATE_LIMITED', retryAfter: at(10 * 60_000) });
    expect(nextHealth(null, fail('TIMEOUT'), T0).reason).toBe('TIMEOUT');
  });

  it('not configured: its own status, checked back rarely', () => {
    expect(nextHealth(null, fail('NOT_CONFIGURED'), T0)).toMatchObject({ status: 'NOT_CONFIGURED', retryAfter: at(P.backoffMaxMs) });
  });

  it('cooling down = retryAfter in the future', () => {
    const s = run([fail()]);
    expect(isCoolingDown(s, at(29_000))).toBe(true);
    expect(isCoolingDown(s, at(30_000))).toBe(false);
    expect(isCoolingDown(null, T0)).toBe(false);
  });

  it('probes: a healthy probe lets a cooling source out early; a down probe never hides a cool-down', () => {
    const down = run([fail(), fail(), fail()]);
    const probedOk = nextHealth(down, { kind: 'probe', health: { status: 'healthy', message: null, retryAfter: null } }, at(5000));
    expect(probedOk).toMatchObject({ status: 'DOWN', retryAfter: null }); // half-open: next search decides
    const probedDown = nextHealth(down, { kind: 'probe', health: { status: 'down', message: 'x', retryAfter: null } }, at(5000));
    expect(probedDown).toMatchObject({ status: 'DOWN', reason: 'PROBE', retryAfter: down.retryAfter });
    const configured = nextHealth(nextHealth(null, fail('NOT_CONFIGURED'), T0), { kind: 'probe', health: { status: 'healthy', message: null, retryAfter: null } }, at(1000));
    expect(configured).toMatchObject({ status: 'HEALTHY', retryAfter: null });
    expect(nextHealth(null, { kind: 'probe', health: { status: 'not_configured', message: 'no keys', retryAfter: null } }, T0).status).toBe('NOT_CONFIGURED');
  });

  it('the probe is only used without recent search evidence (or to notice a recovery)', () => {
    const fresh = nextHealth(null, ok(), T0);
    expect(probeIsUseful(fresh, at(30_000), 60_000)).toBe(false);
    expect(probeIsUseful(fresh, at(60_000), 60_000)).toBe(true);
    expect(probeIsUseful(run([fail()]), at(5_000), 60_000)).toBe(true);
    expect(probeIsUseful(null, T0, 60_000)).toBe(true);
  });
});
