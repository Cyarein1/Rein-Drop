import Constants from 'expo-constants';
import { ApiError, createApiClient, type ApiClient } from '@rein-drop/api-client';
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

/** Shared API client. Throws ApiError with an actionable message when no URL is configured. */
export function getApiClient(): ApiClient {
  if (!apiBaseUrl.url) {
    throw new ApiError(`API base URL is not configured: ${apiBaseUrl.detail}`);
  }
  // TODO(auth): pass getHeaders once the auth provider is chosen.
  client ??= createApiClient({ baseUrl: apiBaseUrl.url });
  return client;
}
