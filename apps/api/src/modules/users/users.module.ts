import { Module } from '@nestjs/common';

/**
 * Users - Account records.
 *
 * Owns: User
 * TODO(auth): identity comes from the managed auth provider (TBD); local dev auth abstraction first.
 *
 * Scaffold only: no controllers or services yet. Other modules must use this
 * module's exported providers rather than querying its tables directly.
 */
@Module({})
export class UsersModule {}
