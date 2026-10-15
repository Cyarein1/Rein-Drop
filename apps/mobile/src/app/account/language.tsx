import { useState } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { countryFromLocaleTag } from '@rein-drop/api-client';
import { LANGUAGE_NAMES, LANGUAGES, translator, type Language } from '@rein-drop/i18n';
import { SessionGate } from '@/auth/SessionGate';
import { useSessionState } from '@/auth/SessionProvider';
import { CheckRow } from '@/components/SettingsRows';
import { getApiClient } from '@/config/api';
import { deviceLanguageTag, useLanguage, useT } from '@/i18n/useT';
import { colors, font, ListSection, Screen, type } from '@/ui';

/**
 * Account > Language (docs/i18n/README.md): English or German. Until one is chosen the phone's
 * language is used. Saved to the account (PUT /me/locale), so web and push follow the same choice.
 */
export default function LanguageScreen() {
  return (
    <SessionGate>
      <LanguageSettings />
    </SessionGate>
  );
}

function LanguageSettings() {
  const t = useT();
  const language = useLanguage();
  const { state, setLocale } = useSessionState();
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState<Language | null>(null);
  const locale = state.status === 'authenticated' ? state.session.user.locale : null;
  const choose = async (next: Language) => {
    if (next === language || saving) return;
    setSaving(next);
    setStatus(null);
    try {
      const country = locale?.countryCode ?? countryFromLocaleTag(deviceLanguageTag()) ?? 'US';
      const saved = await getApiClient().updateLocale({ countryCode: country, currency: locale?.currency, distanceUnit: locale?.distanceUnit, language: next });
      setLocale(saved);
      setStatus(translator(next)('account.languageSaved'));
    } catch (err) {
      setStatus(t('account.languageFailed', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSaving(null);
    }
  };
  return (
    <Screen variant="grouped">
      <Stack.Screen options={{ title: t('account.languageTitle') }} />
      <ListSection footer={t('account.languageHint')}>
        {LANGUAGES.map((value, i) => (
          <CheckRow key={value} title={LANGUAGE_NAMES[value]} checked={value === language} disabled={saving !== null} onPress={() => void choose(value)} last={i === LANGUAGES.length - 1} />
        ))}
      </ListSection>
      {saving && <ActivityIndicator color={colors.text} accessibilityLabel={t('common.loading')} />}
      {status && (
        <Text style={[styles.status, font('medium')]} accessibilityLiveRegion="polite">
          {status}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { color: colors.text, fontSize: type.subhead, marginHorizontal: 4 },
});
