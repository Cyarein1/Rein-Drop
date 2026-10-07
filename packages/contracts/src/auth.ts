/**
 * Auth wire constants.
 *
 * DEVELOPMENT-ONLY auth: the API's DevAuthProvider identifies the seeded local
 * user from DEV_AUTH_HEADER. The header value is an identity *selector*, not a
 * secret or password - which is why dev auth is refused in production and only
 * accepted from this machine / the private network.
 *
 * TODO(auth): the managed provider (TBD) will use its own credential (e.g. a
 * bearer token); clients supply it through the same `getHeaders` hook.
 */
export const AUTH_PROVIDER_IDS = ['dev'] as const;
export type AuthProviderId = (typeof AUTH_PROVIDER_IDS)[number];

export const DEV_AUTH_HEADER = 'x-dev-auth-subject';

/** Subject and email of the user created by `pnpm db:seed` (never in production). */
export const DEV_AUTH_SUBJECT = 'local-dev-user';
export const DEV_AUTH_USER_EMAIL = 'dev@reindrop.local';
