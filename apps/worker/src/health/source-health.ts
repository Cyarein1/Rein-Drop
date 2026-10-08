import type { MarketplaceErrorCode, SourceHealth } from '@rein-drop/marketplace-core';

/**
 * Marketplace source health as a pure state machine (decision 0009). The worker feeds it every
 * real search outcome and periodic health probes; the result drives per-source backoff
 * (`retryAfter`: no searches for this source until then) and what users are told.
 *
 * Local-worker backoff: one source cooling down never blocks the others, and a cooling source is
 * not hammered by every Hunt's job - they wait for `retryAfter` instead.
 */

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'NOT_CONFIGURED';
export type HealthReason = 'SLOW' | 'PARTIAL' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'NOT_CONFIGURED' | 'PROBE';

export interface HealthState {
  status: HealthStatus;
  reason: HealthReason | null;
  message: string | null;
  consecutiveFailures: number;
  lastLatencyMs: number | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  statusSince: Date;
  retryAfter: Date | null;
  checkedAt: Date;
}

export interface SourceHealthPolicy {
  /** A search slower than this is "slow" (degraded) even when it succeeds. */
  slowMs: number;
  /** Failures in a row before the source counts as down (before that: degraded). */
  downAfterFailures: number;
  /** Cool-down after the first failure; doubles per failure... */
  backoffBaseMs: number;
  /** ...up to this. */
  backoffMaxMs: number;
}

export const DEFAULT_SOURCE_HEALTH_POLICY: SourceHealthPolicy = {
  slowMs: 5_000,
  downAfterFailures: 3,
  backoffBaseMs: 30_000,
  backoffMaxMs: 15 * 60_000,
};

export type HealthOutcome =
  | {
      kind: 'success';
      latencyMs: number;
      partial: boolean;
      /** This source's own "slow" threshold when it's slow by nature; never below the policy's. */
      slowAfterMs?: number;
    }
  | { kind: 'failure'; code: MarketplaceErrorCode | 'TIMEOUT'; message: string; latencyMs: number | null; retryAfter: Date | null }
  | { kind: 'probe'; health: Pick<SourceHealth, 'status' | 'message' | 'retryAfter'> };

/** 30s, 1m, 2m, 4m ... capped (failure 1 = base). */
export function sourceBackoffMs(failures: number, policy: SourceHealthPolicy): number {
  return Math.min(policy.backoffBaseMs * 2 ** Math.max(0, failures - 1), policy.backoffMaxMs);
}

export const initialHealth = (now: Date): HealthState => ({
  status: 'HEALTHY',
  reason: null,
  message: null,
  consecutiveFailures: 0,
  lastLatencyMs: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  statusSince: now,
  retryAfter: null,
  checkedAt: now,
});

/** True while searches for this source should wait. */
export const isCoolingDown = (state: Pick<HealthState, 'retryAfter'> | null, now: Date) => !!state?.retryAfter && state.retryAfter.getTime() > now.getTime();

const withStatus = (prev: HealthState, status: HealthStatus, now: Date) => (prev.status === status ? prev.statusSince : now);

export function nextHealth(prev: HealthState | null, outcome: HealthOutcome, now: Date, policy: SourceHealthPolicy = DEFAULT_SOURCE_HEALTH_POLICY): HealthState {
  const p = prev ?? initialHealth(now);

  if (outcome.kind === 'success') {
    const slowMs = Math.max(policy.slowMs, outcome.slowAfterMs ?? 0);
    const reason: HealthReason | null = outcome.partial ? 'PARTIAL' : outcome.latencyMs > slowMs ? 'SLOW' : null;
    const status: HealthStatus = reason ? 'DEGRADED' : 'HEALTHY';
    return {
      ...p,
      status,
      reason,
      message: reason === 'PARTIAL' ? 'Returned partial results' : reason === 'SLOW' ? `Slow response (${Math.round(outcome.latencyMs / 100) / 10}s)` : null,
      consecutiveFailures: 0,
      lastLatencyMs: Math.round(outcome.latencyMs),
      lastSuccessAt: now,
      statusSince: withStatus(p, status, now),
      retryAfter: null,
      checkedAt: now,
    };
  }

  if (outcome.kind === 'failure') {
    const failures = p.consecutiveFailures + 1;
    if (outcome.code === 'NOT_CONFIGURED') {
      return {
        ...p,
        status: 'NOT_CONFIGURED',
        reason: 'NOT_CONFIGURED',
        message: outcome.message,
        consecutiveFailures: failures,
        lastFailureAt: now,
        statusSince: withStatus(p, 'NOT_CONFIGURED', now),
        // Nothing changes until someone configures it: check back rarely (the probe re-checks).
        retryAfter: new Date(now.getTime() + policy.backoffMaxMs),
        checkedAt: now,
      };
    }
    const status: HealthStatus = failures >= policy.downAfterFailures ? 'DOWN' : 'DEGRADED';
    const cooldown = now.getTime() + sourceBackoffMs(failures, policy);
    // Never earlier than the source itself asked for (rate limits).
    const retryAfter = new Date(Math.max(cooldown, outcome.retryAfter?.getTime() ?? 0));
    const reason: HealthReason =
      outcome.code === 'RATE_LIMITED' || outcome.code === 'TIMEOUT' || outcome.code === 'INVALID_RESPONSE' ? outcome.code : 'UNAVAILABLE';
    return {
      ...p,
      status,
      reason,
      message: outcome.message,
      consecutiveFailures: failures,
      lastLatencyMs: outcome.latencyMs === null ? p.lastLatencyMs : Math.round(outcome.latencyMs),
      lastFailureAt: now,
      statusSince: withStatus(p, status, now),
      retryAfter,
      checkedAt: now,
    };
  }

  // Probe: the adapter's own health check. Real search outcomes are better evidence, so a probe
  // only fills in when there is none recently (the caller decides) - with two exceptions below.
  const h = outcome.health;
  if (h.status === 'not_configured') {
    return { ...p, status: 'NOT_CONFIGURED', reason: 'NOT_CONFIGURED', message: h.message, statusSince: withStatus(p, 'NOT_CONFIGURED', now), retryAfter: null, checkedAt: now };
  }
  if (h.status === 'healthy') {
    // Recovered while cooling down / not configured before: let the next search through now.
    const wasBlocked = p.status === 'NOT_CONFIGURED' || isCoolingDown(p, now);
    return {
      ...p,
      status: p.status === 'NOT_CONFIGURED' ? 'HEALTHY' : p.status,
      reason: p.status === 'NOT_CONFIGURED' ? null : p.reason,
      message: p.status === 'NOT_CONFIGURED' ? null : p.message,
      statusSince: p.status === 'NOT_CONFIGURED' ? now : p.statusSince,
      retryAfter: wasBlocked ? null : p.retryAfter,
      checkedAt: now,
    };
  }
  const status: HealthStatus = h.status === 'down' ? 'DOWN' : 'DEGRADED';
  return {
    ...p,
    status,
    reason: 'PROBE',
    message: h.message,
    statusSince: withStatus(p, status, now),
    retryAfter: h.retryAfter && h.retryAfter.getTime() > (p.retryAfter?.getTime() ?? 0) ? h.retryAfter : p.retryAfter,
    checkedAt: now,
  };
}

/** How long without a real search before the probe's view is used. */
export const probeIsUseful = (state: HealthState | null, now: Date, probeIntervalMs: number) =>
  !state || state.status === 'NOT_CONFIGURED' || isCoolingDown(state, now) || now.getTime() - state.checkedAt.getTime() >= probeIntervalMs;
