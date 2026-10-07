/**
 * Text normalization shared by matching and deduplication. Unicode-aware (letters and digits of
 * any script), accent-insensitive, case-insensitive.
 */

export function normalizeText(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Words that never decide whether a listing is the product someone is hunting for.
 * Condition words are here too: condition has its own check.
 * TODO(i18n): English only - add lists per supported language.
 */
export const IGNORED_QUERY_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'without', 'in', 'on', 'of', 'to', 'from', 'by', 'my', 'any',
  'looking', 'want', 'wanted', 'need', 'buy', 'buying', 'sell', 'selling', 'sale', 'cheap', 'bargain', 'deal', 'deals',
  'good', 'great', 'mint', 'excellent', 'condition', 'new', 'used', 'refurbished', 'brand', 'like', 'only',
]);

export const isNumericToken = (token: string) => /^\p{N}+$/u.test(token);

/** Words with a digit identify a model or variant (13, s23, xm4, 128gb): they must match. */
export const isModelToken = (token: string) => /\p{N}/u.test(token);

/** Significant words of a query: what a relevant listing must mention. */
export function significantTokens(text: string): string[] {
  return [...new Set(tokenize(text).filter((t) => !IGNORED_QUERY_WORDS.has(t)))];
}

/**
 * Whether `candidate` (a listing word) satisfies `wanted` (a query word):
 * - plain numbers match exactly (iPhone 13 is not iPhone 130);
 * - model codes of 3+ characters also match inside a word ("xm4" in "1000xm4", not "xm3");
 * - other words also match a simple plural, or a longer word they start with when 3+ characters
 *   long ("galax" -> "galaxy").
 */
export function tokenMatches(wanted: string, candidate: string): boolean {
  if (wanted === candidate) return true;
  if (isNumericToken(wanted) || isNumericToken(candidate)) return false;
  if (isModelToken(wanted)) return wanted.length >= 3 && candidate.includes(wanted);
  if (candidate === `${wanted}s` || wanted === `${candidate}s`) return true;
  return wanted.length >= 3 && candidate.startsWith(wanted);
}

/** Case/accent-insensitive whole-phrase search ("for parts" is found in "Sold for parts or repair"). */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const words = tokenize(phrase);
  if (words.length === 0) return false;
  const tokens = tokenize(haystack);
  for (let i = 0; i + words.length <= tokens.length; i += 1) {
    if (words.every((w, j) => tokens[i + j] === w)) return true;
  }
  return false;
}
