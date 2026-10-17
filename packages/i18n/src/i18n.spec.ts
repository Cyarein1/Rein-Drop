import { describe, expect, it } from 'vitest';
import { formatMessage, messageArguments, pluralCategory } from './format.js';
import { de } from './messages/de/index.js';
import { en } from './messages/en/index.js';
import { resolveLanguage, translator } from './translator.js';

describe('formatMessage', () => {
  it('fills placeholders; numbers formatted for the language; missing values stay visible', () => {
    expect(formatMessage('Hello {name}', { name: 'Ann' })).toBe('Hello Ann');
    expect(formatMessage('{n} items', { n: 12_500 }, 'de')).toBe('12.500 items');
    expect(formatMessage('{n} items', { n: 12_500 }, 'en')).toBe('12,500 items');
    expect(formatMessage('Hi {name}')).toBe('Hi {name}');
    expect(formatMessage("doesn't break on apostrophes")).toBe("doesn't break on apostrophes");
  });

  it('plural (with =N and #) and select, nested', () => {
    const p = '{count, plural, =0 {No Hunts} one {# Hunt} other {# Hunts}}';
    expect([0, 1, 2].map((count) => formatMessage(p, { count }))).toEqual(['No Hunts', '1 Hunt', '2 Hunts']);
    const deP = '{count, plural, one {# Deal gemerkt} other {# Deals gemerkt}}';
    expect(formatMessage(deP, { count: 3 }, 'de')).toBe('3 Deals gemerkt');
    const s = '{m, select, ebay {eBay} other {{m}}} - {count, plural, one {one} other {#}}';
    expect(formatMessage(s, { m: 'ebay', count: 4 })).toBe('eBay - 4');
    expect(formatMessage(s, { m: 'x', count: 1 })).toBe('x - one');
  });

  it('rejects malformed patterns', () => {
    expect(() => formatMessage('{count, plural, one {x}}')).toThrow(/other/);
    expect(() => formatMessage('{oops')).toThrow();
  });

  it('lists argument names', () => {
    expect(messageArguments('{a} and {count, plural, one {# {b}} other {#}}')).toEqual(['a', 'b', 'count']);
  });
});

describe('pluralCategory without Intl.PluralRules (Hermes / React Native)', () => {
  it('gives the same category as Intl for English and German', () => {
    for (const language of ['en', 'de']) {
      for (const n of [0, 1, 2, 3, 5, 10, 11, 21, 100, 1.5, 0.5, -1]) {
        expect(pluralCategory(n, language, false), `${language} ${n}`).toBe(pluralCategory(n, language, true));
      }
    }
  });
});

describe('translator', () => {
  it('resolves the UI language from a stored / detected preference', () => {
    expect(['de', 'de-AT', 'DE', 'en-GB', 'fr', null, undefined].map(resolveLanguage)).toEqual(['de', 'de', 'de', 'en', 'en', 'en', 'en']);
  });

  it('unknown keys come back as the key (visible, never empty)', () => {
    expect(translator('de')('common.doesNotExist' as never)).toBe('common.doesNotExist');
  });
});

describe('German catalog (draft) matches the English source', () => {
  const namespaces = Object.keys(en) as (keyof typeof en)[];
  it('same namespaces and keys', () => {
    expect(Object.keys(de).sort()).toEqual([...namespaces].sort());
    for (const ns of namespaces) expect(Object.keys(de[ns]).sort(), ns).toEqual(Object.keys(en[ns]).sort());
  });

  it('every message parses and keeps exactly the same placeholders', () => {
    const problems: string[] = [];
    for (const ns of namespaces) {
      for (const [key, source] of Object.entries(en[ns] as Record<string, string>)) {
        const target = (de[ns] as Record<string, string>)[key]!;
        if (!target.trim()) problems.push(`${ns}.${key}: empty`);
        try {
          if (messageArguments(source).join() !== messageArguments(target).join()) problems.push(`${ns}.${key}: placeholders differ`);
        } catch (err) {
          problems.push(`${ns}.${key}: ${(err as Error).message}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
