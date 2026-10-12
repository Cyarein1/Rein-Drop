"use client";

import { ArrowDown, Check, Plus } from "lucide-react";
import { PRIMARY_CTA } from "../sections";
import type { MarketplaceKey } from "../marketplaces";
import { dispatchInterest, useMarketplaceInterest } from "./interest-store";
import { INTEREST_COPY, pickCount, pickSummary } from "./marketplace-interest";
import styles from "./MarketplaceGallery.module.css";

/**
 * Client islands for marketplace requests (Landing 17) inside the server-rendered gallery: a
 * toggle per "On our radar" tile, an "Other" toggle, and the visitor's own summary. The picks live
 * in memory only (see marketplace-interest.ts).
 */

export function RequestToggle({ marketplace, name }: { marketplace: MarketplaceKey; name: string }) {
  const { keys } = useMarketplaceInterest();
  const on = keys.includes(marketplace);
  return (
    <button
      type="button"
      className={styles.request}
      aria-pressed={on}
      aria-label={`Request ${name}`}
      onClick={() => dispatchInterest({ type: "toggle", key: marketplace })}
    >
      {on ? <Check aria-hidden size={14} strokeWidth={3} /> : <Plus aria-hidden size={14} strokeWidth={3} />}
      {on ? "Requested" : "Request"}
    </button>
  );
}

export function OtherToggle() {
  const { other } = useMarketplaceInterest();
  return (
    <button type="button" className={styles.otherToggle} aria-pressed={other} onClick={() => dispatchInterest({ type: "toggleOther" })}>
      {other ? <Check aria-hidden size={16} strokeWidth={3} /> : <Plus aria-hidden size={16} strokeWidth={3} />}
      <span>
        <strong>Other</strong> - {INTEREST_COPY.other.toLowerCase()}
      </span>
    </button>
  );
}

/** "2 picked - added to your early-access sign-up below." (polite, the visitor's own picks only). */
export function InterestSummary() {
  const interest = useMarketplaceInterest();
  const any = pickCount(interest) > 0;
  return (
    <div className={styles.interestSummary} data-active={any || undefined}>
      <p aria-live="polite" aria-atomic="true">
        {any ? `${pickSummary(interest)} - ${INTEREST_COPY.carried.toLowerCase()}` : ""}
      </p>
      {any && (
        <span className={styles.interestActions}>
          <a href={`#${PRIMARY_CTA.section}`} className={styles.interestLink}>
            Go to sign-up
            <ArrowDown aria-hidden size={16} />
          </a>
          <button type="button" className={styles.clear} onClick={() => dispatchInterest({ type: "clear" })}>
            Clear picks
          </button>
        </span>
      )}
    </div>
  );
}
