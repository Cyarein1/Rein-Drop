import { brandImages, type BrandImage } from "./brand-assets.generated";

/**
 * Landing page imagery by MEANING (Landing 04). Sections ask for a use ("heroMascot"), never a file
 * name. Only approved Rein Drop art (packages/brand-assets -> optimized copies in
 * public/assets/brand); `null` = no approved pose yet -> the section shows a neutral visual and
 * the gap is tracked in docs/LANDING_ASSETS.md. Never substitute other art, the mockup or the
 * concept sheets.
 */
export const landingImages = {
  // ---- Mascot moments (Creative & Experience Spec section 9) ----
  /** Hero: friendly pose presenting a package. */
  heroMascot: brandImages["mascot/holding-box"],
  /** "We keep looking" / the demo's Hunt starting: carrying pose on the move. */
  huntWorkingMascot: brandImages["mascot/running-box"],
  /** Closing CTA band ("Spend less time searching. More time flipping."): moving inventory. */
  closingMascot: brandImages["mascot/delivery-dash"],
  /** Welcome / friendly hello (waitlist section intro). */
  welcomeMascot: brandImages["mascot/wave"],
  /** Waitlist confirmation ("You're on the list"). */
  confirmedMascot: brandImages["mascot/thumbs-up"],
  /** Deal intelligence / demo evaluation - TODO: thinking pose not approved. */
  thinkingMascot: null,
  /** "Rein Drop searches" step - TODO: searching / inspecting pose (e.g. magnifier) not approved. */
  searchingMascot: null,
  /** Alerts section - TODO: phone / notification pose not approved. */
  alertMascot: null,
  /** Create-a-Hunt step - TODO: planning / checklist pose not approved. */
  planningMascot: null,
  /** Demo's rare exceptional deal - TODO: surprised / exclamation pose not approved. */
  exceptionalMascot: null,
  /** Completed sale (outcomes) - TODO: celebration pose not approved; never for speculative profit. */
  celebrationMascot: null,

  // ---- Logos ----
  /** Header and light surfaces. */
  wordmark: brandImages["logo/wordmark-navy"],
  /** Navy surfaces (closing band, footer if dark). */
  wordmarkOnDark: brandImages["logo/wordmark-white"],
  /** Mascot + wordmark lock-up: social preview / share image (Landing 22). */
  lockup: brandImages["logo/lockup-horizontal"],
  /** Lock-up with a dark glow baked in: navy backgrounds only. */
  lockupOnDark: brandImages["logo/lockup-hero-dark"],
  /** App icon: next to the store badges. */
  appIcon: brandImages["icon/app-icon"],
} as const satisfies Record<string, BrandImage | null>;

export type LandingImageUse = keyof typeof landingImages;

/** Uses still waiting for approved art (for docs / tests). */
export const missingLandingImages = (Object.keys(landingImages) as LandingImageUse[]).filter((k) => landingImages[k] === null);
