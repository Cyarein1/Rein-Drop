import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { joinWaitlistRequestSchema, type JoinWaitlistResponse } from '@rein-drop/contracts';
import type { Request } from 'express';
import { Public } from '../../auth/decorators.js';
import { getRequestId } from '../../common/logging/request-id.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { WaitlistService } from './waitlist.service.js';

class JoinWaitlistDto extends createZodDto(joinWaitlistRequestSchema) {}

/**
 * Per caller IP per minute. The landing reaches this route through the web server (one IP for
 * every visitor), which applies the per-visitor limit itself (apps/web waitlist route); this
 * ceiling stops direct callers from flooding the table and caps the whole site's sign-up rate.
 */
export const WAITLIST_API_LIMIT = { default: { limit: 120, ttl: 60_000 } };

/**
 * POST /waitlist - the one public write for early access (decision L-D3). Body: the shared contract
 * (zod, email normalized). 202 `{ status: 'received' }` for a new AND a repeat address, so the
 * response never reveals whether someone signed up. No GET, no list, no counts (guarded by
 * architecture.spec.ts).
 */
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Public()
  @Throttle(WAITLIST_API_LIMIT)
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async join(@Body() body: JoinWaitlistDto, @Req() req: Request): Promise<JoinWaitlistResponse> {
    await this.waitlist.join(body, getRequestId(req));
    return { status: 'received' };
  }
}
