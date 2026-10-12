"use client";

import type { AnchorHTMLAttributes } from "react";
import { trackLanding } from "./analytics";
import type { LandingEventProps } from "./landing-events";

/**
 * A plain link that records which hero CTA was used (Landing 21) - lets the hero stay a server
 * component. Navigation is untouched: the event is fire-and-forget.
 */
export function TrackedHeroLink({ cta, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & LandingEventProps<"hero_cta_clicked">) {
  return (
    <a
      {...rest}
      onClick={(e) => {
        trackLanding("hero_cta_clicked", { cta });
        onClick?.(e);
      }}
    />
  );
}
