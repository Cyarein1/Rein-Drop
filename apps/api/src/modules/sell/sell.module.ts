import { Module } from '@nestjs/common';
import { createAIProvider } from '@rein-drop/ai-core';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { MediaController } from './media.controller.js';
import { createMediaStorage, MEDIA_STORAGE } from './media-storage.js';
import { createListingPublishers, LISTING_PUBLISHERS } from './publishers.js';
import { SellController } from './sell.controller.js';
import { SELL_AI, SellService } from './sell.service.js';

/**
 * Sell - list bought items for sale and cross-list them (decision 0019).
 *
 * Owns: SellListing, SellPhoto, SellChannel (and listing photo files in media storage).
 * AI drafts: AI_PROVIDER (mock in development; Foundry when configured; none in production without it).
 * Publishing: eBay mock (TODO(sell)), Facebook assisted. Photos: MEDIA_STORAGE (local in development).
 * Endpoints: GET /sell/marketplaces, GET|POST /sell/listings, GET|PATCH /sell/listings/:id,
 * POST /sell/listings/:id/draft, photos (upload, source, order, delete), publish, channel confirm / end,
 * and the public signed-link GET /media/:key.
 */
@Module({
  controllers: [SellController, MediaController],
  providers: [
    SellService,
    { provide: MEDIA_STORAGE, inject: [API_CONFIG], useFactory: (config: ApiConfig) => createMediaStorage(config.media) },
    { provide: LISTING_PUBLISHERS, useFactory: createListingPublishers },
    { provide: SELL_AI, inject: [API_CONFIG], useFactory: (config: ApiConfig) => (config.ai ? createAIProvider(config.ai.provider, config.ai.foundry) : null) },
  ],
})
export class SellModule {}
