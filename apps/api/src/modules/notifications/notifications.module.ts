import { Module } from '@nestjs/common';

/**
 * Notifications - Alerts to users across channels (in-app, push, email).
 *
 * Owns: Alert
 * TODO(notifications): push and transactional email providers TBD.
 *
 * Scaffold only: no controllers or services yet. Other modules must use this
 * module's exported providers rather than querying its tables directly.
 */
@Module({})
export class NotificationsModule {}
