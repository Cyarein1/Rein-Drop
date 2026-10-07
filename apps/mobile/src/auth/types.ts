import type { AccountIdentity, AuthProviderId } from '@rein-drop/api-client';

/**
 * Mobile auth boundary - mirrors apps/web/src/auth/types.ts. Screens use
 * `useSession()` and `getApiClient()`, never a concrete provider, so the managed
 * provider (TBD) can replace the development provider later.
 */
export interface Session {
  user: AccountIdentity;
  provider: AuthProviderId;
  /** True for the DEVELOPMENT-ONLY provider - the UI says so. */
  isDevelopment: boolean;
}

export interface MobileAuthProvider {
  readonly id: AuthProviderId;
  /** Credentials the API expects on every request. */
  getApiHeaders(): Promise<Record<string, string>>;
}
