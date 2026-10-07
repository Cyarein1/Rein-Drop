import { Module } from '@nestjs/common';
import { SellerSnapshotController } from './seller-snapshot.controller.js';
import { SellerSnapshotService } from './seller-snapshot.service.js';

/**
 * SellerProfile - Reseller profile and the Seller Snapshot (the five onboarding
 * answers, App Flow Blueprint section 4).
 *
 * Owns: SellerProfile
 * Endpoints: GET / PATCH / PUT /me/seller-snapshot (current user only).
 * No geography here: exact location belongs to each Hunt.
 *
 * Other modules (e.g. Hunts pre-filling marketplaces / deal criteria) use the
 * exported SellerSnapshotService, never the table directly.
 */
@Module({
  controllers: [SellerSnapshotController],
  providers: [SellerSnapshotService],
  exports: [SellerSnapshotService],
})
export class SellerProfileModule {}
