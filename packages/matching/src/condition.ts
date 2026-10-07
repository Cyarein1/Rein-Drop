import { normalizeText } from './text.js';

/**
 * Maps a listing's free-text condition (each marketplace words it differently) to a category.
 * `for_parts` is separate from `used`: faulty items only match hunts that accept any condition.
 * TODO(marketplace): a normalized condition scale on Listing would make this unnecessary.
 */
export type ConditionCategory = 'new' | 'used' | 'refurbished' | 'for_parts';

const RULES: readonly [ConditionCategory, RegExp][] = [
  ['for_parts', /\b(for parts|parts only|not working|spares|faulty|broken)\b/],
  ['refurbished', /\b(refurb\w*|renewed|reconditioned|remanufactured)\b/],
  // Before "new": "Used - like new" is used.
  ['used', /\b(used|pre ?owned|second ?hand|open box)\b/],
  ['new', /\b(new|sealed|unopened|brand new)\b/],
];

export function classifyCondition(conditionText: string | null): ConditionCategory | null {
  if (!conditionText) return null;
  const text = normalizeText(conditionText).replace(/[-_]/g, ' ');
  return RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}
