import { z } from 'zod';
import { activationBlockSchema } from './plans.js';

export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  /** A hunt cannot go live (plan limits or readiness) - see `activationBlock`. HTTP 409. */
  'ACTIVATION_BLOCKED',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'NOT_IMPLEMENTED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** One field-level problem, e.g. from request validation. */
export const apiErrorDetailSchema = z.object({
  /** Dotted path into the request part, e.g. `body.name`. */
  path: z.string(),
  message: z.string(),
});
export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;

/** Body of every non-2xx API response (except `/ready`, which always returns ReadinessResponse). */
export const apiErrorBodySchema = z.object({
  statusCode: z.number().int(),
  code: apiErrorCodeSchema,
  /** Safe to show to developers; never contains stack traces or secrets. */
  message: z.string(),
  details: z.array(apiErrorDetailSchema).optional(),
  /** Present with code ACTIVATION_BLOCKED: structured reasons and what the user can do. */
  activationBlock: activationBlockSchema.optional(),
  requestId: z.string().optional(),
  path: z.string(),
  timestamp: z.string(),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return apiErrorBodySchema.safeParse(value).success;
}
