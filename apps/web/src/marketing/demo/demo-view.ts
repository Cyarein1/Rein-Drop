import { signedUsd, usd } from "../illustrative";
import { demoProduct } from "./demo-fixtures";
import type { DemoState } from "./demo-model";

/**
 * What the demo UI says about each state (Landing 15): the progress steps, the panel heading
 * (focus moves to it on every step change) and the polite screen-reader announcements for the
 * scan, which runs on its own. Pure, so it's unit-tested without a browser.
 */

export const DEMO_STEPS = [
  { key: "choose", label: "Product" },
  { key: "configure", label: "Hunt" },
  { key: "scan", label: "Scan" },
  { key: "deal", label: "Deal" },
] as const;

/** Index into DEMO_STEPS: the scan result (candidate / no match) still belongs to "Scan". */
export function demoStepIndex(state: DemoState): number {
  switch (state.step) {
    case "choose":
      return 0;
    case "configure":
      return 1;
    case "scan":
    case "candidate":
    case "no_match":
      return 2;
    case "evaluation":
      return 3;
  }
}

/** "Step 2 of 4: Hunt". */
export const demoStepText = (state: DemoState) => `Step ${demoStepIndex(state) + 1} of ${DEMO_STEPS.length}: ${DEMO_STEPS[demoStepIndex(state)]!.label}`;

/** The panel's heading for each state. */
export function demoHeading(state: DemoState): string {
  if (state.step === "choose") return "What should Rein Drop hunt for?";
  const name = demoProduct(state.product).name;
  switch (state.step) {
    case "configure":
      return `Set up your ${name} Hunt`;
    case "scan":
      return `Checking example listings for ${name}`;
    case "candidate":
      return "Best match found";
    case "no_match":
      return "Nothing fits this Hunt yet";
    case "evaluation":
      return "Why this deal was flagged";
  }
}

/**
 * A polite announcement when the scan (which runs by itself) starts or ends - other steps are
 * announced by moving focus to their heading. Null = nothing to announce.
 */
export function demoAnnouncement(prev: DemoState, next: DemoState): string | null {
  if (prev === next) return null;
  if (next.step === "scan" && prev.step !== "scan") {
    return `Checking ${demoProduct(next.product).listings.length} example listings. This takes a couple of seconds.`;
  }
  if (prev.step === "scan" && next.step === "candidate") {
    const fits = next.scanned.filter((s) => s.result === "match").length;
    const { listing, grossUpsideUsd } = next.candidate;
    return `Scan finished: ${fits} of ${next.scanned.length} example listings fit your Hunt. Best match: ${listing.title}, asking ${usd(listing.askingUsd)}, estimated gross upside ${signedUsd(grossUpsideUsd)}.`;
  }
  if (prev.step === "scan" && next.step === "no_match") {
    return `Scan finished: none of the ${next.scanned.length} example listings fit your Hunt. Go back to change it.`;
  }
  return null;
}

/** Pause between scanned listings: quick, but slow enough to follow. Reduced motion skips it. */
export const DEMO_SCAN_TICK_MS = 450;
