"use client";

import { X } from "lucide-react";
import { marketplaceByKey } from "../marketplaces";
import { dispatchInterest, useMarketplaceInterest } from "../marketplaces/interest-store";
import { OTHER_TEXT_MAX, pickCount, REQUESTABLE_MARKETPLACES } from "../marketplaces/marketplace-interest";
import styles from "./ClosingCta.module.css";

/**
 * The optional "requested marketplace" part of the early-access form (Landing 17 + 20). Picks from
 * the gallery arrive here; visitors who skipped the gallery can add one from the native select.
 * Every pick can be removed, and "Other" can be named. The form sends what is shown - nothing else.
 */
export function WaitlistInterest({ disabled = false }: { disabled?: boolean }) {
  const interest = useMarketplaceInterest();
  const available = REQUESTABLE_MARKETPLACES.filter((k) => !interest.keys.includes(k));
  const any = pickCount(interest) > 0;
  return (
    <div className={styles.interest} role="group" aria-labelledby="waitlist-interest-heading">
      <p id="waitlist-interest-heading" className={styles.interestHeading}>
        {any ? "Marketplaces you'd like us to add" : "Want Rein Drop on another marketplace? (optional)"}
      </p>
      {any && (
        <ul className={styles.interestChips}>
          {interest.keys.map((key) => {
            const name = marketplaceByKey(key).name;
            return (
              <li key={key} className={styles.interestChip}>
                {name}
                <button type="button" className={styles.remove} aria-label={`Remove ${name}`} disabled={disabled} onClick={() => dispatchInterest({ type: "toggle", key })}>
                  <X aria-hidden size={14} strokeWidth={3} />
                </button>
              </li>
            );
          })}
          {interest.other && (
            <li className={styles.interestChip}>
              Other
              <button type="button" className={styles.remove} aria-label="Remove Other" disabled={disabled} onClick={() => dispatchInterest({ type: "toggleOther" })}>
                <X aria-hidden size={14} strokeWidth={3} />
              </button>
            </li>
          )}
        </ul>
      )}
      {(available.length > 0 || !interest.other) && (
        <span className={styles.otherField}>
          <label htmlFor="waitlist-add-marketplace">{any ? "Add another" : "Add a marketplace"}</label>
          <select
            id="waitlist-add-marketplace"
            className={styles.otherInput}
            value=""
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "other") dispatchInterest({ type: "toggleOther" });
              else if (v) dispatchInterest({ type: "toggle", key: v as (typeof REQUESTABLE_MARKETPLACES)[number] });
            }}
          >
            <option value="">Choose a marketplace…</option>
            {available.map((k) => (
              <option key={k} value={k}>
                {marketplaceByKey(k).name}
              </option>
            ))}
            {!interest.other && <option value="other">Other (somewhere else)</option>}
          </select>
        </span>
      )}
      {interest.other && (
        <span className={styles.otherField}>
          <label htmlFor="waitlist-other-marketplace">Which marketplace? (optional)</label>
          <input
            id="waitlist-other-marketplace"
            type="text"
            className={styles.otherInput}
            value={interest.otherText}
            maxLength={OTHER_TEXT_MAX}
            placeholder="e.g. a local classifieds site"
            disabled={disabled}
            onChange={(e) => dispatchInterest({ type: "setOtherText", text: e.target.value })}
          />
        </span>
      )}
      <p className={styles.interestNote}>
        {any ? "Requests help us decide what to look at next - they don't guarantee a marketplace will be added." : (
          <>
            Or pick from the <a href="#marketplaces">marketplace list</a>. Requests help us decide what to look at next - they don&apos;t guarantee a marketplace will be added.
          </>
        )}
      </p>
    </div>
  );
}
