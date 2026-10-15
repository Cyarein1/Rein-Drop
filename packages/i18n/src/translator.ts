import { formatMessage, type MessageValues } from './format.js';
import { de } from './messages/de/index.js';
import { en, type Catalog } from './messages/en/index.js';

/** Languages the UI is translated into (English is the source; German is a draft until reviewed). */
export const LANGUAGES = ['en', 'de'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Each language's own name, shown in a language picker (never translated). */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', de: 'Deutsch' };

/** "deals.justDropped" - every key of the English catalog, checked at compile time. */
export type MessageKey = { [N in keyof Catalog]: `${N & string}.${keyof Catalog[N] & string}` }[keyof Catalog];

export interface Translator {
  (key: MessageKey, values?: MessageValues): string;
  readonly language: Language;
}

const CATALOGS: Record<Language, Catalog> = { en, de };

/** Review state of each translation (shown nowhere to users; for release checks and docs). */
export const TRANSLATION_STATUS: Record<Language, 'source' | 'draft' | 'reviewed'> = { en: 'source', de: 'draft' };

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** The UI language for a stored / detected preference ("de", "de-AT" -> de; anything else -> en). */
export function resolveLanguage(preferred: string | null | undefined): Language {
  const primary = preferred?.toLowerCase().split(/[-_]/)[0];
  return isLanguage(primary) ? primary : 'en';
}

const translators = new Map<Language, Translator>();

/** A translator for one language; English is the fallback for anything missing. Cached. */
export function translator(language: Language): Translator {
  const cached = translators.get(language);
  if (cached) return cached;
  const catalog = CATALOGS[language];
  const t = ((messageKey: MessageKey, values?: MessageValues) => {
    const key: string = messageKey;
    const dot = key.indexOf('.');
    const ns = key.slice(0, dot) as keyof Catalog;
    const name = key.slice(dot + 1);
    const pattern = (catalog[ns] as Record<string, string> | undefined)?.[name] ?? (en[ns] as Record<string, string> | undefined)?.[name];
    return pattern === undefined ? key : formatMessage(pattern, values, language);
  }) as Translator;
  Object.defineProperty(t, 'language', { value: language });
  translators.set(language, t);
  return t;
}
