import { ChevronDown } from "lucide-react";
import { FAQ, faqCopy } from "./faq";
import styles from "./FaqSection.module.css";

/**
 * FAQ (Landing 13, spec 12): native <details> disclosures - keyboard and screen-reader friendly,
 * work without JavaScript, searchable with find-in-page. The first answer starts open.
 * Server component.
 */
export function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-heading" tabIndex={-1} className={styles.section}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{faqCopy.eyebrow}</p>
          <h2 id="faq-heading" className={styles.heading}>
            {faqCopy.headline}
          </h2>
        </header>
        <div className={styles.list}>
          {FAQ.map((item, i) => (
            <details key={item.id} id={`faq-${item.id}`} className={styles.item} open={i === 0}>
              <summary className={styles.question}>
                <h3>{item.question}</h3>
                <ChevronDown aria-hidden size={20} className={styles.chevron} />
              </summary>
              <p className={styles.answer}>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
