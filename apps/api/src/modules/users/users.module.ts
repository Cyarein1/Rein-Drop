import { Module } from '@nestjs/common';
import { MeController } from './me.controller.js';

/**
 * Users - Account records.
 *
 * Owns: User
 * Identity comes from the AuthService boundary (src/auth); this module never
 * knows which AuthProvider is active.
 *
 * Endpoints: GET /me. Other modules must use this module's exported providers
 * rather than querying its tables directly.
 */
@Module({
  controllers: [MeController],
})
export class UsersModule {}
