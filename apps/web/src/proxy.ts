import { NextResponse, type NextRequest } from "next/server";
import { entraLandingProxy, entraProxy } from "@/auth/entra/proxy";
import { getAuthSetup } from "@/auth/provider";

/**
 * Route gate for the app (Next.js Proxy). It never calls the API or database; the real check is
 * `verifySession()` in every protected page. With Entra it also keeps the session cookies fresh
 * (refreshing an expiring access token - the only Entra call made here) and ends expired sessions.
 */
export async function proxy(request: NextRequest) {
  const setup = getAuthSetup();
  if (request.nextUrl.pathname === "/") {
    // Public landing page: never a sign-in redirect. A real (Entra) session goes to the app; the
    // development provider "might be signed in" on every request, so it always shows the landing.
    return setup.ok && setup.entra ? entraLandingProxy(request, setup.entra) : NextResponse.next();
  }
  if (setup.ok && setup.entra) return entraProxy(request, setup.entra);
  if (!setup.ok || !setup.provider.mightBeAuthenticated(request)) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
}

/**
 * The landing page (`/`, signed-in redirect only) and the application routes. Other public pages
 * (/sign-in, /dev, later /privacy and /terms), assets and images are excluded.
 */
export const config = {
  matcher: [
    "/",
    "/home/:path*",
    "/onboarding/:path*",
    "/hunts/:path*",
    "/deals/:path*",
    "/alerts/:path*",
    "/analytics/:path*",
    "/inventory/:path*",
    "/sell/:path*",
    "/settings/:path*",
  ],
};
