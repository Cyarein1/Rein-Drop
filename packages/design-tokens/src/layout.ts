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
