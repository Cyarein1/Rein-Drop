import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  brand,
  container,
  displaySize,
  fluidClamp,
  marketingText,
  neutral,
  radius,
  sectionSpace,
  shadow,
  space,
  wash,
} from "@rein-drop/design-tokens";
import { landingImages, missingLandingImages, type LandingImageUse } from "@/marketing/landing-assets";
import styles from "./style-reference.module.css";

export const metadata: Metadata = { title: "Landing style reference", robots: { index: false, follow: false } };

const palette = [
  { name: "Canvas White", hex: brand.canvas, use: "Dominant canvas - keep breathing room", token: "--rd-color-canvas" },
  { name: "Rein Navy", hex: brand.navy, use: "Headlines, navigation, structure, text on orange", token: "--rd-color-navy" },
  { name: "Rein Orange", hex: brand.orange, use: "Primary CTA fill, signature accents (navy text on it)", token: "--rd-color-orange" },
  { name: "Drop Yellow", hex: brand.yellow, use: "Fresh opportunity cues - sparingly, never text", token: "--rd-color-yellow" },
  { name: "Profit Green", hex: brand.green, use: "Potential upside / realized profit, always labelled", token: "--rd-color-green" },
] as const;

const washes = [
  { name: "Sky Wash", hex: wash.sky, token: "--rd-wash-sky" },
  { name: "Soft Orange", hex: wash.orange, token: "--rd-wash-orange" },
  { name: "Soft Yellow", hex: wash.yellow, token: "--rd-wash-yellow" },
  { name: "Soft Green", hex: wash.green, token: "--rd-wash-green" },
] as const;

const neutrals = [
  { name: "Muted text", hex: neutral.textMuted, token: "--rd-neutral-text-muted" },
  { name: "Border", hex: neutral.border, token: "--rd-neutral-border" },
  { name: "Subtle surface", hex: neutral.surfaceSubtle, token: "--rd-neutral-surface-subtle" },
] as const;

const type = [
  { token: "--rd-display-hero", size: displaySize.hero, sample: "You flip it. We find it.", className: styles.displayHero },
  { token: "--rd-display-xl", size: displaySize.xl, sample: "A smarter way to source inventory.", className: styles.displayXl },
  { token: "--rd-display-lg", size: displaySize.lg, sample: "+$200 potential gross upside", className: styles.displayLg },
  { token: "--rd-display-md", size: displaySize.md, sample: "Set your Hunt", className: styles.displayMd },
  { token: "--rd-text-lead", size: marketingText.lead, sample: "Tell Rein Drop what you're after. We'll keep an eye on supported marketplaces and give you a heads-up.", className: styles.lead },
  { token: "--rd-text-eyebrow", size: marketingText.eyebrow, sample: "How Rein Drop works", className: styles.eyebrow },
] as const;

/**
 * DEVELOPMENT ONLY (Landing 03): the landing page's brand foundations - palette, type, spacing,
 * radii, shadows and containers, all read from @rein-drop/design-tokens. 404 in production builds.
 * Not a UI kit: it shows the tokens the landing sections are built from.
 */
