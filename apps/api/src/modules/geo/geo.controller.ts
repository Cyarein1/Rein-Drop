import { Body, Controller, Delete, Get, Param, Put, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  geoSuggestQuerySchema,
  updateUserAreaRequestSchema,
  type GeoConfig,
  type GeoSuggestResponse,
  type UserAreaResponse,
} from '@rein-drop/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { LocaleService } from '../users/locale.service.js';
import { AreaService } from './area.service.js';
import { GeoService } from './geo.service.js';

class GeoSuggestQueryDto extends createZodDto(geoSuggestQuerySchema) {}
class UpdateUserAreaDto extends createZodDto(updateUserAreaRequestSchema) {}
class TileParams extends createZodDto(
  z.object({ z: z.coerce.number().int().min(0).max(19), x: z.coerce.number().int().min(0), y: z.coerce.number().int().min(0) }),
) {}

/** Typing fires a request every few hundred ms: generous per person, still a ceiling on cost. */
export const GEO_SUGGEST_LIMIT = { default: { limit: 120, ttl: 60_000 } };

/** Places and the web map (decision 0017). Signed in (global AuthGuard). */
@Controller('geo')
export class GeoController {
  constructor(
    private readonly geo: GeoService,
    private readonly locales: LocaleService,
  ) {}

  /** What the clients may offer: suggestions, and which tiles the web map uses (if any). */
  @Get('config')
  config(): GeoConfig {
    return this.geo.clientConfig();
  }

  /** Places while typing, biased to the user's country. */
  @Throttle(GEO_SUGGEST_LIMIT)
  @Get('suggest')
  async suggest(@CurrentUser() user: Principal, @Query() query: GeoSuggestQueryDto): Promise<GeoSuggestResponse> {
    const locale = await this.locales.get(user.userId);
    return { places: await this.geo.suggest(query.q, query.limit, locale?.countryCode ?? null) };
  }

  /** A web map tile from Azure Maps (proxy mode; the key never leaves the server). */
  @Get('tiles/:z/:x/:y')
  async tile(@Param() params: TileParams, @Res() res: Response): Promise<void> {
    const tile = await this.geo.tile(params.z, params.x, params.y);
    res.setHeader('Content-Type', tile.contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(Buffer.from(tile.body));
  }
}

/** "Your area" on the profile (decision 0017): a place, never a street address. */
@Controller('me/area')
export class AreaController {
  constructor(private readonly areas: AreaService) {}

  @Get()
  async get(@CurrentUser() user: Principal): Promise<UserAreaResponse> {
    return { area: await this.areas.get(user.userId) };
  }

  @Put()
  async set(@CurrentUser() user: Principal, @Body() body: UpdateUserAreaDto): Promise<UserAreaResponse> {
    return { area: await this.areas.set(user.userId, body) };
  }

  @Delete()
  async clear(@CurrentUser() user: Principal): Promise<UserAreaResponse> {
    await this.areas.clear(user.userId);
    return { area: null };
  }
}
