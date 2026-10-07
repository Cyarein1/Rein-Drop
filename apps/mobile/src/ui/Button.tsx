import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import { fontSize, radius, roles, size, space, type ButtonVariant } from '@rein-drop/design-tokens';
import { font } from './fonts';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  children: ReactNode;
  /** primary = Rein Orange (one per screen), secondary = outline, text, destructive. */
  variant?: ButtonVariant;
  /** Disables the button and shows a spinner. */
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = !!disabled || loading;
  const v = variantStyles[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        v.container,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {loading && <ActivityIndicator size="small" color={v.text.color as string} />}
        <Text style={[styles.label, font('semibold'), v.text]}>{children}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: size.touchTarget,
    paddingHorizontal: space[5],
    borderRadius: radius.sm,
    borderWidth: size.borderWidth,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  label: { fontSize: fontSize.md },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.55 },
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
    container: { backgroundColor: 'transparent', paddingHorizontal: space[3] },
    text: { color: roles.text, textDecorationLine: 'underline' },
  }),
  destructive: StyleSheet.create({
    container: { backgroundColor: roles.destructiveSurface, borderColor: roles.destructive },
    text: { color: roles.onDestructive },
  }),
} satisfies Record<ButtonVariant, unknown>;
