import { ArrowRight, BadgeDollarSign, ShoppingBag, TrendingUp } from "lucide-react";
import { ILLUSTRATIVE_LABEL, potentialGrossUpsideUsd, signedUsd, usd } from "../illustrative";
import { exampleFlip, outcomesCopy, realizedProfitUsd } from "./outcomes-story";
import styles from "./OutcomesSection.module.css";

/**
 * After the flip (Landing 13, spec 10): Bought -> Sold -> Actual profit, three simple cards and one
 * strong green result, then the estimate-vs-actual comparison (gross upside != realized profit).
 * Illustrative numbers; no celebration mascot (no approved pose). Server component.
 */
export function OutcomesSection() {
  const profit = realizedProfitUsd(exampleFlip);
  const estimate = potentialGrossUpsideUsd(exampleFlip.estimate);
  return (
    <section id="outcomes" aria-labelledby="outcomes-heading" tabIndex={-1} className={styles.section}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{outcomesCopy.eyebrow}</p>
          <h2 id="outcomes-heading" className={styles.heading}>
            {outcomesCopy.headline}
          </h2>
          <p className={styles.lead}>{outcomesCopy.lead}</p>
        </header>

        <p className={styles.label}>
          {ILLUSTRATIVE_LABEL} · {exampleFlip.product}
        </p>
        <ol className={styles.flow}>
          <li className={styles.card}>
            <span className={styles.icon} aria-hidden>
              <ShoppingBag size={20} />
            </span>
            <h3 className={styles.cardTitle}>Bought</h3>
            <p className={styles.amount}>{usd(exampleFlip.bought.priceUsd)}</p>
            <ul className={styles.costs}>
              {exampleFlip.bought.costs.map((c) => (
                <li key={c.label}>
                  + {c.label} {usd(c.usd)}
                </li>
              ))}
            </ul>
            <span className={styles.arrow} aria-hidden>
              <ArrowRight size={18} />
            </span>
          </li>
          <li className={styles.card}>
            <span className={styles.icon} aria-hidden>
              <BadgeDollarSign size={20} />
            </span>
            <h3 className={styles.cardTitle}>Sold</h3>
            <p className={styles.amount}>{usd(exampleFlip.sold.priceUsd)}</p>
            <ul className={styles.costs}>
              {exampleFlip.sold.costs.map((c) => (
                <li key={c.label}>
                  - {c.label} {usd(c.usd)}
                </li>
              ))}
            </ul>
            <span className={styles.arrow} aria-hidden>
              <ArrowRight size={18} />
            </span>
          </li>
          <li className={styles.result}>
            <span className={styles.iconResult} aria-hidden>
              <TrendingUp size={20} />
            </span>
            <h3 className={styles.cardTitle}>Actual profit</h3>
            <p className={styles.profit}>{signedUsd(profit)}</p>
            <p className={styles.resultNote}>After every cost you recorded</p>
          </li>
        </ol>

        <p className={styles.compare}>
          <span>
            Estimated upside when you found it: <strong>{signedUsd(estimate)}</strong> <span className={styles.muted}>(gross, before costs)</span>
          </span>
          <span>
            What you actually made: <strong>{signedUsd(profit)}</strong>
          </span>
        </p>
      </div>
    </section>
  );
}
