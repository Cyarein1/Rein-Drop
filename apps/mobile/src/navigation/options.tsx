import { Link } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { fontSize, roles, size } from '@rein-drop/design-tokens';
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

/** Header button to Settings (Settings is not a bottom tab - Mobile UI Screenbook, section 1). */
export function SettingsHeaderButton() {
  return (
    <Link href="/settings" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={8}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <NavIcon name={{ ios: 'gearshape', android: 'settings' }} color={roles.text} />
      </Pressable>
    </Link>
  );
}

/** Header button to the in-app inbox (alerts). */
export function InboxHeaderButton() {
  return (
    <Link href="/alerts" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Inbox"
        hitSlop={8}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <NavIcon name={{ ios: 'bell', android: 'notifications' }} color={roles.text} />
      </Pressable>
    </Link>
  );
}

/** Right side of every tab header: inbox, then Settings. */
export function TabHeaderButtons() {
  return (
    <View style={styles.row}>
      <InboxHeaderButton />
      <SettingsHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  headerButton: {
    width: size.touchTarget,
    height: size.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
