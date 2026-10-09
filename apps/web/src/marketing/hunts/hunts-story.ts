/**
 * Make the Hunt yours (Landing 12, spec 08). The preference panel is an ILLUSTRATION of the app's
 * Hunt form - not a working form, and it never creates a Hunt. The real action is joining early access.
 */
export const huntsCopy = {
  eyebrow: "Hunt customization",
  headline: "Your budget. Your area. Your kind of flip.",
  lead: "Tell Rein Drop exactly what you source. Every Hunt has its own product, price limit, condition, area and marketplaces - so the heads-ups match how you flip.",
  illustrationLabel: "Example Hunt - illustration, not a working form",
  cta: "Join early access to create your first Hunt",
} as const;

/** What the illustrated form shows (values of an example Hunt). */
export const exampleHunt = {
  product: "iPhone 13 Pro",
  maxPriceUsd: 400,
  /** Slider position for the illustration (0-1). */
  budgetFill: 0.55,
  conditions: [
    { label: "Any", selected: false },
    { label: "New", selected: false },
    { label: "Used", selected: true },
  ],
  minimumCondition: "Good or better",
  location: "Within 25 miles of your ZIP code",
  /** Launch targets selected; the rest of the roadmap is shown as not available yet. */
  sources: ["ebay", "facebook"] as const,
  summary:
    "Illustration of the Hunt form: product iPhone 13 Pro, max price $400, used in good condition or better, within 25 miles, on eBay and Facebook Marketplace. It is a picture, not a working form.",
} as const;

/** The plain-language list beside the illustration. */
export const CUSTOMIZE_BY = [
  { key: "product", title: "Product", text: "Keywords or a specific model - plus words to exclude." },
  { key: "budget", title: "Budget", text: "The most you'd pay. Listings above it are skipped." },
  { key: "condition", title: "Condition", text: "New, used, or the minimum condition you'll accept." },
  { key: "location", title: "Location", text: "Your area, for local pickup marketplaces." },
  { key: "sources", title: "Marketplaces", text: "eBay and Facebook Marketplace at launch - more on our radar." },
] as const;
