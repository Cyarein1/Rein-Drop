import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fontSize, radius, roles, size, space, wash } from '@rein-drop/design-tokens';
import { font } from './fonts';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
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
              onPress={() => toggle(option.value)}
              style={({ pressed }) => [styles.chip, checked && styles.chipChecked, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, font(checked ? 'semibold' : 'medium')]}>{option.label}</Text>
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
  legend: { color: roles.text, fontSize: fontSize.sm },
  hint: { color: roles.textMuted, fontSize: fontSize.sm },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minHeight: size.touchTarget,
    paddingHorizontal: space[4],
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: roles.border,
    borderRadius: radius.full,
    backgroundColor: roles.surface,
  },
  // Selected: navy outline on Sky Wash - selection is structure, not action, so not orange.
  chipChecked: { borderColor: roles.text, borderWidth: 2, backgroundColor: wash.sky },
  chipText: { color: roles.text, fontSize: fontSize.md },
  pressed: { opacity: 0.8 },
  error: {
    color: roles.text,
    fontSize: fontSize.sm,
    paddingLeft: space[2],
    borderLeftWidth: 3,
    borderLeftColor: roles.destructive,
  },
});
