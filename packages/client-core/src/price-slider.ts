import { translator, type Translator } from '@rein-drop/i18n';
import { currencyDigits, formatMoney, parseMoneyInput } from './money.js';

/**
 * The max-price slider in Create / Edit Hunt (web + mobile). It sits under the typed field and
 * both stay in sync: the slider moves through round "nice" prices (fine at the low end, coarse
 * at the top - a 30 euro book and a 3,000 euro laptop both get usable steps), the last position
 * is "No limit" (= the empty field), and typing any exact amount still works - the slider then
 * shows the nearest stop.
 *
 * The range follows the currency's rough size: the same ladder is shifted by powers of ten
 * (5-10,000 for USD / EUR / GBP, 50-100,000 for ZAR / MXN, 500-1,000,000 for JPY / INR ...).
 * The table is an order of magnitude only (no exchange rates); it shapes the slider, never a
 * price. Unknown currencies use the USD-sized range - typing still covers any amount.
 */

/** log10 of "units per US dollar", rounded to a whole number. Absent = 0. */
const CURRENCY_MAGNITUDE: Readonly<Record<string, number>> = {
  // ~3-30 per USD
  ZAR: 1, MXN: 1, BRL: 1, SEK: 1, NOK: 1, DKK: 1, CNY: 1, HKD: 1, MYR: 1, PLN: 1, AED: 1, SAR: 1,
  QAR: 1, ILS: 1, MAD: 1, GHS: 1, CZK: 1, RON: 1, BWP: 1, NAD: 1, ZMW: 1, PEN: 1, BOB: 1, GTQ: 1,
  // ~30-300 per USD
  INR: 2, JPY: 2, RUB: 2, KES: 2, PKR: 2, BDT: 2, ISK: 2, LKR: 2, PHP: 2, THB: 2, TWD: 2, TRY: 2,
  EGP: 2, UAH: 2, NPR: 2, ETB: 2, DOP: 2, JMD: 2, UYU: 2, ALL: 2, MKD: 2, RSD: 2, MUR: 2, AMD: 2,
  // ~300-3,000 per USD
  KRW: 3, NGN: 3, HUF: 3, CLP: 3, ARS: 3, TZS: 3, MWK: 3, MGA: 3, KZT: 3, CRC: 3, XOF: 3, XAF: 3, MMK: 3,
  // ~3,000-30,000 per USD
  IDR: 4, VND: 4, UGX: 4, COP: 4, IRR: 4, LBP: 4, UZS: 4, PYG: 4, GNF: 4, LAK: 4, SLL: 4,
};

/** Mantissas of the round prices within each power of ten. */
const NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5] as const;

export interface PriceSlider {
  /** Round prices in major units, ascending. Position `stops.length` = "No limit". */
  stops: readonly number[];
  /** Last slider position (the "No limit" one). */
  max: number;
}

/** The slider's stops for a currency: 5 .. 10,000 (USD-sized), shifted by the currency's magnitude. */
export function priceSlider(currency: string): PriceSlider {
  const scale = 10 ** (CURRENCY_MAGNITUDE[currency.toUpperCase()] ?? 0);
  const stops: number[] = [];
  for (let decade = 1; decade <= 1000; decade *= 10) for (const m of NICE) stops.push(m * decade);
  stops.push(10_000);
  const scaled = stops.filter((v) => v >= 5).map((v) => Math.round(v * scale));
  return { stops: scaled, max: scaled.length };
}

/**
 * Slider position for what's typed in the field: empty = "No limit"; an amount = the nearest stop
 * (by ratio, so 120 sits between 100 and 150 sensibly); above the top stop = the top stop (never
 * "No limit", which would misstate a real limit). Null while the text isn't a valid amount - the
 * slider then keeps its position.
 */
export function priceSliderPosition(slider: PriceSlider, text: string, currency: string): number | null {
  const parsed = parseMoneyInput(text, currency);
  if (!parsed.ok) return null;
  if (!parsed.money) return slider.max;
  const value = parsed.money.amountMinor / 10 ** currencyDigits(currency);
  if (value <= 0) return 0;
  let best = 0;
  for (let i = 1; i < slider.stops.length; i++) {
    if (Math.abs(Math.log(slider.stops[i]! / value)) < Math.abs(Math.log(slider.stops[best]! / value))) best = i;
  }
  return best;
}

/** The field text for a slider position: a whole amount, or "" for "No limit". */
export function priceSliderText(slider: PriceSlider, position: number): string {
  const index = Math.min(Math.max(Math.round(position), 0), slider.max);
  return index === slider.max ? '' : String(slider.stops[index]);
}

/**
 * What a screen reader announces for the slider: the amount actually in the field (formatted for
 * the user's locale), "No limit" when empty, or the stop when the text isn't a valid amount yet.
 */
export function priceSliderValueText(
  slider: PriceSlider,
  text: string,
  position: number,
  currency: string,
  localeTag: string,
  t: Translator = translator('en'),
): string {
  const parsed = parseMoneyInput(text, currency, t);
  if (parsed.ok && parsed.money) return formatMoney(parsed.money, localeTag);
  if (parsed.ok) return t('common.noLimit');
  const stop = slider.stops[Math.min(position, slider.stops.length - 1)]!;
  return formatMoney({ amountMinor: Math.round(stop * 10 ** currencyDigits(currency)), currency }, localeTag);
}

/** The labels under the slider ends, e.g. "$5" and "No limit". */
export function priceSliderEnds(slider: PriceSlider, currency: string, localeTag: string, t: Translator = translator('en')): { min: string; max: string } {
  const first = slider.stops[0]!;
  let min: string;
  try {
    min = new Intl.NumberFormat(localeTag, { style: 'currency', currency, maximumFractionDigits: 0 }).format(first);
  } catch {
    min = `${currency} ${first}`;
  }
  return { min, max: t('common.noLimit') };
}

/** Round amounts offered as one-tap chips next to the slider (USD-sized; shifted like the stops). */
const QUICK_PICKS = [50, 100, 250, 500, 1000] as const;

/**
 * One-tap max prices for the Create Hunt step (mobile): `text` goes into the field, `label` is the
 * chip ("$250"). Always stops of the slider, so the slider lands exactly on them.
 */
export function priceQuickPicks(slider: PriceSlider, currency: string, localeTag: string): { text: string; label: string }[] {
  const scale = slider.stops[0]! / 5;
  return QUICK_PICKS.map((v) => Math.round(v * scale))
    .filter((v) => slider.stops.includes(v))
    .map((v) => {
      let label: string;
      try {
        label = new Intl.NumberFormat(localeTag, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
      } catch {
        label = `${currency} ${v}`;
      }
      return { text: String(v), label };
    });
}
