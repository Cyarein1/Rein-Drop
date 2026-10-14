/**
 * Signed-in session rules shared by web and mobile (Entra External ID, decision 0013): an access
 * token for the API, refreshed shortly before it expires, inside a session with an absolute end
 * that refreshes never extend - after it the user signs in again.
 */
export interface TokenSession {
  accessToken: string;
  /** Epoch ms. */
  accessTokenExpiresAt: number;
  /** Epoch ms. */
  createdAt: number;
  /** Absolute end of the session, epoch ms. */
  expiresAt: number;
}

/** Refresh the access token when it has less than this left. */
export const REFRESH_MARGIN_MS = 5 * 60_000;
/** Default absolute session length (product decision pending: D34). */
export const DEFAULT_SESSION_MAX_AGE_HOURS = 168;
/** When the token response doesn't say (Entra always does), assume the shortest default lifetime. */
const FALLBACK_EXPIRES_IN_S = 3600;

export type TokenSessionState = 'valid' | 'refresh' | 'expired';

/** valid = use it; refresh = access token (nearly) expired; expired = the session itself is over. */
export function tokenSessionState(session: TokenSession | null, now: number): TokenSessionState {
  if (!session || now >= session.expiresAt) return 'expired';
  return session.accessTokenExpiresAt - now <= REFRESH_MARGIN_MS ? 'refresh' : 'valid';
}

/**
 * What to do when a token refresh fails:
 * - `sign_out`: the sign-in service refused it (revoked, expired refresh token). Forget the session.
 * - `use_current`: offline or the service is unreachable, but the access token is still good. Keep it.
 * - `unavailable`: offline and the access token has run out. Keep the session (no sign-out for a
 *   network blip) and report a connection problem; the next request tries again.
 */
export function afterRefreshFailure(session: TokenSession, refusedBySignInService: boolean, now: number): 'sign_out' | 'use_current' | 'unavailable' {
  if (refusedBySignInService || now >= session.expiresAt) return 'sign_out';
  return now < session.accessTokenExpiresAt ? 'use_current' : 'unavailable';
}

/**
 * The session after a token response: a new one at sign-in (`previous` null), or the same
 * session with a new access token after a refresh (absolute end unchanged).
 */
export function nextTokenSession(
  previous: TokenSession | null,
  token: { accessToken: string; expiresInSeconds: number | null | undefined },
  now: number,
  maxAgeMs: number,
): TokenSession {
  return {
    accessToken: token.accessToken,
    accessTokenExpiresAt: now + (token.expiresInSeconds ?? FALLBACK_EXPIRES_IN_S) * 1000,
    createdAt: previous?.createdAt ?? now,
    expiresAt: previous?.expiresAt ?? now + maxAgeMs,
  };
}
