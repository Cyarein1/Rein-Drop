import { contactEmail } from "../site-config";
import styles from "./ContactLink.module.css";

/**
 * The site's one contact path (Landing 20): a mailto link to CONTACT_EMAIL, read on the server
 * (the owner sets it in the web app's environment). Never invented: until it is set, the text says
 * contact details are coming and is marked for review. Used by the footer, the legal drafts and the
 * waitlist form's error help, so they can never disagree.
 */
export function ContactLink({ email = contactEmail(), tone = "light" }: { email?: string | null; tone?: "light" | "dark" }) {
  if (email) {
    return (
      <a href={`mailto:${email}`} className={tone === "dark" ? styles.linkDark : styles.link}>
        {email}
      </a>
    );
  }
  return (
    <span>
      Contact details coming soon <span className={styles.review}>Needs review</span>
    </span>
  );
}