export default function LandingStyleReference() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Development only · Landing 03</p>
        <h1 className={styles.displayXl}>Landing style reference</h1>
        <p className={styles.lead}>Every value comes from <code>@rein-drop/design-tokens</code> as a <code>--rd-*</code> variable. Resize the window: display sizes, gutters and section spacing are fluid between 375 px and 1280 px.</p>
      </header>

      <section className={styles.block} aria-labelledby="palette">
        <h2 id="palette" className={styles.displayMd}>Brand palette</h2>
        <ul className={styles.swatches}>
          {palette.map((c) => (
            <li key={c.hex} className={styles.swatch}>
              <span className={styles.chip} style={{ background: c.hex }} />
              <strong>{c.name}</strong>
              <code>{c.hex}</code>
              <span className={styles.note}>{c.use}</span>
              <code className={styles.note}>{c.token}</code>
            </li>
          ))}
        </ul>
        <h3 className={styles.subhead}>Washes (section backgrounds, light panels)</h3>
        <ul className={styles.swatches}>
          {washes.map((c) => (
            <li key={c.hex} className={styles.swatch}>
              <span className={styles.chip} style={{ background: c.hex }} />
              <strong>{c.name}</strong>
              <code>{c.hex}</code>
              <code className={styles.note}>{c.token}</code>
            </li>
          ))}
        </ul>
        <h3 className={styles.subhead}>Neutrals (navy-derived)</h3>
        <ul className={styles.swatches}>
          {neutrals.map((c) => (
            <li key={c.hex} className={styles.swatch}>
              <span className={styles.chip} style={{ background: c.hex }} />
              <strong>{c.name}</strong>
              <code>{c.hex}</code>
              <code className={styles.note}>{c.token}</code>
            </li>
          ))}
        </ul>
        <p className={styles.rule}>
          Contrast rule: text on orange is <strong>navy</strong> (5.5:1). White on orange is 2.8:1 and fails even large-text AA, so the
          landing CTA never uses it. Yellow and green are fills and large numbers, not small text.
        </p>
      </section>

      <section className={styles.block} aria-labelledby="type">
        <h2 id="type" className={styles.displayMd}>Type - Inter</h2>
        <ul className={styles.typeList}>
          {type.map((t) => (
            <li key={t.token} className={styles.typeRow}>
              <code className={styles.note}>
                {t.token} · {t.size.min}-{t.size.max}px
              </code>
              <span className={t.className}>{t.sample}</span>
            </li>
          ))}
          <li className={styles.typeRow}>
            <code className={styles.note}>body · 16px / 1.5 (app scale, unchanged)</code>
            <span>Rein Drop checks the marketplaces you care about, so you can stop refreshing the same searches all day.</span>
          </li>
        </ul>
        <p className={styles.note}>Weights: 400 body · 500 emphasis · 600 controls · 700 headlines · 800 hero and big numbers.</p>
      </section>

      <section className={styles.block} aria-labelledby="actions">
        <h2 id="actions" className={styles.displayMd}>Call to action and surfaces</h2>
        <div className={styles.row}>
          <a href="#actions" className={styles.cta}>
            Join early access
          </a>
          <a href="#actions" className={styles.secondary}>
            See how it works
          </a>
        </div>
        <div className={styles.navyPanel}>
          <p className={styles.displayLg}>Spend less time searching. More time flipping.</p>
          <p>White text on navy (15.7:1) - the closing CTA band.</p>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="elevation">
        <h2 id="elevation" className={styles.displayMd}>Radii and shadows</h2>
        <ul className={styles.tiles}>
          {Object.entries(radius)
            .filter(([k]) => k !== "full")
            .map(([k, v]) => (
              <li key={k} className={styles.tile} style={{ borderRadius: v }}>
                <code>--rd-radius-{k}</code>
                <span className={styles.note}>{v}px</span>
              </li>
            ))}
        </ul>
        <ul className={styles.tiles}>
          {Object.entries(shadow).map(([k, v]) => (
            <li key={k} className={styles.tile} style={{ boxShadow: v }}>
              <code>--rd-shadow-{k}</code>
              <span className={styles.note}>{k === "cta" ? "Primary CTA only" : "Navy-tinted"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.block} aria-labelledby="images">
        <h2 id="images" className={styles.displayMd}>Images (Landing 04)</h2>
        <p className={styles.note}>
          Optimized copies in <code>public/assets/brand</code>, generated from <code>packages/brand-assets</code>. Shown at their real aspect
          ratio on a soft wash to check transparency. Register: docs/LANDING_ASSETS.md.
        </p>
        <ul className={styles.assets}>
          {(Object.keys(landingImages) as LandingImageUse[])
            .filter((use) => landingImages[use] !== null)
            .map((use) => {
              const image = landingImages[use]!;
              const dark = use === "wordmarkOnDark" || use === "lockupOnDark";
              return (
                <li key={use} className={styles.asset}>
                  <div className={dark ? styles.assetStageDark : styles.assetStage}>
                    <Image src={image.src} width={image.width} height={image.height} alt="" sizes="240px" className={styles.assetImage} />
                  </div>
                  <code>{use}</code>
                  <span className={styles.note}>
                    {image.src.replace("/assets/brand/", "")} · {image.width}x{image.height} · {Math.round(image.bytes / 1024)} KB
                  </span>
                </li>
              );
            })}
          {missingLandingImages.map((use) => (
            <li key={use} className={styles.asset}>
              <div className={styles.assetMissing}>No approved art</div>
              <code>{use}</code>
              <span className={styles.note}>TODO - neutral visual until approved</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.block} aria-labelledby="spacing">
        <h2 id="spacing" className={styles.displayMd}>Spacing and containers</h2>
        <ul className={styles.spaceList}>
          {Object.entries(space)
            .filter(([k]) => k !== "0")
            .map(([k, v]) => (
              <li key={k}>
                <span className={styles.spaceBar} style={{ width: v }} />
                <code className={styles.note}>
                  --rd-space-{k} · {v}px
                </code>
              </li>
            ))}
        </ul>
        <ul className={styles.plainList}>
          {Object.entries(sectionSpace).map(([k, v]) => (
            <li key={k}>
              <code>--rd-section-space-{k}</code> <span className={styles.note}>{fluidClamp(v)}</span>
            </li>
          ))}
          <li>
            <code>--rd-gutter</code> <span className={styles.note}>16-40px page side padding</span>
          </li>
        </ul>
        <ul className={styles.containers}>
          {Object.entries(container).map(([k, v]) => (
            <li key={k} style={{ maxWidth: v }}>
              <code>--rd-container-{k}</code> <span className={styles.note}>{v}px</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
