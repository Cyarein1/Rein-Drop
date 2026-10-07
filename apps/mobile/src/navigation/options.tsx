import { Link } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, type ColorValue } from 'react-native';
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

const styles = StyleSheet.create({
  headerButton: {
    width: size.touchTarget,
    height: size.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
