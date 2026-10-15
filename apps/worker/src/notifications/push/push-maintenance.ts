import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@rein-drop/db';
import type { PushProvider } from './push-provider.js';

export interface PushMaintenanceOptions {
  /** Expo recommends waiting ~15 minutes before asking for receipts. */
  receiptDelayMs: number;
  /** A ticket with no receipt after this long is closed as "unknown". */
  receiptGiveUpMs: number;
  /** Devices that haven't refreshed their registration for this long are disabled (``stale``). */
  staleDeviceDays: number;
  batchSize: number;
}

export const PUSH_MAINTENANCE_DEFAULTS: Omit<PushMaintenanceOptions, 'staleDeviceDays'> = {
  receiptDelayMs: 15 * 60_000,
  receiptGiveUpMs: 24 * 60 * 60_000,
  batchSize: 500,
};
const KEEP_CHECKED_MS = 7 * 24 * 60 * 60_000;

export interface PushMaintenanceSummary {
  checked: number;
  disabledByReceipt: number;
  disabledStale: number;
}

/**
 * Keeps the device list clean (decision 0006, step 84):
 * - push receipts: tickets older than ~15 minutes are checked with their provider; a device the
 *   push service reports as gone (DeviceNotRegistered) is disabled;
 * - stale devices: the app refreshes its registration on every sign-in / launch (lastSeenAt), so a
 *   device silent for ``staleDeviceDays`` (uninstalled, signed out offline, session long expired) is
 *   disabled and stops receiving the account's alerts. Registering again re-enables it.
 */
export class PushMaintenance {
  private readonly logger = new Logger(PushMaintenance.name);

  constructor(
    private readonly prisma: PrismaClient,
    /** Keyed by PushProvider.id. */
    private readonly providers: Readonly<Record<string, PushProvider>>,
    private readonly options: PushMaintenanceOptions,
  ) {}

  async run(now: Date): Promise<PushMaintenanceSummary> {
    const receipts = await this.checkReceipts(now);
    const stale = await this.prisma.pushDevice.updateMany({
      where: { disabledAt: null, lastSeenAt: { lt: new Date(now.getTime() - this.options.staleDeviceDays * 86_400_000) } },
      data: { disabledAt: now, disabledReason: 'stale' },
    });
    await this.prisma.pushTicket.deleteMany({ where: { checkedAt: { lt: new Date(now.getTime() - KEEP_CHECKED_MS) } } });
    return { ...receipts, disabledStale: stale.count };
  }

  private async checkReceipts(now: Date): Promise<Omit<PushMaintenanceSummary, 'disabledStale'>> {
    const due = await this.prisma.pushTicket.findMany({
      where: { checkedAt: null, createdAt: { lte: new Date(now.getTime() - this.options.receiptDelayMs) } },
      orderBy: { createdAt: 'asc' },
      take: this.options.batchSize,
      select: { id: true, provider: true, ticketId: true, pushDeviceId: true, createdAt: true },
    });
    let checked = 0;
    const gone = new Set<string>();
    const byProvider = new Map<string, typeof due>();
    for (const t of due) byProvider.set(t.provider, [...(byProvider.get(t.provider) ?? []), t]);
    for (const [providerId, tickets] of byProvider) {
      const provider = this.providers[providerId];
      if (!provider?.getReceipts) continue;
      let receipts;
      try {
        receipts = await provider.getReceipts(tickets.map((t) => t.ticketId));
      } catch (err) {
        this.logger.warn(`Push receipts from ${providerId} unavailable, will retry: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      for (const t of tickets) {
        const r = receipts.get(t.ticketId);
        if (!r && now.getTime() - t.createdAt.getTime() < this.options.receiptGiveUpMs) continue;
        if (r?.status === 'error' && r.code === 'device_not_registered') gone.add(t.pushDeviceId);
        await this.prisma.pushTicket.update({
          where: { id: t.id },
          data: { checkedAt: now, receiptStatus: r ? r.status : 'unknown', receiptError: r?.status === 'error' ? `${r.code}: ${r.message}`.slice(0, 300) : null },
        });
        checked += 1;
      }
    }
    if (gone.size > 0) {
      await this.prisma.pushDevice.updateMany({ where: { id: { in: [...gone] }, disabledAt: null }, data: { disabledAt: now, disabledReason: 'device_not_registered' } });
    }
    return { checked, disabledByReceipt: gone.size };
  }
}
