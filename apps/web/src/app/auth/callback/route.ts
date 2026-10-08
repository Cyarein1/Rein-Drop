import { NextResponse, type NextRequest } from "next/server";
import { sealTokens, setSessionCookies } from "@/auth/entra/cookies";
import { callbackUrl, entraConfiguration, finishSignIn } from "@/auth/entra/oidc";
import { FLOW_COOKIE, unseal, type AuthFlow } from "@/auth/entra/session";
import { getAuthSetup } from "@/auth/provider";

/**
 * Entra redirects here with the authorization code. The code is redeemed only when the state,
 * PKCE verifier and ID token nonce match the flow this browser started; then the session cookies
 * are set and the user continues where they were going.
 */
export async function GET(request: NextRequest) {
  const setup = getAuthSetup();
  if (!setup.ok || !setup.entra) return NextResponse.redirect(new URL("/sign-in", request.url));
  const config = setup.entra;
  const fail = (error: string) => {
    const response = NextResponse.redirect(new URL(`/sign-in?error=${error}`, config.appBaseUrl));
    response.cookies.delete(FLOW_COOKIE);
    return response;
  };

  const params = request.nextUrl.searchParams;
  // The user cancelled on the hosted page, or Entra refused (details stay out of the URL).
  if (params.get("error")) return fail(params.get("error") === "access_denied" ? "cancelled" : "failed");
  const flow = await unseal<AuthFlow>("flow", request.cookies.get(FLOW_COOKIE)?.value, config.sessionSecret);
  if (!flow) return fail("expired");

  try {
    const now = Date.now();
    // Our registered redirect URI + the response parameters (independent of proxies in front of us).
    const current = new URL(`${callbackUrl(config)}${request.nextUrl.search}`);
    const tokens = await finishSignIn(await entraConfiguration(config), config, current, flow, now);
    const response = NextResponse.redirect(new URL(flow.next, config.appBaseUrl));
    setSessionCookies(response.cookies, config, await sealTokens(config, tokens, now));
    response.cookies.delete(FLOW_COOKIE);
    return response;
  } catch {
    return fail("failed");
  }
}
