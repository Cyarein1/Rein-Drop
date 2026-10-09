/**
 * Shared rules for illustrative deal figures on the landing page (Creative & Experience Spec:
 * "Example numbers must say illustrative"; "Estimated gross upside is not net profit").
 * Prices in USD - the landing page speaks to US resellers first.
 */
export const ILLUSTRATIVE_LABEL = "Illustrative example";

/** An example deal: what the listing asks and what similar items are estimated to resell for. */
export interface IllustrativeDeal {
  askingUsd: number;
  estimatedResaleUsd: number;
}

/** Estimated resale minus asking price - GROSS: before fees, shipping, taxes or repairs. Never "profit". */
export const potentialGrossUpsideUsd = (deal: IllustrativeDeal) => deal.estimatedResaleUsd - deal.askingUsd;

/** "$1,234" (whole dollars - the examples never pretend to cent precision). */
export const usd = (amount: number) => `$${Math.round(amount).toLocaleString("en-US")}`;

/** "+$140" for upside callouts. */
export const signedUsd = (amount: number) => `${amount >= 0 ? "+" : "-"}${usd(Math.abs(amount))}`;
