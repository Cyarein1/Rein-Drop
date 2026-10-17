/**
 * After "Delete account" (decision 0021): the account page signs the person out through
 * POST /auth/sign-out with `then=goodbye`, and they land on /goodbye instead of the sign-in page.
 * With Entra the sign-out goes through Microsoft first and comes back to the registered
 * /sign-in?signed_out=1 address, so a short-lived cookie carries "show the goodbye page" across it.
 */
export const GOODBYE_PATH = "/goodbye";
export const GOODBYE_COOKIE = "rd_goodbye";
/** Clears the cookie, then shows the goodbye page. */
export const GOODBYE_CLEAR_PATH = "/auth/goodbye";
/** Long enough for the round trip through the Microsoft sign-out page. */
export const GOODBYE_COOKIE_SECONDS = 600;

/** True when the sign-out form asked to end on the goodbye page. */
export function wantsGoodbye(form: { get(name: string): unknown } | null): boolean {
  return form?.get("then") === "goodbye";
}
