import { Image } from 'react-native';
import { logoAssets } from './assets';

export interface WordmarkProps {
  height?: number;
  /** Use on navy/dark surfaces. */
  onDark?: boolean;
}

/** MVP logo: the simple Rein Drop wordmark (Brand Identity v2.1, section 5). */
export function Wordmark({ height = 32, onDark = false }: WordmarkProps) {
  return (
    <Image
      source={onDark ? logoAssets.wordmarkOnDark : logoAssets.wordmark}
      style={{ height, width: height * logoAssets.aspectRatio }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Rein Drop"
    />
  );
}
