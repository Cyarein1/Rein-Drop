import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { clientProductEventRequestSchema } from '@rein-drop/contracts';
import type { ProductEvents } from '@rein-drop/telemetry';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { PRODUCT_EVENTS } from './telemetry.tokens.js';

class ClientProductEventDto extends createZodDto(clientProductEventRequestSchema) {}

/** Screen views are cheap and frequent, but a client can't flood the log. */
const CLIENT_EVENT_LIMIT = { default: { limit: 60, ttl: 60_000 } };

/**
 * Events only the apps can observe (CLIENT_PRODUCT_EVENT_NAMES - today: the plan gate was shown).
 * Signed-in only; the user is the caller (a client can't report for someone else), and the body
 * is the strict catalog schema (400 for anything else). 204 - nothing to return.
 */
@Controller('telemetry')
export class TelemetryController {
  constructor(@Inject(PRODUCT_EVENTS) private readonly events: ProductEvents) {}

  @Throttle(CLIENT_EVENT_LIMIT)
  @Post('events')
  @HttpCode(HttpStatus.NO_CONTENT)
  track(@CurrentUser() user: Principal, @Body() body: ClientProductEventDto): void {
    this.events.track(body.name, user.userId, body.properties);
  }
}
