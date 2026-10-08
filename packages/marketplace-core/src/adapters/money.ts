/** Money helpers shared by adapters: exact decimal-string -> integer minor units, no floats. */

/** Minor-unit digits for a currency (2 for USD / ZAR, 0 for JPY ...). */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** "249.5" -> 24950 (exact; no floating-point multiplication). Null if malformed or too many decimals. */
export function decimalToMinor(value: string, currency: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const digits = currencyDigits(currency);
  const [whole = '0', fraction = ''] = value.split('.');
  if (fraction.length > digits) return null;
  return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0');
}
