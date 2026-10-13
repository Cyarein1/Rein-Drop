import type { StaticImageData } from "next/image";
import type { MascotToken } from "@rein-drop/design-tokens";
import wordmarkNavy from "@rein-drop/brand-assets/logo/wordmark-navy.png";
import wordmarkWhite from "@rein-drop/brand-assets/logo/wordmark-white.png";
import mascotWave from "@rein-drop/brand-assets/mascot/mascot-wave.png";
import mascotThumbsUp from "@rein-drop/brand-assets/mascot/mascot-thumbs-up.png";
import mascotHoldingBox from "@rein-drop/brand-assets/mascot/mascot-holding-box.png";
import mascotWorking from "@rein-drop/brand-assets/mascot/mascot-working.png";
import mascotLeaningBox from "@rein-drop/brand-assets/mascot/mascot-leaning-box.png";
import mascotSleeping from "@rein-drop/brand-assets/mascot/mascot-sleeping.png";
import mascotThinking from "@rein-drop/brand-assets/mascot/mascot-thinking.png";
import mascotMagnifier from "@rein-drop/brand-assets/mascot/mascot-magnifier.png";
import mascotSurprised from "@rein-drop/brand-assets/mascot/mascot-surprised.png";
import mascotCelebrating from "@rein-drop/brand-assets/mascot/mascot-celebrating.png";
import mascotProfit from "@rein-drop/brand-assets/mascot/mascot-profit.png";
import mascotSad from "@rein-drop/brand-assets/mascot/mascot-sad.png";

/**
 * The only place web code maps brand tokens to files (see packages/brand-assets/README.md).
 * `null` = no approved asset yet -> render nothing. Never substitute other artwork.
 */
export const mascotAssets: Record<MascotToken, StaticImageData | null> = {
  welcome: mascotWave,
  confirmed: mascotThumbsUp,
  inventory: mascotHoldingBox,
  working: mascotWorking,
  waiting: mascotLeaningBox,
  afterHours: mascotSleeping,
  suggestion: mascotThinking,
  analysis: mascotMagnifier,
  exceptionalDeal: mascotSurprised,
  success: mascotCelebrating,
  profit: mascotProfit,
  cancellation: mascotSad,
};

export const logoAssets = {
  /** Default: on white/light surfaces. */
  wordmark: wordmarkNavy,
  /** On navy/dark surfaces only. */
  wordmarkOnDark: wordmarkWhite,
} as const;
