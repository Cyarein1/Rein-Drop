/**
 * How it works (Landing 10, spec 05): three steps in reseller language. Rein Drop searches and
 * explains; the reseller checks and decides - it never buys anything and promises no bargains.
 * No check frequency is stated (the polling cadence per plan is still open - D7).
 */
export const howItWorksCopy = {
  eyebrow: "How Rein Drop works",
  headline: "A smarter way to source inventory.",
  lead: "Set up a Hunt once. Rein Drop does the repetitive searching and flags what looks worth a closer look - the buying decision stays yours.",
} as const;

export const HOW_IT_WORKS_STEPS = [
  {
    title: "Tell us what you want",
    text: "Pick the product, your max price, the condition you'll accept and where to look.",
    summary: "Illustration: a Hunt being set up - iPhone 13 Pro, max price $400, used in good condition, on eBay and Facebook Marketplace.",
  },
  {
    title: "Rein Drop keeps looking",
    text: "We check the marketplaces you chose again and again, and skip listings that don't match.",
    summary: "Illustration: the Rein Drop mascot carrying a box while eBay and Facebook Marketplace are checked and non-matching listings are skipped.",
  },
  {
    title: "You check promising deals",
    text: "See why a listing was flagged and what's still uncertain. Then you decide whether to buy.",
    summary: "Illustration: a flagged deal showing why it looks promising, what to ask the seller, and buttons to save it, pass on it or mark it bought.",
  },
] as const;

/** The judgement note under the steps. */
export const youDecide = {
  title: "You stay in charge",
  text: "Rein Drop never buys anything for you and can't promise a bargain. Check the listing and the seller yourself, then make the call.",
} as const;
