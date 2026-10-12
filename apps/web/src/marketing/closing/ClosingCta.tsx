import Image from "next/image";
import { landingImages } from "../landing-assets";
import { StoreBadges } from "../StoreBadges";
import { contactEmail } from "../site-config";
import styles from "./ClosingCta.module.css";
import { WaitlistForm } from "./WaitlistForm";

const mascot = landingImages.closingMascot;

/**
 * Closing CTA (Landing 13, spec 13) - the waitlist section every "Join early access" scrolls to.
 * High contrast: white on navy (15.7:1), navy on orange. Holds the ONE early-access form
 * (WaitlistForm, Landing 20) that every CTA leads to. The approved delivery-dash mascot carries the
 * "more time flipping" idea. Server component; the form is a client island.
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

          {/* The one sign-up form (Landing 20); the contact address is read here, on the server. */}
          <WaitlistForm contactEmail={contactEmail()} />

          <StoreBadges tone="dark" />
        </div>
        <div className={styles.visual} aria-hidden>
          <Image src={mascot.src} width={mascot.width} height={mascot.height} alt="" sizes="(min-width: 900px) 380px, 70vw" className={styles.mascot} />
        </div>
      </div>
    </section>
  );
}
