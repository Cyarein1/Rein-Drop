import { WAITLIST_CONSENT_VERSION } from "../waitlist/consent";

/**
 * Privacy notice and terms of use - DRAFTS (Landing 20). Written by the product team from what the
 * site actually does today; NOT reviewed by a lawyer. Rules for this text:
 * - Describe only what is true now (the code), never a practice that doesn't exist yet.
 * - No guarantees (security, availability, results, delivery dates, marketplaces).
 * - Anything undecided is an explicit "To be confirmed" point, not an invented answer.
 * `reviewed` flips to true only after legal review; until then every page shows the draft banner,
 * stays out of search results, and must not be relied on as final.
 */

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  /** Open questions for the owner / legal review, shown as "To be confirmed". */
  toConfirm?: string[];
}

export interface LegalDocument {
  title: string;
  /** Version date - the privacy notice shares the consent version stored with each sign-up. */
  version: string;
  reviewed: boolean;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL_DRAFT_STATUS = "Draft - requires legal review";

export const PRIVACY_DRAFT: LegalDocument = {
  title: "Privacy notice",
  version: WAITLIST_CONSENT_VERSION,
  reviewed: false,
  intro:
    "This notice explains what Rein Drop collects through this website before launch, mainly through the early-access sign-up, and what we do with it.",
  sections: [
    {
      heading: "Who we are",
      paragraphs: ["Rein Drop is a tool for resellers that is being prepared for launch. This website collects early-access sign-ups."],
      toConfirm: ["The legal entity responsible for this website and its registered address.", "Whether a data protection / information officer must be named, and who."],
    },
    {
      heading: "What we collect when you join early access",
      paragraphs: [
        "Your email address.",
        "The marketplaces you asked us to consider (if any), including a name you typed for \"Other\".",
        "That you agreed to be contacted, which version of this notice applied, when you signed up, and which form you used.",
      ],
    },
    {
      heading: "What else the website records",
      paragraphs: [
        "Our servers keep short technical records of requests (for example the page requested, the result and the time) to run and protect the site. Our sign-up records in these logs don't include your email address.",
        "To stop automated abuse, the sign-up form counts recent attempts per network address for a few minutes. Rein Drop doesn't store that address with your sign-up.",
        "This website doesn't use advertising or tracking cookies.",
      ],
      toConfirm: [
        "What the hosting provider records in its own access logs, and for how long.",
        "If anonymous site analytics are added (planned), describe them here before they go live.",
      ],
    },
    {
      heading: "Why we use it",
      paragraphs: [
        "To contact you by email about Rein Drop early access.",
        "To understand which marketplaces resellers want, so we can decide what to look at next. Requests are a signal, not a promise that a marketplace will be added.",
      ],
      toConfirm: ["The legal basis for each use under the laws that apply (for example consent)."],
    },
    {
      heading: "Who it is shared with",
      paragraphs: [
        "Rein Drop doesn't sell sign-up information.",
        "It is stored with the service providers that host our website and database, who process it for us.",
      ],
      toConfirm: ["The hosting and email providers by name, and the countries where data is stored or processed."],
    },
    {
      heading: "How long we keep it",
      paragraphs: ["We haven't set a retention period yet. This notice will state it before sign-ups open to the public."],
      toConfirm: ["Retention period for sign-ups, and what happens to them after launch."],
    },
    {
      heading: "Your choices",
      paragraphs: [
        "You can ask us to tell you what we hold about you, to correct it, or to remove your sign-up, by contacting us at the address below.",
      ],
      toConfirm: ["Which rights apply in your country, how requests are verified, and response times."],
    },
    {
      heading: "Security",
      paragraphs: ["We take reasonable steps to protect the information we hold. No system is completely secure."],
    },
    {
      heading: "Changes to this notice",
      paragraphs: ["When this notice changes, the version date above changes too. Each sign-up records the version that applied when you joined."],
    },
  ],
};

export const TERMS_DRAFT: LegalDocument = {
  title: "Terms of use",
  version: WAITLIST_CONSENT_VERSION,
  reviewed: false,
  intro: "These terms cover this website and joining Rein Drop early access before launch.",
  sections: [
    {
      heading: "Early access",
      paragraphs: [
        "Joining early access adds you to a list. It doesn't guarantee access, a date, a price, particular features or particular marketplaces.",
      ],
    },
    {
      heading: "Examples on this website",
      paragraphs: [
        "Deal figures, listings, photos and the interactive demo on this website are illustrative examples, not live listings, offers or predictions.",
        "Resale figures are estimates and upside is shown before costs such as fees, shipping, taxes and repairs. They are not profit and not a promise of any result.",
      ],
    },
    {
      heading: "Your decisions",
      paragraphs: [
        "Rein Drop doesn't buy or sell anything for you. Whether to buy an item, and checking the listing and the seller, is always your decision and your responsibility.",
      ],
    },
    {
      heading: "Marketplaces and trademarks",
      paragraphs: [
        "Marketplace names and logos belong to their owners. Rein Drop isn't affiliated with or endorsed by them.",
      ],
    },
    {
      heading: "Using this website",
      paragraphs: ["Please don't misuse the website, for example by sending automated sign-ups or trying to disrupt it."],
      toConfirm: [
        "Limits of liability and any disclaimers - wording to be written by a lawyer.",
        "The law and courts that govern these terms.",
        "Terms for the Rein Drop app itself (accounts, plans, billing) - separate from these website terms.",
      ],
    },
    {
      heading: "Changes",
      paragraphs: ["We may update these terms before launch; the version date above shows the latest version."],
    },
  ],
};

export const LEGAL_DRAFTS = { privacy: PRIVACY_DRAFT, terms: TERMS_DRAFT } as const;
