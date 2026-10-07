import type { AccountIdentity, AuthProviderId } from "@rein-drop/api-client";

/**
 * Web auth boundary. App code uses `verifySession()` / `getServerApiClient()` from
 * `@/auth`, never a concrete provider, so the managed provider (TBD) can replace the
 * development provider without touching pages.
 */
export interface Session {
  user: AccountIdentity;
  provider: AuthProviderId;
  /** True for the DEVELOPMENT-ONLY provider - the UI says so. */
  isDevelopment: boolean;
}

export type SessionResult =
  | { status: "authenticated"; session: Session }
  | { status: "unauthenticated"; reason: string };

export interface WebAuthProvider {
  readonly id: AuthProviderId;
  /**
   * Cheap, request-local check for Proxy (no network/database calls). May return
   * true for requests that later fail full verification.
   */
  mightBeAuthenticated(request: { cookies: { has(name: string): boolean } }): boolean;
  /** Full verification against the API. Throws for infrastructure errors (API down). */
  getSession(): Promise<SessionResult>;
  /** Credentials the API expects on server-side requests for the current user. */
  getApiHeaders(): Promise<Record<string, string>>;
}
