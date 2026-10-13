import { describe, expect, it } from 'vitest';
import { parseMoneyInput } from './money.js';
import { priceSlider, priceSliderEnds, priceSliderPosition, priceSliderText, priceSliderValueText } from './price-slider.js';

describe('priceSlider stops', () => {
  it('USD: round prices from 5 to 10,000, strictly ascending, finer at the low end', () => {
    const { stops, max } = priceSlider('USD');
    expect(stops[0]).toBe(5);
    expect(stops.at(-1)).toBe(10_000);
    expect(max).toBe(stops.length);
    for (let i = 1; i < stops.length; i++) expect(stops[i]!).toBeGreaterThan(stops[i - 1]!);
    expect(stops).toEqual(expect.arrayContaining([10, 15, 20, 25, 50, 100, 250, 500, 1000, 2500, 5000]));
    // Every step is at most a 50% jump - usable at any price.
    for (let i = 1; i < stops.length; i++) expect(stops[i]! / stops[i - 1]!).toBeLessThanOrEqual(1.6);
  });

  it('shifts the range by the currency size (no exchange rates)', () => {
    expect([priceSlider('ZAR').stops[0], priceSlider('ZAR').stops.at(-1)]).toEqual([50, 100_000]);
    expect([priceSlider('JPY').stops[0], priceSlider('JPY').stops.at(-1)]).toEqual([500, 1_000_000]);
    expect([priceSlider('IDR').stops[0], priceSlider('IDR').stops.at(-1)]).toEqual([50_000, 100_000_000]);
    expect(priceSlider('eur').stops).toEqual(priceSlider('USD').stops);
  });

  it('unknown currencies fall back to the USD-sized range', () => {
    expect(priceSlider('XYZ').stops).toEqual(priceSlider('USD').stops);
  });

  it('every stop is a whole amount the money field accepts', () => {
    for (const currency of ['USD', 'ZAR', 'JPY', 'KWD']) {
      const slider = priceSlider(currency);
      for (const stop of slider.stops) {
        expect(Number.isInteger(stop)).toBe(true);
        const parsed = parseMoneyInput(String(stop), currency);
        expect(parsed.ok && parsed.money).toBeTruthy();
      }
    }
  });
});

describe('field <-> slider', () => {
  const usd = priceSlider('USD');

  it('empty field = the last position, "No limit"', () => {
    expect(priceSliderPosition(usd, '', 'USD')).toBe(usd.max);
    expect(priceSliderText(usd, usd.max)).toBe('');
  });

  it('a stop round-trips exactly', () => {
    for (let i = 0; i < usd.stops.length; i++) expect(priceSliderPosition(usd, priceSliderText(usd, i), 'USD')).toBe(i);
  });

  it('a typed amount sits at the nearest stop; the field keeps the exact amount', () => {
    expect(usd.stops[priceSliderPosition(usd, '120', 'USD')!]).toBe(100);
    expect(usd.stops[priceSliderPosition(usd, '130', 'USD')!]).toBe(150);
    expect(usd.stops[priceSliderPosition(usd, '1 999.99', 'USD')!]).toBe(2000);
  });

  it('above the top stop: the top stop, never "No limit" (that would misstate a real limit)', () => {
    expect(priceSliderPosition(usd, '25000', 'USD')).toBe(usd.max - 1);
  });

  it('below the first stop (or zero): the first stop', () => {
    expect(priceSliderPosition(usd, '1', 'USD')).toBe(0);
    expect(priceSliderPosition(usd, '0', 'USD')).toBe(0);
  });

  it('text that is not an amount yet: no position (the slider stays put)', () => {
    expect(priceSliderPosition(usd, '12abc', 'USD')).toBeNull();
  });

  it('positions out of range are clamped', () => {
    expect(priceSliderText(usd, -3)).toBe('5');
    expect(priceSliderText(usd, 999)).toBe('');
  });
});

describe('announced value and end labels', () => {
  const zar = priceSlider('ZAR');

  it('announces the exact typed amount in the user locale, or "No limit"', () => {
    expect(priceSliderValueText(zar, '1250', 0, 'ZAR', 'en-ZA')).toMatch(/^R\s?1\s?250,00$/);
    expect(priceSliderValueText(zar, '', zar.max, 'ZAR', 'en-ZA')).toBe('No limit');
  });

  it('falls back to the stop while the text is invalid', () => {
    expect(priceSliderValueText(priceSlider('USD'), '9x', 0, 'USD', 'en-US')).toBe('$5.00');
  });

  it('end labels: first stop without decimals, then "No limit"', () => {
    expect(priceSliderEnds(priceSlider('USD'), 'USD', 'en-US')).toEqual({ min: '$5', max: 'No limit' });
    expect(priceSliderEnds(zar, 'ZAR', 'en-ZA').min).toMatch(/^R\s?50$/);
  });
});
