import Link from "next/link";
import { SiteFooter } from "./SiteFooter";
import styles from "./LegalPlaceholder.module.css";

/**
 * Placeholder legal page (Landing 13): exists so footer links never 404, and says plainly that the
 * text is a draft that needs legal review. The drafts themselves are written in Landing 20 and must
 * be reviewed before real email addresses are collected or the site launches publicly.
 */
export function LegalPlaceholder({ title }: { title: string }) {
  return (
    <>
      <main id="main-content" className={styles.main}>
        <Link href="/" className={styles.back}>
          ← Back to Rein Drop
        </Link>
        <p className={styles.status}>Draft - requires legal review</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.text}>
          This page is a placeholder. The {title.toLowerCase()} for Rein Drop is being prepared and will be reviewed before the site launches
          publicly or collects sign-ups.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
