/**
 * Public contact details for the landing page footer. Not decided yet, so nothing is invented:
 * set CONTACT_EMAIL in the web app's environment (read when the page is built). Until then the
 * footer says contact details are coming and marks it for review.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactEmail(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.CONTACT_EMAIL?.trim();
  return raw && EMAIL.test(raw) ? raw : null;
}

/** Legal pages - drafts that require legal review before any public launch (Landing 20 writes them). */
export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;
