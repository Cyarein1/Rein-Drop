import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@rein-drop/db';
import { DeliverySkipped, type NotificationMessage, type NotificationSender, type SendResult } from '../sender-types.js';
import type { PushProvider, PushTicket } from './push-provider.js';

/** Android notification channel the app creates for alerts (apps/mobile src/notifications). */
export const ALERTS_CHANNEL_ID = 'alerts';

/**
 * Sends one alert as a push to every active device of the user, each through its provider
 * (`PushDevice.provider` -> PushProvider). Outcome of the delivery:
 * - at least one device accepted it -> delivered (SENT, or SIMULATED if every acceptance was);
 * - no active device / every device gone -> DeliverySkipped (`no_device`);
 * - nothing accepted but something may work later -> throws (the outbox retries).
 * Devices the push service reports as unregistered are disabled, so they aren't tried again.
 */
export class PushNotificationSender implements NotificationSender {
  private readonly logger = new Logger(PushNotificationSender.name);

  constructor(
    private readonly prisma: PrismaClient,
    /** Keyed by PushDevice.provider. A device whose provider isn't here is not used. */
    private readonly providers: Readonly<Record<string, PushProvider>>,
  ) {}

  async send(message: NotificationMessage): Promise<SendResult> {
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId: message.recipient.userId, disabledAt: null },
      select: { id: true, provider: true, token: true },
    });
    const usable = devices.filter((d) => this.providers[d.provider]);
    if (usable.length === 0) throw new DeliverySkipped('no_device');

    const data: Record<string, string> = { alertId: message.alertId, category: message.category, ...(message.dealId ? { dealId: message.dealId } : {}) };
    const results: { deviceId: string; provider: PushProvider; ticket: PushTicket }[] = [];
    for (const [providerKey, group] of Object.entries(groupBy(usable, (d) => d.provider))) {
      const provider = this.providers[providerKey]!;
      const tickets = await provider.send(group.map((d) => ({ to: d.token, title: message.title, body: message.body, data, channelId: ALERTS_CHANNEL_ID })));
      group.forEach((d, i) => results.push({ deviceId: d.id, provider, ticket: tickets[i] ?? { status: 'error', code: 'other', message: 'No ticket returned', retryable: true } }));
    }

    const gone = results.filter((r) => r.ticket.status === 'error' && r.ticket.code === 'device_not_registered').map((r) => r.deviceId);
    if (gone.length > 0) {
      await this.prisma.pushDevice.updateMany({ where: { id: { in: gone } }, data: { disabledAt: new Date(), disabledReason: 'device_not_registered' } });
    }

    const accepted = results.filter((r) => r.ticket.status === 'ok');
    // Keep the ticket ids of providers with receipts, so PushMaintenance can check delivery later.
    const tickets = accepted.flatMap((r) => (r.ticket.status === 'ok' && r.ticket.id && r.provider.getReceipts ? [{ provider: r.provider.id, ticketId: r.ticket.id, pushDeviceId: r.deviceId, deliveryId: message.deliveryId }] : []));
    if (tickets.length > 0) await this.prisma.pushTicket.createMany({ data: tickets, skipDuplicates: true });
    if (accepted.length > 0) {
      const providers = [...new Set(accepted.map((r) => r.provider.id))];
      return { provider: providers.join(','), simulated: accepted.every((r) => r.provider.simulated) };
    }
    if (gone.length === results.length) throw new DeliverySkipped('no_device');
    const errors = results.flatMap((r) => (r.ticket.status === 'error' ? [`${r.ticket.code}: ${r.ticket.message}`] : []));
    this.logger.warn(`Push for alert ${message.alertId} not accepted by any device: ${errors.join('; ')}`);
    throw new Error(errors.join('; ').slice(0, 500));
  }
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) (groups[key(item)] ??= []).push(item);
  return groups;
}
