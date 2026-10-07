import { Module } from '@nestjs/common';
import { AlertsController, DevNotificationsController, NotificationPreferencesController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Notifications - alerts to users across channels (in-app, push, email).
 *
 * Owns: Alert, NotificationDelivery, NotificationPreference
 * The worker creates alerts (one per eligible deal) and sends deliveries through its outbox;
 * this module serves preferences, the in-app inbox and the development delivery log.
 * Endpoints: GET/PATCH /me/notification-preferences, GET /alerts, POST /alerts/:id/read,
 * POST /alerts/read-all, GET /dev/notifications (development only).
 * TODO(notifications): Expo push (Build Prompt 25); email provider TBD.
 */
@Module({
  controllers: [NotificationPreferencesController, AlertsController, DevNotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
