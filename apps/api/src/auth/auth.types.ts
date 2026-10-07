import type { AuthProviderId } from '@rein-drop/contracts';

/**
 * The auth boundary. Everything outside src/auth depends only on these types and
 * AuthService - never on a concrete provider - so the managed provider (TBD)
 * can replace DevAuthProvider without touching modules.
 */

/** What a provider may inspect. Deliberately framework-free. */
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  /** Socket peer address (no proxy headers are trusted). */
  remoteAddress: string | undefined;
}

/** The authenticated caller, resolved to an internal Rein Drop user. */
export interface Principal {
  /** Internal User.id. */
  userId: string;
  email: string;
  displayName: string | null;
  provider: AuthProviderId;
  /** The provider's id for the user (User.authSubject). */
  subject: string;
}

export type AuthResult =
  | { status: 'authenticated'; principal: Principal }
  /** No (valid) credentials -> 401. */
  | { status: 'anonymous'; reason: string }
  /** Credentials present but not acceptable here -> 403. */
  | { status: 'forbidden'; reason: string };

export interface AuthProvider {
  readonly id: AuthProviderId;
  authenticate(request: AuthRequest): Promise<AuthResult>;
}

/** Injection token for the active AuthProvider implementation. */
export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');
