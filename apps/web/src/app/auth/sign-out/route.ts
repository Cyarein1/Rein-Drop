import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookies } from "@/auth/entra/cookies";
import { entraConfiguration, signedOutUrl, signOutUrl } from "@/auth/entra/oidc";
import { getAuthSetup } from "@/auth/provider";

/**
 * Signs out: deletes the session cookies, then ends the Entra session too (so the hosted page
 * asks for the password again) and returns to /sign-in. POST only - a link or image can't sign
 * anyone out.
 */
export async function POST(request: NextRequest) {
  const setup = getAuthSetup();
  let target = new URL("/sign-in?signed_out=1", request.url);
  if (setup.ok && setup.entra) {
    target = new URL(signedOutUrl(setup.entra));
    try {
      target = signOutUrl(await entraConfiguration(setup.entra), setup.entra) ?? target;
    } catch {
      // Entra unreachable: the local session still ends.
    }
  }
  const response = NextResponse.redirect(target, 303);
  clearSessionCookies(response.cookies);
  return response;
}
