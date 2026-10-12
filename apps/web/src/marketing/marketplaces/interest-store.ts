"use client";

import { useSyncExternalStore } from "react";
import { trackLanding } from "../analytics/analytics";
import { EMPTY_INTEREST, interestReducer, newlyRequested, type InterestAction, type MarketplaceInterest } from "./marketplace-interest";

/**
 * The visitor's marketplace picks (Landing 17), shared by the gallery and the waitlist form - two
 * separate client islands - through one in-memory store. Never persisted or sent; a reload clears it.
 * Every new pick (gallery toggle, form select or "Other") is recorded here, once, as an anonymous
 * marketplace_requested event - the key only, never the typed "Other" name (Landing 21).
 */

let current: MarketplaceInterest = EMPTY_INTEREST;
const listeners = new Set<() => void>();

export function dispatchInterest(action: InterestAction) {
  const next = interestReducer(current, action);
  if (next === current) return;
  const added = newlyRequested(current, next);
  current = next;
  for (const l of listeners) l();
  for (const marketplace of added) trackLanding("marketplace_requested", { marketplace });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The visitor's picks; empty on the server and on every fresh page load. */
export function useMarketplaceInterest(): MarketplaceInterest {
  return useSyncExternalStore(subscribe, () => current, () => EMPTY_INTEREST);
}
