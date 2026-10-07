import type { Tone } from './semantic.js';

/**
 * Shared component *contracts* (variants/props), from the Mobile UI Screenbook
 * section 10 "Component system to design first". Web and mobile implement these
 * separately; sharing the types keeps behavior and naming aligned.
 */

/** Primary orange - secondary outline - text - destructive. Loading/disabled are props. */
export const BUTTON_VARIANTS = ['primary', 'secondary', 'text', 'destructive'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

/** Text - password - money - search (+ email for account creation). */
export const TEXT_INPUT_KINDS = ['text', 'email', 'password', 'money', 'search'] as const;
export type TextInputKind = (typeof TEXT_INPUT_KINDS)[number];

/** Badge uses (freshness, marketplace, confidence, status) are expressed through tones. */
export type BadgeTone = Tone;

/** Neutral - profit - loss; `estimated` and `comparison` are props (estimated values must be labeled). */
export const METRIC_TONES = ['neutral', 'profit', 'loss'] as const;
export type MetricTone = (typeof METRIC_TONES)[number];

/** Source degraded -> warning, payment issue -> error, plan limit -> info/warning. */
export const BANNER_TONES = ['info', 'success', 'warning', 'error'] as const;
export type BannerTone = (typeof BANNER_TONES)[number];

/** Banner tone -> color tone. Warning uses Drop Yellow wash; errors use Loss Red. */
export const bannerToneColors: Record<BannerTone, Tone> = {
  info: 'info',
  success: 'profit',
  warning: 'fresh',
  error: 'loss',
};
