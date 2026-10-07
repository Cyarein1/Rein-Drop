/**
 * Rein Drop design tokens - shared by web and mobile.
 * Values and types only: no React, no CSS-in-JS, no platform UI code.
 *
 * Sources: Brand Identity v2.1 (palette, semantics, typography), Mascot Usage
 * Guide v1.0 (mascot tokens), Mobile UI Screenbook v1.0 (component variants,
 * card radius, touch targets). Values marked "engineering default" are not
 * brand-specified.
 */
export * from './colors.js';
export * from './semantic.js';
export * from './typography.js';
export * from './layout.js';
export * from './components.js';
export * from './mascot.js';
export * from './css.js';

export type { BrandColor as ColorToken } from './colors.js';
