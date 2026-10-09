/**
 * Deal intelligence showcase (Landing 11, spec 07): one example deal, explained. ILLUSTRATIVE -
 * not a live listing; the resale price is an ESTIMATE; the upside is GROSS (before costs). Costs
 * are named, never invented amounts, and nothing is ever called net profit.
 */
export const intelligenceCopy = {
  eyebrow: "Deal intelligence",
  headline: "Know why a deal is worth a closer look.",
  lead: "Rein Drop doesn't just send a link. It shows the numbers, why the listing stood out and what you should still check - in plain language.",
} as const;

export const showcaseDeal = {
  product: "PlayStation 5 · Disc edition",
  details: "Good condition · 1 controller included",
  /** A launch target from the marketplace roadmap. */
  marketplace: "ebay",
  strength: "Strong deal",
  /** Plain words, no percentages (spec: avoid unsupported confidence scores). */
  confidence: "Medium confidence - a handful of similar sales to compare",
  askingUsd: 300,
  estimatedResaleUsd: 420,
} as const;

/** The three notes around the card, in reading order. */
export const showcaseNotes = [
  {
    key: "why",
    title: "Why it was flagged",
    items: ["Under the max price you set ($350)", "Condition matches what you asked for", "Asking price is well below what similar consoles have sold for"],
  },
  {
    key: "questions",
    title: "Questions to ask the seller",
    items: ["Has the disc drive been tested?", "Original controller and cables included?", "Pickup or shipped - and who pays shipping?"],
    caution: "An unusually low price can also be a red flag. Check the seller before you pay.",
  },
  {
    key: "costs",
    title: "Before you count it as profit",
    items: ["Selling fees", "Shipping and packaging", "Sales tax", "Repairs or cleaning"],
    note: "The upside shown is gross. Your actual result depends on these costs - Rein Drop tracks them when you sell.",
  },
] as const;
