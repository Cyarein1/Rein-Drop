import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { ContactLink } from "../contact/ContactLink";
import { SiteFooter } from "../footer/SiteFooter";
import { LEGAL_DRAFT_STATUS, type LegalDocument } from "./legal-drafts";
import styles from "./LegalDraft.module.css";

/**
 * A legal page (Landing 20). While `reviewed` is false - today, for both documents - a conspicuous
 * banner says it is a draft that requires legal review, every open point is shown as "To be
 * confirmed", and the page metadata keeps it out of search results. Server component.
 */
export function LegalDraft({ doc }: { doc: LegalDocument }) {
  return (
    <>
      <main id="main-content" className={styles.main}>
        <Link href="/" className={styles.back}>
          ← Back to Rein Drop
        </Link>
        {!doc.reviewed && (
          <div className={styles.banner} role="note" aria-labelledby="legal-status">
            <CircleAlert aria-hidden size={22} />
            <div>
              <p id="legal-status" className={styles.bannerTitle}>
                {LEGAL_DRAFT_STATUS}
              </p>
              <p>This text hasn&apos;t been reviewed by a lawyer yet. It may change, and it isn&apos;t final. Points marked &quot;To be confirmed&quot; are still open.</p>
            </div>
          </div>
        )}
        <h1 className={styles.title}>{doc.title}</h1>
        <p className={styles.version}>Version {doc.version}{doc.reviewed ? "" : " (draft)"}</p>
        <p className={styles.intro}>{doc.intro}</p>

        {doc.sections.map((s) => (
          <section key={s.heading} className={styles.section} aria-labelledby={`legal-${slug(s.heading)}`}>
            <h2 id={`legal-${slug(s.heading)}`} className={styles.heading}>
              {s.heading}
            </h2>
            {s.paragraphs.map((p) => (
              <p key={p} className={styles.text}>
                {p}
              </p>
            ))}
            {s.toConfirm && !doc.reviewed && (
              <div className={styles.toConfirm}>
                <p className={styles.toConfirmTitle}>To be confirmed</p>
                <ul>
                  {s.toConfirm.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}

        <section className={styles.section} aria-labelledby="legal-contact">
          <h2 id="legal-contact" className={styles.heading}>
            Contact
          </h2>
          <p className={styles.text}>
            Questions or requests about this {doc.title.toLowerCase()}: <ContactLink />
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
