import type { IllustrativeDeal } from "../illustrative";

/**
 * After the flip (Landing 13, spec 10): Bought -> Sold -> Actual profit. Continues the deal-
 * intelligence example so the page shows the difference between an ESTIMATED gross upside and an
 * ACTUAL realized result after costs. Illustrative numbers, labelled.
 */
export const outcomesCopy = {
  eyebrow: "After the flip",
  headline: "The deal isn't done until it's sold.",
  lead: "Mark what you bought and what it sold for. Rein Drop adds up the costs in between, so you see what you actually made - not just what a deal looked like.",
} as const;

/** The PS5 from the deal-intelligence showcase, bought and sold. */
export const exampleFlip = {
  product: "PlayStation 5 console",
  /** What the showcase estimated (gross, before costs). */
  estimate: { askingUsd: 300, estimatedResaleUsd: 420 } satisfies IllustrativeDeal,
  bought: { priceUsd: 300, costs: [{ label: "Cleaning kit", usd: 8 }] },
  sold: { priceUsd: 415, costs: [{ label: "Selling fees", usd: 31 }, { label: "Shipping", usd: 13 }] },
} as const;

const sum = (costs: readonly { usd: number }[]) => costs.reduce((s, c) => s + c.usd, 0);

/** Realized profit = sale price - selling costs - (purchase price + purchase costs). The app's ledger formula. */
export function realizedProfitUsd(flip: typeof exampleFlip): number {
  const costBasis = flip.bought.priceUsd + sum(flip.bought.costs);
  const netProceeds = flip.sold.priceUsd - sum(flip.sold.costs);
  return netProceeds - costBasis;
}

export const totalCostsUsd = (flip: typeof exampleFlip) => sum(flip.bought.costs) + sum(flip.sold.costs);
