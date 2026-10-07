import { z } from 'zod';
import {
  idSchema,
  isoDateTimeSchema,
  marketplaceKeySchema,
  moneySchema,
  pageQuerySchema,
  pageSchema,
  type MarketplaceKey,
} from './common.js';

/**
 * Hunts - saved sourcing searches (App Flow Blueprint sections 5, 13, 14).
 *
 * Lifecycle (server-enforced): DRAFT -> LIVE <-> PAUSED, and any non-archived -> ARCHIVED.
 * Hunts are never deleted; edits keep the same id and are recorded as HuntEvents.
 */

/** Mirrors the HuntStatus database enum (checked by a test in apps/api). */
export const HUNT_STATUSES = ['DRAFT', 'LIVE', 'PAUSED', 'ARCHIVED'] as const;
export const huntStatusSchema = z.enum(HUNT_STATUSES);
export type HuntStatus = z.infer<typeof huntStatusSchema>;

/** Mirrors the HuntPriority database enum. MVP has normal priority only ("Hot Hunt" later). */
export const HUNT_PRIORITIES = ['NORMAL'] as const;
export const huntPrioritySchema = z.enum(HUNT_PRIORITIES);
export type HuntPriority = z.infer<typeof huntPrioritySchema>;

/** Listing condition filter. An empty list means "any condition". */
export const HUNT_CONDITIONS = ['new', 'used', 'refurbished'] as const;
export const huntConditionSchema = z.enum(HUNT_CONDITIONS);
export type HuntCondition = z.infer<typeof huntConditionSchema>;

export const HUNT_NAME_MAX_LENGTH = 100;
export const HUNT_QUERY_MIN_LENGTH = 2;
export const HUNT_QUERY_MAX_LENGTH = 200;
export const HUNT_LOCATION_MAX_LENGTH = 100;
export const HUNT_RADIUS_KM_MAX = 500;
export const HUNT_EXCLUSIONS_MAX = 20;
export const HUNT_EXCLUSION_MAX_LENGTH = 50;

/** Marketplaces that are local-pickup by nature: a Hunt needs a location to go live on them. */
export const LOCAL_MARKETPLACES: readonly MarketplaceKey[] = ['facebook'];

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

const huntName = z.string().trim().min(1, 'Name is required').max(HUNT_NAME_MAX_LENGTH);

/** The product or a natural-language description of what to find. */
const huntQuery = z
  .string()
  .trim()
  .min(HUNT_QUERY_MIN_LENGTH, `Describe what to hunt for (at least ${HUNT_QUERY_MIN_LENGTH} characters)`)
  .max(HUNT_QUERY_MAX_LENGTH)
  .refine((q) => HAS_LETTER_OR_DIGIT.test(q), 'Describe what to hunt for using words or model numbers');

const huntMarketplaces = z
  .array(marketplaceKeySchema)
  .min(1, 'Choose at least one marketplace')
  .refine((keys) => new Set(keys).size === keys.length, 'Marketplaces must not repeat');

/**
 * Where to look. Free text until a geocoding provider is chosen (TODO(geo)).
 * Radius in kilometres (display in miles can come later).
 */
export const huntLocationSchema = z.object({
  text: z.string().trim().min(2, 'Enter a city, area or postal code').max(HUNT_LOCATION_MAX_LENGTH),
  radiusKm: z.number().int().min(1).max(HUNT_RADIUS_KM_MAX).nullable(),
});
export type HuntLocation = z.infer<typeof huntLocationSchema>;

const huntConditions = z
  .array(huntConditionSchema)
  .refine((list) => new Set(list).size === list.length, 'Conditions must not repeat');

const positiveMoney = moneySchema.refine((m) => m.amountMinor > 0, 'Amount must be greater than 0');

/** Optional target economics: a dollar profit or a margin, not both. */
export const huntTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('profit'), amount: positiveMoney }),
  /** Whole percent, e.g. 30 = 30% margin. */
  z.object({ kind: z.literal('margin'), percent: z.number().int().min(1).max(100) }),
]);
export type HuntTarget = z.infer<typeof huntTargetSchema>;

