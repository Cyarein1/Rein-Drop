/**
 * The problem section's story (Landing 09, Creative & Experience Spec 04): the endless refresh
 * routine vs one saved Hunt. Plain reseller language; no performance claims (no "hours saved",
 * percentages or speed promises) and no live activity (no timestamps, counters).
 */
export const problemCopy = {
  eyebrow: "The problem",
  headline: "Great flips don't wait for your next refresh.",
  lead: "Checking the same searches on every marketplace, all day, is exhausting - and the good listings still slip past. One saved Hunt does the checking for you.",
} as const;

export const beforeStory = {
  title: "Without Rein Drop",
  points: ["The same searches, over and over", "Tabs open everywhere", "The good one was gone before you saw it"],
  /** Browser tabs in the illustration (search pages a reseller keeps open). */
  tabs: ["iphone 13 pro - eBay", "Marketplace - iPhone 13", "iphone 13 pro used", "Marketplace - search", "iphone 13 - eBay", "iPhone deals"],
  /** What the listings turned out to be - the reasons a refresh routine misses. */
  listings: [
    { title: "iPhone 13 Pro 128GB", outcome: "Sold already" },
    { title: "iPhone 13 Pro - unlocked", outcome: "Too expensive" },
    { title: "iPhone 13 Pro 128GB", outcome: "Seen it twice" },
  ],
  summary: "Illustration: a browser full of marketplace tabs and a refresh button; the listings found are already sold, too expensive or ones you've seen before.",
} as const;

export const afterStory = {
  title: "With a saved Hunt",
  points: ["Set what you want once", "Rein Drop keeps checking for you", "You get a heads-up when something's worth a look"],
  hunt: {
    name: "iPhone 13 Pro",
    criteria: ["Under $400", "Good condition or better", "Within 25 miles"],
    marketplaces: ["ebay", "facebook"] as const,
    status: "Live - watching for you",
  },
  headsUp: "Strong deal: iPhone 13 Pro 128 GB",
  summary: "Illustration: one saved Hunt for an iPhone 13 Pro under $400 on eBay and Facebook Marketplace, live and watching, with a heads-up when a strong deal appears.",
} as const;
