import { Module } from '@nestjs/common';
import { LocaleController } from './locale.controller.js';
import { LocaleService } from './locale.service.js';
import { MeController } from './me.controller.js';

/**
 * Users - Account records and the user's locale preferences.
 *
 * Owns: User
 * Identity comes from the AuthService boundary (src/auth); this module never
 * knows which AuthProvider is active.
 *
 * Endpoints: GET /me, GET/PUT /me/locale. Other modules use the exported
 * LocaleService (e.g. default currency for new hunts) rather than the table.
 */
@Module({
  controllers: [MeController, LocaleController],
  providers: [LocaleService],
  exports: [LocaleService],
})
export class UsersModule {}
