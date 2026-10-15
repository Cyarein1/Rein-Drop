import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { radius, space } from '@rein-drop/design-tokens';
import { font } from './fonts';
import { haptic } from './haptics';
import { colors, GUTTER, type } from './theme';

export interface Chip<T extends string> {
  value: T;
  label: string;
  /** Optional mark before the label (e.g. a marketplace logo). Decorative - the label is announced. */
  icon?: ReactNode;
  /** e.g. a count shown after the label ("New · 12"). Part of the announced label. */
  count?: number;
}

export type ChipBarProps<T extends string> = {
  /** Accessibility name of the group, e.g. "Filter deals". Not shown. */
  label: string;
  chips: readonly Chip<T>[];
  /** Extra trailing chip, e.g. a "All Hunts ▾" picker that opens a sheet. */
  trailing?: ReactNode;
} & ({ multiple: true; value: readonly T[]; onChange: (value: T[]) => void } | { multiple?: false; value: T; onChange: (value: T) => void });

/**
 * A row of filter chips that scrolls sideways by dragging (no scrollbar), edge to edge with the
 * screen gutter - the eBay-style filter row from the approved mock-up. Selected = navy fill.
 */
export function ChipBar<T extends string>(props: ChipBarProps<T>) {
  const isOn = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
  const press = (v: T) => {
    haptic.select();
    if (props.multiple) props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
    else props.onChange(v);
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole={props.multiple ? undefined : 'radiogroup'}
      accessibilityLabel={props.label}
      style={styles.scroller}
    >
      {props.chips.map((c) => (
        <ChipButton
          key={c.value}
          label={c.count === undefined ? c.label : `${c.label} · ${c.count}`}
          icon={c.icon}
          selected={isOn(c.value)}
          role={props.multiple ? 'checkbox' : 'radio'}
          onPress={() => press(c.value)}
        />
      ))}
      {props.trailing}
    </ScrollView>
  );
}

/** One chip - also usable alone (e.g. a trailing "All Hunts ▾" picker chip with `role="button"`). */
export function ChipButton({
  label,
  icon,
  trailingIcon,
  selected = false,
  role = 'button',
  onPress,
  accessibilityHint,
}: {
  label: string;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  selected?: boolean;
  role?: 'radio' | 'checkbox' | 'button';
  onPress: () => void;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'button' ? undefined : { checked: selected }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}
    >
      <View style={styles.content}>
        {icon}
        <Text style={[styles.text, font(selected ? 'semibold' : 'medium'), selected && styles.textOn]}>{label}</Text>
        {trailingIcon}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Bleed to the screen edges: the parent's gutter is undone so chips scroll under the edge.
  scroller: { marginHorizontal: -GUTTER, flexGrow: 0 },
  row: { gap: space[2], paddingHorizontal: GUTTER, paddingVertical: space[1] },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  content: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { color: colors.text, fontSize: type.subhead },
  textOn: { color: colors.background },
  pressed: { opacity: 0.75 },
});
