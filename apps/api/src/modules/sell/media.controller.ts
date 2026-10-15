import { Controller, Get, HttpStatus, Inject, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../auth/decorators.js';
import { AppException } from '../../common/errors/app.exception.js';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { MEDIA_LINK_TTL_S, MEDIA_STORAGE, verifyMediaSignature, type MediaStorage } from './media-storage.js';

/**
 * Listing photos by signed link (decision 0019). Public route: the short-lived HMAC signature in
 * the link - issued only to the photo's owner inside their listing - is the authorization, so
 * <img> / <Image> can load it without credentials. Invalid or expired links are 404.
 */
@Controller('media')
export class MediaController {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
  ) {}

  @Public()
  @Get(':key')
  async get(@Param('key') key: string, @Query('exp') exp: string | undefined, @Query('sig') sig: string | undefined, @Res() res: Response): Promise<void> {
    const found = verifyMediaSignature(key, exp, sig, this.config.media.signingSecret, Date.now()) ? await this.media.get(key) : null;
    if (!found) throw new AppException('NOT_FOUND', 'Photo not found', HttpStatus.NOT_FOUND);
    res.setHeader('Content-Type', found.contentType);
    res.setHeader('Cache-Control', `private, max-age=${MEDIA_LINK_TTL_S}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(found.bytes);
  }
}
