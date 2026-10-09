/**
 * The hero's sample deal card. ILLUSTRATIVE: not a real listing, price or result, and never shown
 * without the label below (Creative & Experience Spec: "Example numbers must say illustrative").
 * Prices in USD - the landing page speaks to US resellers first.
 */
export const ILLUSTRATIVE_LABEL = "Illustrative example";

export const heroExample = {
  product: "iPhone 13 Pro · 128 GB",
  condition: "Good condition",
  /** A launch target from the marketplace roadmap (marketplaces.ts) - shown with its official mark. */
  marketplace: "facebook",
  /** Same wording as the app's strength band ("Strong deal"). */
  strength: "Strong deal",
  askingUsd: 380,
  estimatedResaleUsd: 520,
} as const;

/** Estimated resale minus asking price - GROSS: before fees, shipping, taxes or repairs. */
export const potentialGrossUpsideUsd = (e: { askingUsd: number; estimatedResaleUsd: number }) => e.estimatedResaleUsd - e.askingUsd;

/** "$1,234" (whole dollars - the example never pretends to cent precision). */
export const usd = (amount: number) => `$${Math.round(amount).toLocaleString("en-US")}`;

/** "+$140" for the upside callout. */
export const signedUsd = (amount: number) => `${amount >= 0 ? "+" : "-"}${usd(Math.abs(amount))}`;
