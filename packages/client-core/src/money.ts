import type { Money } from '@rein-drop/contracts';
import { translator, type Translator } from '@rein-drop/i18n';

/** Number of minor-unit digits for a currency (2 for USD/ZAR, 0 for JPY...). */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export type ParsedAmount = { ok: true; money: Money | null } | { ok: false; message: string };

/**
 * Parses what a person types into a money field ("1500", "1 500", "1,500.50", "1500,50")
 * into integer minor units. Empty input = no amount (null). Error messages in 	's language.
 */
export function parseMoneyInput(text: string, currency: string, t: Translator = translator('en')): ParsedAmount {
  const raw = text.replace(/[\s ']/g, '');
  if (raw === '') return { ok: true, money: null };
  if (!/^\d[\d.,]*$/.test(raw)) return { ok: false, message: t('common.moneyInvalid') };

  const lastSep = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  const digits = currencyDigits(currency);
  let normalized: string;
  // A final separator followed by 1-2 digits (within the currency's precision) is the decimal point.
  const tail = lastSep >= 0 ? raw.length - lastSep - 1 : 0;
  if (lastSep >= 0 && tail > 0 && tail <= Math.max(digits, 0) && tail <= 2) {
    normalized = `${raw.slice(0, lastSep).replace(/[.,]/g, '')}.${raw.slice(lastSep + 1)}`;
  } else {
    normalized = raw.replace(/[.,]/g, '');
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, message: t('common.moneyInvalid') };
  const amountMinor = Math.round(value * 10 ** digits);
  if (!Number.isSafeInteger(amountMinor)) return { ok: false, message: t('common.moneyTooLarge') };
  return { ok: true, money: { amountMinor, currency } };
}

/** Money -> the text shown in an input (no currency symbol, no grouping), e.g. 1500.5 -> "1500.50". */
export function moneyToInput(money: Money): string {
  const digits = currencyDigits(money.currency);
  return (money.amountMinor / 10 ** digits).toFixed(digits);
}

/** Money -> display text for the user's locale, e.g. "R 2 000,00" for en-ZA. */
export function formatMoney(money: Money, localeTag: string): string {
  const digits = currencyDigits(money.currency);
  try {
    return new Intl.NumberFormat(localeTag, { style: 'currency', currency: money.currency }).format(
      money.amountMinor / 10 ** digits,
    );
  } catch {
    return `${money.currency} ${(money.amountMinor / 10 ** digits).toFixed(digits)}`;
  }
}
