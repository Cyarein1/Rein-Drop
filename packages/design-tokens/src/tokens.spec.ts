import { describe, expect, it } from 'vitest';
import { brand, container, cssVariables, displaySize, fluidClamp, fluidViewport, marketingText, radius, roles, sectionSpace, shadow, size, TONES, tones, wash } from './index.js';

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

describe('marketing tokens (landing page)', () => {
  /** Evaluates `clamp(MINpx, Apx + Bvw, MAXpx)` at a viewport width. */
  const at = (css: string, vw: number) => {
    const m = /^clamp\((\d+)px, (-?[\d.]+)px \+ ([\d.]+)vw, (\d+)px\)$/.exec(css);
    if (!m) throw new Error(`not a fluid clamp: ${css}`);
    const [, min, a, b, max] = m.map(Number) as [number, number, number, number, number];
    return Math.min(max, Math.max(min, a + (b * vw) / 100));
  };

  it('fluid sizes hit their min on phones and their max on desktops', () => {
    for (const s of [...Object.values(displaySize), ...Object.values(marketingText), ...Object.values(sectionSpace)]) {
      const css = fluidClamp(s);
      expect(at(css, 320)).toBe(s.min);
      expect(at(css, fluidViewport.min)).toBeCloseTo(s.min, 1);
      expect(at(css, fluidViewport.max)).toBeCloseTo(s.max, 1);
      expect(at(css, 1920)).toBe(s.max);
    }
  });

  it('display sizes stay larger than the app scale and keep their order', () => {
    expect(displaySize.hero.max).toBeGreaterThan(displaySize.xl.max);
    expect(displaySize.xl.max).toBeGreaterThan(displaySize.lg.max);
    expect(displaySize.lg.max).toBeGreaterThan(displaySize.md.max);
    // The app's largest size (36) is unchanged; marketing headlines start above body text.
    expect(displaySize.md.min).toBeGreaterThanOrEqual(20);
  });

  it('containers, radii and shadows extend the system without changing app values', () => {
    expect(container.page).toBe(size.pageMaxWidth);
    expect(container.narrow).toBe(size.narrowMaxWidth);
    expect(container.prose).toBeLessThan(container.page);
    expect(container.wide).toBeGreaterThan(container.page);
    expect(radius).toMatchObject({ sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32 });
    // Shadows stay in the navy family (no black / grey); only the CTA glow is orange.
    for (const [k, v] of Object.entries(shadow)) {
      if (k === 'cta') expect(v).toContain('255, 107, 53');
      else expect(v).not.toMatch(/rgba\(0, 0, 0|#000/);
    }
  });

  it('landing text pairs are readable (navy on every wash, navy on the orange CTA)', () => {
    for (const bg of [brand.canvas, wash.sky, wash.orange, wash.yellow, wash.green]) expect(contrast(brand.navy, bg)).toBeGreaterThanOrEqual(AA);
    expect(contrast(brand.navy, brand.orange)).toBeGreaterThanOrEqual(AA);
    expect(contrast(brand.canvas, brand.navy)).toBeGreaterThanOrEqual(AA);
    // White on orange fails even large-text AA (3:1) - the landing CTA must not use it.
    expect(contrast(brand.canvas, brand.orange)).toBeLessThan(3);
  });

  it('are exposed as CSS variables', () => {
    const vars = cssVariables();
    expect(vars['--rd-display-hero']).toBe(fluidClamp(displaySize.hero));
    expect(vars['--rd-text-lead']).toMatch(/^clamp\(/);
    expect(vars['--rd-section-space-default']).toMatch(/^clamp\(64px, /);
    expect(vars['--rd-gutter']).toMatch(/^clamp\(16px, /);
    expect(vars['--rd-container-wide']).toBe('1280px');
    expect(vars['--rd-shadow-xl']).toBe(shadow.xl);
    expect(vars['--rd-radius-2xl']).toBe('32px');
    expect(vars['--rd-letter-spacing-eyebrow']).toBe('0.08em');
    expect(vars['--rd-line-height-hero']).toBe('1.05');
  });
});
