import Constants from 'expo-constants';
import { ApiError, createApiClient, type ApiClient } from '@rein-drop/api-client';
import { authSetup } from '@/auth/provider';
import { resolveApiBaseUrl, type ResolvedApiBaseUrl } from './api-base-url';

/**
 * Resolved once at startup. EXPO_PUBLIC_* values must be referenced literally so
 * Expo can inline them into the bundle.
 */
export const apiBaseUrl: ResolvedApiBaseUrl = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  envPort: process.env.EXPO_PUBLIC_API_PORT,
  hostUri: Constants.expoConfig?.hostUri,
  isDev: __DEV__,
});

let client: ApiClient | null = null;
const unauthorizedListeners = new Set<() => void>();

/**
 * Called when the API answers 401 to a signed-in request (session ended, token revoked or the
 * session's absolute end passed). The session provider uses it to send the person to sign-in.
 */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/**
 * Shared API client, sending credentials from the active auth provider on every
 * request. Throws ApiError with an actionable message when no URL is configured.
 */
export function getApiClient(): ApiClient {
  if (!apiBaseUrl.url) {
    throw new ApiError(`API base URL is not configured: ${apiBaseUrl.detail}`);
  }
  client ??= createApiClient({
    baseUrl: apiBaseUrl.url,
    // Item events (the inventory timeline) record that a change was made on the phone.
    platform: 'mobile',
    getHeaders: () => (authSetup.ok ? authSetup.provider.getApiHeaders() : {}),
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      if (response.status === 401) unauthorizedListeners.forEach((listener) => listener());
      return response;
    },
  });
  return client;
}
