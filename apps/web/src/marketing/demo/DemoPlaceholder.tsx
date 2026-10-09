import styles from "./DemoPlaceholder.module.css";

/**
 * TEMPORARY (until Landing 14-15): keeps the "Try a sample Hunt" anchor in place so links and the
 * section order hold. Replaced by the interactive, illustrative Hunt demo.
 */
export function DemoPlaceholder() {
  return (
    <section id="demo" aria-labelledby="demo-heading" tabIndex={-1} className={styles.section}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Interactive demo</p>
        <h2 id="demo-heading" className={styles.heading}>
          Try a sample Hunt
        </h2>
        <p className={styles.text}>The interactive example is on its way.</p>
      </div>
    </section>
  );
}
