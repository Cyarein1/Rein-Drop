import { comingSoon, exploring, MARKETPLACES, type MarketplaceKey } from "../marketplaces";

/**
 * Marketplace requests (Landing 17): visitors mark marketplaces on our radar - or "Other" - that
 * they'd like Rein Drop to add, and the picks travel to the early-access form. CLIENT STATE ONLY
 * until the waitlist backend exists (Landing 18-20): kept in memory, never stored or sent, gone on
 * reload. Requests are a signal for prioritising - no promise of delivery, and no totals are shown.
 */

/** Only marketplaces that aren't available yet can be requested (never the launch targets). */
export const REQUESTABLE_MARKETPLACES: readonly MarketplaceKey[] = [...comingSoon(), ...exploring()].map((m) => m.key as MarketplaceKey);

/** Free text for "Other" - a marketplace name, not an essay. */
export const OTHER_TEXT_MAX = 60;

export const INTEREST_COPY = {
  hint: "Tap the ones you'd use. Your picks are added to your early-access sign-up - they help us decide what to look at next, but don't guarantee a marketplace will be added.",
  other: "Somewhere else",
  carried: "Added to your early-access sign-up below.",
} as const;

export interface MarketplaceInterest {
  /** In gallery order, whatever order they were picked in. */
  keys: MarketplaceKey[];
  other: boolean;
  otherText: string;
}

export const EMPTY_INTEREST: MarketplaceInterest = { keys: [], other: false, otherText: "" };

export type InterestAction =
  | { type: "toggle"; key: MarketplaceKey }
  | { type: "toggleOther" }
  | { type: "setOtherText"; text: string }
  | { type: "clear" };

const ORDER = new Map<string, number>(MARKETPLACES.map((m, i) => [m.key, i]));

/** Pure: the next selection. Unknown or non-requestable keys are ignored (same object back). */
export function interestReducer(state: MarketplaceInterest, action: InterestAction): MarketplaceInterest {
  switch (action.type) {
    case "toggle": {
      if (!REQUESTABLE_MARKETPLACES.includes(action.key)) return state;
      const keys = state.keys.includes(action.key) ? state.keys.filter((k) => k !== action.key) : [...state.keys, action.key];
      return { ...state, keys: keys.sort((a, b) => ORDER.get(a)! - ORDER.get(b)!) };
    }
    case "toggleOther":
      // Turning "Other" off forgets what was typed: nothing is carried that the visitor can't see.
      return state.other ? { ...state, other: false, otherText: "" } : { ...state, other: true };
    case "setOtherText": {
      if (!state.other) return state;
      const otherText = action.text.replace(/\s+/g, " ").trimStart().slice(0, OTHER_TEXT_MAX);
      return otherText === state.otherText ? state : { ...state, otherText };
    }
    case "clear":
      return state.keys.length === 0 && !state.other ? state : EMPTY_INTEREST;
  }
}

/** How many picks (a marketplace or "Other"). Shown to the visitor about THEIR picks only. */
export const pickCount = (s: MarketplaceInterest) => s.keys.length + (s.other ? 1 : 0);

/** The visitor's own summary, e.g. "2 picked" - never a count across visitors. */
export const pickSummary = (s: MarketplaceInterest) => (pickCount(s) === 0 ? "Nothing picked yet" : `${pickCount(s)} picked`);

/** What the waitlist form will send once it exists (Landing 20): keys + optional free text. */
export function interestFormFields(s: MarketplaceInterest): { name: string; value: string }[] {
  return [
    ...s.keys.map((k) => ({ name: "requestedMarketplaces", value: k })),
    ...(s.other ? [{ name: "requestedMarketplaces", value: "other" }] : []),
    ...(s.other && s.otherText.trim() ? [{ name: "requestedMarketplaceOther", value: s.otherText.trim() }] : []),
  ];
}
