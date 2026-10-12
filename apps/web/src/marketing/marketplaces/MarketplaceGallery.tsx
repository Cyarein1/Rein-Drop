import { ChevronDown } from "lucide-react";
import { comingSoon, exploring, MARKETPLACE_STATUS_INFO, startingWith, type MarketplaceEntry, type MarketplaceKey, type MarketplaceStatus } from "../marketplaces";
import { PRIMARY_CTA } from "../sections";
import { InterestSummary, OtherToggle, RequestToggle } from "./InterestControls";
import { INTEREST_COPY } from "./marketplace-interest";
import { MarketplaceMark } from "./MarketplaceMark";
import styles from "./MarketplaceGallery.module.css";

function StatusPill({ status }: { status: MarketplaceStatus }) {
  return (
    <span className={styles.pill} data-status={status}>
      {MARKETPLACE_STATUS_INFO[status].label}
    </span>
  );
}

function RadarTile({ marketplace }: { marketplace: MarketplaceEntry }) {
  return (
    <li className={styles.tile}>
      <MarketplaceMark marketplace={marketplace} size={36} />
      <div className={styles.tileText}>
        <span className={styles.tileName}>{marketplace.name}</span>
        <span className={styles.tileCategory}>{marketplace.category}</span>
      </div>
      <StatusPill status={marketplace.status} />
      <RequestToggle marketplace={marketplace.key as MarketplaceKey} name={marketplace.name} />
    </li>
  );
}

/**
 * Marketplace gallery (Landing 08). "Starting with" = the launch targets, large; "On our radar" =
 * Coming soon / Exploring shown, the 11 Exploring ones behind a native <details> expander (works
 * without JavaScript, keyboard and screen reader friendly, searchable with find-in-page). Server
 * component; data and honesty rules in ../marketplaces.ts. Landing 17: radar tiles + "Other" can be
 * requested (client islands); the picks are carried into the waitlist form - no totals, no promises.
 */
export function MarketplaceGallery() {
  const starting = startingWith();
  const next = comingSoon();
  const later = exploring();
  return (
    <section id="marketplaces" aria-labelledby="marketplaces-heading" tabIndex={-1} className={styles.section}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Marketplaces</p>
          <h2 id="marketplaces-heading" className={styles.heading}>
            Starting with the places you already source.
          </h2>
          <p className={styles.lead}>
            Rein Drop launches with eBay and Facebook Marketplace. More are on our radar - we add a marketplace only when access,
            reliability and cost check out.
          </p>
        </header>

        <h3 className={styles.groupHeading}>Starting with</h3>
        <ul className={styles.starting}>
          {starting.map((m) => (
            <li key={m.key} className={styles.feature}>
              <MarketplaceMark marketplace={m} size={m.logo?.kind === "wordmark" ? 44 : 52} />
              <div className={styles.featureText}>
                <span className={styles.featureName}>{m.name}</span>
                <span className={styles.tileCategory}>{m.category}</span>
              </div>
              <StatusPill status={m.status} />
            </li>
          ))}
        </ul>

        <h3 className={styles.groupHeading}>On our radar</h3>
        <p className={styles.requestHint}>{INTEREST_COPY.hint}</p>
        <ul className={styles.grid}>
          {next.map((m) => (
            <RadarTile key={m.key} marketplace={m} />
          ))}
        </ul>
        <details className={styles.more}>
          <summary className={styles.moreSummary}>
            <span>
              See {later.length} more we&apos;re exploring
            </span>
            <ChevronDown aria-hidden size={18} className={styles.chevron} />
          </summary>
          <ul className={styles.grid}>
            {later.map((m) => (
              <RadarTile key={m.key} marketplace={m} />
            ))}
          </ul>
        </details>

        <div className={styles.requestRow}>
          <OtherToggle />
          <InterestSummary />
        </div>

        <dl className={styles.legend}>
          {(["launch_target", "coming_soon", "exploring"] as const).map((s) => (
            <div key={s}>
              <dt>
                <StatusPill status={s} />
              </dt>
              <dd>{MARKETPLACE_STATUS_INFO[s].meaning}</dd>
            </div>
          ))}
        </dl>

        <p className={styles.footnote}>
          Don&apos;t see where you source? Pick <strong>Other</strong> and name it in the <a href={`#${PRIMARY_CTA.section}`}>early-access sign-up</a>. Marketplace names and
          logos are trademarks of their owners; Rein Drop isn&apos;t affiliated with or endorsed by them.
        </p>
      </div>
    </section>
  );
}
