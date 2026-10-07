import { Module } from '@nestjs/common';
import { DealsModule } from '../deals/deals.module.js';
import { SellerProfileModule } from '../seller-profile/seller-profile.module.js';
import { HomeController } from './home.controller.js';
import { HomeService } from './home.service.js';

/**
 * Home - composition (no tables): attention, active Hunts, realized profit snapshot, recent
 * activity and one recommendation, in priority order. Endpoint: GET /me/home.
 */
@Module({
  imports: [DealsModule, SellerProfileModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
