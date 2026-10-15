import { useMemo } from 'react';
import { getLocales } from 'expo-localization';
import { huntFormContext, type HuntFormContext } from '@rein-drop/client-core';
import { resolveLanguage, translator, type Language, type Translator } from '@rein-drop/i18n';
import { useOptionalSessionState } from '@/auth/SessionProvider';

/** The phone's language, e.g. "de-DE" (used before sign-in and when no preference is stored). */
export function deviceLanguageTag(): string | null {
  return getLocales()[0]?.languageTag ?? null;
}

/**
 * The UI language: the account's stored preference (Account → Language), else the phone's
 * language. German or English (docs/i18n/README.md). Works outside the session provider too.
 */
export function useLanguage(): Language {
  const state = useOptionalSessionState()?.state;
  const stored = state?.status === 'authenticated' ? state.session.user.locale?.language : null;
  return resolveLanguage(stored ?? deviceLanguageTag());
}

/** `t('deals.justDropped')` in the UI language. */
export function useT(): Translator {
  return translator(useLanguage());
}

/** Currency, units, number formatting and `t` for shared view logic (client-core). */
export function useDisplayContext(): HuntFormContext {
  const state = useOptionalSessionState()?.state;
  const locale = state?.status === 'authenticated' ? state.session.user.locale : null;
  return useMemo(() => huntFormContext(locale, deviceLanguageTag()), [locale]);
}
