import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { deleteAccountRequestSchema, type AccountIdentity, type DeleteAccountResponse } from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { STRICT_LIMIT } from '../../common/rate-limit/rate-limit.guard.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { LocaleService } from './locale.service.js';

class DeleteAccountDto extends createZodDto(deleteAccountRequestSchema) {}

/** Protected by the global AuthGuard (no @Public). */
@Controller('me')
export class MeController {
  constructor(
    private readonly locales: LocaleService,
    private readonly deletion: AccountDeletionService,
  ) {}

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

  /**
   * `POST /me/delete` with `{ confirmation: "DELETE" }` - deletes the signed-in account (only ever
   * the caller's own). Cancels a paid subscription first; 503 (nothing deleted) if that fails.
   * Afterwards the session belongs to no account: sign out (401 on the next call with the dev
   * provider; with Entra a new empty account would be created on the next call).
   */
  @Throttle(STRICT_LIMIT)
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  deleteAccount(@CurrentUser() user: Principal, @Body() _body: DeleteAccountDto): Promise<DeleteAccountResponse> {
    return this.deletion.delete(user.userId);
  }
}
