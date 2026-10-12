import type { Metadata } from "next";
import type { ComponentType } from "react";
import { AlertsSection } from "@/marketing/alerts/AlertsSection";
import { ClosingCta } from "@/marketing/closing/ClosingCta";
import { HuntDemo } from "@/marketing/demo/HuntDemo";
import { FaqSection } from "@/marketing/faq/FaqSection";
import { SiteFooter } from "@/marketing/footer/SiteFooter";
import { Hero } from "@/marketing/hero/Hero";
import { HowItWorks } from "@/marketing/how-it-works/HowItWorks";
import { HuntPreferences } from "@/marketing/hunts/HuntPreferences";
import { DealIntelligence } from "@/marketing/intelligence/DealIntelligence";
import { MarketplaceGallery } from "@/marketing/marketplaces/MarketplaceGallery";
import { SiteNav } from "@/marketing/nav/SiteNav";
import { OutcomesSection } from "@/marketing/outcomes/OutcomesSection";
import { ProblemSection } from "@/marketing/problem/ProblemSection";
import { LANDING_SECTIONS, type LandingSectionId } from "@/marketing/sections";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  // Absolute: the landing page is the brand's front door, not "<page> · Rein Drop".
  title: { absolute: "Rein Drop - You flip it. We find it." },
  description: "Tell Rein Drop what you're hunting for. It keeps an eye on supported marketplaces, spots promising listings and gives you a heads-up.",
};

/** Each section id -> its component (each renders its own <section id=...>). Typed so none is missing. */
const SECTIONS: Record<LandingSectionId, ComponentType> = {
  hero: Hero, // Landing 07
  marketplaces: MarketplaceGallery, // Landing 08
  problem: ProblemSection, // Landing 09
  "how-it-works": HowItWorks, // Landing 10
  demo: HuntDemo, // Landing 14-15 (interactive, illustrative)
  intelligence: DealIntelligence, // Landing 11
  hunts: HuntPreferences, // Landing 12
  alerts: AlertsSection, // Landing 12
  outcomes: OutcomesSection, // Landing 13
  faq: FaqSection, // Landing 13
  waitlist: ClosingCta, // Landing 13 (form wired in Landing 20)
};

/**
 * Landing page (docs/LANDING_BUILD_STATUS.md): navigation (Landing 06), the sections in narrative
 * order (LANDING_SECTIONS), footer (Landing 13). Sections are focusable (tabIndex -1) so in-page
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
        {LANDING_SECTIONS.map(({ id }) => {
          const Section = SECTIONS[id];
          return <Section key={id} />;
        })}
      </main>
      <SiteFooter />
    </>
  );
}
