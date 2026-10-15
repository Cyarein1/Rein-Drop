/**
 * Shared API contracts: zod schemas + inferred TypeScript types describing the
 * wire format between apps/api and its clients (web, mobile). This is the only
 * place request/response DTOs are defined - apps import them, never redeclare.
 *
 * Framework-free: depends only on zod and @rein-drop/marketplace-core.
 */

/** Header carrying the request id. Clients may send one; the API always returns one. */
export const REQUEST_ID_HEADER = 'x-request-id';

export * from './common.js';
export * from './errors.js';
export * from './health.js';
export * from './account.js';
export * from './auth.js';
export * from './locale.js';
export * from './geo.js';
export * from './seller-snapshot.js';
export * from './home.js';
export * from './hunts.js';
export * from './plans.js';
export * from './capabilities.js';
export * from './listings.js';
export * from './deals.js';
export * from './notifications.js';
export * from './outcomes.js';
export * from './sell.js';
export * from './analytics.js';
export * from './marketplace-health.js';
export * from './diagnostics.js';
export * from './product-events.js';
export * from './waitlist.js';
