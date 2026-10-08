import type { AccountIdentity, AuthProviderId } from '@rein-drop/api-client';

/**
 * Mobile auth boundary - mirrors apps/web/src/auth/types.ts. Screens use
 * `useSession()` and `getApiClient()`, never a concrete provider.
 */
export interface Session {
  user: AccountIdentity;
  provider: AuthProviderId;
  /** True for the DEVELOPMENT-ONLY provider - the UI says so. */
  isDevelopment: boolean;
}

export type SignInOutcome = 'signed_in' | 'cancelled';

export interface MobileAuthProvider {
  readonly id: AuthProviderId;
  /** Credentials the API expects on every request (empty when signed out). */
  getApiHeaders(): Promise<Record<string, string>>;
  /** Interactive sign-in / sign-up (absent for development auth, which signs in automatically). */
  signIn?(): Promise<SignInOutcome>;
  /** Forgets the session on this device (absent for development auth). */
  signOut?(): Promise<void>;
}
