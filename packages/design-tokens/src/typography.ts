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
