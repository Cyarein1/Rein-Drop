import type { AccountIdentity, AuthProviderId } from '@rein-drop/api-client';
import type { MessageKey } from '@rein-drop/i18n';

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

/** An error whose text the UI shows in its own language (`messageKey`); `message` is the English text for logs. */
export class TranslatableError extends Error {
  constructor(
    message: string,
    readonly messageKey: MessageKey,
  ) {
    super(message);
    this.name = 'TranslatableError';
  }
}

/** The session is kept, but its token couldn't be refreshed because the sign-in service is unreachable. */
export class SignInServiceUnreachable extends TranslatableError {
  constructor() {
    super("Couldn't reach the sign-in service. Check your connection - you're still signed in.", 'errors.signInServiceUnreachable');
    this.name = 'SignInServiceUnreachable';
  }
}

/** The browser sign-in came back without a result. */
export class SignInIncomplete extends TranslatableError {
  constructor() {
    super('Sign-in did not complete. Please try again.', 'auth.signInIncomplete');
    this.name = 'SignInIncomplete';
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
