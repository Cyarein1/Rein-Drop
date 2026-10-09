/**
 * Typography - Brand Identity v2.1, section 4: Inter;
 * 400-500 body, 600 controls, 700-800 headlines/KPIs.
 */
export const fontFamily = {
  /** Web uses the variable font + this fallback stack; mobile maps weights to loaded families. */
  sans: 'Inter',
  sansFallback: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;
export type FontWeightToken = keyof typeof fontWeight;

/** Role -> weight, straight from the brand rules. */
export const fontWeightRole = {
  body: 'regular',
  bodyEmphasis: 'medium',
  control: 'semibold',
  heading: 'bold',
  kpi: 'extrabold',
} as const satisfies Record<string, FontWeightToken>;

/**
 * Size scale (px). Engineering defaults - the brand doc does not specify sizes.
 * TODO(brand): confirm with the high-fidelity design pass.
 */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 36,
} as const;
export type FontSizeToken = keyof typeof fontSize;

/** Line height multipliers. */
export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
} as const;

/**
 * Fluid size: `min` px on a 375 px viewport growing linearly to `max` px at 1280 px, clamped
 * outside that range. Emitted as CSS `clamp()` (see css.ts); mobile uses `min`.
 */
export interface FluidSize {
  readonly min: number;
  readonly max: number;
}

/** Viewport range the fluid sizes interpolate over (phone -> desktop). */
export const fluidViewport = { min: 375, max: 1280 } as const;

/**
 * Marketing display scale (landing page, Landing 03). Larger and bolder than the app's `fontSize`
 * scale, which is unchanged. Engineering values sized to the Creative & Experience Spec
 * ("bold, expressive display sizes and readable body text").
 * TODO(brand): confirm with the high-fidelity landing design (Gate C).
 */
export const displaySize = {
  /** Hero headline ("You flip it. We find it."). */
  hero: { min: 40, max: 76 },
  /** Section headlines. */
  xl: { min: 30, max: 48 },
  /** Card / sub-section headlines, oversized deal numbers. */
  lg: { min: 24, max: 34 },
  /** Small display (step titles, callouts). */
  md: { min: 20, max: 24 },
} as const satisfies Record<string, FluidSize>;
export type DisplaySizeToken = keyof typeof displaySize;

/** Marketing body sizes. */
export const marketingText = {
  /** Intro paragraph under a headline. */
  lead: { min: 17, max: 20 },
  /** Small uppercase label above a headline ("HOW REIN DROP WORKS"). */
  eyebrow: { min: 12, max: 13 },
} as const satisfies Record<string, FluidSize>;

/** Letter spacing (em). Tight for big Inter headlines, wide for uppercase eyebrows. */
export const letterSpacing = {
  display: -0.02,
  normal: 0,
  eyebrow: 0.08,
} as const;

/** Line heights for display text (app text keeps `lineHeight`). */
export const displayLineHeight = {
  hero: 1.05,
  heading: 1.15,
} as const;
