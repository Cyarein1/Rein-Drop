import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  toNotificationPreferences,
  type Alert,
  type AlertPage,
  type ListAlertsQuery,
  type NotificationCategory,
  type NotificationLog,
  type NotificationPreferences,
  type UpdateNotificationPreferencesRequest,
} from '@rein-drop/contracts';
import type { Alert as AlertRow, PrismaClient } from '@rein-drop/db';
import { AppException } from '../../common/errors/app.exception.js';
import { PRISMA } from '../../database/database.module.js';

export function toAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    category: row.category as NotificationCategory,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    dealId: row.huntMatchId,
    huntId: row.huntId,
  };
}

/**
 * Notification preferences, the in-app inbox and the development delivery log. Alerts are created
 * by the worker (one per eligible deal); this module only reads them and records "read".
 */
@Injectable()
export class NotificationsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async preferences(userId: string): Promise<NotificationPreferences> {
    const stored = await this.prisma.notificationPreference.findMany({ where: { userId }, select: { category: true, channel: true, enabled: true } });
    return toNotificationPreferences(stored);
  }

  /** Stores explicit choices (only editable channels get here - the contract refuses the rest). */
  async updatePreferences(userId: string, request: UpdateNotificationPreferencesRequest): Promise<NotificationPreferences> {
    await this.prisma.$transaction(
      request.changes.map((c) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_category_channel: { userId, category: c.category, channel: c.channel } },
          create: { userId, category: c.category, channel: c.channel, enabled: c.enabled },
          update: { enabled: c.enabled },
        }),
      ),
    );
    return this.preferences(userId);
  }

  /** Newest first (ids are time-ordered), with the unread count for the bell. */
  async inbox(userId: string, query: ListAlertsQuery): Promise<AlertPage> {
    const [rows, unreadCount] = await Promise.all([
      this.prisma.alert.findMany({
        where: { userId, ...(query.unreadOnly ? { readAt: null } : {}), ...(query.cursor ? { id: { lt: query.cursor } } : {}) },
        orderBy: { id: 'desc' },
        take: query.limit + 1,
      }),
      this.prisma.alert.count({ where: { userId, readAt: null } }),
    ]);
    const page = rows.slice(0, query.limit);
    return { items: page.map(toAlert), nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null, unreadCount };
  }

  /** Idempotent: keeps the first read time. Another user's alert is 404. */
  async markRead(userId: string, id: string): Promise<Alert> {
    await this.prisma.alert.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    const row = await this.prisma.alert.findFirst({ where: { id, userId } });
    if (!row) throw new AppException('NOT_FOUND', 'Alert not found', HttpStatus.NOT_FOUND);
    return toAlert(row);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const { count } = await this.prisma.alert.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: count };
  }

  /** The caller's latest deliveries: the log of the local notification simulator. */
  async deliveryLog(userId: string): Promise<NotificationLog> {
    const rows = await this.prisma.notificationDelivery.findMany({
      where: { alert: { userId } },
      include: { alert: { select: { category: true, title: true } } },
      orderBy: [{ createdAt: 'desc' }, { channel: 'asc' }],
      take: 100,
    });
    return {
      items: rows.map((d) => ({
        id: d.id,
        alertId: d.alertId,
        category: d.alert.category as NotificationCategory,
        title: d.alert.title,
        channel: d.channel,
        status: d.status,
        provider: d.provider,
        reason: d.reason,
        attempts: d.attempts,
        createdAt: d.createdAt.toISOString(),
        sentAt: d.sentAt?.toISOString() ?? null,
      })),
    };
  }
}
