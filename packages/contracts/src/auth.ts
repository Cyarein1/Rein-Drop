/**
 * Auth wire constants.
 *
 * - `entra`: Microsoft Entra External ID (decision 0013). Clients send an access token for the
 *   Rein Drop API as `Authorization: Bearer <token>`; the API verifies it.
 * - `dev`: DEVELOPMENT-ONLY. The API's DevAuthProvider identifies a seeded local user from
 *   DEV_AUTH_HEADER - an identity *selector*, not a secret - so it is refused in production and
 *   only accepted from this machine / the private network.
 */
export const AUTH_PROVIDER_IDS = ['dev', 'entra'] as const;
export type AuthProviderId = (typeof AUTH_PROVIDER_IDS)[number];

export const DEV_AUTH_HEADER = 'x-dev-auth-subject';

/** Subject and email of the user created by `pnpm db:seed` (never in production). */
export const DEV_AUTH_SUBJECT = 'local-dev-user';
export const DEV_AUTH_USER_EMAIL = 'dev@reindrop.local';

/** Default delegated scope the API registration exposes (`api://<api-client-id>/access_as_user`). */
export const ENTRA_DEFAULT_SCOPE_NAME = 'access_as_user';

/**
 * OpenID configuration of an Entra External ID tenant:
 * `https://<subdomain>.ciamlogin.com/<tenant-id>/v2.0/.well-known/openid-configuration`.
 * `authority` is `https://<subdomain>.ciamlogin.com` (a trailing slash is fine).
 */
export function entraDiscoveryUrl(authority: string, tenantId: string): string {
  return `${authority.trim().replace(/\/+$/, '')}/${tenantId}/v2.0/.well-known/openid-configuration`;
}

/** Full scope a client requests for the Rein Drop API. */
export function entraApiScope(apiClientId: string, scopeName: string = ENTRA_DEFAULT_SCOPE_NAME): string {
  return `api://${apiClientId}/${scopeName}`;
}
