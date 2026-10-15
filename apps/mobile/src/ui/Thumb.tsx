import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { radius } from '@rein-drop/design-tokens';
import { Icon, icons } from './Icon';
import { colors } from './theme';

/** Product photo (cached by expo-image); a neutral placeholder when there is none. Decorative - the row names the item. */
export function Thumb({ uri, size = 88, rounded = radius.sm }: { uri?: string | null; size?: number; rounded?: number }) {
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: rounded }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={uri} />
      ) : (
        <Icon name={icons.photo} color={colors.textDisabled} size={Math.round(size / 3.2)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.grouped, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
