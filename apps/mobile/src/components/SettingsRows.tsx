import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { space } from '@rein-drop/design-tokens';
import { colors, font, haptic, Icon, icons, type } from '@/ui';

/**
 * Rows for grouped settings screens that `ListRow` doesn't cover: a switch row and a single-choice
 * (radio) row. Same size and separators as `ListRow`; use inside `ListSection`.
 */

/** Title (+ subtitle) with a Switch. The switch is the control screen readers focus, named by `accessibilityLabel`. */
export function SwitchRow({
  title,
  subtitle,
  value,
  disabled,
  onChange,
  accessibilityLabel,
  last,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  accessibilityLabel: string;
  last?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.main, !last && styles.separator]}>
        <View style={styles.text} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={[styles.title, font('regular'), disabled && styles.muted]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, font('regular')]}>{subtitle}</Text> : null}
        </View>
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={(v) => {
            haptic.select();
            onChange(v);
          }}
          accessibilityLabel={accessibilityLabel}
          trackColor={{ true: colors.text, false: colors.border }}
        />
      </View>
    </View>
  );
}

/** One option of a single choice: a check mark on the chosen row. */
export function CheckRow({ title, subtitle, checked, disabled, onPress, last }: { title: string; subtitle?: string; checked: boolean; disabled?: boolean; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      disabled={disabled}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.main, !last && styles.separator]}>
        <View style={styles.text}>
          <Text style={[styles.title, font(checked ? 'semibold' : 'regular')]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, font('regular')]}>{subtitle}</Text> : null}
        </View>
        {checked && <Icon name={icons.check} color={colors.text} size={18} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingLeft: 14, backgroundColor: colors.background },
  main: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 50, paddingVertical: 10, paddingRight: 14 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  text: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: type.body },
  muted: { color: colors.textMuted },
  subtitle: { color: colors.textMuted, fontSize: type.subhead },
  pressed: { opacity: 0.6 },
});
