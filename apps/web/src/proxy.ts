import { NextResponse, type NextRequest } from "next/server";
import { entraProxy } from "@/auth/entra/proxy";
import { getAuthSetup } from "@/auth/provider";

/**
 * Route gate for the app (Next.js Proxy). It never calls the API or database; the real check is
 * `verifySession()` in every protected page. With Entra it also keeps the session cookies fresh
 * (refreshing an expiring access token - the only Entra call made here) and ends expired sessions.
 */
export async function proxy(request: NextRequest) {
  const setup = getAuthSetup();
  if (setup.ok && setup.entra) return entraProxy(request, setup.entra);
  if (!setup.ok || !setup.provider.mightBeAuthenticated(request)) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
}

/** Application routes only - public pages (/sign-in, /dev), assets and images are excluded. */
export const config = {
  matcher: [
    "/home/:path*",
    "/onboarding/:path*",
    "/hunts/:path*",
    "/deals/:path*",
    "/alerts/:path*",
    "/analytics/:path*",
    "/inventory/:path*",
    "/settings/:path*",
  ],
};
