import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type TextInputProps as RNTextInputProps,
} from 'react-native';
import { radius, roles, size, space, type TextInputKind } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { font } from './fonts';
import { type } from './theme';

export interface TextInputProps extends Omit<RNTextInputProps, 'style' | 'secureTextEntry'> {
  label: string;
  kind?: TextInputKind;
  hint?: string;
  /** Validation message; marks the field invalid and is announced. */
  error?: string;
  /** For kind="money": ISO currency code shown as a prefix, e.g. "USD". */
  currency?: string;
}

const KIND_PROPS: Record<TextInputKind, Partial<RNTextInputProps>> = {
  text: {},
  email: { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email', autoCorrect: false },
  password: { autoCapitalize: 'none', autoComplete: 'current-password', autoCorrect: false },
  money: { keyboardType: 'decimal-pad' },
  search: { returnKeyType: 'search', autoCorrect: false },
  // A calendar day typed as YYYY-MM-DD (screens offer Today / Yesterday shortcuts). TODO(ui): native date picker.
  date: { keyboardType: 'numbers-and-punctuation', autoCorrect: false, autoCapitalize: 'none', maxLength: 10 },
};

export function TextInput({ label, kind = 'text', hint, error, currency, ...rest }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const t = useT();

  return (
    <View style={styles.field}>
      <Text style={[styles.label, font('semibold')]}>{label}</Text>
      {hint && <Text style={[styles.hint, font('regular')]}>{hint}</Text>}
      <View style={[styles.control, focused && styles.focused, !!error && styles.invalid]}>
        {kind === 'money' && currency && (
          <Text style={[styles.adornment, font('medium')]}>{currency}</Text>
        )}
        <RNTextInput
          accessibilityLabel={label}
          // The error first, then the hint - never one hiding the other (aria-invalid is ignored by React Native).
          accessibilityHint={[error && t('common.inputError', { error }), hint].filter(Boolean).join('. ') || undefined}
          aria-invalid={!!error}
          placeholderTextColor={roles.textDisabled}
          secureTextEntry={kind === 'password' && !showPassword}
          style={[styles.input, font('regular')]}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholder={kind === 'date' ? t('common.datePlaceholder') : undefined}
          {...KIND_PROPS[kind]}
          {...rest}
        />
        {kind === 'password' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(showPassword ? 'common.hidePassword' : 'common.showPassword')}
            onPress={() => setShowPassword((v) => !v)}
            style={styles.toggle}
          >
            <Text style={[styles.toggleText, font('semibold')]}>{t(showPassword ? 'common.hide' : 'common.show')}</Text>
          </Pressable>
        )}
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
  field: { gap: 6, alignSelf: 'stretch' },
  label: { color: roles.text, fontSize: type.subhead },
  hint: { color: roles.textMuted, fontSize: type.subhead },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: size.borderWidth,
    borderColor: roles.border,
    borderRadius: radius.md,
    backgroundColor: roles.surface,
  },
  focused: { borderColor: roles.text, borderWidth: size.focusRingWidth },
  invalid: { borderColor: roles.destructive },
  input: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    color: roles.text,
    fontSize: type.headline,
  },
  adornment: { paddingLeft: 14, color: roles.textMuted, fontSize: type.headline },
  toggle: { minHeight: 48, paddingHorizontal: space[3], justifyContent: 'center' },
  toggleText: { color: roles.text, fontSize: type.subhead },
  error: {
    color: roles.text,
    fontSize: type.subhead,
    paddingLeft: space[2],
    borderLeftWidth: 3,
    borderLeftColor: roles.destructive,
  },
});
