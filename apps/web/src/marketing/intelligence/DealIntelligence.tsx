import Image from "next/image";
import { CircleAlert, CircleCheck, CircleHelp, Gauge, Receipt } from "lucide-react";
import { ILLUSTRATIVE_LABEL, potentialGrossUpsideUsd, signedUsd, usd } from "../illustrative";
import { marketplaceByKey } from "../marketplaces";
import { MarketplaceMark } from "../marketplaces/MarketplaceMark";
import { productPhotos } from "../photos";
import { intelligenceCopy, showcaseDeal, showcaseNotes } from "./deal-showcase";
import styles from "./DealIntelligence.module.css";

const NOTE_ICONS = { why: CircleCheck, questions: CircleHelp, costs: Receipt } as const;

/** Numbered marker tying a spot on the card to its note (decorative - the notes are an ordered list). */
const Marker = ({ n }: { n: number }) => (
  <span className={styles.marker} aria-hidden>
    {n}
  </span>
);

/**
 * Deal intelligence (Landing 11, spec 07): one oversized, editorial deal card - example product photo,
 * asking price, ESTIMATED resale, potential GROSS upside (the only green) - with three numbered
 * notes: why it was flagged, questions / risks, and the costs that come before any profit.
 * Everything is labelled illustrative; no net-profit claim, no invented costs, no confidence %.
 * Server component.
 */
export function DealIntelligence() {
  const upside = potentialGrossUpsideUsd(showcaseDeal);
  const marketplace = marketplaceByKey(showcaseDeal.marketplace);
  return (
    <section id="intelligence" aria-labelledby="intelligence-heading" tabIndex={-1} className={styles.section}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{intelligenceCopy.eyebrow}</p>
          <h2 id="intelligence-heading" className={styles.heading}>
            {intelligenceCopy.headline}
          </h2>
          <p className={styles.lead}>{intelligenceCopy.lead}</p>
        </header>

        <div className={styles.composition}>
          <figure className={styles.card} aria-labelledby="intelligence-deal">
            <figcaption className={styles.label}>{ILLUSTRATIVE_LABEL} - not a live listing</figcaption>
            <div className={styles.top}>
              <div className={styles.photo}>
                <Image
                  src={productPhotos.playstation5.src}
                  width={productPhotos.playstation5.width}
                  height={productPhotos.playstation5.height}
                  alt={productPhotos.playstation5.alt}
                  sizes="(min-width: 640px) 220px, 90vw"
                  className={styles.photoImage}
                />
                <span className={styles.photoTag} aria-hidden>
                  Example photo
                </span>
              </div>
              <div className={styles.identity}>
                <span className={styles.strengthRow}>
                  <span className={styles.strength}>{showcaseDeal.strength}</span>
                  <Marker n={1} />
                </span>
                <h3 id="intelligence-deal" className={styles.product}>
                  {showcaseDeal.product}
                </h3>
                <p className={styles.details}>{showcaseDeal.details}</p>
                <p className={styles.source}>
                  {/* A wordmark already spells the name; icons get the name beside them. */}
                  <MarketplaceMark marketplace={marketplace} size={18} showName={marketplace.logo?.kind !== "wordmark"} />
                </p>
              </div>
            </div>

            <dl className={styles.numbers}>
              <div>
                <dt>Asking price</dt>
                <dd>{usd(showcaseDeal.askingUsd)}</dd>
              </div>
              <div>
                <dt>
                  Est. resale <span className={styles.estimate}>Estimate</span>
                </dt>
                <dd>{usd(showcaseDeal.estimatedResaleUsd)}</dd>
              </div>
              <div className={styles.upside}>
                <dt>
                  Potential gross upside <Marker n={3} />
                </dt>
                <dd>{signedUsd(upside)}</dd>
                <span className={styles.beforeCosts}>Before fees, shipping, tax and repairs</span>
              </div>
            </dl>

            <p className={styles.confidence}>
              <Gauge aria-hidden size={16} />
              {showcaseDeal.confidence}
              <Marker n={2} />
            </p>
          </figure>

          <ol className={styles.notes}>
            {showcaseNotes.map((note, i) => {
              const Icon = NOTE_ICONS[note.key];
              return (
                <li key={note.key} className={styles.note}>
                  <span className={styles.noteNumber} aria-hidden>
                    {i + 1}
                  </span>
                  <div className={styles.noteBody}>
                    <h3 className={styles.noteTitle}>
                      <Icon aria-hidden size={18} />
                      {note.title}
                    </h3>
                    <ul className={styles.items}>
                      {note.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    {"caution" in note ? (
                      <p className={styles.caution}>
                        <CircleAlert aria-hidden size={16} />
                        {note.caution}
                      </p>
                    ) : null}
                    {"note" in note ? <p className={styles.noteText}>{note.note}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
