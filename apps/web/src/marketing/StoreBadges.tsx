import { PRIMARY_CTA } from "./sections";
import { storeLinks, type StoreLink } from "./store-links";
import styles from "./StoreBadges.module.css";

/** Official badge artwork (docs/LANDING_ASSETS.md) - shown unaltered, never redrawn or recoloured. */
const BADGES = {
  appStore: { src: "/assets/third-party/stores/app-store-badge.svg", width: 120, height: 40, name: "App Store", soonLabel: "Rein Drop for iPhone is coming soon to the App Store - join early access" },
  googlePlay: { src: "/assets/third-party/stores/google-play-badge.png", width: 646, height: 250, name: "Google Play", soonLabel: "Rein Drop for Android is coming soon to Google Play - join early access" },
} as const;

/**
 * App Store + Google Play badges (decision L-D7). Not published yet: each badge leads to the
 * waitlist and the row says "Coming soon"; a configured store URL (store-links.ts) turns that badge
 * into a real download link. `tone` only changes the caption colour for navy backgrounds.
 */
export function StoreBadges({ links = storeLinks(), tone = "light" }: { links?: StoreLink[]; tone?: "light" | "dark" }) {
  const comingSoon = links.some((l) => l.status === "coming_soon");
  return (
    <div className={styles.row} data-tone={tone}>
      <ul className={styles.badges}>
        {links.map((link) => {
          const badge = BADGES[link.store];
          const available = link.status === "available";
          return (
            <li key={link.store}>
              <a
                href={available ? link.href : `#${PRIMARY_CTA.section}`}
                className={styles.badge}
                data-store={link.store}
                aria-label={available ? `Download Rein Drop on ${badge.name}` : badge.soonLabel}
                {...(available ? { rel: "noopener", target: "_blank" } : {})}
              >
                {/* Plain <img>: official artwork served as-is (an SVG and a palette PNG need no optimizer). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {/* Lazy: the closing section's copy is far below the fold; the hero's loads at once anyway (in view). */}
                <img src={badge.src} width={badge.width} height={badge.height} alt="" decoding="async" loading="lazy" />
              </a>
            </li>
          );
        })}
      </ul>
      {comingSoon ? <span className={styles.soon}>Mobile apps coming soon</span> : null}
    </div>
  );
}
