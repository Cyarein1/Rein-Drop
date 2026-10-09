import Image from "next/image";
import { Bookmark, Check, CircleHelp, Search, ShieldCheck, ShoppingBag, X } from "lucide-react";
import { landingImages } from "../landing-assets";
import { marketplaceByKey } from "../marketplaces";
import { MarketplaceMark } from "../marketplaces/MarketplaceMark";
import { HOW_IT_WORKS_STEPS, howItWorksCopy, youDecide } from "./how-it-works-story";
import styles from "./HowItWorks.module.css";

const mascot = landingImages.huntWorkingMascot;
const ebay = marketplaceByKey("ebay");
const facebook = marketplaceByKey("facebook");

/** Step 1: a Hunt being set up (UI fragment, decorative - summarised in words on its figure). */
function SetupFragment() {
  return (
    <div className={styles.fragment} aria-hidden>
      <div className={styles.field}>
        <Search size={14} />
        <span>iPhone 13 Pro</span>
      </div>
      <div className={styles.row}>
        <span className={styles.fieldLabel}>Max price</span>
        <span className={styles.value}>$400</span>
      </div>
      <div className={styles.chips}>
        <span className={styles.chipOn}>Used</span>
        <span className={styles.chip}>New</span>
        <span className={styles.chipOn}>Good or better</span>
      </div>
      <div className={styles.row}>
        <span className={styles.fieldLabel}>Where</span>
        <span className={styles.marks}>
          <MarketplaceMark marketplace={ebay} size={16} />
          <MarketplaceMark marketplace={facebook} size={16} />
        </span>
      </div>
    </div>
  );
}

/** Step 2: the approved "running with a box" mascot + the checks (no times, no counters). */
function LookingFragment() {
  return (
    <div className={styles.fragment} aria-hidden>
      <Image src={mascot.src} width={mascot.width} height={mascot.height} alt="" sizes="140px" className={styles.mascot} />
      <ul className={styles.checks}>
        <li>
          <MarketplaceMark marketplace={ebay} size={16} />
          <span>Checked</span>
          <Check size={14} strokeWidth={3} className={styles.ok} />
        </li>
        <li>
          <MarketplaceMark marketplace={facebook} size={16} />
          <span>Checked</span>
          <Check size={14} strokeWidth={3} className={styles.ok} />
        </li>
        <li className={styles.skipped}>
          <X size={14} strokeWidth={3} />
          <span>Over your max price - skipped</span>
        </li>
      </ul>
    </div>
  );
}

/** Step 3: why it was flagged, what to ask, and the reseller's own decision buttons. */
function DecideFragment() {
  return (
    <div className={styles.fragment} aria-hidden>
      <span className={styles.strength}>Strong deal</span>
      <ul className={styles.reasons}>
        <li>
          <Check size={14} strokeWidth={3} className={styles.ok} />
          Under your max price
        </li>
        <li>
          <Check size={14} strokeWidth={3} className={styles.ok} />
          Condition matches your Hunt
        </li>
        <li>
          <CircleHelp size={14} strokeWidth={2.5} className={styles.ask} />
          Ask about battery health
        </li>
      </ul>
      <div className={styles.actions}>
        <span className={styles.action}>
          <Bookmark size={13} />
          Save
        </span>
        <span className={styles.action}>
          <X size={13} />
          Not for me
        </span>
        <span className={styles.actionPrimary}>
          <ShoppingBag size={13} />I bought it
        </span>
      </div>
    </div>
  );
}

const FRAGMENTS = [SetupFragment, LookingFragment, DecideFragment];

/**
 * How it works (Landing 10, spec 05): three connected steps. The sequence is a real ordered list
 * (numbers + "Step n of 3" for assistive tech); the arrows / line between steps are decorative
 * (aria-hidden). One approved mascot on the step where it helps ("keeps looking"). The closing note
 * makes the judgement explicit: Rein Drop never buys for you. Server component.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-heading" tabIndex={-1} className={styles.section}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{howItWorksCopy.eyebrow}</p>
          <h2 id="how-it-works-heading" className={styles.heading}>
            {howItWorksCopy.headline}
          </h2>
          <p className={styles.lead}>{howItWorksCopy.lead}</p>
        </header>

        <ol className={styles.steps}>
          {HOW_IT_WORKS_STEPS.map((step, i) => {
            const Fragment = FRAGMENTS[i]!;
            return (
              <li key={step.title} className={styles.step}>
                <figure className={styles.visual} role="img" aria-label={step.summary}>
                  <Fragment />
                </figure>
                <div className={styles.text}>
                  <span className={styles.number} aria-hidden>
                    {i + 1}
                  </span>
                  <h3 className={styles.stepTitle}>
                    <span className="visually-hidden">Step {i + 1} of {HOW_IT_WORKS_STEPS.length}: </span>
                    {step.title}
                  </h3>
                  <p className={styles.stepText}>{step.text}</p>
                </div>
                {i < HOW_IT_WORKS_STEPS.length - 1 ? <span className={styles.connector} aria-hidden /> : null}
              </li>
            );
          })}
        </ol>

        <aside className={styles.decide} aria-labelledby="how-it-works-decide">
          <ShieldCheck aria-hidden size={28} className={styles.decideIcon} />
          <div>
            <h3 id="how-it-works-decide" className={styles.decideTitle}>
              {youDecide.title}
            </h3>
            <p>{youDecide.text}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
