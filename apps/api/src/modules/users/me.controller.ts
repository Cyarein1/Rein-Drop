import { Controller, Get } from '@nestjs/common';
import type { AccountIdentity } from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { LocaleService } from './locale.service.js';

/** Protected by the global AuthGuard (no @Public). */
@Controller('me')
export class MeController {
  constructor(private readonly locales: LocaleService) {}

  /** `GET /me` - the authenticated caller, including locale preferences. */
  @Get()
  async getMe(@CurrentUser() user: Principal): Promise<AccountIdentity> {
    return {
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      locale: await this.locales.get(user.userId),
    };
  }
}
