import { z } from 'zod';
import { isoDateTimeSchema, marketplaceKeySchema } from './common.js';

/**
 * Marketplace source health as users see it (decision 0009). Written by the worker from real
 * search outcomes and health probes; read by every screen that shows monitoring, so a Hunt never
 * looks fully healthy while one of its sources isn't.
 *
 * - healthy: searches work normally.
 * - degraded: working, but slow / partial / intermittently failing / rate limited.
 * - down: failing repeatedly; searches wait until `nextAttemptAt`.
 * - not_configured: this source isn't set up.
 * - unknown: no recent information (never checked, or the worker hasn't reported for a while).
 */
export const SOURCE_STATES = ['healthy', 'degraded', 'down', 'not_configured', 'unknown'] as const;
export const sourceStateSchema = z.enum(SOURCE_STATES);
export type SourceState = z.infer<typeof sourceStateSchema>;

/** Machine reasons (copy is written by clients). */
export const SOURCE_REASONS = ['slow', 'partial', 'rate_limited', 'unavailable', 'timeout', 'invalid_response', 'not_configured', 'probe'] as const;
export const sourceReasonSchema = z.enum(SOURCE_REASONS);
export type SourceReason = z.infer<typeof sourceReasonSchema>;

export const sourceHealthSchema = z.object({
  marketplace: marketplaceKeySchema,
  status: sourceStateSchema,
  reason: sourceReasonSchema.nullable(),
  /** Since when it has been in this status. */
  since: isoDateTimeSchema.nullable(),
  lastSuccessAt: isoDateTimeSchema.nullable(),
  /** When Rein Drop will try this source again (while it is cooling down); null = normal schedule. */
  nextAttemptAt: isoDateTimeSchema.nullable(),
  checkedAt: isoDateTimeSchema.nullable(),
});
export type SourceHealth = z.infer<typeof sourceHealthSchema>;

/** `GET /marketplaces/health` - every launch marketplace, always in the same order. */
export const sourceHealthListSchema = z.object({ items: z.array(sourceHealthSchema), generatedAt: isoDateTimeSchema });
export type SourceHealthList = z.infer<typeof sourceHealthListSchema>;

/** A source's state as attached to a Hunt's marketplace or a deal. */
export const sourceStatusSchema = z.object({
  status: sourceStateSchema,
  reason: sourceReasonSchema.nullable(),
  nextAttemptAt: isoDateTimeSchema.nullable(),
});
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
