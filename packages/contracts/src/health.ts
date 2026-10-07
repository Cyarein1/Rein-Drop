import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';

/** `GET /health` - liveness. 200 whenever the process is serving requests; checks no dependencies. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
  timestamp: isoDateTimeSchema,
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const dependencyStatusSchema = z.enum(['up', 'down']);
export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;

/** `GET /ready` - readiness. HTTP 200 when ready, 503 (same body shape) when not. */
export const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.object({
    database: dependencyStatusSchema,
  }),
  timestamp: isoDateTimeSchema,
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
