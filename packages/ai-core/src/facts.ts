import type { ListingFacts } from './provider.js';
import type { Evidence } from './schemas.js';

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
