import { DEFAULT_SESSION_MAX_AGE_HOURS } from '@rein-drop/client-core';
import { DEV_AUTH_HEADER, DEV_AUTH_SUBJECT } from '@rein-drop/api-client';
import { createEntraMobileAuthProvider } from './entra-provider';
import type { MobileAuthProvider } from './types';

/**
 * DEVELOPMENT-ONLY mobile auth: no sign-in screen, no passwords. Every request names the seeded
 * local user via the dev header; the API verifies it with its DevAuthProvider (local network
 * only, refused in production). `__DEV__` is a build-time constant, so release bundles drop it.
 */
const createDevMobileAuthProvider: (() => MobileAuthProvider) | undefined = __DEV__
  ? () => {
      const headers = { [DEV_AUTH_HEADER]: DEV_AUTH_SUBJECT };
      return { id: 'dev', getApiHeaders: async () => headers };
    }
  : undefined;

export type AuthSetup = { ok: true; provider: MobileAuthProvider } | { ok: false; reason: string };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chooses the auth provider from EXPO_PUBLIC_AUTH_PROVIDER (inlined at build time; referenced
 * literally so Expo can inline them). Development default: dev. Release builds: entra only.
 */
function resolve(): AuthSetup {
  const chosen = process.env.EXPO_PUBLIC_AUTH_PROVIDER?.trim() || (__DEV__ ? 'dev' : 'entra');
  if (chosen === 'dev') {
    if (!createDevMobileAuthProvider) return { ok: false, reason: 'Development sign-in is not available in this build.' };
    return { ok: true, provider: createDevMobileAuthProvider() };
  }
  if (chosen !== 'entra') return { ok: false, reason: `Unknown auth provider "${chosen}".` };

  const authority = process.env.EXPO_PUBLIC_ENTRA_AUTHORITY?.trim();
  const tenantId = process.env.EXPO_PUBLIC_ENTRA_TENANT_ID?.trim();
  const clientId = process.env.EXPO_PUBLIC_ENTRA_MOBILE_CLIENT_ID?.trim();
  const apiClientId = process.env.EXPO_PUBLIC_ENTRA_API_CLIENT_ID?.trim();
  const hours = Number(process.env.EXPO_PUBLIC_AUTH_SESSION_MAX_AGE_HOURS?.trim() || DEFAULT_SESSION_MAX_AGE_HOURS);
  const missing = [
    !authority?.startsWith('https://') && 'EXPO_PUBLIC_ENTRA_AUTHORITY',
    !(tenantId && GUID.test(tenantId)) && 'EXPO_PUBLIC_ENTRA_TENANT_ID',
    !(clientId && GUID.test(clientId)) && 'EXPO_PUBLIC_ENTRA_MOBILE_CLIENT_ID',
    !(apiClientId && GUID.test(apiClientId)) && 'EXPO_PUBLIC_ENTRA_API_CLIENT_ID',
  ].filter(Boolean);
  if (missing.length > 0) return { ok: false, reason: `Sign-in is not configured in this build (${missing.join(', ')}).` };
  return {
    ok: true,
    provider: createEntraMobileAuthProvider({
      authority: authority!,
      tenantId: tenantId!.toLowerCase(),
      clientId: clientId!,
      apiClientId: apiClientId!.toLowerCase(),
      sessionMaxAgeHours: Number.isInteger(hours) && hours > 0 && hours <= 720 ? hours : DEFAULT_SESSION_MAX_AGE_HOURS,
    }),
  };
}

export const authSetup: AuthSetup = resolve();
