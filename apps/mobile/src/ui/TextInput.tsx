import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type TextInputProps as RNTextInputProps,
} from 'react-native';
import { fontSize, radius, roles, size, space, type TextInputKind } from '@rein-drop/design-tokens';
import { font } from './fonts';

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
};

export function TextInput({ label, kind = 'text', hint, error, currency, ...rest }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
          accessibilityHint={error ?? hint}
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
          {...KIND_PROPS[kind]}
          {...rest}
        />
        {kind === 'password' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            onPress={() => setShowPassword((v) => !v)}
            style={styles.toggle}
          >
            <Text style={[styles.toggleText, font('semibold')]}>{showPassword ? 'Hide' : 'Show'}</Text>
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
  field: { gap: space[1], alignSelf: 'stretch' },
  label: { color: roles.text, fontSize: fontSize.sm },
  hint: { color: roles.textMuted, fontSize: fontSize.sm },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.touchTarget,
    borderWidth: size.borderWidth,
    borderColor: roles.border,
    borderRadius: radius.sm,
    backgroundColor: roles.surface,
  },
  focused: { borderColor: roles.text, borderWidth: size.focusRingWidth },
  invalid: { borderColor: roles.destructive },
  input: {
    flex: 1,
    minHeight: size.touchTarget,
    paddingHorizontal: space[3],
    color: roles.text,
    fontSize: fontSize.md,
  },
  adornment: { paddingLeft: space[3], color: roles.textMuted, fontSize: fontSize.md },
  toggle: { minHeight: size.touchTarget, paddingHorizontal: space[3], justifyContent: 'center' },
  toggleText: { color: roles.text, fontSize: fontSize.sm },
  error: {
    color: roles.text,
    fontSize: fontSize.sm,
    paddingLeft: space[2],
    borderLeftWidth: 3,
    borderLeftColor: roles.destructive,
  },
});
