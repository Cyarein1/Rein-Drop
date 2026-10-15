import countryToCurrency from 'country-to-currency';
import { z } from 'zod';
import { currencySchema } from './common.js';

/**
 * The user's locale drives display defaults (product decision, 2026-10-07): country,
 * currency, distance unit and language follow where the user is, detected from the
 * device / browser locale at first sign-in and overridable later. Storage stays canonical
 * everywhere (money = minor units + currency, distances = km); apps convert for display.
 *
 * TODO(region): app-store storefront country could refine detection on mobile (needs a
 * native module); the device region is used for now.
 * UI translations: English (source) and German (draft, native review pending) - @rein-drop/i18n.
 */

/** Languages the UI is translated into. Preferences outside this list fall back to the first. */
export const SUPPORTED_LANGUAGES = ['en', 'de'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** BCP 47 primary language subtag, lower case (e.g. "en", "af", "zu", "fil"). */
export const languageSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((tag) => /^[a-z]{2,3}$/.test(tag) && isKnownLanguage(tag), 'Must be a language code, e.g. "en" or "af"');

function isKnownLanguage(tag: string): boolean {
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}

/** "en-ZA" -> "en"; null when the tag has no valid language. */
export function languageFromLocaleTag(tag: string | null | undefined): string | null {
  const primary = tag?.replace(/_/g, '-').split('-')[0]?.toLowerCase();
  return primary && languageSchema.safeParse(primary).success ? primary : null;
}

/** The language to render the UI in for a stored preference. */
export function uiLanguage(preferred: string | null | undefined): SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(preferred ?? '')
    ? (preferred as SupportedLanguage)
    : SUPPORTED_LANGUAGES[0];
}

export const DISTANCE_UNITS = ['km', 'mi'] as const;
export const distanceUnitSchema = z.enum(DISTANCE_UNITS);
export type DistanceUnit = z.infer<typeof distanceUnitSchema>;

/** Countries that use miles for everyday distances. */
const MILE_COUNTRIES = new Set(['US', 'GB', 'LR', 'MM']);

const CURRENCY_BY_COUNTRY: Readonly<Record<string, string>> = countryToCurrency;

/** ISO 3166-1 alpha-2 country with a known default currency. */
export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((code) => code in CURRENCY_BY_COUNTRY, 'Must be an ISO 3166-1 alpha-2 country code, e.g. "ZA" or "US"');

export interface RegionDefaults {
  currency: string;
  distanceUnit: DistanceUnit;
}

/** Display defaults for a country (country code assumed valid). */
export function regionDefaults(countryCode: string): RegionDefaults {
  const code = countryCode.toUpperCase();
  return {
    currency: CURRENCY_BY_COUNTRY[code] ?? 'USD',
    distanceUnit: MILE_COUNTRIES.has(code) ? 'mi' : 'km',
  };
}

/** "en-ZA" / "en_ZA" / "zh-Hant-TW" -> "ZA" / "ZA" / "TW"; null when the tag has no known region. */
export function countryFromLocaleTag(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const parts = tag.replace(/_/g, '-').split('-').slice(1);
  const region = parts.find((p) => /^[A-Za-z]{2}$/.test(p))?.toUpperCase();
  return region && region in CURRENCY_BY_COUNTRY ? region : null;
}

const KM_PER_MILE = 1.609344;

/** Canonical km -> the user's unit (rounded to whole units for display/inputs). */
export function kmToUnit(km: number, unit: DistanceUnit): number {
  return unit === 'km' ? km : Math.round(km / KM_PER_MILE);
}

/** The user's unit -> canonical km (rounded to whole km). */
export function unitToKm(value: number, unit: DistanceUnit): number {
  return unit === 'km' ? value : Math.round(value * KM_PER_MILE);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const LOCALE_SOURCES = ['detected', 'user'] as const;

/** `GET/PUT /me/locale` - the user's locale preferences. */
export const userLocaleSchema = z.object({
  countryCode: z.string().length(2),
  currency: currencySchema,
  distanceUnit: distanceUnitSchema,
  /** Preferred language (may not be translated yet - see `uiLanguage`). */
  language: z.string(),
  /** "detected" = from device/browser locale; "user" = chosen in settings. */
  source: z.enum(LOCALE_SOURCES),
});
export type UserLocale = z.infer<typeof userLocaleSchema>;

/** Null until the locale has been detected or chosen. */
export const userLocaleResponseSchema = z.object({ locale: userLocaleSchema.nullable() });
export type UserLocaleResponse = z.infer<typeof userLocaleResponseSchema>;

/**
 * `PUT /me/locale`. Currency and unit default from the country, language from
 * `"en"`, when omitted. `source: "detected"` never overwrites a locale the user chose.
 */
export const updateUserLocaleRequestSchema = z.object({
  countryCode: countryCodeSchema,
  currency: currencySchema.optional(),
  distanceUnit: distanceUnitSchema.optional(),
  language: languageSchema.optional(),
  source: z.enum(LOCALE_SOURCES).default('user'),
});
export type UpdateUserLocaleRequest = z.infer<typeof updateUserLocaleRequestSchema>;
export type UpdateUserLocaleRequestInput = z.input<typeof updateUserLocaleRequestSchema>;

/**
 * Builds the detection request from a device/browser locale tag (e.g. "en-ZA").
 * Null when the tag carries no usable country.
 */
export function detectedLocaleRequest(tag: string | null | undefined): UpdateUserLocaleRequestInput | null {
  const countryCode = countryFromLocaleTag(tag);
  if (!countryCode) return null;
  const language = languageFromLocaleTag(tag);
  return { countryCode, ...(language ? { language } : {}), source: 'detected' };
}
