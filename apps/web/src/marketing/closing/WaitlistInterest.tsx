"use client";

import { X } from "lucide-react";
import { marketplaceByKey } from "../marketplaces";
import { dispatchInterest, useMarketplaceInterest } from "../marketplaces/interest-store";
import { interestFormFields, OTHER_TEXT_MAX, pickCount } from "../marketplaces/marketplace-interest";
import styles from "./ClosingCta.module.css";

/**
 * The marketplace picks from the gallery, carried into the early-access form (Landing 17). The
 * visitor can see, remove and (for "Other") name what will be sent; hidden inputs hold the values
 * for when the form is wired (Landing 20). Client state only - nothing is stored or sent today.
 */
export function WaitlistInterest() {
  const interest = useMarketplaceInterest();
  if (pickCount(interest) === 0) {
    return (
      <p className={styles.interestEmpty}>
        Want Rein Drop on another marketplace? <a href="#marketplaces">Pick it in the marketplace list</a> and it&apos;s added here.
      </p>
    );
  }
  return (
    <div className={styles.interest} role="group" aria-labelledby="waitlist-interest-heading">
      <p id="waitlist-interest-heading" className={styles.interestHeading}>
        Marketplaces you&apos;d like us to add
      </p>
      <ul className={styles.interestChips}>
        {interest.keys.map((key) => {
          const name = marketplaceByKey(key).name;
          return (
            <li key={key} className={styles.interestChip}>
              {name}
              <button type="button" className={styles.remove} aria-label={`Remove ${name}`} onClick={() => dispatchInterest({ type: "toggle", key })}>
                <X aria-hidden size={14} strokeWidth={3} />
              </button>
            </li>
          );
        })}
        {interest.other && (
          <li className={styles.interestChip}>
            Other
            <button type="button" className={styles.remove} aria-label="Remove Other" onClick={() => dispatchInterest({ type: "toggleOther" })}>
              <X aria-hidden size={14} strokeWidth={3} />
            </button>
          </li>
        )}
      </ul>
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
            onChange={(e) => dispatchInterest({ type: "setOtherText", text: e.target.value })}
          />
        </span>
      )}
      <p className={styles.interestNote}>Requests help us decide what to look at next - they don&apos;t guarantee a marketplace will be added.</p>
      {interestFormFields(interest).map((f, i) => (
        <input key={`${f.name}-${i}`} type="hidden" name={f.name} value={f.value} />
      ))}
    </div>
  );
}
