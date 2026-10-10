import Image from "next/image";
import { ArrowDown, ArrowRight } from "lucide-react";
import { landingImages } from "../landing-assets";
import { marketplaceByKey } from "../marketplaces";
import { MarketplaceMark } from "../marketplaces/MarketplaceMark";
import { productPhotos } from "../photos";
import { NAV_LINKS, PRIMARY_CTA } from "../sections";
import { StoreBadges } from "../StoreBadges";
import { heroExample, ILLUSTRATIVE_LABEL, potentialGrossUpsideUsd, signedUsd, usd } from "./hero-example";
import styles from "./Hero.module.css";

const mascot = landingImages.heroMascot;
const howItWorks = NAV_LINKS.find((l) => l.section === "how-it-works")!;

/**
 * Hero (Landing 07, Creative & Experience Spec 02): the value in one look - headline, one-line
 * promise, Join early access + See how it works, store badges (coming soon), and on the right the
 * approved mascot presenting a package with a sample deal card. Desktop: asymmetric ~45 / 55;
 * mobile: copy -> CTAs -> compact mascot + card. Every number on the card is labelled
 * illustrative; nothing pretends to be live (no timestamps, counters or "just found").
 * Server-rendered, no client JavaScript.
 */
export function Hero() {
  const upside = potentialGrossUpsideUsd(heroExample);
  return (
    <section id="hero" aria-labelledby="hero-heading" tabIndex={-1} className={styles.hero}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Built for resellers</p>
          <h1 id="hero-heading" className={styles.headline}>
            You flip it.
            <br />
            We <span className={styles.highlight}>find it.</span>
          </h1>
          <p className={styles.lead}>
            Tell Rein Drop what you&apos;re after. We&apos;ll keep an eye on supported marketplaces, spot promising listings and give you a
            heads-up.
          </p>
          <div className={styles.ctas}>
            <a href={`#${PRIMARY_CTA.section}`} className={styles.primary}>
              {PRIMARY_CTA.label}
              <ArrowRight aria-hidden size={18} />
            </a>
            <a href={`#${howItWorks.section}`} className={styles.secondary}>
              See {howItWorks.label.toLowerCase()}
              <ArrowDown aria-hidden size={18} />
            </a>
          </div>
          <StoreBadges />
          <p className={styles.sources}>
            Launch targets: <strong>eBay</strong> and <strong>Facebook Marketplace</strong>. You decide what to buy.
          </p>
        </div>

        <div className={styles.visual}>
          <div className={styles.glow} aria-hidden />
          <Image
            src={mascot.src}
            width={mascot.width}
            height={mascot.height}
            alt=""
            fetchPriority="high"
            loading="eager"
            sizes="(min-width: 900px) 440px, 62vw"
            className={styles.mascot}
          />
          <figure className={styles.card}>
            <figcaption className={styles.cardLabel}>{ILLUSTRATIVE_LABEL} - not a live listing</figcaption>
            <div className={styles.cardBody}>
              <Image
                src={productPhotos.iphone13Pro.src}
                width={productPhotos.iphone13Pro.width}
                height={productPhotos.iphone13Pro.height}
                alt={productPhotos.iphone13Pro.alt}
                sizes="96px"
                className={styles.thumb}
              />
              <div className={styles.cardText}>
                <span className={styles.strength}>{heroExample.strength}</span>
                <p className={styles.product}>{heroExample.product}</p>
                <p className={styles.meta}>
                  <MarketplaceMark marketplace={marketplaceByKey(heroExample.marketplace)} size={16} showName />
                </p>
                <p className={styles.meta}>{heroExample.condition}</p>
              </div>
            </div>
            <dl className={styles.metrics}>
              <div>
                <dt>Asking price</dt>
                <dd>{usd(heroExample.askingUsd)}</dd>
              </div>
              <div>
                <dt>Est. resale</dt>
                <dd>{usd(heroExample.estimatedResaleUsd)}</dd>
              </div>
              <div className={styles.upside}>
                <dt>Potential gross upside</dt>
                <dd>{signedUsd(upside)}</dd>
              </div>
            </dl>
            <p className={styles.footnote}>Before fees, shipping and repairs. Estimates aren&apos;t guaranteed.</p>
          </figure>
        </div>
      </div>
    </section>
  );
}
