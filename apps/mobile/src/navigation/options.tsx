import { Link } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, type ColorValue } from 'react-native';
import { fontSize, roles, size } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { font } from '@/ui';

/** Native header styling from the design tokens (navy on white). */
export function headerOptions() {
  return {
    headerStyle: { backgroundColor: roles.background },
    headerTintColor: roles.text,
    headerTitleStyle: { ...font('bold'), fontSize: fontSize.lg, color: roles.text },
    contentStyle: { backgroundColor: roles.background },
  } as const;
}

type SymbolName = SymbolViewProps['name'];

/** Native platform icon: SF Symbols on iOS, Material Symbols on Android. */
export function NavIcon({ name, color, size: iconSize = 24 }: { name: SymbolName; color: ColorValue; size?: number }) {
  return <SymbolView name={name} tintColor={color} size={iconSize} />;
}

/** Inventory tab header: your listings (Sell, decision 0019). */
export function ListingsHeaderButton() {
  const t = useT();
  return (
    <Link href="/sell" asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={t('nav.titleListings')} hitSlop={8} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <NavIcon name={{ ios: 'storefront', android: 'storefront' }} color={roles.text} />
      </Pressable>
    </Link>
  );
}

/** Header button to the in-app inbox (alerts). */
export function InboxHeaderButton() {
  const t = useT();
  return (
    <Link href="/alerts" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('nav.titleInbox')}
        hitSlop={8}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <NavIcon name={{ ios: 'bell', android: 'notifications' }} color={roles.text} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    width: size.touchTarget,
    height: size.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
