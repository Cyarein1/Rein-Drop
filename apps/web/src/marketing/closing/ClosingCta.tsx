import Image from "next/image";
import { landingImages } from "../landing-assets";
import { StoreBadges } from "../StoreBadges";
import styles from "./ClosingCta.module.css";

const mascot = landingImages.closingMascot;

/**
 * Closing CTA (Landing 13, spec 13) - the waitlist section every "Join early access" scrolls to.
 * High contrast: white on navy (15.7:1), navy on orange. The sign-up form is wired in Landing 20;
 * until then it is shown DISABLED with a plain note, so nothing pretends to submit. The approved
 * delivery-dash mascot carries the "more time flipping" idea. Server component.
 */
export function ClosingCta() {
  return (
    <section id="waitlist" aria-labelledby="waitlist-heading" tabIndex={-1} className={styles.section}>
      <div className={styles.band}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Early access</p>
          <h2 id="waitlist-heading" className={styles.heading}>
            Spend less time searching. More time flipping.
          </h2>
          <p className={styles.lead}>Join early access and be among the first resellers to try Rein Drop on eBay and Facebook Marketplace.</p>

          <form className={styles.form} aria-describedby="waitlist-status" action="#waitlist">
            <label htmlFor="waitlist-email" className="visually-hidden">
              Email address
            </label>
            <input id="waitlist-email" type="email" name="email" placeholder="Enter your email address" autoComplete="email" disabled className={styles.input} />
            <button type="submit" disabled className={styles.button}>
              Join early access
            </button>
          </form>
          <p id="waitlist-status" className={styles.status}>
            Sign-up opens here soon - the form is being connected.
          </p>

          <StoreBadges tone="dark" />
        </div>
        <div className={styles.visual} aria-hidden>
          <Image src={mascot.src} width={mascot.width} height={mascot.height} alt="" sizes="(min-width: 900px) 380px, 70vw" className={styles.mascot} />
        </div>
      </div>
    </section>
  );
}
