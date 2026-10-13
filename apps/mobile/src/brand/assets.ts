import type { ImageSourcePropType } from 'react-native';
import type { MascotToken } from '@rein-drop/design-tokens';

/**
 * The only place mobile code maps brand tokens to files (see packages/brand-assets/README.md).
 * `null` = no approved asset yet -> render nothing. Never substitute other artwork.
 */
export const mascotAssets: Record<MascotToken, ImageSourcePropType | null> = {
  welcome: require('@rein-drop/brand-assets/mascot/mascot-wave.png'),
  confirmed: require('@rein-drop/brand-assets/mascot/mascot-thumbs-up.png'),
  inventory: require('@rein-drop/brand-assets/mascot/mascot-holding-box.png'),
  working: require('@rein-drop/brand-assets/mascot/mascot-working.png'),
  waiting: require('@rein-drop/brand-assets/mascot/mascot-leaning-box.png'),
  afterHours: require('@rein-drop/brand-assets/mascot/mascot-sleeping.png'),
  suggestion: require('@rein-drop/brand-assets/mascot/mascot-thinking.png'),
  analysis: require('@rein-drop/brand-assets/mascot/mascot-magnifier.png'),
  exceptionalDeal: require('@rein-drop/brand-assets/mascot/mascot-surprised.png'),
  success: require('@rein-drop/brand-assets/mascot/mascot-celebrating.png'),
  profit: require('@rein-drop/brand-assets/mascot/mascot-profit.png'),
  cancellation: require('@rein-drop/brand-assets/mascot/mascot-sad.png'),
};

export const logoAssets = {
  /** Default: on white/light surfaces. Source is 1983x793. */
  wordmark: require('@rein-drop/brand-assets/logo/wordmark-navy.png') as ImageSourcePropType,
  /** On navy/dark surfaces only. */
  wordmarkOnDark: require('@rein-drop/brand-assets/logo/wordmark-white.png') as ImageSourcePropType,
  aspectRatio: 1983 / 793,
};
