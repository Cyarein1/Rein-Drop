import type { AccountIdentity } from "@rein-drop/api-client";

/**
 * PLACEHOLDER AUTH. Every request is treated as signed in as a fixed local user so
 * the authenticated shell can be built before an auth provider is chosen.
 *
 * TODO(auth): replace with the real session lookup (provider TBD). When a request
 * has no session, the (app) layout must redirect to sign-in instead of rendering.
 */
export interface Session {
  user: AccountIdentity;
  /** True while auth is a placeholder - the UI says so, so nobody mistakes it for real auth. */
  isPlaceholder: boolean;
}

const PLACEHOLDER_SESSION: Session = {
  user: {
    userId: "00000000-0000-7000-8000-000000000001",
    email: "dev@reindrop.local",
    // Name is not collected at sign-up (App Flow Blueprint, section 3.2).
    displayName: null,
  },
  isPlaceholder: true,
};

export async function getSession(): Promise<Session> {
  return PLACEHOLDER_SESSION;
}
