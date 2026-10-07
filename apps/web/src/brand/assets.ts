import type { StaticImageData } from "next/image";
import type { MascotToken } from "@rein-drop/design-tokens";
import wordmarkNavy from "@rein-drop/brand-assets/logo/wordmark-navy.png";
import wordmarkWhite from "@rein-drop/brand-assets/logo/wordmark-white.png";
import mascotWave from "@rein-drop/brand-assets/mascot/mascot-wave.png";
import mascotThumbsUp from "@rein-drop/brand-assets/mascot/mascot-thumbs-up.png";
import mascotHoldingBox from "@rein-drop/brand-assets/mascot/mascot-holding-box.png";

/**
 * The only place web code maps brand tokens to files (see packages/brand-assets/README.md).
 * `null` = no approved asset yet -> render nothing. Never substitute other artwork.
 */
export const mascotAssets: Record<MascotToken, StaticImageData | null> = {
  welcome: mascotWave,
  confirmed: mascotThumbsUp,
  inventory: mascotHoldingBox,
  working: null,
  waiting: null,
  afterHours: null,
  suggestion: null,
  analysis: null,
  exceptionalDeal: null,
  success: null,
  profit: null,
  cancellation: null,
};

export const logoAssets = {
  /** Default: on white/light surfaces. */
  wordmark: wordmarkNavy,
  /** On navy/dark surfaces only. */
  wordmarkOnDark: wordmarkWhite,
} as const;
