import type { MarketplaceKey, SourceHealth, SourceReason, SourceState, SourceStatus } from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import { MARKETPLACE_IDS } from '@rein-drop/marketplace-core';

/**
 * Marketplace source health for the API, from the worker's MarketplaceHealth rows (decision 0009).
 * Read-only. A source with no row, or one the worker hasn't reported on for STALE_AFTER_MS (e.g.
 * the worker isn't running), is "unknown" - never presented as healthy.
 */

export const SOURCE_STALE_AFTER_MS = 60 * 60_000;

const STATE: Record<string, SourceState> = { HEALTHY: 'healthy', DEGRADED: 'degraded', DOWN: 'down', NOT_CONFIGURED: 'not_configured' };
const REASONS = new Set<string>(['slow', 'partial', 'rate_limited', 'unavailable', 'timeout', 'invalid_response', 'not_configured', 'probe']);

export interface SourceHealthRow {
  status: string;
  reason: string | null;
  statusSince: Date;
  lastSuccessAt: Date | null;
  retryAfter: Date | null;
  checkedAt: Date;
}

export function toSourceHealth(marketplace: MarketplaceKey, row: SourceHealthRow | null, now: Date): SourceHealth {
  if (!row || now.getTime() - row.checkedAt.getTime() > SOURCE_STALE_AFTER_MS) {
    return {
      marketplace,
      status: 'unknown',
      reason: null,
      since: null,
      lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
      nextAttemptAt: null,
      checkedAt: row?.checkedAt.toISOString() ?? null,
    };
  }
  const reason = row.reason?.toLowerCase() ?? null;
  return {
    marketplace,
    status: STATE[row.status] ?? 'unknown',
    reason: reason && REASONS.has(reason) ? (reason as SourceReason) : null,
    since: row.statusSince.toISOString(),
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    nextAttemptAt: row.retryAfter && row.retryAfter.getTime() > now.getTime() ? row.retryAfter.toISOString() : null,
    checkedAt: row.checkedAt.toISOString(),
  };
}

export const toSourceStatus = (h: SourceHealth): SourceStatus => ({ status: h.status, reason: h.reason, nextAttemptAt: h.nextAttemptAt });

/** Every launch marketplace, in MARKETPLACE_IDS order. */
export async function loadSourceHealth(prisma: PrismaClient, now: Date): Promise<SourceHealth[]> {
  const rows = await prisma.marketplaceHealth.findMany({ include: { marketplace: { select: { key: true } } } });
  const byKey = new Map(rows.map((r) => [r.marketplace.key, r]));
  return MARKETPLACE_IDS.map((key) => toSourceHealth(key, byKey.get(key) ?? null, now));
}

/** Lookup by marketplace key, for attaching to hunts / deals. */
export async function sourceStatusByKey(prisma: PrismaClient, now: Date): Promise<(key: MarketplaceKey) => SourceStatus> {
  const all = await loadSourceHealth(prisma, now);
  const map = new Map(all.map((h) => [h.marketplace, toSourceStatus(h)]));
  return (key) => map.get(key) ?? { status: 'unknown', reason: null, nextAttemptAt: null };
}
