/**
 * Spacing, radius and sizing. Engineering defaults (4px grid) except where a
 * source document specifies a value.
 */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;
export type SpaceToken = keyof typeof space;

export const radius = {
  sm: 8,
  /** Cards: "12px-ish radius" (Mobile UI Screenbook, section 1). */
  md: 12,
  lg: 16,
  /** Marketing feature cards and the demo stage. */
  xl: 24,
  /** Large marketing panels (closing CTA band). */
  '2xl': 32,
  full: 9999,
} as const;

export const size = {
  /** Minimum touch target ("large mobile targets", Screenbook section 1; 48dp Android guideline). */
  touchTarget: 48,
  borderWidth: 1,
  focusRingWidth: 2,
  /** Max content width for web pages. */
  pageMaxWidth: 1120,
  /** Max width for single-column forms/onboarding on web. */
  narrowMaxWidth: 560,
} as const;

/**
 * Container widths for marketing pages (the app keeps `size.pageMaxWidth` / `narrowMaxWidth`).
 * Content never touches the viewport edge: see `gutter`.
 */
export const container = {
  /** Running text (FAQ answers, legal pages): ~70 characters per line. */
  prose: 680,
  /** Single-column blocks (waitlist form, centred CTA). */
  narrow: 560,
  /** Default section content (same as the app page width). */
  page: 1120,
  /** Wide editorial sections (hero, interactive demo stage). */
  wide: 1280,
} as const;
export type ContainerToken = keyof typeof container;

/** Horizontal page padding, phone -> desktop (fluid, px). 16 px matches the mobile 16 px side gutter. */
export const gutter = { min: 16, max: 40 } as const;

/** Vertical space between marketing sections (fluid, px). */
export const sectionSpace = {
  /** Default section padding (top and bottom). */
  default: { min: 64, max: 120 },
  /** Dense sections (marketplace strip, footer). */
  compact: { min: 40, max: 72 },
} as const;

/**
 * Elevation - Rein Navy shadows (no grey / black, so they stay in the brand family), soft and
 * light-first. `cta` is the one coloured shadow: under the primary orange call to action only.
 */
export const shadow = {
  sm: '0 1px 2px rgba(18, 35, 63, 0.06), 0 1px 3px rgba(18, 35, 63, 0.08)',
  md: '0 4px 12px rgba(18, 35, 63, 0.08), 0 2px 4px rgba(18, 35, 63, 0.04)',
  lg: '0 12px 32px rgba(18, 35, 63, 0.12), 0 4px 8px rgba(18, 35, 63, 0.04)',
  /** Floating product cards over the hero / demo. */
  xl: '0 24px 56px rgba(18, 35, 63, 0.16), 0 8px 16px rgba(18, 35, 63, 0.06)',
  cta: '0 8px 20px rgba(255, 107, 53, 0.32)',
} as const;
export type ShadowToken = keyof typeof shadow;
