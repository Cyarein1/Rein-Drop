import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readEntraWebConfig } from "./config";
import { sealTokens } from "./cookies";
import { API_CLIENT, CONFIG, fakeEntra, METADATA, TENANT, WEB_CLIENT } from "./fake-entra.test-helper";
import { entraConfiguration, finishSignIn, refreshSession, signOutUrl, startSignIn } from "./oidc";
import { entraProxy } from "./proxy";
import { REFRESH_COOKIE, safeNextPath, seal, SESSION_COOKIE, sessionState, unseal, type WebSession } from "./session";

const NOW = 1_800_000_000_000;
const session = (o: Partial<WebSession> = {}): WebSession => ({
  accessToken: "access-1",
  accessTokenExpiresAt: NOW + 3_600_000,
  createdAt: NOW - 1000,
  expiresAt: NOW + 7 * 86_400_000,
  ...o,
});

describe("session cookies", () => {
  const secret = "s".repeat(40);

  it("round-trips sealed data and rejects tampering, another secret, another purpose and expiry", async () => {
    const sealed = await seal("session", session(), secret, 60);
    expect(await unseal("session", sealed, secret)).toEqual(session());
    expect(sealed).not.toContain("access-1"); // encrypted, not just signed
    expect(await unseal("session", `${sealed.slice(0, -4)}AAAA`, secret)).toBeNull();
    expect(await unseal("session", sealed, "t".repeat(40))).toBeNull();
    expect(await unseal("refresh", sealed, secret)).toBeNull();
    expect(await unseal("session", undefined, secret)).toBeNull();
    vi.useFakeTimers({ now: Date.now() + 120_000 });
    try {
      expect(await unseal("session", sealed, secret)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("only allows same-origin return paths", () => {
    expect(safeNextPath("/deals/1?x=2")).toBe("/deals/1?x=2");
    for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/a\r\nSet-Cookie: x"]) {
      expect(safeNextPath(bad)).toBe("/home");
    }
  });

  it("knows when to refresh and when the session is over", () => {
    expect(sessionState(session(), NOW)).toBe("valid");
    expect(sessionState(session({ accessTokenExpiresAt: NOW + 60_000 }), NOW)).toBe("refresh");
    expect(sessionState(session({ expiresAt: NOW }), NOW)).toBe("expired");
    expect(sessionState(null, NOW)).toBe("expired");
  });
});

describe("web Entra config", () => {
  const env = {
    ENTRA_AUTHORITY: "https://reindrop.ciamlogin.com",
    ENTRA_TENANT_ID: TENANT,
    ENTRA_WEB_CLIENT_ID: WEB_CLIENT,
    ENTRA_WEB_CLIENT_SECRET: "secret",
    ENTRA_API_CLIENT_ID: API_CLIENT,
    APP_BASE_URL: "http://localhost:3000/",
    AUTH_SESSION_SECRET: "x".repeat(32),
  };

  it("reads the settings, derives the API scope and defaults to a 7-day session", () => {
    expect(readEntraWebConfig(env)).toEqual({ ok: true, config: { ...CONFIG, clientSecret: "secret", sessionSecret: "x".repeat(32) } });
  });

  it("names every missing or invalid variable (never their values)", () => {
    const result = readEntraWebConfig({ ...env, ENTRA_WEB_CLIENT_SECRET: "", AUTH_SESSION_SECRET: "short", ENTRA_TENANT_ID: "contoso" });
    expect(result).toEqual({ ok: false, reason: "Sign-in is not configured: set ENTRA_TENANT_ID (GUID), ENTRA_WEB_CLIENT_SECRET, AUTH_SESSION_SECRET (32+ characters)." });
  });
});

describe("OIDC against a fake Entra External ID tenant", () => {
  it("starts sign-in with PKCE (S256), state, nonce, the API scope and offline access", async () => {
    const entra = await fakeEntra();
    const { url, flow } = await startSignIn(await entraConfiguration(CONFIG, entra.fetch), CONFIG, "/deals");
    expect(`${url.origin}${url.pathname}`).toBe(METADATA.authorization_endpoint);
    const p = url.searchParams;
    expect(Object.fromEntries(p)).toMatchObject({
      client_id: WEB_CLIENT,
      redirect_uri: "http://localhost:3000/auth/callback",
      response_type: "code",
      scope: `openid profile offline_access api://${API_CLIENT}/access_as_user`,
      code_challenge_method: "S256",
      state: flow.state,
      nonce: flow.nonce,
    });
    expect(p.get("code_challenge")).not.toBe(flow.codeVerifier);
    expect(flow.next).toBe("/deals");
    expect(url.toString()).not.toContain(CONFIG.clientSecret);
  });

  it("redeems the code into a session (access token + refresh token, absolute expiry)", async () => {
    const entra = await fakeEntra();
    const oidc = await entraConfiguration(CONFIG, entra.fetch);
    const { url, flow } = await startSignIn(oidc, CONFIG, "/home");
    const tokens = await finishSignIn(oidc, CONFIG, entra.approve(url), flow, NOW);
    expect(tokens).toEqual({
      session: { accessToken: "access-1", accessTokenExpiresAt: NOW + 3_600_000, createdAt: NOW, expiresAt: NOW + CONFIG.sessionMaxAgeSeconds * 1000 },
      refreshToken: "refresh-1",
    });
  });

  it("refuses a callback whose state, nonce or PKCE verifier doesn't match", async () => {
    const entra = await fakeEntra();
    const oidc = await entraConfiguration(CONFIG, entra.fetch);
    const { url, flow } = await startSignIn(oidc, CONFIG, "/home");
    const callback = entra.approve(url);
    await expect(finishSignIn(oidc, CONFIG, callback, { ...flow, state: "forged" }, NOW)).rejects.toThrow();
    await expect(finishSignIn(oidc, CONFIG, entra.approve(url), { ...flow, codeVerifier: "x".repeat(43) }, NOW)).rejects.toThrow();
    const badNonce = await fakeEntra({ idTokenNonce: "replayed" });
    const oidc2 = await entraConfiguration(CONFIG, badNonce.fetch);
    const second = await startSignIn(oidc2, CONFIG, "/home");
    await expect(finishSignIn(oidc2, CONFIG, badNonce.approve(second.url), second.flow, NOW)).rejects.toThrow();
  });

  it("refreshes without extending the absolute expiry, and builds the end-session URL", async () => {
    const entra = await fakeEntra();
    const oidc = await entraConfiguration(CONFIG, entra.fetch);
    const s = session();
    expect(await refreshSession(oidc, CONFIG, s, "refresh-1", NOW + 10)).toEqual({
      session: { accessToken: "access-2", accessTokenExpiresAt: NOW + 10 + 3_600_000, createdAt: s.createdAt, expiresAt: s.expiresAt },
      refreshToken: "refresh-2",
    });
    const logout = signOutUrl(oidc, CONFIG)!;
    expect(`${logout.origin}${logout.pathname}`).toBe(METADATA.end_session_endpoint);
    expect(logout.searchParams.get("post_logout_redirect_uri")).toBe("http://localhost:3000/sign-in?signed_out=1");
  });

  it("refuses discovery documents from another tenant", async () => {
    const wrong = (async () => Response.json({ ...METADATA, issuer: "https://evil.example/v2.0" })) as typeof fetch;
    await expect(entraConfiguration(CONFIG, wrong)).rejects.toThrow(/Unexpected issuer/);
  });
});

describe("entraProxy (session upkeep before protected pages)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const request = (cookies: Record<string, string>) => {
    const req = new NextRequest("http://localhost:3000/deals?tab=new");
    for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
    return req;
  };
  const cookieHeader = (res: Response) => res.headers.getSetCookie().join("\n");

  it("lets a valid session through untouched", async () => {
    const sealed = await sealTokens(CONFIG, { session: session(), refreshToken: "refresh-1" }, NOW);
    const res = await entraProxy(request({ [SESSION_COOKIE]: sealed.session }), CONFIG, NOW);
    expect(res.headers.get("location")).toBeNull();
    expect(cookieHeader(res)).toBe("");
  });

  it("sends visitors without a session to sign-in, keeping where they were going", async () => {
    const res = await entraProxy(request({}), CONFIG, NOW);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/sign-in");
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe("/deals?tab=new");
  });

  it("ends a session past its absolute expiry and clears the cookies", async () => {
    const sealed = await sealTokens(CONFIG, { session: session({ expiresAt: NOW + 1000 }), refreshToken: "refresh-1" }, NOW);
    const res = await entraProxy(request({ [SESSION_COOKIE]: sealed.session, [REFRESH_COOKIE]: sealed.refresh! }), CONFIG, NOW + 2000);
    expect(new URL(res.headers.get("location")!).searchParams.get("reason")).toBe("expired");
    expect(cookieHeader(res)).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
    expect(cookieHeader(res)).toMatch(new RegExp(`${REFRESH_COOKIE}=;`));
  });

  it("refreshes an expiring access token for this request and the browser (httpOnly, SameSite=Lax)", async () => {
    const entra = await fakeEntra();
    vi.stubGlobal("fetch", entra.fetch);
    const sealed = await sealTokens(CONFIG, { session: session({ accessTokenExpiresAt: NOW + 60_000 }), refreshToken: "refresh-1" }, NOW);
    const req = request({ [SESSION_COOKIE]: sealed.session, [REFRESH_COOKIE]: sealed.refresh! });
    const res = await entraProxy(req, CONFIG, NOW);
    expect(res.headers.get("location")).toBeNull();
    const fresh = await unseal<WebSession>("session", req.cookies.get(SESSION_COOKIE)?.value, CONFIG.sessionSecret);
    expect(fresh?.accessToken).toBe("access-2");
    expect(cookieHeader(res)).toMatch(/rd_session=[^;]+;.*HttpOnly/i);
    expect(cookieHeader(res)).toMatch(/SameSite=lax/i);
  });

  it("ends the session when the refresh token is refused", async () => {
    const entra = await fakeEntra({ refreshFails: true });
    vi.stubGlobal("fetch", entra.fetch);
    const sealed = await sealTokens(CONFIG, { session: session({ accessTokenExpiresAt: NOW - 1 }), refreshToken: "refresh-1" }, NOW);
    const res = await entraProxy(request({ [SESSION_COOKIE]: sealed.session, [REFRESH_COOKIE]: sealed.refresh! }), CONFIG, NOW);
    expect(new URL(res.headers.get("location")!).searchParams.get("reason")).toBe("expired");
  });
});
