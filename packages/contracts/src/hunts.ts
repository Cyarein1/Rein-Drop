import { z } from 'zod';
import { idSchema, isoDateTimeSchema, marketplaceKeySchema, pageQuerySchema, pageSchema } from './common.js';

/** Mirrors the HuntStatus database enum (checked by a test in apps/api). */
export const HUNT_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export const huntStatusSchema = z.enum(HUNT_STATUSES);
export type HuntStatus = z.infer<typeof huntStatusSchema>;

export const HUNT_NAME_MAX_LENGTH = 100;
export const HUNT_QUERY_MAX_LENGTH = 200;

const huntName = z.string().trim().min(1, 'Name is required').max(HUNT_NAME_MAX_LENGTH);
const huntQuery = z.string().trim().min(1, 'Search terms are required').max(HUNT_QUERY_MAX_LENGTH);
const huntMarketplaces = z
  .array(marketplaceKeySchema)
  .min(1, 'Choose at least one marketplace')
  .refine((keys) => new Set(keys).size === keys.length, 'Marketplaces must not repeat');

// TODO(product): typed hunt criteria (price range, condition, distance...) - not
// part of the contract until defined. The database keeps a Json column for it.

/** `POST /hunts` body. New hunts start ACTIVE. */
export const createHuntRequestSchema = z.object({
  name: huntName,
  query: huntQuery,
  marketplaces: huntMarketplaces,
});
export type CreateHuntRequest = z.infer<typeof createHuntRequestSchema>;

/** `PATCH /hunts/:id` body. Any subset of fields, at least one. */
export const updateHuntRequestSchema = z
  .object({
    name: huntName,
    query: huntQuery,
    marketplaces: huntMarketplaces,
    status: huntStatusSchema,
  })
  .partial()
  .refine((body) => Object.values(body).some((v) => v !== undefined), 'Provide at least one field to update');
export type UpdateHuntRequest = z.infer<typeof updateHuntRequestSchema>;

/** A hunt as returned by `GET /hunts/:id`, `GET /hunts`, `POST` and `PATCH`. */
export const huntSchema = z.object({
  id: idSchema,
  name: z.string(),
  query: z.string(),
  status: huntStatusSchema,
  /** Enabled marketplaces for this hunt. */
  marketplaces: z.array(marketplaceKeySchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Hunt = z.infer<typeof huntSchema>;

/** `GET /hunts` query. */
export const listHuntsQuerySchema = pageQuerySchema.extend({
  status: huntStatusSchema.optional(),
});
export type ListHuntsQuery = z.infer<typeof listHuntsQuerySchema>;
/** What callers may pass (defaults not yet applied). */
export type ListHuntsQueryInput = z.input<typeof listHuntsQuerySchema>;

export const huntPageSchema = pageSchema(huntSchema);
