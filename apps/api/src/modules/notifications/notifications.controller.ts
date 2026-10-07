import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import {
  idSchema,
  listAlertsQuerySchema,
  updateNotificationPreferencesRequestSchema,
  type Alert,
  type AlertPage,
  type NotificationLog,
  type NotificationPreferences,
} from '@rein-drop/contracts';
import { z } from 'zod';
import type { Principal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators.js';
import { AppException } from '../../common/errors/app.exception.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { NotificationsService } from './notifications.service.js';

class UpdatePreferencesDto extends createZodDto(updateNotificationPreferencesRequestSchema) {}
class ListAlertsQueryDto extends createZodDto(listAlertsQuerySchema) {}
class AlertIdParams extends createZodDto(z.object({ id: idSchema })) {}

/** Per-category, per-channel choices. Marketing is a separate group and opt-in only. */
@Controller('me/notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  get(@CurrentUser() user: Principal): Promise<NotificationPreferences> {
    return this.notifications.preferences(user.userId);
  }

  @Patch()
  update(@CurrentUser() user: Principal, @Body() body: UpdatePreferencesDto): Promise<NotificationPreferences> {
    return this.notifications.updatePreferences(user.userId, body);
  }
}

/** The in-app inbox. */
@Controller('alerts')
export class AlertsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: Principal, @Query() query: ListAlertsQueryDto): Promise<AlertPage> {
    return this.notifications.inbox(user.userId, query);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  readAll(@CurrentUser() user: Principal): Promise<{ updated: number }> {
    return this.notifications.markAllRead(user.userId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  read(@CurrentUser() user: Principal, @Param() params: AlertIdParams): Promise<Alert> {
    return this.notifications.markRead(user.userId, params.id);
  }
}

/**
 * DEVELOPMENT ONLY: the notification simulator's log (the caller's deliveries and their status).
 * Responds 404 in production as if the route did not exist.
 */
@Controller('dev/notifications')
export class DevNotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Get()
  async log(@CurrentUser() user: Principal): Promise<NotificationLog> {
    if (this.config.nodeEnv === 'production') {
      throw new AppException('NOT_FOUND', 'Cannot GET /dev/notifications', HttpStatus.NOT_FOUND);
    }
    return this.notifications.deliveryLog(user.userId);
  }
}
