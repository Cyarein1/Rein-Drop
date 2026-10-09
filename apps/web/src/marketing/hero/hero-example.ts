/**
 * The hero's sample deal card. ILLUSTRATIVE: not a real listing, price or result, and never shown
 * without the illustrative label. Shared label / formatting rules: ../illustrative.ts.
 */
export { ILLUSTRATIVE_LABEL, potentialGrossUpsideUsd, signedUsd, usd } from "../illustrative";

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
