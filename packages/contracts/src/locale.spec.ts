import { describe, expect, it } from 'vitest';
import {
  countryFromLocaleTag,
  detectedLocaleRequest,
  kmToUnit,
  languageFromLocaleTag,
  regionDefaults,
  uiLanguage,
  unitToKm,
  updateUserLocaleRequestSchema,
} from './index.js';

describe('locale', () => {
  it('derives currency and distance unit from the country', () => {
    expect(regionDefaults('ZA')).toEqual({ currency: 'ZAR', distanceUnit: 'km' });
    expect(regionDefaults('US')).toEqual({ currency: 'USD', distanceUnit: 'mi' });
    expect(regionDefaults('gb')).toEqual({ currency: 'GBP', distanceUnit: 'mi' });
    expect(regionDefaults('DE')).toEqual({ currency: 'EUR', distanceUnit: 'km' });
  });

  it('reads country and language from locale tags', () => {
    expect(countryFromLocaleTag('en-ZA')).toBe('ZA');
    expect(countryFromLocaleTag('en_US')).toBe('US');
    expect(countryFromLocaleTag('zh-Hant-TW')).toBe('TW');
    expect(countryFromLocaleTag('en')).toBeNull();
    expect(countryFromLocaleTag('en-XX')).toBeNull();
    expect(countryFromLocaleTag(undefined)).toBeNull();
    expect(languageFromLocaleTag('af-ZA')).toBe('af');
    expect(languageFromLocaleTag('zu_ZA')).toBe('zu');
    expect(languageFromLocaleTag('123')).toBeNull();
  });

  it('builds the detection request', () => {
    expect(detectedLocaleRequest('zu-ZA')).toEqual({ countryCode: 'ZA', language: 'zu', source: 'detected' });
    expect(detectedLocaleRequest('en')).toBeNull();
  });

  it('falls back to a supported UI language', () => {
    expect(uiLanguage('en')).toBe('en');
    expect(uiLanguage('de')).toBe('de');
    expect(uiLanguage('af')).toBe('en');
    expect(uiLanguage(null)).toBe('en');
  });

  it('converts between km and miles', () => {
    expect(kmToUnit(40, 'km')).toBe(40);
    expect(kmToUnit(40, 'mi')).toBe(25);
    expect(unitToKm(25, 'mi')).toBe(40);
    expect(unitToKm(10, 'km')).toBe(10);
  });

  it('validates the update request', () => {
    expect(updateUserLocaleRequestSchema.parse({ countryCode: ' za ', language: 'AF' })).toEqual({
      countryCode: 'ZA',
      language: 'af',
      source: 'user',
    });
    expect(updateUserLocaleRequestSchema.safeParse({ countryCode: 'XX' }).success).toBe(false);
    expect(updateUserLocaleRequestSchema.safeParse({ countryCode: 'US', distanceUnit: 'furlongs' }).success).toBe(false);
    expect(updateUserLocaleRequestSchema.safeParse({ countryCode: 'US', language: 'english' }).success).toBe(false);
  });
});
