import { describe, expect, it } from 'vitest';
import { brand, cssVariables, roles, TONES, tones } from './index.js';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;

describe('brand palette', () => {
  it('matches Brand Identity v2.1 exactly', () => {
    expect(brand).toEqual({
      canvas: '#FFFFFF',
      navy: '#12233F',
      orange: '#FF6B35',
      yellow: '#FFC928',
      green: '#16A66A',
      skyWash: '#EAF4FF',
      lossRed: '#D64545',
    });
  });
});

describe('contrast (WCAG AA)', () => {
  it.each(TONES)('%s tone text is readable on its background', (tone) => {
    expect(contrast(tones[tone].foreground, tones[tone].background)).toBeGreaterThanOrEqual(AA);
  });

  it('primary action label is readable on orange', () => {
    expect(contrast(roles.onAction, roles.action)).toBeGreaterThanOrEqual(AA);
  });

  it('destructive label is readable on its surface', () => {
    expect(contrast(roles.onDestructive, roles.destructiveSurface)).toBeGreaterThanOrEqual(AA);
  });

  it('body and muted text are readable on the canvas', () => {
    expect(contrast(roles.text, roles.background)).toBeGreaterThanOrEqual(AA);
    expect(contrast(roles.textMuted, roles.background)).toBeGreaterThanOrEqual(AA);
  });
});

describe('cssVariables', () => {
  it('exposes brand, role and tone variables for web', () => {
    const vars = cssVariables();
    expect(vars['--rd-color-navy']).toBe('#12233F');
    expect(vars['--rd-on-action']).toBe(brand.navy);
    expect(vars['--rd-tone-fresh-accent']).toBe(brand.yellow);
    expect(vars['--rd-radius-md']).toBe('12px');
  });
});
