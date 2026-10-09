import { ArrowRight, ChevronDown, MapPin, Search, SlidersHorizontal, Store, Tag, Wrench } from "lucide-react";
import { usd } from "../illustrative";
import { marketplaceByKey, comingSoon } from "../marketplaces";
import { MarketplaceMark } from "../marketplaces/MarketplaceMark";
import { PRIMARY_CTA } from "../sections";
import { CUSTOMIZE_BY, exampleHunt, huntsCopy } from "./hunts-story";
import styles from "./HuntPreferences.module.css";

const ICONS = { product: Search, budget: Tag, condition: Wrench, location: MapPin, sources: Store } as const;

/**
 * Make the Hunt yours (Landing 12, spec 08). The Hunt form is an ILLUSTRATION inside an app-screen
 * frame: a single role="img" with a text summary and no real inputs or buttons, so it can't be
 * mistaken for a working form (Technical Decisions: "no fake interactive elements"). The only
 * action is a real link to the waitlist. Server component.
 */
export function HuntPreferences() {
  const nextUp = comingSoon().slice(0, 2);
  return (
    <section id="hunts" aria-labelledby="hunts-heading" tabIndex={-1} className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{huntsCopy.eyebrow}</p>
          <h2 id="hunts-heading" className={styles.heading}>
            {huntsCopy.headline}
          </h2>
          <p className={styles.lead}>{huntsCopy.lead}</p>
          <ul className={styles.list}>
            {CUSTOMIZE_BY.map((item) => {
              const Icon = ICONS[item.key];
              return (
                <li key={item.key}>
                  <span className={styles.listIcon} aria-hidden>
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <span className={styles.listText}>{item.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <a href={`#${PRIMARY_CTA.section}`} className={styles.cta}>
            {huntsCopy.cta}
            <ArrowRight aria-hidden size={18} />
          </a>
        </div>

        <figure className={styles.figure}>
          <figcaption className={styles.caption}>{huntsCopy.illustrationLabel}</figcaption>
          <div className={styles.screen} role="img" aria-label={exampleHunt.summary}>
            <div className={styles.screenInner} aria-hidden>
              <div className={styles.screenTop}>
                <SlidersHorizontal size={16} />
                <span>New Hunt</span>
                <span className={styles.screenTag}>Illustration</span>
              </div>

              <div className={styles.group}>
                <span className={styles.label}>Product</span>
                <span className={styles.input}>
                  <Search size={14} />
                  {exampleHunt.product}
                </span>
              </div>

              <div className={styles.group}>
                <span className={styles.labelRow}>
                  <span className={styles.label}>Max price</span>
                  <span className={styles.value}>{usd(exampleHunt.maxPriceUsd)}</span>
                </span>
                <span className={styles.track}>
                  <span className={styles.fill} style={{ width: `${exampleHunt.budgetFill * 100}%` }} />
                  <span className={styles.thumb} style={{ left: `${exampleHunt.budgetFill * 100}%` }} />
                </span>
              </div>

              <div className={styles.group}>
                <span className={styles.label}>Condition</span>
                <span className={styles.segmented}>
                  {exampleHunt.conditions.map((c) => (
                    <span key={c.label} className={c.selected ? styles.segmentOn : styles.segment}>
                      {c.label}
                    </span>
                  ))}
                </span>
                <span className={styles.chip}>{exampleHunt.minimumCondition}</span>
              </div>

              <div className={styles.group}>
                <span className={styles.label}>Location</span>
                <span className={styles.input}>
                  <MapPin size={14} />
                  {exampleHunt.location}
                  <ChevronDown size={14} className={styles.push} />
                </span>
              </div>

              <div className={styles.group}>
                <span className={styles.label}>Marketplaces</span>
                <span className={styles.sources}>
                  {exampleHunt.sources.map((key) => (
                    <span key={key} className={styles.sourceOn}>
                      <MarketplaceMark marketplace={marketplaceByKey(key)} size={16} showName={marketplaceByKey(key).logo?.kind !== "wordmark"} />
                    </span>
                  ))}
                  {nextUp.map((m) => (
                    <span key={m.key} className={styles.sourceOff}>
                      {m.name} · soon
                    </span>
                  ))}
                </span>
              </div>

              <span className={styles.screenButton}>Start watching</span>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
