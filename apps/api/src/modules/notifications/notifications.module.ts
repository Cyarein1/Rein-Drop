import { Module } from '@nestjs/common';
import { AlertsController, DevNotificationsController, NotificationPreferencesController, PushDevicesController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Notifications - alerts to users across channels (in-app, push, email).
 *
 * Owns: Alert, NotificationDelivery, NotificationPreference, PushDevice
 * The worker creates alerts (one per eligible deal) and sends deliveries through its outbox;
 * this module serves preferences, the in-app inbox and the development delivery log.
 * Endpoints: GET/PATCH /me/notification-preferences, GET /alerts, POST /alerts/:id/read,
 * POST /alerts/read-all, GET/POST /me/push-devices, DELETE /me/push-devices/:id,
 * GET /dev/notifications (development only).
 * TODO(notifications): email provider TBD.
 */
@Module({
  controllers: [NotificationPreferencesController, AlertsController, PushDevicesController, DevNotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
