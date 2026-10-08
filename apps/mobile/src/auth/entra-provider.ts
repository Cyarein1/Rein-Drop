import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { entraApiScope, entraDiscoveryUrl } from '@rein-drop/api-client';
import { nextTokenSession, tokenSessionState, type TokenSession } from '@rein-drop/client-core';
import type { MobileAuthProvider, SignInOutcome } from './types';

/**
 * Microsoft Entra External ID on mobile (decision 0013): authorization code + PKCE as a public
 * client, in the system browser (email + password on the tenant's hosted page). Tokens live in the
 * device keychain / keystore (expo-secure-store), never in plain storage.
 */
export interface EntraMobileConfig {
  authority: string;
  tenantId: string;
  /** Application (client) ID of the mobile app registration (public client - no secret). */
  clientId: string;
  /** Application (client) ID of the Rein Drop API registration. */
  apiClientId: string;
  sessionMaxAgeHours: number;
}

const STORE_KEY = 'rd.entra.session';
interface Stored {
  session: TokenSession;
  refreshToken: string | null;
}

// Completes a pending web auth session (no-op on iOS / Android).
WebBrowser.maybeCompleteAuthSession();

export function createEntraMobileAuthProvider(config: EntraMobileConfig): MobileAuthProvider {
  const scopes = ['openid', 'profile', 'offline_access', entraApiScope(config.apiClientId)];
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'reindrop', path: 'auth' });
  const maxAgeMs = config.sessionMaxAgeHours * 3_600_000;
  let discovery: Promise<AuthSession.DiscoveryDocument> | null = null;
  let refreshing: Promise<Stored | null> | null = null;

  /** The tenant's endpoints (fetched directly: Entra's issuer and discovery host differ). */
  function endpoints(): Promise<AuthSession.DiscoveryDocument> {
    discovery ??= fetch(entraDiscoveryUrl(config.authority, config.tenantId))
      .then(async (res) => {
        if (!res.ok) throw new Error(`Sign-in service returned HTTP ${res.status}`);
        const doc = (await res.json()) as { authorization_endpoint?: string; token_endpoint?: string; end_session_endpoint?: string };
        if (!doc.authorization_endpoint || !doc.token_endpoint) throw new Error('Sign-in service configuration is incomplete');
        return { authorizationEndpoint: doc.authorization_endpoint, tokenEndpoint: doc.token_endpoint, endSessionEndpoint: doc.end_session_endpoint };
      })
      .catch((err: unknown) => {
        discovery = null;
        throw err;
      });
    return discovery;
  }

  async function load(): Promise<Stored | null> {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Stored;
    } catch {
      return null;
    }
  }
  const save = (stored: Stored) => SecureStore.setItemAsync(STORE_KEY, JSON.stringify(stored));
  const clear = () => SecureStore.deleteItemAsync(STORE_KEY);

  /** The stored session, refreshed when its access token is about to expire; null = signed out. */
  async function current(): Promise<Stored | null> {
    const stored = await load();
    const state = tokenSessionState(stored?.session ?? null, Date.now());
    if (state === 'valid') return stored;
    if (state === 'expired' || !stored?.refreshToken) {
      if (stored) await clear();
      return null;
    }
    // One refresh at a time, however many requests are waiting.
    refreshing ??= (async () => {
      try {
        const token = await AuthSession.refreshAsync({ clientId: config.clientId, refreshToken: stored.refreshToken!, scopes }, await endpoints());
        const next: Stored = {
          session: nextTokenSession(stored.session, { accessToken: token.accessToken, expiresInSeconds: token.expiresIn }, Date.now(), maxAgeMs),
          refreshToken: token.refreshToken ?? stored.refreshToken,
        };
        await save(next);
        return next;
      } catch {
        // Refused (revoked / expired) or offline: sign in again.
        await clear();
        return null;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  return {
    id: 'entra',
    async getApiHeaders(): Promise<Record<string, string>> {
      const stored = await current();
      return stored ? { authorization: `Bearer ${stored.session.accessToken}` } : {};
    },
    async signIn(): Promise<SignInOutcome> {
      const doc = await endpoints();
      const request = new AuthSession.AuthRequest({ clientId: config.clientId, scopes, redirectUri, usePKCE: true, responseType: AuthSession.ResponseType.Code });
      // promptAsync checks the returned state against the request's.
      const result = await request.promptAsync(doc);
      if (result.type === 'cancel' || result.type === 'dismiss') return 'cancelled';
      if (result.type !== 'success' || !result.params.code) throw new Error('Sign-in did not complete. Please try again.');
      const token = await AuthSession.exchangeCodeAsync(
        { clientId: config.clientId, code: result.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier! }, scopes },
        doc,
      );
      await save({
        session: nextTokenSession(null, { accessToken: token.accessToken, expiresInSeconds: token.expiresIn }, Date.now(), maxAgeMs),
        refreshToken: token.refreshToken ?? null,
      });
      return 'signed_in';
    },
    async signOut() {
      await clear();
      // End the browser session at Entra too, so the next sign-in asks for the password again.
      try {
        const doc = await endpoints();
        if (doc.endSessionEndpoint) {
          const url = `${doc.endSessionEndpoint}?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
          await WebBrowser.openAuthSessionAsync(url, redirectUri);
        }
      } catch {
        // Local sign-out already happened.
      }
    },
  };
}
