import { Controller, Get } from '@nestjs/common';
import type { AccessResponse } from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { AccessService } from './access.service.js';

/**
 * `GET /me/access` - the signed-in account's effective access per product (Source / Sell), its
 * state (active, trialing, past due, grace period, canceled, expired, suspended ...) and usage
 * against its limits. The same answer on web and mobile: access belongs to the account, not the
 * device. No provider ids, prices or payment details.
 */
@Controller('me/access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get()
  get(@CurrentUser() user: Principal): Promise<AccessResponse> {
    return this.access.access(user.userId);
  }
}
