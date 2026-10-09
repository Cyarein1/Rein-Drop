import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/brand/Wordmark";
import { LANDING_SECTIONS } from "@/marketing/sections";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  // Absolute: the landing page is the brand's front door, not "<page> · Rein Drop".
  title: { absolute: "Rein Drop - You flip it. We find it." },
  description: "Tell Rein Drop what you're hunting for. It keeps an eye on supported marketplaces, spots promising listings and gives you a heads-up.",
};

/**
 * Landing page skeleton (Landing 02): the section structure and anchors only - no final design yet.
 * Each section is filled in by its own landing step (docs/LANDING_BUILD_STATUS.md).
 */
export default function LandingPage() {
  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link href="/" aria-label="Rein Drop home">
          <Wordmark height={28} priority />
        </Link>
        <nav aria-label="Page sections" className={styles.nav}>
          <a href="#how-it-works">How it works</a>
          <a href="#marketplaces">Marketplaces</a>
          <a href="#faq">FAQ</a>
          <Link href="/sign-in">Sign in</Link>
          <a href="#waitlist">Join early access</a>
        </nav>
      </header>
      <main id="main-content" className={styles.main}>
        {LANDING_SECTIONS.map((section) =>
          section.id === "hero" ? (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className={styles.section}>
              <h1 id={`${section.id}-heading`}>You flip it. We find it.</h1>
              <p className={styles.placeholder}>Hero - designed in Landing 07.</p>
            </section>
          ) : (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className={styles.section}>
              <h2 id={`${section.id}-heading`}>{section.label}</h2>
              <p className={styles.placeholder}>Section placeholder.</p>
            </section>
          ),
        )}
      </main>
    </>
  );
}
