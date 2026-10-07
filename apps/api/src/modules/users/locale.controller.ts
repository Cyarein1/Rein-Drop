import { Body, Controller, Get, Put } from '@nestjs/common';
import { updateUserLocaleRequestSchema, type UserLocaleResponse } from '@rein-drop/contracts';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { LocaleService } from './locale.service.js';

class UpdateUserLocaleDto extends createZodDto(updateUserLocaleRequestSchema) {}

/** The current user's locale preferences. Protected by the global AuthGuard. */
@Controller('me/locale')
export class LocaleController {
  constructor(private readonly locales: LocaleService) {}

  @Get()
  async get(@CurrentUser() user: Principal): Promise<UserLocaleResponse> {
    return { locale: await this.locales.get(user.userId) };
  }

  /** Set the locale (`source: "user"`) or report a detected one (`source: "detected"`). */
  @Put()
  async update(@CurrentUser() user: Principal, @Body() body: UpdateUserLocaleDto): Promise<UserLocaleResponse> {
    return { locale: await this.locales.update(user.userId, body) };
  }
}
