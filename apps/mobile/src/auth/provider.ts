import { DEV_AUTH_HEADER, DEV_AUTH_SUBJECT } from '@rein-drop/api-client';
import type { MobileAuthProvider } from './types';

/**
 * DEVELOPMENT-ONLY mobile auth: no sign-in screen, no passwords. Every request
 * names the seeded local user via the dev header; the API verifies it with its
 * DevAuthProvider (local network only, refused in production).
 */
function createDevMobileAuthProvider(): MobileAuthProvider {
  if (!__DEV__) {
    throw new Error('The development auth provider must never run in a release build');
  }
  const headers = { [DEV_AUTH_HEADER]: DEV_AUTH_SUBJECT };
  return { id: 'dev', getApiHeaders: async () => headers };
}

export type AuthSetup = { ok: true; provider: MobileAuthProvider } | { ok: false; reason: string };

/**
 * Release builds have no auth provider until the managed provider is chosen, so
 * they cannot sign in - by design. TODO(auth): add the managed provider here.
 */
export const authSetup: AuthSetup = __DEV__
  ? { ok: true, provider: createDevMobileAuthProvider() }
  : { ok: false, reason: 'Sign-in is not available in this build yet.' };
