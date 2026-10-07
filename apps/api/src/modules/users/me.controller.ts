import { Controller, Get } from '@nestjs/common';
import type { AccountIdentity } from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';

/** Protected by the global AuthGuard (no @Public). */
@Controller('me')
export class MeController {
  /** `GET /me` - the authenticated caller (AccountIdentity contract). */
  @Get()
  getMe(@CurrentUser() user: Principal): AccountIdentity {
    return { userId: user.userId, email: user.email, displayName: user.displayName };
  }
}
