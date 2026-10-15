import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { Icon, type IconName } from './Icon';
import { colors } from './theme';

export interface IconButtonProps {
  icon: IconName;
  /** Required: icon-only buttons are named for screen readers. */
  label: string;
  onPress: () => void;
  /** plain = in a header or row; floating = white circle over a photo. */
  variant?: 'plain' | 'floating';
  color?: ColorValue;
  /** Small count dot (e.g. unread alerts). Announced via `label`. */
  badge?: number;
  disabled?: boolean;
}

/** 44 pt touch target around a 22 pt icon. */
export function IconButton({ icon, label, onPress, variant = 'plain', color = colors.text, badge, disabled }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.base, variant === 'floating' && styles.floating, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon name={icon} color={color} size={variant === 'floating' ? 18 : 22} />
      {!!badge && badge > 0 && <View style={styles.badge} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  floating: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    shadowColor: colors.text,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  badge: { position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.action, borderWidth: 1.5, borderColor: colors.background },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
});
