import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import { radius, roles, space, type ButtonVariant } from '@rein-drop/design-tokens';
import { font } from './fonts';
import { type } from './theme';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  children: ReactNode;
  /** primary = Rein Orange (one per screen), secondary = navy outline, text = plain navy label, destructive. */
  variant?: ButtonVariant;
  /** large = bottom action bars and sheets (52), medium = default (44), small = inline in rows / cards (34). */
  size?: 'small' | 'medium' | 'large';
  /** Disables the button and shows a spinner. */
  loading?: boolean;
  /** Stretches across its container (and shares a row with siblings). */
  fullWidth?: boolean;
  /** Optional mark before the label (e.g. a marketplace logo). Decorative - the label is announced. */
  icon?: ReactNode;
}

/** Pill-shaped buttons (native-app style, step 89 redesign). */
export function Button({ children, variant = 'primary', size = 'medium', loading = false, fullWidth = false, icon, disabled, ...rest }: ButtonProps) {
  const isDisabled = !!disabled || loading;
  const v = variantStyles[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={size === 'small' ? { top: 5, bottom: 5 } : undefined}
      style={({ pressed }) => [styles.base, sizes[size], v.container, fullWidth && styles.fullWidth, pressed && !isDisabled && styles.pressed, isDisabled && styles.disabled]}
      {...rest}
    >
      <View style={styles.content}>
        {loading && <ActivityIndicator size="small" color={v.text.color as string} />}
        {!loading && icon}
        <Text style={[size === 'small' ? styles.labelSmall : styles.label, font('semibold'), v.text]} numberOfLines={1}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.full, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  fullWidth: { alignSelf: 'stretch', flexGrow: 1, flexBasis: 0 },
  content: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  label: { fontSize: type.body },
  labelSmall: { fontSize: type.subhead },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});

const sizes = StyleSheet.create({
  small: { minHeight: 34, paddingHorizontal: 14 },
  medium: { minHeight: 44, paddingHorizontal: space[5] },
  large: { minHeight: 52, paddingHorizontal: space[6] },
});

// Navy text on orange: white would be 2.84:1 (fails WCAG AA).
const variantStyles = {
  primary: StyleSheet.create({
    container: { backgroundColor: roles.action },
    text: { color: roles.onAction },
  }),
  secondary: StyleSheet.create({
    container: { backgroundColor: roles.surface, borderColor: roles.text },
    text: { color: roles.text },
  }),
  text: StyleSheet.create({
    container: { backgroundColor: 'transparent', paddingHorizontal: space[2] },
    text: { color: roles.text },
  }),
  destructive: StyleSheet.create({
    container: { backgroundColor: roles.destructiveSurface, borderColor: roles.destructive },
    text: { color: roles.onDestructive },
  }),
} satisfies Record<ButtonVariant, unknown>;
