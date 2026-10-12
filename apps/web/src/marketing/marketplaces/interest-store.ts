"use client";

import { useSyncExternalStore } from "react";
import { EMPTY_INTEREST, interestReducer, type InterestAction, type MarketplaceInterest } from "./marketplace-interest";

/**
 * The visitor's marketplace picks (Landing 17), shared by the gallery and the waitlist form - two
 * separate client islands - through one in-memory store. Never persisted or sent; a reload clears it.
 */

let current: MarketplaceInterest = EMPTY_INTEREST;
const listeners = new Set<() => void>();

export function dispatchInterest(action: InterestAction) {
  const next = interestReducer(current, action);
  if (next === current) return;
  current = next;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The visitor's picks; empty on the server and on every fresh page load. */
export function useMarketplaceInterest(): MarketplaceInterest {
  return useSyncExternalStore(subscribe, () => current, () => EMPTY_INTEREST);
}
