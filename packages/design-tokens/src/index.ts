/**
 * Rein Drop light brand. Plain values so web (CSS) and mobile (StyleSheet)
 * can both consume them.
 *
 * TODO(brand): typography, spacing and radius scales are not specified yet.
 */
export const colors = {
  canvas: '#FFFFFF',
  navy: '#12233F',
  orange: '#FF6B35',
  yellow: '#FFC928',
  green: '#16A66A',
} as const;

export type ColorToken = keyof typeof colors;
