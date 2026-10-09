import Image from "next/image";
import Link from "next/link";
import { landingImages } from "../landing-assets";
import { NAV_LINKS } from "../sections";
import { contactEmail, LEGAL_LINKS } from "../site-config";
import styles from "./SiteFooter.module.css";

const wordmark = landingImages.wordmark;
const WORDMARK_HEIGHT = 28;

/**
 * Footer (Landing 13): wordmark, section links, contact (configured - never invented; marked for
 * review until set), legal links to the draft pages (marked for review), the non-affiliation /
 * trademark line. No testimonials, badges or pricing. Server component.
 */
export function SiteFooter() {
  const email = contactEmail();
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Image src={wordmark.src} width={Math.round((wordmark.width / wordmark.height) * WORDMARK_HEIGHT)} height={WORDMARK_HEIGHT} alt="Rein Drop" />
          <p>You flip it. We find it.</p>
        </div>

        <nav aria-label="Footer" className={styles.columns}>
          <div>
            <h2 className={styles.columnTitle}>Rein Drop</h2>
            <ul>
              {NAV_LINKS.map((l) => (
                <li key={l.section}>
                  <a href={`/#${l.section}`}>{l.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className={styles.columnTitle}>Contact</h2>
            <ul>
              <li>
                {email ? (
                  <a href={`mailto:${email}`}>{email}</a>
                ) : (
                  <span>
                    Contact details coming soon <span className={styles.review}>Needs review</span>
                  </span>
                )}
              </li>
            </ul>
          </div>
          <div>
            <h2 className={styles.columnTitle}>Legal</h2>
            <ul>
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link> <span className={styles.review}>Draft - needs legal review</span>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <p className={styles.fineprint}>
          eBay, Facebook, Facebook Marketplace and other marketplace names and logos, App Store and Google Play are trademarks of their
          respective owners. Rein Drop is not affiliated with or endorsed by them. Examples on this page are illustrative.
        </p>
        <p className={styles.fineprint}>© Rein Drop</p>
      </div>
    </footer>
  );
}
