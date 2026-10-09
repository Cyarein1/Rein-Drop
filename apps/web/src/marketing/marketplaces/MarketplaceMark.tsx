import { Store } from "lucide-react";
import type { MarketplaceEntry } from "../marketplaces";
import styles from "./MarketplaceMark.module.css";

/**
 * A marketplace's official mark (unaltered file, decision L-D6) at a given height, or - when no
 * official file is available - a neutral store glyph that is clearly not the brand's logo. The
 * brand name is always the accessible text (logos are decorative next to it).
 */
export function MarketplaceMark({ marketplace, size = 40, showName = false }: { marketplace: MarketplaceEntry; size?: number; showName?: boolean }) {
  const logo = marketplace.logo;
  return (
    <span className={styles.mark} style={{ "--mark-size": `${size}px` } as React.CSSProperties}>
      {logo ? (
        // Official third-party files served as-is (tiny PNG / WebP / SVG): no optimizer re-encoding.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo.src}
          alt=""
          width={logo.kind === "wordmark" ? Math.round((logo.width / logo.height) * size) : size}
          height={size}
          decoding="async"
          loading="lazy"
          className={logo.kind === "wordmark" ? styles.wordmark : styles.icon}
        />
      ) : (
        <span className={styles.fallback} aria-hidden>
          <Store size={Math.round(size * 0.5)} strokeWidth={1.75} />
        </span>
      )}
      {showName ? <span className={styles.name}>{marketplace.name}</span> : <span className="visually-hidden">{marketplace.name}</span>}
    </span>
  );
}
