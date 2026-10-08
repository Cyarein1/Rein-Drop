import { NextResponse, type NextRequest } from "next/server";
import { entraConfiguration, startSignIn } from "@/auth/entra/oidc";
import { cookieOptions, FLOW_COOKIE, FLOW_TTL_SECONDS, safeNextPath, seal } from "@/auth/entra/session";
import { getAuthSetup } from "@/auth/provider";

/**
 * Starts sign-in / sign-up: remembers PKCE verifier, state, nonce and the return path in a short-lived
 * encrypted cookie, then sends the browser to the Entra External ID hosted page (email + password).
 */
export async function GET(request: NextRequest) {
  const setup = getAuthSetup();
  if (!setup.ok || !setup.entra) return NextResponse.redirect(new URL("/sign-in", request.url));
  const config = setup.entra;
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  try {
    const { url, flow } = await startSignIn(await entraConfiguration(config), config, next);
    const response = NextResponse.redirect(url);
    response.cookies.set(FLOW_COOKIE, await seal("flow", flow, config.sessionSecret, FLOW_TTL_SECONDS), cookieOptions(config.appBaseUrl, FLOW_TTL_SECONDS));
    return response;
  } catch {
    return NextResponse.redirect(new URL("/sign-in?error=unavailable", config.appBaseUrl));
  }
}
