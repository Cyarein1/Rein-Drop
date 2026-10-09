/**
 * The landing page's sections, in narrative order (Creative & Experience Spec section 5).
 * The ids are the page's anchor targets (`/#how-it-works`) - navigation, CTAs and tests use these,
 * so renaming one is a breaking change for links already shared.
 */
export const LANDING_SECTIONS = [
  { id: "hero", label: "Rein Drop" },
  { id: "marketplaces", label: "Marketplaces" },
  { id: "problem", label: "The problem" },
  { id: "how-it-works", label: "How it works" },
  { id: "demo", label: "Try a sample Hunt" },
  { id: "intelligence", label: "Why this deal?" },
  { id: "hunts", label: "Make the Hunt yours" },
  { id: "alerts", label: "Alerts" },
  { id: "outcomes", label: "After the flip" },
  { id: "faq", label: "FAQ" },
  { id: "waitlist", label: "Join early access" },
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number]["id"];

/** `/#id` link to a section. */
export const sectionHref = (id: LandingSectionId) => `/#${id}`;
