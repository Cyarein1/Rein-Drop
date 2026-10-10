import Image from "next/image";
import { Bell, Check, RotateCw, X } from "lucide-react";
import { landingImages } from "../landing-assets";
import { marketplaceByKey } from "../marketplaces";
import { MarketplaceMark } from "../marketplaces/MarketplaceMark";
import { productPhotos } from "../photos";
import { afterStory, beforeStory, problemCopy } from "./problem-story";
import styles from "./ProblemSection.module.css";

const LISTING_PHOTOS = [productPhotos.iphoneListing1, productPhotos.iphoneListing2, productPhotos.iphoneListing3];

/**
 * The problem (Landing 09, spec 04): two opposing worlds side by side. Before = a crowded browser
 * (marketplace tabs, refresh, listings that turn out sold / too expensive / seen); after = one saved
 * Hunt, live, with a heads-up. Illustrations are pure CSS / UI fragments (role="img" + a text
 * summary); the meaning is also in the visible points, so nothing depends on the picture.
 * Server component, no client JavaScript.
 */
export function ProblemSection() {
  return (
    <section id="problem" aria-labelledby="problem-heading" tabIndex={-1} className={styles.section}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{problemCopy.eyebrow}</p>
          <h2 id="problem-heading" className={styles.heading}>
            {problemCopy.headline}
          </h2>
          <p className={styles.lead}>{problemCopy.lead}</p>
        </header>

        <div className={styles.compare}>
          {/* ---------------- Before ---------------- */}
          <article className={styles.before} aria-labelledby="problem-before">
            <h3 id="problem-before" className={styles.cardTitle}>
              <span className={styles.badgeBefore}>Before</span>
              {beforeStory.title}
            </h3>
            <div className={styles.browser} role="img" aria-label={beforeStory.summary}>
              <div className={styles.tabs} aria-hidden>
                {beforeStory.tabs.map((tab, i) => (
                  <span key={i} className={styles.tab} data-active={i === 2 || undefined}>
                    {tab}
                  </span>
                ))}
              </div>
              <div className={styles.toolbar} aria-hidden>
                <RotateCw size={14} strokeWidth={2.4} />
                <span className={styles.address}>Search: iphone 13 pro</span>
              </div>
              <ul className={styles.listings} aria-hidden>
                {beforeStory.listings.map((l, i) => (
                  <li key={i} className={styles.listing}>
                    <Image src={LISTING_PHOTOS[i]!.src} width={LISTING_PHOTOS[i]!.width} height={LISTING_PHOTOS[i]!.height} alt="" sizes="72px" className={styles.listingThumb} />
                    <span className={styles.listingTitle}>{l.title}</span>
                    <span className={styles.outcome}>
                      <X size={12} strokeWidth={3} />
                      {l.outcome}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <ul className={styles.points}>
              {beforeStory.points.map((p) => (
                <li key={p}>
                  <X aria-hidden size={16} strokeWidth={2.6} className={styles.iconBefore} />
                  {p}
                </li>
              ))}
            </ul>
          </article>

          <div className={styles.arrow} aria-hidden>
            <span>vs</span>
          </div>

          {/* ---------------- After ---------------- */}
          <article className={styles.after} aria-labelledby="problem-after">
            <h3 id="problem-after" className={styles.cardTitle}>
              <span className={styles.badgeAfter}>After</span>
              {afterStory.title}
            </h3>
            <div className={styles.huntStage} role="img" aria-label={afterStory.summary}>
              <div className={styles.huntCard} aria-hidden>
                <div className={styles.huntTop}>
                  <span className={styles.huntName}>{afterStory.hunt.name}</span>
                  <span className={styles.live}>{afterStory.hunt.status}</span>
                </div>
                <div className={styles.chips}>
                  {afterStory.hunt.criteria.map((c) => (
                    <span key={c} className={styles.chip}>
                      {c}
                    </span>
                  ))}
                </div>
                <div className={styles.sources}>
                  {afterStory.hunt.marketplaces.map((key) => (
                    <MarketplaceMark key={key} marketplace={marketplaceByKey(key)} size={18} />
                  ))}
                  <span className={styles.sourcesText}>eBay + Facebook Marketplace</span>
                </div>
              </div>
              <div className={styles.headsUp} aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={landingImages.appIcon.src} width={32} height={32} alt="" className={styles.appIcon} />
                <span className={styles.headsUpText}>
                  <strong>Rein Drop</strong>
                  {afterStory.headsUp}
                </span>
                <Bell size={16} className={styles.bell} />
              </div>
            </div>
            <ul className={styles.points}>
              {afterStory.points.map((p) => (
                <li key={p}>
                  <Check aria-hidden size={16} strokeWidth={2.8} className={styles.iconAfter} />
                  {p}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
