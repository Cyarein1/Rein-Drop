import { brand, neutral, wash } from './colors.js';
import { container, gutter, radius, sectionSpace, shadow, size, space } from './layout.js';
import { roles, tones } from './semantic.js';
import { displayLineHeight, displaySize, fluidViewport, fontFamily, fontSize, fontWeight, letterSpacing, marketingText, type FluidSize } from './typography.js';

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * CSS `clamp()` for a fluid size: `min` px at 375 px viewport width -> `max` px at 1280 px.
 * Linear in between: size = intercept + slope * 100vw.
 */
export function fluidClamp({ min, max }: FluidSize, viewport = fluidViewport): string {
  const slope = (max - min) / (viewport.max - viewport.min);
  const intercept = min - slope * viewport.min;
  return `clamp(${min}px, ${round(intercept)}px + ${round(slope * 100)}vw, ${max}px)`;
}

/**
 * Tokens as CSS custom properties (`--rd-*`) for web. Generated from the same
 * values mobile uses, so the platforms cannot drift.
 */
export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(brand)) vars[`--rd-color-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(wash)) vars[`--rd-wash-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(neutral)) vars[`--rd-neutral-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(roles)) vars[`--rd-${kebab(k)}`] = v;
  for (const [tone, c] of Object.entries(tones)) {
    vars[`--rd-tone-${tone}-bg`] = c.background;
    vars[`--rd-tone-${tone}-fg`] = c.foreground;
    vars[`--rd-tone-${tone}-accent`] = c.accent;
  }
  for (const [k, v] of Object.entries(space)) vars[`--rd-space-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(radius)) vars[`--rd-radius-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(fontSize)) vars[`--rd-font-size-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(fontWeight)) vars[`--rd-font-weight-${kebab(k)}`] = String(v);
  vars['--rd-font-sans'] = `'${fontFamily.sans}', ${fontFamily.sansFallback}`;
  vars['--rd-touch-target'] = `${size.touchTarget}px`;
  vars['--rd-page-max-width'] = `${size.pageMaxWidth}px`;
  vars['--rd-narrow-max-width'] = `${size.narrowMaxWidth}px`;
  // Marketing (landing page): fluid display type, spacing, containers, elevation.
  for (const [k, v] of Object.entries(displaySize)) vars[`--rd-display-${k}`] = fluidClamp(v);
  for (const [k, v] of Object.entries(marketingText)) vars[`--rd-text-${k}`] = fluidClamp(v);
  for (const [k, v] of Object.entries(letterSpacing)) vars[`--rd-letter-spacing-${k}`] = `${v}em`;
  for (const [k, v] of Object.entries(displayLineHeight)) vars[`--rd-line-height-${k}`] = String(v);
  for (const [k, v] of Object.entries(container)) vars[`--rd-container-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(sectionSpace)) vars[`--rd-section-space-${k}`] = fluidClamp(v);
  for (const [k, v] of Object.entries(shadow)) vars[`--rd-shadow-${k}`] = v;
  vars['--rd-gutter'] = fluidClamp(gutter);
  return vars;
}

/** `:root { ... }` block ready to inline in a <style> tag. */
export function cssVariablesBlock(selector = ':root'): string {
  const body = Object.entries(cssVariables())
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `${selector} {\n${body}\n}`;
}
