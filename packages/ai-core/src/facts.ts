import { tokenize } from '@rein-drop/matching';
import type { ListingDraftFacts, ListingFacts, Money } from './provider.js';
import type { Evidence, ListingCondition } from './schemas.js';

/**
 * Canonical string values of the structured listing facts evidence can cite. Providers and the
 * validator both use this, so a claim like "listed 40 days ago" must point at the real listedAt.
 */
export function factValue(listing: ListingFacts, field: Extract<Evidence, { source: 'listing_field' }>['field']): string {
  switch (field) {
    case 'price':
      return listing.price ? `${listing.price.currency} ${listing.price.amountMinor}` : 'none';
    case 'listedAt':
      return listing.listedAt ?? 'none';
    case 'photoCount':
      return String(listing.photoCount);
    case 'description':
      return listing.description === null ? 'none' : `${listing.description.trim().length} chars`;
  }
}

export function textOf(listing: ListingFacts, field: Extract<Evidence, { source: 'text' }>['field']): string {
  return listing[field] ?? '';
}

/** True when the evidence really is in the listing. */
export function isGrounded(listing: ListingFacts, evidence: Evidence): boolean {
  return evidence.source === 'text'
    ? textOf(listing, evidence.field).includes(evidence.quote)
    : factValue(listing, evidence.field) === evidence.value;
}

// ---------------------------------------------------------------------------
// Listing drafts: what a draft may say, shared by the mock and the validator
// ---------------------------------------------------------------------------

/** The item text a listing draft can be grounded in. Never the purchase price or where it was bought. */
export function listingDraftText(facts: ListingDraftFacts): string {
  return [facts.itemTitle, facts.sourceTitle, facts.sourceDescription, facts.sourceConditionText, facts.sellerNotes]
    .filter((t): t is string => Boolean(t))
    .join('\n');
}

/**
 * True when every word of `value` is in the facts text (case-insensitive). A word may also be two
 * adjacent words written together, so "128GB" is grounded by "128 GB".
 */
export function isGroundedInText(text: string, value: string): boolean {
  const tokens = tokenize(text);
  const known = new Set(tokens);
  tokens.forEach((t, i) => tokens[i + 1] !== undefined && known.add(t + tokens[i + 1]));
  const wanted = tokenize(value);
  return wanted.length > 0 && wanted.every((w) => known.has(w));
}

/** Whole major units of an amount (ZAR 3 500.00 -> 3500); assumes 2 decimals unless the currency has others. */
export function majorAmount(money: Money): number {
  let digits = 2;
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency: money.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    // Unknown currency code: keep 2.
  }
  return Math.floor(money.amountMinor / 10 ** digits);
}

/**
 * Whole numbers written in the text, ignoring thousands separators and decimals ("R3 500,00",
 * "3,500", "3500.00" -> 3500). Letters around a number don't matter ("R3500", "128GB").
 */
export function numbersIn(text: string): number[] {
  const joined = text.replace(/(\d)[,.  ' ](?=\d{3}(?![\p{L}\p{N}]))/gu, '$1');
  return [...joined.matchAll(/(?<![\d.,])\d+/g)].map((m) => Number(m[0]));
}

const MARKETPLACE_NAMES: Record<NonNullable<ListingDraftFacts['sourceMarketplace']>, RegExp> = {
  ebay: /\bebay\b/i,
  facebook: /\b(?:facebook|fb marketplace)\b/i,
};

/**
 * Private facts that must never reach buyers: the purchase price (as a whole major amount, unless
 * the number is part of the item's own title, e.g. a model number) and the source marketplace.
 */
export function privateFactLeaks(facts: ListingDraftFacts, text: string): string[] {
  const problems: string[] = [];
  const paid = majorAmount(facts.purchasePrice);
  if (paid > 0 && numbersIn(text).includes(paid) && !numbersIn(facts.itemTitle).includes(paid)) {
    problems.push(`mentions the purchase price (${paid})`);
  }
  const market = facts.sourceMarketplace;
  if (market && MARKETPLACE_NAMES[market].test(text) && !MARKETPLACE_NAMES[market].test(facts.itemTitle)) {
    problems.push(`mentions where it was bought (${market})`);
  }
  return problems;
}

/** Claims a listing may not make: guarantees always; "brand new" unless it is new; a warranty the facts don't mention. */
export function unsupportedClaims(facts: ListingDraftFacts, condition: ListingCondition, text: string): string[] {
  const problems: string[] = [];
  if (/\bguarantee[ds]?\b/i.test(text)) problems.push('claims a guarantee');
  if (condition !== 'new' && /\bbrand[\s-]new\b/i.test(text)) problems.push(`says "brand new" but the condition is ${condition}`);
  if (/\bwarrant(?:y|ies|ee)\b/i.test(text) && !/\bwarrant/i.test(listingDraftText(facts))) problems.push('mentions a warranty the facts do not');
  return problems;
}
