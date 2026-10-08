import { createHash } from "node:crypto";
import { generateKeyPair, SignJWT, type KeyObject } from "jose";
import type { EntraWebConfig } from "./config";

/**
 * A fake Entra External ID tenant for tests: the OpenID configuration (issuer in tenant-ID form,
 * served from the subdomain host, like the real one) and a token endpoint that checks the code,
 * PKCE verifier, client secret and redirect URI, and issues signed ID tokens.
 */
export const TENANT = "11111111-2222-3333-4444-555555555555";
export const WEB_CLIENT = "22222222-3333-4444-5555-666666666666";
export const API_CLIENT = "33333333-4444-5555-6666-777777777777";
const HOST = "https://reindrop.ciamlogin.com";

export const CONFIG: EntraWebConfig = {
  authority: HOST,
  tenantId: TENANT,
  clientId: WEB_CLIENT,
  clientSecret: "web-client-secret",
  apiScope: `api://${API_CLIENT}/access_as_user`,
  appBaseUrl: "http://localhost:3000",
  sessionSecret: "x".repeat(40),
  sessionMaxAgeSeconds: 7 * 24 * 3600,
};

export const METADATA = {
  issuer: `https://${TENANT}.ciamlogin.com/${TENANT}/v2.0`,
  authorization_endpoint: `${HOST}/${TENANT}/oauth2/v2.0/authorize`,
  token_endpoint: `${HOST}/${TENANT}/oauth2/v2.0/token`,
  end_session_endpoint: `${HOST}/${TENANT}/oauth2/v2.0/logout`,
  jwks_uri: `${HOST}/${TENANT}/discovery/v2.0/keys`,
  response_types_supported: ["code"],
  id_token_signing_alg_values_supported: ["RS256"],
};

interface PendingCode {
  challenge: string;
  nonce: string;
  redirectUri: string;
}

export async function fakeEntra(o: { idTokenNonce?: string; refreshFails?: boolean } = {}) {
  const key = (await generateKeyPair("RS256")).privateKey as KeyObject;
  const codes = new Map<string, PendingCode>();
  const calls: { url: string; body: URLSearchParams | null }[] = [];
  let n = 0;

  const idToken = (nonce: string) =>
    new SignJWT({ nonce: o.idTokenNonce ?? nonce, oid: "99999999-8888-7777-6666-555555555555", tid: TENANT, email: "thandi@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(METADATA.issuer)
      .setAudience(WEB_CLIENT)
      .setSubject("pairwise-sub")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = init?.body ? new URLSearchParams(String(init.body)) : null;
    calls.push({ url, body });
    if (url === `${HOST}/${TENANT}/v2.0/.well-known/openid-configuration`) return Response.json(METADATA);
    if (url === METADATA.token_endpoint && body) {
      if (body.get("client_id") !== WEB_CLIENT || body.get("client_secret") !== CONFIG.clientSecret) return Response.json({ error: "invalid_client" }, { status: 401 });
      if (body.get("grant_type") === "authorization_code") {
        const pending = codes.get(body.get("code") ?? "");
        const verifier = body.get("code_verifier") ?? "";
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        if (!pending || pending.challenge !== challenge || pending.redirectUri !== body.get("redirect_uri")) return Response.json({ error: "invalid_grant" }, { status: 400 });
        codes.delete(body.get("code")!);
        return Response.json({ token_type: "Bearer", access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, scope: body.get("scope") ?? "", id_token: await idToken(pending.nonce) });
      }
      if (body.get("grant_type") === "refresh_token") {
        if (o.refreshFails || body.get("refresh_token") !== "refresh-1") return Response.json({ error: "invalid_grant", error_description: "AADSTS70000" }, { status: 400 });
        return Response.json({ token_type: "Bearer", access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 });
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof globalThis.fetch;

  /** What the hosted page does after the user signs in: redirect back with a code. */
  const approve = (authorizationUrl: URL) => {
    const code = `code-${++n}`;
    const p = authorizationUrl.searchParams;
    codes.set(code, { challenge: p.get("code_challenge")!, nonce: p.get("nonce")!, redirectUri: p.get("redirect_uri")! });
    return new URL(`${p.get("redirect_uri")}?code=${code}&state=${encodeURIComponent(p.get("state")!)}`);
  };

  return { fetch: fetchImpl, approve, calls };
}
