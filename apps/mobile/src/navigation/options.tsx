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

/** Hunts tab header: Create Hunt (decision 0018 - Create lives in Hunts; opens the modal). */
export function CreateHuntHeaderButton() {
  return (
    <Link href="/hunts/new" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create Hunt"
        hitSlop={8}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <NavIcon name={{ ios: 'plus', android: 'add' }} color={roles.text} />
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
