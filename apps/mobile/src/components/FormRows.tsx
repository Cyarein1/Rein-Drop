import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput as RNTextInput, View, type TextInputProps as RNTextInputProps } from 'react-native';
import { radius, space } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { colors, font, Icon, icons, type, type IconName } from '@/ui';

/**
 * Compact building blocks for detail screens and form sheets (step 89 redesign, approved
 * mock-ups DealDetail / BoughtSheet): a titled section, label / value fact rows, a bordered group
 * of inline fields (label left, value right) and plain link rows.
 */

/** A titled block on a white screen: heading on the left, an optional small action on the right. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, font('semibold')]}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

const TONE = { profit: colors.profitText, loss: colors.lossText, neutral: colors.text } as const;

/** One "label ... value" line with a hairline below (unless `last`). */
export function FactRow({ label, value, strong, tone = 'neutral', last }: { label: string; value: string; strong?: boolean; tone?: keyof typeof TONE; last?: boolean }) {
  return (
    <View style={[styles.fact, !last && styles.hairline]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.factLabel, font(strong ? 'semibold' : 'regular')]}>{label}</Text>
      <Text style={[styles.factValue, font(strong ? 'bold' : 'semibold'), { color: TONE[tone] }]}>{value}</Text>
    </View>
  );
}

/** A row that opens something: label, then a chevron (or an "opens outside the app" mark). */
export function LinkRow({ label, onPress, external, last }: { label: string; onPress: () => void; external?: boolean; last?: boolean }) {
  return (
    <Pressable accessibilityRole={external ? 'link' : 'button'} accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.link, !last && styles.hairline, pressed && styles.pressed]}>
      <Text style={[styles.linkText, font('medium')]}>{label}</Text>
      <Icon name={external ? icons.external : icons.chevron} color={colors.textMuted} size={external ? 16 : 14} />
    </Pressable>
  );
}

/** Bordered, rounded group of `InlineField`s (the sheet form style). */
export function FieldGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

export interface InlineFieldProps extends Omit<RNTextInputProps, 'style'> {
  label: string;
  kind?: 'text' | 'money' | 'date';
  /** kind="money": ISO currency code shown before the amount. */
  currency?: string;
  error?: string;
  hint?: string;
  /** Last field of its group: no separator. */
  last?: boolean;
}

/** Label on the left, the value typed on the right; error / hint under the row. */
export function InlineField({ label, kind = 'text', currency, error, hint, last, ...rest }: InlineFieldProps) {
  const t = useT();
  const kindProps: Partial<RNTextInputProps> =
    kind === 'money'
      ? { keyboardType: 'decimal-pad', placeholder: '0.00' }
      : kind === 'date'
        ? { keyboardType: 'numbers-and-punctuation', autoCorrect: false, autoCapitalize: 'none', maxLength: 10, placeholder: t('common.datePlaceholder') }
        : {};
  return (
    <View style={!last && styles.hairline}>
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, font('regular'), !!error && styles.fieldLabelError]} numberOfLines={2}>
          {label}
        </Text>
        {kind === 'money' && currency ? <Text style={[styles.adornment, font('medium')]}>{currency}</Text> : null}
        <RNTextInput
          accessibilityLabel={label}
          accessibilityHint={[error && t('common.inputError', { error }), hint].filter(Boolean).join('. ') || undefined}
          aria-invalid={!!error}
          placeholderTextColor={colors.textDisabled}
          style={[styles.input, font('semibold'), kind === 'text' && styles.inputText]}
          {...kindProps}
          {...rest}
        />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, font('regular')]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[styles.hint, font('regular')]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** A plain "+ Add another" style button (mock: "Add another cost"). */
export function AddRow({ label, onPress, icon = icons.plus, accessibilityLabel }: { label: string; onPress: () => void; icon?: IconName; accessibilityLabel?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.add, pressed && styles.pressed]}>
      <Icon name={icon} color={colors.text} size={18} />
      <Text style={[styles.addText, font('medium')]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[1] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], minHeight: 32 },
  sectionTitle: { flex: 1, color: colors.text, fontSize: type.headline },
  hairline: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  fact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], minHeight: 40, paddingVertical: space[2] },
  factLabel: { flex: 1, color: colors.textMuted, fontSize: type.callout },
  factValue: { color: colors.text, fontSize: type.callout, textAlign: 'right', maxWidth: '55%' },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], minHeight: 44, paddingVertical: space[2] },
  linkText: { flex: 1, color: colors.text, fontSize: type.body },
  pressed: { opacity: 0.6 },
  group: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, backgroundColor: colors.background },
  field: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 52 },
  fieldLabel: { flexShrink: 1, color: colors.text, fontSize: type.body },
  fieldLabelError: { color: colors.lossText },
  adornment: { marginLeft: 'auto', color: colors.textMuted, fontSize: type.body },
  input: { flexGrow: 1, flexBasis: 90, minHeight: 44, paddingVertical: space[2], textAlign: 'right', color: colors.text, fontSize: type.body },
  inputText: { flexBasis: 140 },
  error: { color: colors.lossText, fontSize: type.footnote, paddingBottom: space[2], textAlign: 'right' },
  hint: { color: colors.textMuted, fontSize: type.footnote, paddingBottom: space[2] },
  add: { flexDirection: 'row', alignItems: 'center', gap: space[2], alignSelf: 'flex-start', minHeight: 44 },
  addText: { color: colors.text, fontSize: type.callout },
});
