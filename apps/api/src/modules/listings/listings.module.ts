import { Module } from '@nestjs/common';

/**
 * Listings - Ingests raw source records and normalizes them into marketplace-agnostic listings.
 *
 * Owns: RawListing, Listing
 * Marketplace-specific data stays in RawListing.payload / Listing.sourceMetadata.
 *
 * Scaffold only: no controllers or services yet. Other modules must use this
 * module's exported providers rather than querying its tables directly.
 */
@Module({})
export class ListingsModule {}
