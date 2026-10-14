import { Global, Module } from '@nestjs/common';
import { createGeocodingProvider } from '@rein-drop/geo';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { UsersModule } from '../users/users.module.js';
import { AreaService } from './area.service.js';
import { AreaController, GeoController } from './geo.controller.js';
import { GeoService } from './geo.service.js';
import { GEOCODER } from './geo.tokens.js';

export { GEOCODER };

/**
 * Geo - place suggestions, "Your area", placing Hunt locations, web map tiles (decision 0017).
 *
 * Owns: User.area* columns. GeoPlaceCache is the worker's (listing places for distance checks).
 * Provider: GEOCODING_PROVIDER - mock (development), azure (AZURE_MAPS_KEY), none (production
 * default: free-text locations). Global so Hunts can place locations on save.
 * Endpoints: GET /geo/config, GET /geo/suggest, GET /geo/tiles/:z/:x/:y, GET/PUT/DELETE /me/area.
 */
@Global()
@Module({
  imports: [UsersModule],
  controllers: [GeoController, AreaController],
  providers: [
    { provide: GEOCODER, inject: [API_CONFIG], useFactory: (config: ApiConfig) => createGeocodingProvider(config.geo) },
    GeoService,
    AreaService,
  ],
  exports: [GeoService],
})
export class GeoModule {}
