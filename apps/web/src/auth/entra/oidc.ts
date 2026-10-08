import * as client from "openid-client";
import { entraDiscoveryUrl } from "@rein-drop/api-client";
import { nextTokenSession } from "@rein-drop/client-core";
import type { EntraWebConfig } from "./config";
import type { AuthFlow, WebSession } from "./session";

/**
 * OpenID Connect against Microsoft Entra External ID (authorization code flow with PKCE, a
 * confidential web client). Email + password sign-up / sign-in, verification and password reset
 * happen on the tenant's hosted (brandable) pages; we only start the flow and receive the code.
 *
 * Discovery: Entra publishes its issuer as https://<tenant-id>.ciamlogin.com/<tenant-id>/v2.0 while
 * the document is served from the tenant's subdomain, so the metadata is fetched here and handed to
 * openid-client as-is; ID tokens are then checked against that real issuer (iss, aud, nonce, exp).
 */

type FetchLike = typeof fetch;

export const SIGN_IN_SCOPES = (apiScope: string) => `openid profile offline_access ${apiScope}`;
export const callbackUrl = (config: EntraWebConfig) => `${config.appBaseUrl}/auth/callback`;
export const signedOutUrl = (config: EntraWebConfig) => `${config.appBaseUrl}/sign-in?signed_out=1`;

const configurations = new Map<string, Promise<client.Configuration>>();

/** The tenant's OIDC client configuration (cached per tenant + client; retried after a failure). */
export function entraConfiguration(config: EntraWebConfig, fetchImpl?: FetchLike): Promise<client.Configuration> {
  const key = `${config.authority}|${config.tenantId}|${config.clientId}`;
  let pending = fetchImpl ? undefined : configurations.get(key);
  if (!pending) {
    pending = discover(config, fetchImpl ?? fetch);
    if (!fetchImpl) {
      configurations.set(key, pending);
      pending.catch(() => configurations.delete(key));
    }
  }
  return pending;
}

async function discover(config: EntraWebConfig, fetchImpl: FetchLike): Promise<client.Configuration> {
  const res = await fetchImpl(entraDiscoveryUrl(config.authority, config.tenantId), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Entra OpenID configuration returned HTTP ${res.status}`);
  const metadata = (await res.json()) as client.ServerMetadata;
  for (const field of ["issuer", "authorization_endpoint", "token_endpoint"] as const) {
    if (typeof metadata[field] !== "string") throw new Error(`Entra OpenID configuration has no ${field}`);
  }
  if (!metadata.issuer.includes(config.tenantId)) throw new Error(`Unexpected issuer ${metadata.issuer}`);
  const configuration = new client.Configuration(metadata, config.clientId, undefined, client.ClientSecretPost(config.clientSecret));
  if (fetchImpl !== fetch) configuration[client.customFetch] = fetchImpl as never;
  return configuration;
}

/** Where to send the browser to sign in or sign up, and the secrets to keep until it returns. */
export async function startSignIn(oidc: client.Configuration, config: EntraWebConfig, next: string): Promise<{ url: URL; flow: AuthFlow }> {
  const flow: AuthFlow = { state: client.randomState(), nonce: client.randomNonce(), codeVerifier: client.randomPKCECodeVerifier(), next };
  const url = client.buildAuthorizationUrl(oidc, {
    redirect_uri: callbackUrl(config),
    scope: SIGN_IN_SCOPES(config.apiScope),
    response_type: "code",
    response_mode: "query",
    code_challenge: await client.calculatePKCECodeChallenge(flow.codeVerifier),
    code_challenge_method: "S256",
    state: flow.state,
    nonce: flow.nonce,
  });
  return { url, flow };
}

export interface Tokens {
  session: WebSession;
  refreshToken: string | null;
}

function toTokens(response: client.TokenEndpointResponse, config: EntraWebConfig, now: number, previous: WebSession | null, previousRefresh: string | null): Tokens {
  if (!response.access_token) throw new Error("Entra returned no access token");
  return {
    session: nextTokenSession(previous, { accessToken: response.access_token, expiresInSeconds: response.expires_in }, now, config.sessionMaxAgeSeconds * 1000),
    // Entra rotates refresh tokens; keep the old one if a response has none.
    refreshToken: response.refresh_token ?? previousRefresh,
  };
}

/** Validates the callback (state, PKCE, ID token nonce / issuer / audience) and redeems the code. */
export async function finishSignIn(oidc: client.Configuration, config: EntraWebConfig, currentUrl: URL, flow: AuthFlow, now: number): Promise<Tokens> {
  const response = await client.authorizationCodeGrant(oidc, currentUrl, {
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    pkceCodeVerifier: flow.codeVerifier,
    idTokenExpected: true,
  });
  return toTokens(response, config, now, null, null);
}

/** A new access token for the same session (absolute expiry unchanged). */
export async function refreshSession(oidc: client.Configuration, config: EntraWebConfig, session: WebSession, refreshToken: string, now: number): Promise<Tokens> {
  const response = await client.refreshTokenGrant(oidc, refreshToken, { scope: SIGN_IN_SCOPES(config.apiScope) });
  return toTokens(response, config, now, session, refreshToken);
}

/** Entra's end-session URL, returning to our sign-in page; null when the tenant publishes none. */
export function signOutUrl(oidc: client.Configuration, config: EntraWebConfig): URL | null {
  if (!oidc.serverMetadata().end_session_endpoint) return null;
  return client.buildEndSessionUrl(oidc, { post_logout_redirect_uri: signedOutUrl(config) });
}
