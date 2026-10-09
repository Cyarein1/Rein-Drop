import type { Metadata } from "next";
import { SiteNav } from "@/marketing/nav/SiteNav";
import { LANDING_SECTIONS } from "@/marketing/sections";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  // Absolute: the landing page is the brand's front door, not "<page> · Rein Drop".
  title: { absolute: "Rein Drop - You flip it. We find it." },
  description: "Tell Rein Drop what you're hunting for. It keeps an eye on supported marketplaces, spots promising listings and gives you a heads-up.",
};

/**
 * Landing page (docs/LANDING_BUILD_STATUS.md): navigation (Landing 06) + section skeleton (Landing 02);
 * each section is filled in by its own landing step. Sections are focusable (tabIndex -1) so in-page
 * links move keyboard / screen-reader focus to them, not just the scroll position.
 */
export default function LandingPage() {
  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <SiteNav />
      <main id="main-content" className={styles.main}>
        {LANDING_SECTIONS.map((section) =>
          section.id === "hero" ? (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} tabIndex={-1} className={styles.section}>
              <h1 id={`${section.id}-heading`}>You flip it. We find it.</h1>
              <p className={styles.placeholder}>Hero - designed in Landing 07.</p>
            </section>
          ) : (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} tabIndex={-1} className={styles.section}>
              <h2 id={`${section.id}-heading`}>{section.label}</h2>
              <p className={styles.placeholder}>Section placeholder.</p>
            </section>
          ),
        )}
      </main>
    </>
  );
}
