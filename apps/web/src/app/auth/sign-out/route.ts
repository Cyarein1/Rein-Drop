import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookies } from "@/auth/entra/cookies";
import { entraConfiguration, signedOutUrl, signOutUrl } from "@/auth/entra/oidc";
import { GOODBYE_COOKIE, GOODBYE_COOKIE_SECONDS, GOODBYE_PATH, wantsGoodbye } from "@/auth/goodbye";
import { getAuthSetup } from "@/auth/provider";

/**
 * Signs out: deletes the session cookies, then ends the Entra session too (so the hosted page
 * asks for the password again) and returns to /sign-in. POST only - a link or image can't sign
 * anyone out. `then=goodbye` (after deleting the account) ends on the goodbye page instead.
 */
export async function POST(request: NextRequest) {
  const setup = getAuthSetup();
  const goodbye = wantsGoodbye(await request.formData().catch(() => null));
  let target = new URL(goodbye ? GOODBYE_PATH : "/sign-in?signed_out=1", request.url);
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
  if (goodbye && setup.ok && setup.entra) {
    // Microsoft returns to /sign-in?signed_out=1 (the registered address); this sends it on to /goodbye.
    const secure = setup.entra.appBaseUrl.startsWith("https://");
    response.cookies.set(GOODBYE_COOKIE, "1", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: GOODBYE_COOKIE_SECONDS });
  }
  return response;
}
