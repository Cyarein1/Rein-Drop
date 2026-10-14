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

/** The session is kept, but its token couldn't be refreshed because the sign-in service is unreachable. */
export class SignInServiceUnreachable extends Error {
  constructor() {
    super("Couldn't reach the sign-in service. Check your connection - you're still signed in.");
    this.name = 'SignInServiceUnreachable';
  }
}

export interface MobileAuthProvider {
  readonly id: AuthProviderId;
  /** Credentials the API expects on every request (empty when signed out). */
  getApiHeaders(): Promise<Record<string, string>>;
  /** Interactive sign-in / sign-up (absent for development auth, which signs in automatically). */
  signIn?(): Promise<SignInOutcome>;
  /** Forgets the session on this device (absent for development auth). */
  signOut?(): Promise<void>;
}
