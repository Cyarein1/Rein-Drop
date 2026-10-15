import { Image, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { MarketplaceKey } from '@rein-drop/api-client';
import { MARKETPLACE_LABEL } from '@rein-drop/client-core';
import { fontSize, radius, roles, space } from '@rein-drop/design-tokens';
import { font } from '@/ui';

/**
 * Marketplace logos, the same official files as the landing page (docs/LANDING_ASSETS.md, decision
 * L-D6): used unaltered, next to the marketplace's name - the name is what screen readers hear, so
 * the logo itself is decorative.
 * - eBay: the official 4-colour wordmark SVG (static.ebayinc.com), paths copied exactly.
 * - Facebook Marketplace: Facebook's site icon (no separate Marketplace mark exists).
 */
const EBAY_WORDMARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 191.4 76.7"><g>
<path fill="#ffbd14" d="M121.2,40.7c-8.7,0.3-14.1,1.9-14.1,7.6c0,3.7,3,7.7,10.5,7.7c10.1,0,15.4-5.5,15.4-14.5l0-1 C129.5,40.5,125.1,40.6,121.2,40.7z M142.6,52.6c0,2.8,0.1,5.5,0.3,8H134c-0.2-2-0.3-4.1-0.3-6c-4.8,5.9-10.6,7.6-18.5,7.6 C103.3,62.2,97,56,97,48.7c0-10.5,8.6-14.1,23.5-14.5c4.1-0.1,8.7-0.1,12.5-0.1l0-1c0-7-4.5-9.9-12.3-9.9c-5.8,0-10,2.4-10.5,6.5 h-10.1c1.1-10.3,11.9-12.9,21.4-12.9c11.4,0,21,4.1,21,16.1V52.6z"/>
<path fill="#f02d2d" d="M38.2,35.6c-0.4-9-6.8-12.3-13.8-12.3C17,23.2,11,27,10,35.6H38.2z M9.8,42c0.5,8.7,6.5,13.9,14.8,13.9 c5.7,0,10.8-2.3,12.5-7.4H47C45,58.7,34.1,62.2,24.7,62.2C7.6,62.2,0,52.8,0,40.1c0-14,7.8-23.2,24.8-23.2 c13.5,0,23.5,7.1,23.5,22.5V42H9.8z"/>
<path fill="#0968f6" d="M72.9,55.6c8.9,0,15-6.4,15-16.1c0-9.7-6.1-16.1-15-16.1c-8.9,0-15,6.4-15,16.1 C57.9,49.2,64,55.6,72.9,55.6z M48.3,0h9.6l0,24.1c4.7-5.6,11.2-7.2,17.6-7.2c10.7,0,22.6,7.2,22.6,22.8c0,13-9.4,22.5-22.7,22.5 c-7,0-13.5-2.5-17.6-7.4c0,2-0.1,4-0.3,5.9H48c0.2-3,0.3-6.8,0.3-9.9V0z"/>
<path fill="#92c821" d="M191.4,18.5l-29.7,58.3H151l8.5-16.2l-22.3-42.1h11.2l16.4,32.9l16.4-32.9H191.4z"/>
</g></svg>`;
const EBAY_RATIO = 191.4 / 76.7;
const FACEBOOK_ICON = require('../../assets/marketplaces/facebook.webp');

/** The logo alone, `size` = its height in points. Decorative (pair it with the name). */
export function MarketplaceMark({ marketplace, size = 16 }: { marketplace: MarketplaceKey; size?: number }) {
  if (marketplace === 'ebay') {
    // The wordmark's letters sit lower than a square icon; a slightly taller box reads the same size.
    const height = Math.round(size * 1.15);
    return (
      <View testID="marketplace-mark-ebay" accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <SvgXml xml={EBAY_WORDMARK} width={Math.round(height * EBAY_RATIO)} height={height} />
      </View>
    );
  }
  return (
    <Image
      testID={`marketplace-mark-${marketplace}`}
      source={FACEBOOK_ICON}
      style={[styles.icon, { width: size, height: size }]}
      accessible={false}
      accessibilityIgnoresInvertColors
    />
  );
}

/** Logo + name inline, e.g. on a deal card. The name carries the meaning for screen readers. */
export function MarketplaceName({
  marketplace,
  size = 16,
  showName = true,
  textStyle,
}: {
  marketplace: MarketplaceKey;
  size?: number;
  /** eBay's wordmark already spells the name; set false to show only the logo there. */
  showName?: boolean;
  textStyle?: StyleProp<TextStyle>;
}) {
  const name = MARKETPLACE_LABEL[marketplace];
  const spelled = marketplace === 'ebay' && !showName;
  return (
    <View style={styles.row} accessible accessibilityLabel={name}>
      <MarketplaceMark marketplace={marketplace} size={size} />
      {!spelled && <Text style={[styles.name, font('medium'), textStyle]}>{name}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { borderRadius: radius.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  name: { color: roles.textMuted, fontSize: fontSize.sm },
});
