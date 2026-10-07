import { brand, neutral, wash } from './colors.js';

/**
 * Semantic meanings -> colors (Brand Identity v2.1, section 3 "UI brand behavior").
 * Components pick a *tone*; only this file decides what the tone looks like.
 */
export const TONES = ['neutral', 'info', 'action', 'fresh', 'profit', 'loss'] as const;
export type Tone = (typeof TONES)[number];

export interface ToneColors {
  /** Soft background for badges/banners. */
  background: string;
  /** Text on `background` (always AA). */
  foreground: string;
  /** Strong accent: borders, icons, dots, large text. */
  accent: string;
}

export const tones: Record<Tone, ToneColors> = {
  /** Structure / intelligence. */
  neutral: { background: neutral.surfaceSubtle, foreground: brand.navy, accent: neutral.textMuted },
  /** Calm information. */
  info: { background: wash.sky, foreground: brand.navy, accent: brand.navy },
  /** Action / Rein Drop. */
  action: { background: wash.orange, foreground: brand.navy, accent: brand.orange },
  /** Fresh opportunity - must be paired with explicit text/timestamp. */
  fresh: { background: wash.yellow, foreground: brand.navy, accent: brand.yellow },
  /** Profit / success. */
  profit: { background: wash.green, foreground: brand.navy, accent: brand.green },
  /** Realized loss / destructive / error. */
  loss: { background: wash.red, foreground: brand.navy, accent: brand.lossRed },
};

/** Text/surface roles used across components. */
export const roles = {
  background: brand.canvas,
  surface: brand.canvas,
  surfaceSecondary: wash.sky,
  text: brand.navy,
  textMuted: neutral.textMuted,
  textDisabled: neutral.textDisabled,
  border: neutral.border,
  focusRing: brand.navy,
  /** Primary action fill; text on it must be `onAction` (navy - white fails contrast). */
  action: brand.orange,
  onAction: brand.navy,
  /**
   * Destructive actions: loss-red border/accent on the red wash with navy text.
   * (White on loss red is 4.38:1 - just under AA for normal-size labels.)
   */
  destructive: brand.lossRed,
  destructiveSurface: wash.red,
  onDestructive: brand.navy,
} as const;
