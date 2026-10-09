/**
 * FAQ (Landing 13, spec 12). Answers reflect the actual stage: no dates, no prices, no promises.
 * Required topics (build prompt): Hunt definition, launch targets, notification timing, estimates,
 * costs (pricing TBD), availability, and whether Rein Drop buys items.
 */
export const faqCopy = {
  eyebrow: "FAQ",
  headline: "Questions resellers ask.",
} as const;

export const FAQ = [
  {
    id: "what-is-a-hunt",
    topic: "hunt",
    question: "What is a Hunt?",
    answer:
      "A Hunt is a saved search for something you want to source - the product, the most you'd pay, the condition, your area and which marketplaces to watch. Rein Drop keeps checking for you and flags listings worth a closer look.",
  },
  {
    id: "which-marketplaces",
    topic: "marketplaces",
    question: "Which marketplaces does Rein Drop watch?",
    answer:
      "Rein Drop launches with eBay and Facebook Marketplace as its targets - they're being built and tested, not live yet. Other marketplaces are on our radar, without dates. Rein Drop isn't affiliated with or endorsed by any marketplace.",
  },
  {
    id: "how-quickly",
    topic: "timing",
    question: "How quickly will I hear about new listings?",
    answer:
      "It depends on how often your Hunt is checked and what each marketplace makes available. Rein Drop can't promise instant alerts or that it will catch every listing - it gives you a heads-up when it finds something worth checking.",
  },
  {
    id: "estimates",
    topic: "estimates",
    question: "Are the profit estimates guaranteed?",
    answer:
      "No. Estimated resale prices and potential upside are estimates based on the information available, and they're shown before fees, shipping, tax and repairs. Always check the listing and the seller yourself.",
  },
  {
    id: "does-it-buy",
    topic: "buying",
    question: "Does Rein Drop buy items for me?",
    answer: "No. Rein Drop finds and explains listings; you decide whether to buy and you buy directly from the seller on the marketplace.",
  },
  {
    id: "cost",
    topic: "cost",
    question: "What will it cost?",
    answer: "Pricing isn't final yet. Early access members will hear about plans and prices first.",
  },
  {
    id: "when",
    topic: "availability",
    question: "When can I try it?",
    answer:
      "We're preparing early access now - on the web first, with iPhone and Android apps coming soon. Join early access and we'll let you know when your spot is ready.",
  },
] as const;
