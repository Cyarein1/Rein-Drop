import { NextResponse, type NextRequest } from "next/server";
import { getAuthSetup } from "@/auth/provider";

/**
 * Optimistic, request-local route gate (Next.js Proxy). It never calls the API or
 * database; the real check is `verifySession()` in every protected page.
 */
export function proxy(request: NextRequest) {
  const setup = getAuthSetup();
  if (!setup.ok || !setup.provider.mightBeAuthenticated(request)) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
}

/** Application routes only - public pages (/sign-in, /dev), assets and images are excluded. */
export const config = {
  matcher: ["/home/:path*", "/hunts/:path*", "/deals/:path*", "/analytics/:path*", "/settings/:path*"],
};
