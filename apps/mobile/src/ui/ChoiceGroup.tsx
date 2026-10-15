import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, roles, space } from '@rein-drop/design-tokens';
import { font } from './fonts';
import { haptic } from './haptics';
import { type } from './theme';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** Optional mark before the label (e.g. a marketplace logo). Decorative - the label is announced. */
  icon?: ReactNode;
}

interface BaseProps<T extends string> {
  legend: string;
  options: readonly ChoiceOption<T>[];
  hint?: string;
  error?: string;
  /** Keep the legend as the group's accessibility label but don't show it (a heading already asks it). */
  hideLegend?: boolean;
}

export type ChoiceGroupProps<T extends string> = BaseProps<T> &
  (
    | { multiple: true; value: readonly T[]; onChange: (value: T[]) => void }
    | { multiple?: false; value: T; onChange: (value: T) => void }
  );

/** Chips with checkbox (multiple) or radio (single) semantics for screen readers. */
export function ChoiceGroup<T extends string>(props: ChoiceGroupProps<T>) {
  const { legend, options, hint, error, hideLegend } = props;
  const isChecked = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
  const toggle = (v: T) => {
    haptic.select();
    if (props.multiple) {
      props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
    } else {
      props.onChange(v);
    }
  };

  return (
    <View style={styles.group} accessibilityRole={props.multiple ? undefined : 'radiogroup'} accessibilityLabel={legend}>
      {!hideLegend && <Text style={[styles.legend, font('semibold')]}>{legend}</Text>}
      {hint && <Text style={[styles.hint, font('regular')]}>{hint}</Text>}
      <View style={styles.options}>
        {options.map((option) => {
          const checked = isChecked(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole={props.multiple ? 'checkbox' : 'radio'}
              accessibilityState={{ checked }}
              accessibilityLabel={option.label}
              onPress={() => toggle(option.value)}
              style={({ pressed }) => [styles.chip, checked && styles.chipChecked, pressed && styles.pressed]}
            >
              <View style={styles.chipContent}>
                {option.icon}
                <Text style={[styles.chipText, font(checked ? 'semibold' : 'medium'), checked && styles.chipTextChecked]}>{option.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {error && (
        <Text accessibilityLiveRegion="polite" style={[styles.error, font('regular')]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[2], alignSelf: 'stretch' },
  legend: { color: roles.text, fontSize: type.subhead },
  hint: { color: roles.textMuted, fontSize: type.subhead },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minHeight: 38,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: roles.border,
    borderRadius: radius.full,
    backgroundColor: roles.surface,
  },
  // Selected: navy fill (same as the filter ChipBar) - selection is structure, not action, so not orange.
  chipChecked: { borderColor: roles.text, backgroundColor: roles.text },
  chipContent: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  chipText: { color: roles.text, fontSize: type.callout },
  chipTextChecked: { color: roles.background },
  pressed: { opacity: 0.8 },
  error: {
    color: roles.text,
    fontSize: type.subhead,
    paddingLeft: space[2],
    borderLeftWidth: 3,
    borderLeftColor: roles.destructive,
  },
});
