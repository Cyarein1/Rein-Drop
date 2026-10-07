/**
 * Rein Drop color tokens - Brand Identity v2.1 (light mode).
 *
 * Contrast notes (WCAG 2.x, measured against these exact values):
 * - White text on orange is 2.84:1 (fails AA). Use navy text on orange (5.54:1).
 * - Orange, yellow and green fail AA as small text on white. Use them as fills/accents;
 *   green as text only at large/KPI sizes (3.14:1 passes AA-large).
 * - Loss red on white is 4.38:1: fine for large text and icons; pair small text with navy.
 */

/** Approved brand palette (Brand Identity v2.1, section 1). */
export const brand = {
  canvas: '#FFFFFF', // Canvas White - dominant environment
  navy: '#12233F', // Rein Navy - structure, headings, navigation
  orange: '#FF6B35', // Rein Orange - signature / action
  yellow: '#FFC928', // Drop Yellow - fresh opportunity (always with explicit timestamp/text)
  green: '#16A66A', // Profit Green - profit / success
  skyWash: '#EAF4FF', // Sky Wash - calm secondary surface
  lossRed: '#D64545', // Loss Red - realized loss / destructive / error
} as const;

/** Soft background washes from the Mascot Branding Kit colour reference. */
export const wash = {
  sky: brand.skyWash,
  orange: '#FFF0E8', // Soft Orange - subtle background accents
  yellow: '#FFF8D9', // Soft Yellow - opportunity background / notifications
  /** Derived: Profit Green mixed 88% toward white (navy text 13.8:1). */
  green: '#E3F4ED',
  /** Derived: Loss Red mixed 88% toward white (navy text 13.4:1). */
  red: '#FAE9E9',
} as const;

/**
 * Neutrals. The brand defines no greys, so these are Rein Navy mixed toward white
 * (keeps every grey in the navy family instead of inventing new hues).
 * TODO(brand): replace if design defines an explicit neutral ramp.
 */
export const neutral = {
  textMuted: '#4D5A6F', // navy 75% - secondary text, 6.98:1 on white (AA)
  textDisabled: '#7D8695', // navy 55% - disabled text/placeholders (3.67:1, decorative only)
  border: '#DBDEE2', // navy 15% - subtle borders, dividers
  surfaceSubtle: '#F6F6F7', // navy 4% - subtle fills, skeletons
} as const;

export const colors = {
  ...brand,
  wash,
  neutral,
} as const;

export type BrandColor = keyof typeof brand;
