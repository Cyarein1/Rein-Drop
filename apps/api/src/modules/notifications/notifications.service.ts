import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  toNotificationPreferences,
  type Alert,
  type AlertPage,
  type ListAlertsQuery,
  type NotificationCategory,
  type DevTestNotification,
  type NotificationLog,
  type NotificationPreferences,
  type PushDevice,
  type PushDeviceProvider,
  type RegisterPushDeviceRequest,
  type UpdateNotificationPreferencesRequest,
} from '@rein-drop/contracts';
import type { Alert as AlertRow, PrismaClient, PushDevice as PushDeviceRow } from '@rein-drop/db';
import { AppException } from '../../common/errors/app.exception.js';
import { PRISMA } from '../../database/database.module.js';

export function toPushDevice(row: PushDeviceRow): PushDevice {
  return {
    id: row.id,
    provider: row.provider as PushDeviceProvider,
    platform: row.platform as PushDevice['platform'],
    deviceName: row.deviceName,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    active: row.disabledAt === null,
    disabledReason: row.disabledReason,
  };
}

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
  /**
   * DEVELOPMENT ONLY: a test alert (category operational, so it isn't subject to Hunt access) with
   * a PENDING push the worker sends like any other. It points at the caller's most recent deal so
   * tapping it exercises the deep link; without deals it opens the inbox.
   */
  async sendTestNotification(userId: string): Promise<DevTestNotification> {
    const deal = await this.prisma.huntMatch.findFirst({
      where: { hunt: { userId } },
      orderBy: { matchedAt: 'desc' },
      select: { id: true, listing: { select: { title: true } } },
    });
    const alert = await this.prisma.alert.create({
      data: {
        userId,
        category: 'operational',
        huntMatchId: deal?.id ?? null,
        dedupeKey: `test:${randomUUID()}`,
        title: 'Test notification from Rein Drop',
        body: deal ? `Tap to open "${deal.listing.title.slice(0, 80)}".` : 'Tap to open your inbox.',
        deliveries: { create: [{ channel: 'IN_APP', status: 'SENT', sentAt: new Date() }, { channel: 'PUSH', status: 'PENDING' }] },
      },
    });
    return { alertId: alert.id, dealId: deal?.id ?? null };
  }

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

  /**
   * Registers this phone for push, or refreshes it. Keyed by token: a token seen before is
   * re-enabled and moved to the caller (a phone signed into another account).
   */
  async registerDevice(userId: string, request: RegisterPushDeviceRequest): Promise<PushDevice> {
    const data = {
      userId,
      provider: request.provider,
      platform: request.platform,
      deviceName: request.deviceName ?? null,
      appVersion: request.appVersion ?? null,
      lastSeenAt: new Date(),
      disabledAt: null,
      disabledReason: null,
    };
    return toPushDevice(await this.prisma.pushDevice.upsert({ where: { token: request.token }, create: { token: request.token, ...data }, update: data }));
  }

  async devices(userId: string): Promise<{ items: PushDevice[] }> {
    const rows = await this.prisma.pushDevice.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' } });
    return { items: rows.map(toPushDevice) };
  }

  /** Stops push to this phone (kept for history; registering again re-enables it). */
  async unregisterDevice(userId: string, id: string): Promise<PushDevice> {
    await this.prisma.pushDevice.updateMany({ where: { id, userId, disabledAt: null }, data: { disabledAt: new Date(), disabledReason: 'unregistered' } });
    const row = await this.prisma.pushDevice.findFirst({ where: { id, userId } });
    if (!row) throw new AppException('NOT_FOUND', 'Device not found', HttpStatus.NOT_FOUND);
    return toPushDevice(row);
  }
}
