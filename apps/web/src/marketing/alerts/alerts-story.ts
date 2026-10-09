/**
 * Alerts (Landing 12, spec 09). Only what the product does: push (the Rein Drop app) and the in-app
 * inbox, per-type preferences, one alert per deal. No email (not built - D14), no speed or
 * "never miss" promises, no timestamps on the illustrated notification.
 */
export const alertsCopy = {
  eyebrow: "Alerts",
  headline: "Get a heads-up when something worth checking drops.",
  lead: "When a listing matches your Hunt and looks worth a closer look, Rein Drop lets you know - so you can stop refreshing the same searches.",
  caveat: "Alerts depend on how often marketplaces are checked and what they make available. They're a heads-up to look, not advice to buy.",
} as const;

export const exampleNotification = {
  app: "Rein Drop",
  title: "Strong deal: PlayStation 5 · Disc",
  body: "$300 asking · est. resale $420 · eBay",
  /** The phone screen is an illustration - its numbers are the deal-intelligence example. */
  summary: "Illustration: a phone lock screen showing a Rein Drop notification - Strong deal: PlayStation 5 Disc, $300 asking, estimated resale $420, on eBay.",
} as const;

export const ALERT_POINTS = [
  { key: "push", title: "Push notifications", text: "On your phone, with the Rein Drop app." },
  { key: "inbox", title: "In-app alerts", text: "Every alert is kept in your Rein Drop inbox." },
  { key: "choose", title: "You choose", text: "Turn alert types on or off in your settings." },
  { key: "once", title: "One alert per deal", text: "No repeats when the same listing is checked again." },
] as const;
