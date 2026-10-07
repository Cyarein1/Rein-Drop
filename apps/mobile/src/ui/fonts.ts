import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import type { FontWeightToken } from '@rein-drop/design-tokens';
import type { TextStyle } from 'react-native';

/** Only the weights the brand uses (400-800), so unused font files are not bundled. */
export const interFonts = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
};

/**
 * React Native selects custom font weights by family name, not fontWeight.
 * Falls back to the system font (with a matching fontWeight) if Inter failed to load.
 */
const FAMILY: Record<FontWeightToken, keyof typeof interFonts> = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
};

const SYSTEM_WEIGHT: Record<FontWeightToken, TextStyle['fontWeight']> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
};

let interLoaded = false;
export function setInterLoaded(loaded: boolean) {
  interLoaded = loaded;
}

export function font(weight: FontWeightToken): TextStyle {
  return interLoaded ? { fontFamily: FAMILY[weight] } : { fontWeight: SYSTEM_WEIGHT[weight] };
}
