import { NextResponse, type NextRequest } from "next/server";
import { GOODBYE_COOKIE, GOODBYE_PATH } from "@/auth/goodbye";

/** Clears the one-time "account deleted" marker (set by sign-out) and shows the goodbye page. */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL(GOODBYE_PATH, request.url), 303);
  response.cookies.delete(GOODBYE_COOKIE);
  return response;
}