const huntExclusions = z
  .array(z.string().trim().min(1).max(HUNT_EXCLUSION_MAX_LENGTH))
  .max(HUNT_EXCLUSIONS_MAX, `At most ${HUNT_EXCLUSIONS_MAX} exclusions`)
  .refine(
    (list) => new Set(list.map((e) => e.toLowerCase())).size === list.length,
    'Exclusions must not repeat',
  );

const criteriaFields = {
  name: huntName,
  query: huntQuery,
  marketplaces: huntMarketplaces,
  location: huntLocationSchema.nullable(),
  conditions: huntConditions,
  maxPrice: positiveMoney.nullable(),
  target: huntTargetSchema.nullable(),
  exclusions: huntExclusions,
  priority: huntPrioritySchema,
};

/**
 * Cross-field rules that make criteria meaningful. Applied to create and update
 * (for update, only to the fields present in the same request).
 */
function criteriaRules(
  c: {
    query?: string | undefined;
    maxPrice?: { currency: string } | null | undefined;
    target?: HuntTarget | null | undefined;
    exclusions?: string[] | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if (c.query !== undefined && c.exclusions) {
    const words = new Set(c.query.toLowerCase().split(/\s+/).filter(Boolean));
    c.exclusions.forEach((exclusion, i) => {
      if (words.has(exclusion.toLowerCase()) || exclusion.toLowerCase() === c.query?.toLowerCase()) {
        ctx.addIssue({
          code: 'custom',
          path: ['exclusions', i],
          message: `"${exclusion}" is part of what you're hunting for - excluding it would hide every result`,
        });
      }
    });
  }
  if (c.maxPrice && c.target?.kind === 'profit' && c.target.amount.currency !== c.maxPrice.currency) {
    ctx.addIssue({
      code: 'custom',
      path: ['target', 'amount', 'currency'],
      message: 'Use the same currency as the max price',
    });
  }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** `POST /hunts` - creates a DRAFT. Activate separately (plan gate sits there later). */
export const createHuntRequestSchema = z
  .object({
    ...criteriaFields,
    /** Defaults to the query when omitted. */
    name: huntName.optional(),
    location: criteriaFields.location.default(null),
    conditions: criteriaFields.conditions.default([]),
    maxPrice: criteriaFields.maxPrice.default(null),
    target: criteriaFields.target.default(null),
    exclusions: criteriaFields.exclusions.default([]),
    priority: criteriaFields.priority.default('NORMAL'),
  })
  .superRefine(criteriaRules);
export type CreateHuntRequest = z.infer<typeof createHuntRequestSchema>;
export type CreateHuntRequestInput = z.input<typeof createHuntRequestSchema>;

/**
 * `PATCH /hunts/:id` - edit criteria (any subset, at least one field). Status is
 * changed only through the lifecycle actions. Send null to clear location /
 * maxPrice / target. Not allowed on ARCHIVED hunts.
 */
export const updateHuntRequestSchema = z
  .object(criteriaFields)
  .partial()
  .refine((body) => Object.values(body).some((v) => v !== undefined), 'Provide at least one field to update')
  .superRefine(criteriaRules);
export type UpdateHuntRequest = z.infer<typeof updateHuntRequestSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** A hunt as returned by every hunt endpoint. */
export const huntSchema = z.object({
  id: idSchema,
  name: z.string(),
  query: z.string(),
  status: huntStatusSchema,
  priority: huntPrioritySchema,
  /** Enabled marketplaces for this hunt. */
  marketplaces: z.array(marketplaceKeySchema),
  location: huntLocationSchema.nullable(),
  /** Empty = any condition. */
  conditions: z.array(huntConditionSchema),
  maxPrice: moneySchema.nullable(),
  target: huntTargetSchema.nullable(),
  exclusions: z.array(z.string()),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  /** Last criteria edit (null if never edited). */
  lastEditedAt: isoDateTimeSchema.nullable(),
  /** First time the hunt went live. */
  activatedAt: isoDateTimeSchema.nullable(),
  pausedAt: isoDateTimeSchema.nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
});
export type Hunt = z.infer<typeof huntSchema>;

/**
 * `GET /hunts` query. Without `status`, archived hunts are left out (they stay in
 * history - request `status=ARCHIVED` to see them). Newest first.
 */
export const listHuntsQuerySchema = pageQuerySchema.extend({
  status: huntStatusSchema.optional(),
});
export type ListHuntsQuery = z.infer<typeof listHuntsQuerySchema>;
/** What callers may pass (defaults not yet applied). */
export type ListHuntsQueryInput = z.input<typeof listHuntsQuerySchema>;

export const huntPageSchema = pageSchema(huntSchema);

// ---------------------------------------------------------------------------
// Lifecycle + history
// ---------------------------------------------------------------------------

export const HUNT_ACTIONS = ['activate', 'pause', 'resume', 'archive', 'restore'] as const;
export type HuntAction = (typeof HUNT_ACTIONS)[number];

/** Mirrors the HuntEventType database enum. */
export const HUNT_EVENT_TYPES = [
  'CREATED',
  'EDITED',
  'ACTIVATED',
  'PAUSED',
  'RESUMED',
  'ARCHIVED',
  'RESTORED',
] as const;
export const huntEventTypeSchema = z.enum(HUNT_EVENT_TYPES);
export type HuntEventType = z.infer<typeof huntEventTypeSchema>;

/** `GET /hunts/:id/events` item - the hunt's history, oldest first. */
export const huntEventSchema = z.object({
  id: idSchema,
  type: huntEventTypeSchema,
  fromStatus: huntStatusSchema.nullable(),
  toStatus: huntStatusSchema.nullable(),
  /** For EDITED: changed fields with their previous and new values. */
  changes: z.record(z.string(), z.object({ before: z.unknown(), after: z.unknown() })).nullable(),
  createdAt: isoDateTimeSchema,
});
export type HuntEvent = z.infer<typeof huntEventSchema>;
export const huntEventListSchema = z.object({ items: z.array(huntEventSchema) });

/**
 * What still stops a hunt from going live (empty = ready). Shared so the review
 * screen can show the same reasons the API enforces.
 * TODO(product): confirm "location required for local marketplaces"; plan limits are checked
 * separately at activation once plans exist (Blueprint section 6).
 */
export function huntLiveReadinessProblems(hunt: Pick<Hunt, 'marketplaces' | 'location'>): string[] {
  const problems: string[] = [];
  const local = hunt.marketplaces.filter((m) => LOCAL_MARKETPLACES.includes(m));
  if (local.length > 0 && !hunt.location) {
    problems.push('Add a location - Facebook Marketplace listings are local pickup');
  }
  return problems;
}

/**
 * Valid lifecycle moves: action -> statuses it may start from, and the resulting status.
 * `restore`'s target depends on the status before archiving - see `restoredStatus`.
 */
export const HUNT_TRANSITIONS: Record<HuntAction, { from: readonly HuntStatus[]; to: HuntStatus }> = {
  activate: { from: ['DRAFT'], to: 'LIVE' },
  pause: { from: ['LIVE'], to: 'PAUSED' },
  resume: { from: ['PAUSED'], to: 'LIVE' },
  archive: { from: ['DRAFT', 'LIVE', 'PAUSED'], to: 'ARCHIVED' },
  restore: { from: ['ARCHIVED'], to: 'PAUSED' },
};

/**
 * Where a restored hunt lands. Never straight back to LIVE: going live again must pass
 * the go-live checks (and the plan gate, later) via `resume`. A hunt that was never
 * activated returns to DRAFT.
 */
export function restoredStatus(statusBeforeArchive: HuntStatus | null): HuntStatus {
  return statusBeforeArchive === 'DRAFT' ? 'DRAFT' : 'PAUSED';
}
